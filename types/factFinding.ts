import { z } from "zod";
import { sourceSchema } from "@/types/research";

/**
 * Pass1「基礎調査」のレスポンス型。
 *
 * search系モデル（-search-preview 等）は出力トークンが実測で1,000〜1,500程度に
 * 制限されており、3道比較を含む大きな ResearchResult を直接生成させると出力が
 * 途中で切れてしまう（2026-08-12 実測）。そのため Web Search はこの軽量な
 * 事実調査ステップのみで使用し、詳細な ResearchResult 生成 (Pass2) は
 * Web Search なしの通常モデルで行う。
 */
export const factFindingResponseSchema = z.object({
  facts: z.array(z.string()).min(1).max(8),
  sources: z.array(sourceSchema).default([]),
});
export type FactFindingResponse = z.infer<typeof factFindingResponseSchema>;

/**
 * 個別グラウンディング・深掘り呼び出し（`lib/researchOrchestrator.ts`）1回分のレスポンス型。
 * `factFindingResponseSchema` とほぼ同じ形だが、1トピックぶんの軽量な回答を想定し
 * `facts` は最大3件に絞る（実在しない場合は空配列を許容）。
 */
export const topicFindingResponseSchema = z.object({
  facts: z.array(z.string()).max(3).default([]),
  sources: z.array(sourceSchema).default([]),
});
export type TopicFindingResponse = z.infer<typeof topicFindingResponseSchema>;

/**
 * オーケストレーション（`lib/researchOrchestrator.ts`）で複数呼び出しの結果を
 * マージした最終形。`factFindingResponseSchema` は単一LLM呼び出しの出力検証用に
 * `facts` を最大8件に制限しているが、マージ後はステージ数ぶん増えるため上限を緩めた
 * 型を別途用意する（LLMの出力そのものの検証には使わない、コード内で組み立てる値）。
 */
export const mergedFactFindingSchema = z.object({
  facts: z.array(z.string()).max(40),
  sources: z.array(sourceSchema).default([]),
});
export type MergedFactFinding = z.infer<typeof mergedFactFindingSchema>;
