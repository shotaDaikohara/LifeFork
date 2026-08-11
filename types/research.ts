import { z } from "zod";

/**
 * LifeFork ドメイン型定義
 *
 * 設計書「LifeFork_システム基本設計_v0.3」 8章・10章に対応。
 * zod スキーマを単一の情報源とし、型はスキーマから推論する。
 * ワイヤーフレーム未確定のため profile.fields は自由なキー/値を許容する。
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
// Response: ResearchResult (設計書 10章)
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

export const currentPathSchema = z.object({
  title: z.string(),
  outlook: outlookSchema,
  income: currentIncomeSchema,
  steps: z.array(z.string()).default([]),
  risks: z.array(riskSchema).default([]),
});
export type CurrentPath = z.infer<typeof currentPathSchema>;

export const targetPathSchema = z.object({
  title: z.string(),
  outlook: outlookSchema,
  income: targetIncomeSchema,
  steps: z.array(z.string()).default([]),
  risks: z.array(riskSchema).default([]),
});
export type TargetPath = z.infer<typeof targetPathSchema>;

export const sourceSchema = z.object({
  title: z.string(),
  url: z.string(),
  usedFor: z.string(),
});
export type Source = z.infer<typeof sourceSchema>;

export const summarySchema = z.object({
  headline: z.string(),
  comparisonConclusion: z.string(),
});
export type Summary = z.infer<typeof summarySchema>;

export const researchResultSchema = z.object({
  summary: summarySchema,
  currentPath: currentPathSchema,
  targetPath: targetPathSchema,
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
      | "rate_limited"
      | "upstream_error"
      | "timeout"
      | "invalid_response"
      | "internal_error";
    message: string;
  };
}
