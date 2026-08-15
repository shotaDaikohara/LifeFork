import type { Source } from "@/types/research";

/**
 * 出典番号参照の表示ヘルパー（UI案 lifefork_demo 0813トンマナ.html の
 * cite() / cites() / citeIn() を React コンポーネント化したもの）。
 *
 * `sources` は ResearchResult.sources（[{title,url}, ...]）そのもの、
 * `index` / `indexes` は 1始まりの sourceIndex。
 * 対応する要素が存在しない（未指定・範囲外）場合は何も描画しない。
 */

// sources[].url はAIモデルの出力をそのままzodスキーマ（z.string()、URL形式チェックなし）
// で通した値のため、`javascript:` 等の不正スキームが混入する可能性を排除できない。
// href として使う直前に http(s) スキームのみへ絞り込む。
function isSafeHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function resolveSource(sources: Source[], index?: number): Source | undefined {
  if (!index || index < 1) return undefined;
  const src = sources[index - 1];
  if (!src || !isSafeHttpUrl(src.url)) return undefined;
  return src;
}

/** 出典バッジ1件（UI案 a.cite）。単独で本文の近くに置く用途。 */
export function Cite({ index, sources }: { index?: number; sources: Source[] }) {
  const src = resolveSource(sources, index);
  if (!src) return null;
  return (
    <a className="cite" href={src.url} target="_blank" rel="noopener noreferrer">
      {src.title}
    </a>
  );
}

/** 「出典」ラベル＋バッジ列（UI案 .cites、cites()関数）。 */
export function Cites({
  indexes,
  sources,
  label = "出典",
}: {
  indexes?: number | number[];
  sources: Source[];
  label?: string;
}) {
  const raw = Array.isArray(indexes) ? indexes : indexes != null ? [indexes] : [];
  const list = raw.filter((n) => typeof n === "number" && n >= 1 && n <= sources.length);
  if (!list.length) return null;
  return (
    <div className="cites">
      <span className="lb">{label}</span>
      {list.map((n) => (
        <Cite key={n} index={n} sources={sources} />
      ))}
    </div>
  );
}

/** 行内に小さく添えるタイプ（UI案 .cite-in、citeIn()関数）。 */
export function CiteIn({ index, sources }: { index?: number; sources: Source[] }) {
  const src = resolveSource(sources, index);
  if (!src) return null;
  return (
    <a className="cite-in" href={src.url} target="_blank" rel="noopener noreferrer">
      {src.title} ↗
    </a>
  );
}
