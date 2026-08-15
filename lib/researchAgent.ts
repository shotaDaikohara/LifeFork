import { buildFactFindingPrompt } from "@/lib/PromptBuilder";
import {
  requestAgenticSearchTurn,
  requestAgenticJudgmentTurn,
  requestAgenticExtractionTurn,
} from "@/lib/OrcaRouterClient";
import type { ResearchRequest } from "@/types/research";
import type { MergedFactFinding } from "@/types/factFinding";
import type { AgenticStepStateInput } from "@/types/agenticSearch";

/**
 * Pass1 基礎調査（mode: "normal"）のエージェント型検索。
 * `lib/researchOrchestrator.ts`（候補生成→個別グラウンディング→深掘りを固定回数で回す
 * 手動オーケストレーション）を置き換える。設計: docs/pass1-agentic-search-design.md
 *
 * 検索ターン（Web Search可）と自己判定ターン（Web Searchなし・構造化出力のみ）を
 * 交互に呼び、モデル自身が「もう十分か／まだ何が足りないか」を判定する。
 * アプリ側は「何を・何回検索するか」を一切固定せず、ループの器（上限サイクル数という
 * 安全弁）だけを持つ。
 *
 * 実測（同ドキュメント5章・TOBE PoC 10回）: 検索2〜5回・平均約3回で収束（80%）。
 * 収束しない場合は MAX_CYCLES で強制終了し、その時点までの facts で Pass2 へ進む
 * （情報が薄い出力になるリスクはあるが、無限ループ・暴走コストにはならない）。
 */
const MAX_CYCLES = 3;

export async function runAgenticFactFinding(
  request: Pick<ResearchRequest, "profile" | "goal">,
): Promise<MergedFactFinding | undefined> {
  const initialPrompt = await buildFactFindingPrompt(request);

  let previousResponseId: string | undefined;
  let input = initialPrompt.user;
  // instructions（research_facts.md の方針）は初回ターンのみ渡す。
  // 2ターン目以降は previousResponseId により会話履歴として保持されるため不要。
  let instructions: string | undefined = initialPrompt.system;

  for (let cycle = 1; cycle <= MAX_CYCLES; cycle++) {
    const search = await requestAgenticSearchTurn({ instructions, input, previousResponseId });
    instructions = undefined;
    previousResponseId = search.responseId;

    const judge = await requestAgenticJudgmentTurn({ previousResponseId });
    previousResponseId = judge.responseId;

    if (judge.judgment.sufficient) break;
    if (cycle >= MAX_CYCLES) break;

    input = `次の不足カテゴリについて、具体的な金額・要件・実例を調べてください: ${judge.judgment.missing_categories.join("、")}`;
  }

  if (!previousResponseId) return undefined; // MAX_CYCLES>=1 なら到達しないが型上のガード。

  // 会話全体（複数ターンの自由記述）を、Pass2が読める軽量な facts/sources 構造へ変換する。
  const extraction = await requestAgenticExtractionTurn({ previousResponseId });
  if (extraction.facts.length === 0 && extraction.sources.length === 0) return undefined;
  return extraction;
}

// ---------------------------------------------------------------------------
// ステップ実行版（1呼び出し=1サイクル、クライアントが繰り返し呼ぶことで深掘りを継続する）
//
// 実クエリ数（`tool_usage.web_search.num_requests`）で約100回相当の調査を行うには、
// 実測で1サイクルあたり約97秒×約25サイクル ≈ 約40分かかり、Vercelの1回の関数実行時間
// （Fluid Compute有効時でも最大300秒）に収まらない。単一の同期リクエストでは実現不可能な
// ため、1呼び出し=1サイクルの粒度に分割し、クライアント（app/researching/page.tsx）が
// 状態（AgenticStepState）を持ち回しながら繰り返し呼び出す設計にする。
// サーバー側には新たな永続化（KV/DB）を持ち込まず、状態はレスポンスとして毎回クライアントへ
// 返し、次回リクエストにそのまま含めてもらう（`lib/researchSession.ts`のsessionStorage方針と
// 揃えている）。
// ---------------------------------------------------------------------------

// 下限サイクル数は設けない（自己判定を無視して回数を強制するのは、この設計全体が
// 否定してきたやり方であるため）。判定基準（`lib/OrcaRouterClient.ts`の
// requestAgenticJudgmentTurn）を厳格化し、本当に必要な深さを追求した結果として
// 検索回数が自然に決まることを狙う。上限のみ、無限ループ・コスト暴走を防ぐ安全弁として設定する。
const STEP_MAX_CYCLES = 30;
// スタール検出（docs/pass1-agentic-search-design.md 9章）: 新規実クエリ数が
// この回数だけ連続で0だったら、「これ以上検索しても進展しない」とみなして打ち切る。
// これは目標回数の決め打ちではなく、そのリクエスト固有の実測に基づく客観的な停止条件。
const STALL_THRESHOLD = 2;

export type AgenticStepState = AgenticStepStateInput;

export type AgenticStepResult =
  | { status: "continue"; state: AgenticStepState }
  | { status: "done"; factFinding: MergedFactFinding | undefined; cycle: number; totalNumRequests: number };

/**
 * 1サイクル（検索ターン＋自己判定ターン）だけ実行する。`state`未指定なら初回として
 * `prompts/research_facts.md`の方針から開始する。停止判定は完全に自己判定
 * （`sufficient`）に委ね、アプリ側の下限は設けない。上限（`STEP_MAX_CYCLES`）は
 * 暴走防止の安全弁としてのみ機能する。
 */
export async function runAgenticFactFindingStep(
  request: Pick<ResearchRequest, "profile" | "goal">,
  prevState?: AgenticStepState,
): Promise<AgenticStepResult> {
  let instructions: string | undefined;
  let input: string;
  let previousResponseId: string | undefined;
  let cycle: number;
  let totalNumRequests: number;
  let consecutiveZeroNewQueries: number;

  if (!prevState) {
    const initialPrompt = await buildFactFindingPrompt(request);
    instructions = initialPrompt.system;
    input = initialPrompt.user;
    previousResponseId = undefined;
    cycle = 0;
    totalNumRequests = 0;
    consecutiveZeroNewQueries = 0;
  } else {
    instructions = undefined;
    input = prevState.input;
    previousResponseId = prevState.previousResponseId;
    cycle = prevState.cycle;
    totalNumRequests = prevState.totalNumRequests;
    consecutiveZeroNewQueries = prevState.consecutiveZeroNewQueries;
  }

  const search = await requestAgenticSearchTurn({ instructions, input, previousResponseId });
  cycle += 1;
  totalNumRequests += search.numRequests;
  previousResponseId = search.responseId;
  consecutiveZeroNewQueries = search.numRequests === 0 ? consecutiveZeroNewQueries + 1 : 0;

  const judge = await requestAgenticJudgmentTurn({ previousResponseId });
  previousResponseId = judge.responseId;

  const capReached = cycle >= STEP_MAX_CYCLES;
  const stalled = consecutiveZeroNewQueries >= STALL_THRESHOLD;
  const isDone = capReached || stalled || judge.judgment.sufficient;

  if (isDone) {
    // スタールで打ち切った場合のみ、埋まらなかった観点をPass2への引き継ぎとして渡す
    // （自己判定が sufficient: true で正常終了した場合は残課題が無いので渡さない）。
    const unresolvedGaps =
      stalled && !judge.judgment.sufficient ? judge.judgment.missing_categories : undefined;
    const extraction = await requestAgenticExtractionTurn({ previousResponseId, unresolvedGaps });
    const factFinding =
      extraction.facts.length === 0 && extraction.sources.length === 0 ? undefined : extraction;
    return { status: "done", factFinding, cycle, totalNumRequests };
  }

  // missing_categoriesが空なのにsufficient: falseという矛盾した判定が返るケースへの保険
  // （通常はmissing_categoriesがあるはず）。reasoningを手がかりに続行させる。
  const nextInput =
    judge.judgment.missing_categories.length > 0
      ? `次の不足カテゴリについて、具体的な金額・要件・実例を調べてください: ${judge.judgment.missing_categories.join("、")}`
      : `不十分と判断した理由を踏まえて、さらに深掘りしてください: ${judge.judgment.reasoning}`;

  return {
    status: "continue",
    state: { previousResponseId, input: nextInput, cycle, totalNumRequests, consecutiveZeroNewQueries },
  };
}
