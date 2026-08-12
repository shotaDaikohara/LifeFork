import { factFindingResponseSchema, type FactFindingResponse } from "@/types/factFinding";

export type FactFindingValidationResult =
  | { ok: true; data: FactFindingResponse }
  | { ok: false; message: string };

/**
 * Pass1 (基礎調査) のレスポンスを検証する。
 * research_facts.md は最大8件・簡潔な箇条書きという軽量な出力を想定しているため、
 * 検証失敗時の再問い合わせは行わず、失敗時は呼び出し元がベストエフォートで
 * facts なしの Pass2 にフォールバックする。
 */
export function validateFactFindingResponse(raw: string): FactFindingValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, message: "モデル出力がJSONとして解釈できませんでした。" };
  }

  const result = factFindingResponseSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join(" / ");
    return { ok: false, message: `FactFindingスキーマ検証に失敗しました: ${issues}` };
  }

  return { ok: true, data: result.data };
}
