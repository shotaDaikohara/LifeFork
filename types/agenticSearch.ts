import { z } from "zod";

/**
 * Pass1 エージェント型検索（`lib/researchAgent.ts`）の自己判定ターンのレスポンス型。
 *
 * 設計・実測根拠: docs/pass1-agentic-search-design.md
 * 検索ターン（Web Search可）と自己判定ターン（Web Searchなし・構造化出力のみ）を
 * 別呼び出しに分離しているのは、両方を同じ呼び出しに同居させると検索よりスキーマ充足が
 * 優先され検索が発火しなくなる問題が実測で確認されたため（同ドキュメント3.2節）。
 */
export const agenticJudgmentSchema = z.object({
  sufficient: z.boolean(),
  // 十分な場合は空配列。モデル自身が「まだ調べるべき」と判断したカテゴリの一覧
  // （アプリ側で事前にカテゴリを固定しない。詳細は docs/pass1-agentic-search-design.md 4章）。
  missing_categories: z.array(z.string()).default([]),
  reasoning: z.string(),
});
export type AgenticJudgment = z.infer<typeof agenticJudgmentSchema>;

/**
 * POST /api/research/step のリクエスト/レスポンスで、クライアントと往復させる進捗状態。
 * サーバー側に新たな永続化（KV/DB）を持ち込まず、状態はレスポンスとしてクライアントへ返し、
 * 次回リクエストにそのまま含めてもらう設計（`lib/researchAgent.ts` 参照）。
 */
export const agenticStepStateSchema = z.object({
  previousResponseId: z.string().optional(),
  input: z.string(),
  cycle: z.number().int().min(0),
  totalNumRequests: z.number().int().min(0),
  // スタール検出用（docs/pass1-agentic-search-design.md 9章）。直近何サイクル連続で
  // 新規実クエリ数(numRequests)が0だったかを数え、2に達したら「これ以上検索しても
  // 進展しない」とみなして打ち切る。
  consecutiveZeroNewQueries: z.number().int().min(0).default(0),
});
export type AgenticStepStateInput = z.infer<typeof agenticStepStateSchema>;

export const agenticStepRequestSchema = z.object({
  profile: z.object({ fields: z.record(z.string(), z.string()).default({}) }),
  goal: z.object({ type: z.enum(["career_change", "independence"]), description: z.string().min(1) }),
  state: agenticStepStateSchema.optional(),
});
export type AgenticStepRequest = z.infer<typeof agenticStepRequestSchema>;
