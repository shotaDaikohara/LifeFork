import { interviewResponseSchema, type InterviewResponse } from "@/types/interview";
import { stripNullValues } from "@/lib/jsonNormalize";

export type InterviewValidationResult =
  | { ok: true; data: InterviewResponse }
  | { ok: false; message: string };

/**
 * OrcaRouter から返却された生の文字列（JSON想定）を InterviewResponse スキーマで検証する。
 * 設計書 8.1章の方針に従い、最大4問・InterviewQuestion[]以外の出力を許容しない。
 */
export function validateInterviewResponse(raw: string): InterviewValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, message: "モデル出力がJSONとして解釈できませんでした。" };
  }

  const result = interviewResponseSchema.safeParse(stripNullValues(parsed));
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join(" / ");
    return { ok: false, message: `InterviewResponseスキーマ検証に失敗しました: ${issues}` };
  }

  return { ok: true, data: result.data };
}
