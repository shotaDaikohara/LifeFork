import { NextResponse } from "next/server";
import { agenticStepRequestSchema } from "@/types/agenticSearch";
import { runAgenticFactFindingStep } from "@/lib/researchAgent";
import { buildResearchPrompt } from "@/lib/PromptBuilder";
import { getModelAuto, requestResearchCompletion, routerDebugHeaders } from "@/lib/OrcaRouterClient";
import { validateResearchResult } from "@/lib/ResultValidator";
import { ResearchError, toErrorResponse } from "@/lib/errors";
import { requireAuthorizedUser } from "@/lib/apiGuard";

export const runtime = "nodejs";
// 1呼び出し=1サイクル（検索ターン+自己判定ターン）。実測で1サイクル最大約120秒程度。
// 最終サイクルはこれに加えて抽出ターン+Pass2（検索なし）が乗るため長めに確保する。
export const maxDuration = 280;

/**
 * POST /api/research/step
 * `mode: "normal"` のPass1（エージェント型検索、`lib/researchAgent.ts`）を1サイクルだけ
 * 進める。ユーザーが指定した下限（実クエリ数約100回相当≒25サイクル）に達するまで
 * `sufficient: true` を無視して継続するため、Pass1全体では最大40分程度かかりうる。
 * これは単一のVercel関数実行時間（Fluid Compute有効時でも最大300秒）に収まらないため、
 * クライアント（app/researching/page.tsx）がこのエンドポイントを繰り返し呼び出す
 * ポーリング方式にしている。サーバー側に新たな永続化は持ち込まず、状態
 * （`AgenticStepState`）は毎回レスポンスとして返し、次回リクエストにそのまま含めてもらう。
 *
 * `status: "done"` になったら、この呼び出しの中で抽出ターン＋Pass2まで実行し、
 * 完成した `ResearchResult` を返す（`mode: "eco"` は対象外、`/api/research` を使う）。
 *
 * 設計・実測根拠: docs/pass1-agentic-search-design.md
 */
export async function POST(request: Request) {
  try {
    await requireAuthorizedUser();

    const json = await request.json().catch(() => {
      throw new ResearchError("invalid_request", "リクエストボディがJSONとして解釈できません。");
    });

    const parsed = agenticStepRequestSchema.safeParse(json);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join(" / ");
      throw new ResearchError("invalid_request", `入力内容が不正です: ${issues}`);
    }

    const { profile, goal, state } = parsed.data;
    const step = await runAgenticFactFindingStep({ profile, goal }, state);

    if (step.status === "continue") {
      return NextResponse.json({
        status: "continue" as const,
        state: step.state,
        progress: { cycle: step.state.cycle, totalNumRequests: step.state.totalNumRequests },
      });
    }

    // Pass1完了。Pass2（詳細生成、検索なし）まで通してこの呼び出しで完成させる。
    const researchRequest = { profile, goal, answers: [], mode: "normal" as const };
    const prompt = await buildResearchPrompt(researchRequest, step.factFinding);
    const modelOverride = getModelAuto();

    const first = await requestResearchCompletion(prompt, undefined, modelOverride);
    const firstValidation = validateResearchResult(first.content);
    if (firstValidation.ok) {
      return NextResponse.json(
        {
          status: "done" as const,
          result: firstValidation.data,
          progress: { cycle: step.cycle, totalNumRequests: step.totalNumRequests },
        },
        { headers: routerDebugHeaders(first) },
      );
    }

    const retryHint = [
      "直前の出力はスキーマ検証に失敗しました。以下のエラーを踏まえ、",
      "指定されたJSON構造のみを、前置きや説明文・コードブロック無しで出力し直してください。",
      `検証エラー: ${firstValidation.message}`,
    ].join("");
    const second = await requestResearchCompletion(prompt, retryHint, modelOverride);
    const secondValidation = validateResearchResult(second.content);
    if (secondValidation.ok) {
      return NextResponse.json(
        {
          status: "done" as const,
          result: secondValidation.data,
          progress: { cycle: step.cycle, totalNumRequests: step.totalNumRequests },
        },
        { headers: routerDebugHeaders(second) },
      );
    }

    throw new ResearchError(
      "invalid_response",
      `モデル出力の検証に2回失敗しました: ${secondValidation.message}`,
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
