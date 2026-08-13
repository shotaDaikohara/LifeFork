import { researchResultSchema, type ResearchResult } from "@/types/research";
import { stripNullValues } from "@/lib/jsonNormalize";

export type ValidationResult =
  | { ok: true; data: ResearchResult }
  | { ok: false; message: string };

/**
 * OrcaRouter から返却された生の文字列（JSON想定）を ResearchResult スキーマで検証する。
 *
 * 設計書 7章 (9) の方針に従い、失敗した場合も結果を捏造せず、
 * 検証エラーの詳細を呼び出し側へ返す。
 */
export function validateResearchResult(raw: string): ValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, message: "モデル出力がJSONとして解釈できませんでした。" };
  }

  const result = researchResultSchema.safeParse(stripNullValues(parsed));
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join(" / ");
    return { ok: false, message: `ResearchResultスキーマ検証に失敗しました: ${issues}` };
  }

  return { ok: true, data: result.data };
}
