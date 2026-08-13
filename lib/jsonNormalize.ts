/**
 * OrcaRouterから返るJSONの前処理。
 *
 * 任意項目（zod の `.optional()`）を、モデルが値を持たないときに
 * キー自体を省略せず `null` を明示的に埋めて返すことがある
 * （2026-08-13 実測: `sourceIndex` 等）。zod の `.optional()` は
 * `undefined` のみを許容し `null` は弾くため、そのままでは
 * スキーマ検証に失敗し、無駄なリトライを消費してしまう。
 *
 * 本スキーマ群には意味のある `null` 値を持つフィールドが存在しないため、
 * オブジェクト内の `null` は「未指定」とみなして安全にキーごと取り除く。
 */
export function stripNullValues<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => stripNullValues(v)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === null) continue;
      out[key] = stripNullValues(v);
    }
    return out as T;
  }
  return value;
}
