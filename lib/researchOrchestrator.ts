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
 *   Pass2は最終的に必ず「素朴なフルコース」を含む3道を出力しうるが、Stage1は
 *   代替ルートしか発想しないため、素朴なルートを固定候補として先頭に追加する
 *   （後述の理由）。
 * ステージ2: 個別グラウンディング（Web検索あり、並列、ベースライン1件＋候補ごとに1件）
 *   候補ラベルごとに単一の狭い質問を投げ、実在を確認する。実在しない候補は
 *   `facts` が空配列で返り、そのまま脱落する（無理に埋めない）。
 * ステージ3: 深掘り（Web検索あり、並列、最大4件×2クエリ）
 *   ステージ2で実在が確認できた候補のうち、(a)固定候補「素朴なフルコース」を
 *   常に1枠確保、(b)残りは情報源が多い順に上位3件、の計最大4件について、
 *   価値が実証された2種類の問いを追加で調べる:
 *     (a) 具体的な金額・要件・申請の流れ
 *     (b) 実際に行われた具体的な事例（成功例・失敗例、人物名・地域名付き）
 *   「地域差の比較」「申請の時系列・注意点」は実測で出典が付かない／無関係な
 *   結果になりやすいと確認できたため、深掘り対象から意図的に外している
 *   （検証内容は docs/api-cost.md 参照）。
 *
 * 【固定候補「素朴なフルコース」を追加する理由】
 * Pass2（詳細生成）が出力する3道のうち少なくとも1件は、多くの場合
 * 「ゼロから自己資金で始める」という素朴なルートになる（`research_system.md`
 * の方針上、代替ルートが本当に無いテーマではこの型にフォールバックする）。
 * しかし Stage1（候補生成）は「素朴なルート以外」しか発想しないため、
 * このルートには専用の深掘りクエリが一つも割り当たらず、Pass2が出力する
 * 3道のうち1つだけ他の道より調査が薄いという非対称が生じていた。
 * ウェディングフォトの日程調整AIが「訪問する7か所」それぞれを深掘りするのと
 * 同様に、最終的に道として採用されうる候補は素朴なルートも含めて同格に
 * 深掘りするべき、という整理から固定候補として追加している。
 *
 * 各ステージは失敗しても例外を外へ投げず、可能な範囲の結果をベストエフォートで
 * マージして返す（呼び出し元 `runFactFindingBestEffort` も同様の方針）。
 */

const MAX_CANDIDATES = 6;
const MAX_DEPTH_TARGETS = 3;
const NAIVE_ROUTE_LABEL = "ゼロから自己資金・独学で用意する素朴なフルコース";
const DEPTH_QUERY_TEMPLATES = [
  (label: string) => `「${label}」について、具体的な金額・要件・申請の流れを詳しく教えてください。`,
  (label: string) => `「${label}」が実際に行われた具体的な事例（成功例・失敗例）を、人物名や地域名も含めて具体的に教えてください。`,
];

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
  const discovered = await runCandidateGeneration(request);
  // 素朴なフルコースは常に候補の先頭に固定で含める（理由は関数群のコメント参照）。
  const candidates = [NAIVE_ROUTE_LABEL, ...discovered];

  // ステージ2: ベースライン1件 + 候補ごとに1件、並列実行。
  const baselineQuery = `${request.goal.description} を実現する上での、業界動向・年収相場・必要な資格や準備・利用できる制度・リスクの実例を教えてください。`;
  const candidateQueries = candidates.map((c) =>
    c === NAIVE_ROUTE_LABEL
      ? `${request.goal.description} を、他者の力を借りず自己資金・独学だけでゼロから実現する場合、具体的にどれくらいの費用・期間・準備が必要ですか？`
      : `${request.goal.description} に関連して、「${c}」を実現できる具体的な制度・サービス・支援窓口は実在しますか？実在する場合は制度名・実施団体名を教えてください。`,
  );
  const stage2 = await Promise.all([
    runTopic(request, baselineQuery),
    ...candidates.map((c, i) => runTopic(request, candidateQueries[i], c)),
  ]);

  // ステージ3: 深掘り対象は最大 MAX_DEPTH_TARGETS+1 件。
  // 素朴なフルコースが実在確認できていれば1枠を確保し、残りは情報源が
  // 多い順に上位 MAX_DEPTH_TARGETS 件（素朴なフルコース自身は除く）。
  const groundedCandidates = stage2.filter(
    (r): r is TopicResult => !!r && !!r.label && r.facts.length > 0 && r.sources.length > 0,
  );
  const naiveTarget = groundedCandidates.find((r) => r.label === NAIVE_ROUTE_LABEL);
  const otherTargets = groundedCandidates
    .filter((r) => r.label !== NAIVE_ROUTE_LABEL)
    .sort((a, b) => b.sources.length - a.sources.length)
    .slice(0, MAX_DEPTH_TARGETS);
  const depthTargets = naiveTarget ? [naiveTarget, ...otherTargets] : otherTargets;

  const stage3 = await Promise.all(
    depthTargets.flatMap((t) =>
      DEPTH_QUERY_TEMPLATES.map((buildQuery) => runTopic(request, buildQuery(t.label!), t.label)),
    ),
  );

  return mergeResults([...stage2, ...stage3]);
}
