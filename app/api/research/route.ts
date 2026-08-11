import { NextResponse } from "next/server";
import { researchRequestSchema } from "@/types/research";
import { buildResearchPrompt } from "@/lib/PromptBuilder";
import { requestResearchCompletion } from "@/lib/OrcaRouterClient";
import { validateResearchResult } from "@/lib/ResultValidator";
import { ResearchError, toErrorResponse } from "@/lib/errors";
import { requireAuthorizedUser } from "@/lib/apiGuard";

export const runtime = "nodejs";

/**
 * POST /api/research
 * 設計書 7章・8.2章に対応する ResearchController。
 * 未認証は401、ホワイトリスト対象外は403、Rate Limit超過は429を返す（設計書14.1章・14.2章）。
 * ユーザー入力を検証し、PromptBuilder → OrcaRouterClient → ResultValidator の順で処理する。
 */
export async function POST(request: Request) {
  try {
    await requireAuthorizedUser();

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
