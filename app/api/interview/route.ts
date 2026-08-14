import { NextResponse } from "next/server";
import { interviewRequestSchema } from "@/types/interview";
import { buildInterviewPrompt } from "@/lib/PromptBuilder";
import { requestInterviewCompletion, routerDebugHeaders } from "@/lib/OrcaRouterClient";
import { validateInterviewResponse } from "@/lib/InterviewValidator";
import { ResearchError, toErrorResponse } from "@/lib/errors";
import { requireAuthorizedUser } from "@/lib/apiGuard";

export const runtime = "nodejs";

/**
 * POST /api/interview
 * 設計書 7章・8.1章に対応する InterviewController。
 * 未認証は401、ホワイトリスト対象外は403、Rate Limit超過は429を返す（設計書14.1章・14.2章）。
 * プロフィール・将来像を検証し、PromptBuilder → OrcaRouterClient → InterviewValidator の順で処理する。
 * 質問は1回のみ生成し、回答ごとの逐次質問生成は行わない。
 */
export async function POST(request: Request) {
  try {
    await requireAuthorizedUser();

    const json = await request.json().catch(() => {
      throw new ResearchError("invalid_request", "リクエストボディがJSONとして解釈できません。");
    });

    const parsed = interviewRequestSchema.safeParse(json);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join(" / ");
      throw new ResearchError("invalid_request", `入力内容が不正です: ${issues}`);
    }

    const prompt = await buildInterviewPrompt(parsed.data);

    const first = await requestInterviewCompletion(prompt);
    const firstValidation = validateInterviewResponse(first.content);
    if (firstValidation.ok) {
      return NextResponse.json(firstValidation.data, {
        status: 200,
        headers: routerDebugHeaders(first),
      });
    }

    // 設計書13章の方針に準じ、JSON不正時は1回のみフォーマット修正の再問い合わせを行う。
    const retryHint = [
      "直前の出力はスキーマ検証に失敗しました。以下のエラーを踏まえ、",
      "指定されたJSON構造のみを、前置きや説明文・コードブロック無しで出力し直してください。",
      `検証エラー: ${firstValidation.message}`,
    ].join("");

    const second = await requestInterviewCompletion(prompt, retryHint);
    const secondValidation = validateInterviewResponse(second.content);
    if (secondValidation.ok) {
      return NextResponse.json(secondValidation.data, {
        status: 200,
        headers: routerDebugHeaders(second),
      });
    }

    throw new ResearchError(
      "invalid_response",
      `モデル出力の検証に2回失敗しました: ${secondValidation.message}`,
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
