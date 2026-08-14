import { NextResponse } from "next/server";
import { researchRequestSchema } from "@/types/research";
import { buildFactFindingPrompt, buildResearchPrompt } from "@/lib/PromptBuilder";
import {
  getModelAuto,
  isFactFindingConfigured,
  requestFactFindingCompletion,
  requestResearchCompletion,
  routerDebugHeaders,
} from "@/lib/OrcaRouterClient";
import { validateResearchResult } from "@/lib/ResultValidator";
import { validateFactFindingResponse } from "@/lib/FactFindingValidator";
import type { FactFindingResponse } from "@/types/factFinding";
import { ResearchError, toErrorResponse } from "@/lib/errors";
import { requireAuthorizedUser } from "@/lib/apiGuard";

export const runtime = "nodejs";
// Pass1(基礎調査) + Pass2(詳細生成、リトライ含む) の合計で90秒前後かかりうるため長めに確保する。
// Vercel Hobbyプランは通常60秒上限だが、Fluid Compute有効時は300秒まで設定できる。
export const maxDuration = 120;

/**
 * POST /api/research
 * 設計書 7章・8.2章に対応する ResearchController。
 * 未認証は401、ホワイトリスト対象外は403、Rate Limit超過は429を返す（設計書14.1章・14.2章）。
 *
 * Pass1 (基礎調査・Web Search対応モデル) → Pass2 (詳細生成・通常モデル) の2段階構成。
 * search系モデルは出力トークンが実測1,000〜1,500程度に制限されており、3道比較を含む
 * 大きな ResearchResult を直接生成させると出力が途中で切れる (2026-08-12 実測)。
 * そのため Web Search は軽量な基礎調査のみで使い、その結果を詳細生成のプロンプトに
 * 埋め込むことで、情報量の多い新UIと最新情報の反映を両立する。
 * 基礎調査はベストエフォートとし、失敗・未設定でも詳細生成は続行する。
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

    const factFinding = await runFactFindingBestEffort(parsed.data);

    const prompt = await buildResearchPrompt(parsed.data, factFinding);

    // モデル選択方針（docs/orcarouter-routing-design.md 参照）:
    // 「このリクエストにどのモデルを割り当てるべきか」の判断はアプリ側では一切行わず、
    // 通常モード(mode: "normal")は毎回 orcarouter/auto（OrcaRouter自身の判断）に委ねる。
    // エコモード(mode: "eco")は判断そのものを省略し、常に固定・低コストの ORCAROUTER_MODEL
    // のみを使う。1回目・2回目(検証失敗時の再試行)とも同じ方針で統一する。
    const modelOverride = parsed.data.mode === "normal" ? getModelAuto() : undefined;

    const first = await requestResearchCompletion(prompt, undefined, modelOverride);
    const firstValidation = validateResearchResult(first.content);
    if (firstValidation.ok) {
      return NextResponse.json(firstValidation.data, {
        status: 200,
        headers: routerDebugHeaders(first),
      });
    }

    // 設計書13章: JSON不正時は余裕があれば1回のみフォーマット修正の再問い合わせを行う。
    const retryHint = [
      "直前の出力はスキーマ検証に失敗しました。以下のエラーを踏まえ、",
      "指定されたJSON構造のみを、前置きや説明文・コードブロック無しで出力し直してください。",
      `検証エラー: ${firstValidation.message}`,
    ].join("");

    const second = await requestResearchCompletion(prompt, retryHint, modelOverride);
    const secondValidation = validateResearchResult(second.content);
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

/**
 * Pass1（基礎調査）をベストエフォートで実行する。
 * ORCAROUTER_FACT_MODEL 未設定、タイムアウト、検証失敗など、いかなる理由でも
 * 例外を外へ投げず、詳細生成 (Pass2) は facts なしで続行できるようにする。
 */
async function runFactFindingBestEffort(
  request: Parameters<typeof buildFactFindingPrompt>[0],
): Promise<FactFindingResponse | undefined> {
  if (!isFactFindingConfigured()) return undefined;

  try {
    const prompt = await buildFactFindingPrompt(request);
    const { content } = await requestFactFindingCompletion(prompt);
    const validation = validateFactFindingResponse(content);
    return validation.ok ? validation.data : undefined;
  } catch {
    return undefined;
  }
}
