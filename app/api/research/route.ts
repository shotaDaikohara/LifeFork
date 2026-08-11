import { NextResponse } from "next/server";
import { researchRequestSchema, type ApiErrorBody } from "@/types/research";
import { buildResearchPrompt } from "@/lib/PromptBuilder";
import { requestResearchCompletion } from "@/lib/OrcaRouterClient";
import { validateResearchResult } from "@/lib/ResultValidator";
import { ResearchError, statusForErrorCode } from "@/lib/errors";

export const runtime = "nodejs";

/**
 * POST /api/research
 * 設計書 7章・8.1章に対応する ResearchController。
 * ユーザー入力を検証し、PromptBuilder → OrcaRouterClient → ResultValidator の順で処理する。
 */
export async function POST(request: Request) {
  try {
    const json = await request.json().catch(() => {
      throw new ResearchError("invalid_request", "リクエストボディがJSONとして解釈できません。");
    });

    const parsed = researchRequestSchema.safeParse(json);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join(" / ");
      throw new ResearchError("invalid_request", `入力内容が不正です: ${issues}`);
    }

    const prompt = await buildResearchPrompt(parsed.data);

    const rawFirst = await requestResearchCompletion(prompt);
    const firstValidation = validateResearchResult(rawFirst);
    if (firstValidation.ok) {
      return NextResponse.json(firstValidation.data, { status: 200 });
    }

    // 設計書13章: JSON不正時は余裕があれば1回のみフォーマット修正の再問い合わせを行う。
    const retryHint = [
      "直前の出力はスキーマ検証に失敗しました。以下のエラーを踏まえ、",
      "指定されたJSON構造のみを、前置きや説明文・コードブロック無しで出力し直してください。",
      `検証エラー: ${firstValidation.message}`,
    ].join("");

    const rawSecond = await requestResearchCompletion(prompt, retryHint);
    const secondValidation = validateResearchResult(rawSecond);
    if (secondValidation.ok) {
      return NextResponse.json(secondValidation.data, { status: 200 });
    }

    throw new ResearchError(
      "invalid_response",
      `モデル出力の検証に2回失敗しました: ${secondValidation.message}`,
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}

function toErrorResponse(err: unknown): NextResponse<ApiErrorBody> {
  const researchError =
    err instanceof ResearchError
      ? err
      : new ResearchError(
          "internal_error",
          err instanceof Error ? err.message : "サーバーで予期しないエラーが発生しました。",
        );

  const body: ApiErrorBody = {
    error: { code: researchError.code, message: researchError.message },
  };
  return NextResponse.json(body, { status: statusForErrorCode(researchError.code) });
}
