import { z } from "zod";

/**
 * LifeFork ドメイン型定義
 *
 * 設計書「LifeFork_システム基本設計_v0.4」 8章・10章をベースに、
 * UI案 (lifefork_demo 0813トンマナ.html) の情報構造へ拡張したもの。
 * zod スキーマを単一の情報源とし、型はスキーマから推論する。
 * ワイヤーフレーム未確定のため profile.fields は自由なキー/値を許容する。
 *
 * v0.4設計からの主な拡張（UI案対応）:
 * - targetPath (単数) → targetPaths (3件固定: 「進める道」A/B/C)
 * - 各パスに年次推移シーン(yearlyScenes: y1/y3/y5)を追加
 * - 各 targetPath に条件シミュレーション係数(tuneFactors)を追加
 *   （UI案のスライダー「貯金/準備期間/週の時間/引っ越し可否」を動かした際の
 *   フロントエンド側での近似再計算に使う。AIが出す値はあくまで目安の感度。）
 * - summary.facts ( 0-100の「いま向いてる度」等) を追加。
 *   設計書10章は「将来性70点のような根拠の弱い疑似精密スコアは持たせない」と
 *   明記しているが、UI案の要求により明示的に追加した。ユーザー判断による例外。
 * - checks (足りているもの/足りないもの) を追加
 * - 出典番号参照システム（sourceIndex）を追加（2026-08-13 トンマナ更新対応）。
 *   sources配列は [{title,url}] のシンプルな配列とし、verdict.lead / facts各項目 /
 *   checks各項目 / 確率シミュレーション / 各パス(detail・plan・firstStep・年次シーン共通)
 *   に、根拠として使った sources のインデックス（1始まり）を持たせる。
 *   AIが生成しない場合は省略可能（=根拠を示さない）。
 *
 * ヒアリング質問 (InterviewQuestion) は v0.3 で AI 動的生成に変更されたため
 * types/interview.ts で定義する。本ファイルの Profile / Goal / GoalType は
 * interview.ts からも再利用される。
 */

// ---------------------------------------------------------------------------
// Request: POST /api/research
// ---------------------------------------------------------------------------

export const goalTypeSchema = z.enum(["career_change", "independence"]);
export type GoalType = z.infer<typeof goalTypeSchema>;

export const profileSchema = z.object({
  fields: z.record(z.string(), z.string()).default({}),
});
export type Profile = z.infer<typeof profileSchema>;

export const goalSchema = z.object({
  type: goalTypeSchema,
  description: z.string().min(1, "goal.description は必須です"),
});
export type Goal = z.infer<typeof goalSchema>;

export const interviewAnswerSchema = z.object({
  questionId: z.string().min(1),
  // POST /api/interview で動的生成された質問文。DBを持たないため、
  // PromptBuilder が research_system.md 向けプロンプトを組み立てる際の
  // 質問ラベル解決はクライアントから再送されるこの値に依存する。
  question: z.string().optional(),
  answer: z.string(),
});
export type InterviewAnswer = z.infer<typeof interviewAnswerSchema>;

export const researchRequestSchema = z.object({
  profile: profileSchema,
  goal: goalSchema,
  answers: z.array(interviewAnswerSchema).default([]),
});
export type ResearchRequest = z.infer<typeof researchRequestSchema>;

// ---------------------------------------------------------------------------
// Response: ResearchResult (設計書10章 + UI案拡張)
// ---------------------------------------------------------------------------

export const likelihoodSchema = z.enum(["low", "medium", "high", "unknown"]);
export type Likelihood = z.infer<typeof likelihoodSchema>;

export const impactSchema = z.enum(["low", "medium", "high"]);
export type Impact = z.infer<typeof impactSchema>;

export const riskSchema = z.object({
  title: z.string(),
  likelihood: likelihoodSchema,
  impact: impactSchema,
  description: z.string(),
});
export type Risk = z.infer<typeof riskSchema>;

export const outlookSchema = z.object({
  summary: z.string(),
  evidence: z.array(z.string()).default([]),
});
export type Outlook = z.infer<typeof outlookSchema>;

export const currentIncomeSchema = z.object({
  current: z.number(),
  year3Low: z.number(),
  year3Base: z.number(),
  year3High: z.number(),
  assumptions: z.array(z.string()).default([]),
});
export type CurrentIncome = z.infer<typeof currentIncomeSchema>;

export const targetIncomeSchema = z.object({
  year3Low: z.number(),
  year3Base: z.number(),
  year3High: z.number(),
  assumptions: z.array(z.string()).default([]),
});
export type TargetIncome = z.infer<typeof targetIncomeSchema>;

// ---- 出典（sources）と、各コンテンツからの番号参照 ----
// UI案は sources を [title, url] のシンプルな配列とし、各コンテンツ要素が
// 1始まりのインデックスで参照する（表示側は該当箇所に小さくリンクを添える）。
export const sourceSchema = z.object({
  title: z.string(),
  url: z.string(),
});
export type Source = z.infer<typeof sourceSchema>;

// sources配列を参照する1始まりのインデックス。
export const sourceIndexSchema = z.number().int().min(1);
export const sourceIndexesSchema = z.array(sourceIndexSchema).default([]);

// ---- 年次推移シーン（UI案「1年後/3年後/5年後」演出） ----

export const yearSceneStatSchema = z.object({
  label: z.string(),
  value: z.string(),
});
export type YearSceneStat = z.infer<typeof yearSceneStatSchema>;

export const yearSceneSchema = z.object({
  headline: z.string(),
  narrative: z.string(),
  stats: z.array(yearSceneStatSchema).min(1).max(6),
});
export type YearScene = z.infer<typeof yearSceneSchema>;

export const yearlyScenesSchema = z.object({
  y1: yearSceneSchema,
  y3: yearSceneSchema,
  y5: yearSceneSchema,
});
export type YearlyScenes = z.infer<typeof yearlyScenesSchema>;

// ---- 条件シミュレーション係数（UI案スライダーの近似再計算用、目安値） ----

export const tuneFactorsSchema = z.object({
  base: z.number().min(0).max(100),
  savingsSensitivity: z.number().min(0).max(100),
  prepMonthsSensitivity: z.number().min(0).max(100),
  weeklyHoursSensitivity: z.number().min(0).max(100),
  relocationSensitivity: z.number().min(0).max(100),
});
export type TuneFactors = z.infer<typeof tuneFactorsSchema>;

export const pathMetricSchema = z.object({
  label: z.string(),
  value: z.string(),
});
export type PathMetric = z.infer<typeof pathMetricSchema>;

// ---- グラフ用の数値系列（UI案の年収/貯金/夢への近さ/満足度の推移グラフ用） ----
// yearlyScenes.stats は表示用の自由なラベル文字列だが、グラフ描画には厳密な
// 数値配列が必要なため、[いま, 1年後, 3年後, 5年後] の4点で別途持たせる。
export const trendSeriesSchema = z.object({
  income: z.array(z.number()).length(4),
  savings: z.array(z.number()).length(4),
  dreamCloseness: z.array(z.number().min(0).max(100)).length(4),
  satisfaction: z.array(z.number().min(0).max(100)).length(4),
});
export type TrendSeries = z.infer<typeof trendSeriesSchema>;

export const firstStepSchema = z.object({
  headline: z.string(),
  body: z.string(),
});
export type FirstStep = z.infer<typeof firstStepSchema>;

export const planStepSchema = z.object({
  period: z.string(),
  title: z.string(),
  detail: z.string(),
});
export type PlanStep = z.infer<typeof planStepSchema>;

// ---- パス本体 ----
// sourceIndex: そのパスの detail / plan / firstStep / yearlyScenes に共通する
// 主要な根拠（UI案の path.src に対応、単一・省略可）。

export const currentPathSchema = z.object({
  title: z.string(),
  outlook: outlookSchema,
  income: currentIncomeSchema,
  steps: z.array(z.string()).default([]),
  risks: z.array(riskSchema).default([]),
  yearlyScenes: yearlyScenesSchema,
  series: trendSeriesSchema,
  sourceIndex: sourceIndexSchema.optional(),
});
export type CurrentPath = z.infer<typeof currentPathSchema>;

export const targetPathSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  tagline: z.string(),
  recommended: z.boolean().default(false),
  outlook: outlookSchema,
  income: targetIncomeSchema,
  steps: z.array(z.string()).default([]),
  risks: z.array(riskSchema).default([]),
  metrics: z.array(pathMetricSchema).min(2).max(4),
  detail: z.string(),
  yearlyScenes: yearlyScenesSchema,
  series: trendSeriesSchema,
  tuneFactors: tuneFactorsSchema,
  firstStep: firstStepSchema,
  plan: z.array(planStepSchema).min(3).max(6),
  sourceIndex: sourceIndexSchema.optional(),
});
export type TargetPath = z.infer<typeof targetPathSchema>;

export const checkItemSchema = z.object({
  status: z.enum(["ok", "ng"]),
  title: z.string(),
  detail: z.string(),
  sourceIndex: sourceIndexSchema.optional(),
});
export type CheckItem = z.infer<typeof checkItemSchema>;

// ---- summary.facts（UI案 verdict.facts、固定4項目） ----
// 設計書10章の「疑似精密スコアを持たせない」方針とは矛盾するが、UI案要求により
// ユーザー判断で追加。sourceIndexは根拠が示せる場合のみ付与する（例: 相場データ）。
export const factSchema = z.object({
  label: z.string(),
  value: z.number(),
  unit: z.string(),
  sourceIndex: sourceIndexSchema.optional(),
});
export type Fact = z.infer<typeof factSchema>;

export const summarySchema = z.object({
  headline: z.string(),
  // 1文程度の短いリード文（UI案 verdict.lead）。詳しい説明は checks / facts に譲る。
  lead: z.string(),
  leadSourceIndexes: sourceIndexesSchema,
  fitScore: factSchema, // 例: { label: "いま向いてる度", value: 58, unit: "/100" }
  availableFunds: factSchema, // 例: { label: "準備できるお金", value: 800, unit: "万円" }
  survivalPeriod: factSchema, // 例: { label: "生活できる期間", value: 22, unit: "か月" }
  relevantExperience: factSchema, // 例: { label: "いちご経験", value: 0, unit: "年" }
});
export type Summary = z.infer<typeof summarySchema>;

export const researchResultSchema = z.object({
  summary: summarySchema,
  currentPath: currentPathSchema,
  // UI案は「今のまま」+ 進める道3つ(A/B/C)固定で構成される。
  targetPaths: z.array(targetPathSchema).length(3),
  checks: z.array(checkItemSchema).min(3).max(8),
  // 条件シミュレーション（確率バー）全体の主な根拠（UI案 D.rateSrc、単一・省略可）。
  rateSourceIndex: sourceIndexSchema.optional(),
  sources: z.array(sourceSchema).default([]),
  limitations: z.array(z.string()).default([]),
});
export type ResearchResult = z.infer<typeof researchResultSchema>;

// ---------------------------------------------------------------------------
// API エラー形式
// ---------------------------------------------------------------------------

export interface ApiErrorBody {
  error: {
    code:
      | "invalid_request"
      | "unauthorized"
      | "forbidden"
      | "app_rate_limited"
      | "rate_limited"
      | "upstream_error"
      | "timeout"
      | "invalid_response"
      | "internal_error";
    message: string;
  };
}
