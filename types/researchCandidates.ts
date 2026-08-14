import { z } from "zod";

/**
 * Pass1オーケストレーション（`lib/researchOrchestrator.ts`）のステージ1「候補生成」の
 * レスポンス型。Web検索は行わず、`goal.type`/`goal.description` から一般知識のみで
 * 代替ルートの候補ラベルを発想する（検索グラウンディングはステージ2で個別に行う）。
 *
 * 実測（2026-08-15）: 検索を伴わない自由な列挙は、6〜8件を超えたあたりから
 * 重複・的外れな項目に劣化する傾向が確認できたため、件数を絞って質を優先する。
 */
export const researchCandidatesSchema = z.object({
  candidates: z.array(z.string()).max(6).default([]),
});
export type ResearchCandidates = z.infer<typeof researchCandidatesSchema>;
