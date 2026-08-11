import { z } from "zod";
import { goalSchema, profileSchema } from "@/types/research";

/**
 * ヒアリング質問のドメイン型定義。
 *
 * 設計書「LifeFork_システム基本設計_v0.3」 8.1章・11章に対応。
 * v0.3 でヒアリングは静的な質問ファイルから、OrcaRouterによる
 * 1回生成・最大4問の動的質問 (InterviewQuestion[]) に変更された。
 */

export const MAX_INTERVIEW_QUESTIONS = 4;

export const interviewQuestionTypeSchema = z.enum(["text", "single_select"]);
export type InterviewQuestionType = z.infer<typeof interviewQuestionTypeSchema>;

export const interviewQuestionSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    type: interviewQuestionTypeSchema,
    options: z.array(z.string()).default([]),
    required: z.boolean().default(false),
  })
  .refine(
    (q) => q.type !== "single_select" || q.options.length > 0,
    { message: "single_select 質問には options が1件以上必要です", path: ["options"] },
  );
export type InterviewQuestion = z.infer<typeof interviewQuestionSchema>;

// ---------------------------------------------------------------------------
// Request/Response: POST /api/interview (設計書 8.1章)
// ---------------------------------------------------------------------------

export const interviewRequestSchema = z.object({
  profile: profileSchema,
  goal: goalSchema,
});
export type InterviewRequest = z.infer<typeof interviewRequestSchema>;

export const interviewResponseSchema = z.object({
  questions: z.array(interviewQuestionSchema).max(MAX_INTERVIEW_QUESTIONS),
});
export type InterviewResponse = z.infer<typeof interviewResponseSchema>;
