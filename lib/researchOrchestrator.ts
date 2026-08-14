import { buildCandidatesPrompt, buildGroundingPrompt } from "@/lib/PromptBuilder";
import { requestCandidatesCompletion, requestGroundingCompletion } from "@/lib/OrcaRouterClient";
import { researchCandidatesSchema } from "@/types/researchCandidates";
import { topicFindingResponseSchema, type FactFindingResponse } from "@/types/factFinding";
import type { ResearchRequest, Source } from "@/types/research";
import { stripNullValues } from "@/lib/jsonNormalize";

/**
 * Pass1（基礎調査）の「推奨性能」構成: カテゴリ単位で複数回に分割してWeb検索する
 * オーケストレーション。設計・実測の詳細は docs/api-cost.md 参照。
 *
 * ステージ1: 候補生成（Web検索なし、1回）
 *   `goal.type`/`goal.description` から代替ルートの候補ラベルを最大6件発想する。
 * ステージ2: 個別グラウンディング（Web検索あり、並列、ベースライン1件＋候補ごとに1件）
 *   候補ラベルごとに単一の狭い質問を投げ、実在を確認する。実在しない候補は
 *   `facts` が空配列で返り、そのまま脱落する（無理に埋めない）。
 * ステージ3: 深掘り（Web検索あり、並列、最大3件）
 *   ステージ2で実在が確認できた候補のうち、情報源が多い順に上位3件について
 *   具体的な金額・要件・申請の流れを追加で調べる。
 *
 * 各ステージは失敗しても例外を外へ投げず、可能な範囲の結果をベストエフォートで
 * マージして返す（呼び出し元 `runFactFindingBestEffort` も同様の方針）。
 */

const MAX_CANDIDATES = 6;
const MAX_DEPTH_TARGETS = 3;

interface TopicResult {
  /** 候補の短いラベル（深掘り時の再利用・出典の重複排除用）。ベースラインは undefined。 */
  label?: string;
  facts: string[];
  sources: Source[];
}

async function runTopic(
  request: Pick<ResearchRequest, "profile" | "goal">,
  query: string,
  label?: string,
): Promise<TopicResult | undefined> {
  try {
    const prompt = await buildGroundingPrompt(request, query);
    const { content } = await requestGroundingCompletion(prompt);
    const parsed = topicFindingResponseSchema.safeParse(stripNullValues(JSON.parse(content)));
    if (!parsed.success) return undefined;
    return { label, facts: parsed.data.facts, sources: parsed.data.sources };
  } catch {
    return undefined;
  }
}

async function runCandidateGeneration(
  request: Pick<ResearchRequest, "profile" | "goal">,
): Promise<string[]> {
  try {
    const prompt = await buildCandidatesPrompt(request);
    const { content } = await requestCandidatesCompletion(prompt);
    const parsed = researchCandidatesSchema.safeParse(stripNullValues(JSON.parse(content)));
    if (!parsed.success) return [];
    return parsed.data.candidates.slice(0, MAX_CANDIDATES);
  } catch {
    return [];
  }
}

function mergeResults(results: (TopicResult | undefined)[]): FactFindingResponse | undefined {
  const valid = results.filter((r): r is TopicResult => !!r);
  const facts = valid.flatMap((r) => r.facts);
  const sourceMap = new Map<string, Source>();
  for (const r of valid) {
    for (const s of r.sources) {
      if (!sourceMap.has(s.url)) sourceMap.set(s.url, s);
    }
  }
  if (facts.length === 0) return undefined;
  return { facts, sources: [...sourceMap.values()] };
}

export async function runOrchestratedFactFinding(
  request: Pick<ResearchRequest, "profile" | "goal">,
): Promise<FactFindingResponse | undefined> {
  const candidates = await runCandidateGeneration(request);

  // ステージ2: ベースライン1件 + 候補ごとに1件、並列実行。
  const baselineQuery = `${request.goal.description} を実現する上での、業界動向・年収相場・必要な資格や準備・利用できる制度・リスクの実例を教えてください。`;
  const candidateQueries = candidates.map(
    (c) =>
      `${request.goal.description} に関連して、「${c}」を実現できる具体的な制度・サービス・支援窓口は実在しますか？実在する場合は制度名・実施団体名を教えてください。`,
  );
  const stage2 = await Promise.all([
    runTopic(request, baselineQuery),
    ...candidates.map((c, i) => runTopic(request, candidateQueries[i], c)),
  ]);

  // ステージ3: ステージ2で実在確認できた候補（ベースラインを除く）のうち、
  // 情報源が多い順に上位 MAX_DEPTH_TARGETS 件だけ深掘りする。
  const groundedCandidates = stage2.filter(
    (r): r is TopicResult => !!r && !!r.label && r.facts.length > 0 && r.sources.length > 0,
  );
  const depthTargets = [...groundedCandidates]
    .sort((a, b) => b.sources.length - a.sources.length)
    .slice(0, MAX_DEPTH_TARGETS);
  const stage3 = await Promise.all(
    depthTargets.map((t) =>
      runTopic(request, `「${t.label}」について、具体的な金額・要件・申請の流れを詳しく教えてください。`, t.label),
    ),
  );

  return mergeResults([...stage2, ...stage3]);
}
