import type { Impact, Likelihood, Risk } from "@/types/research";

const LIKELIHOOD_LABEL: Record<Likelihood, string> = {
  low: "可能性: 低",
  medium: "可能性: 中",
  high: "可能性: 高",
  unknown: "可能性: 不明",
};

const IMPACT_LABEL: Record<Impact, string> = {
  low: "影響: 小",
  medium: "影響: 中",
  high: "影響: 大",
};

const LIKELIHOOD_STYLE: Record<Likelihood, string> = {
  low: "bg-emerald-50 text-emerald-700",
  medium: "bg-amber-50 text-amber-700",
  high: "bg-red-50 text-red-700",
  unknown: "bg-zinc-100 text-zinc-500",
};

export function RiskList({ risks }: { risks: Risk[] }) {
  if (risks.length === 0) {
    return <p className="text-sm text-zinc-400">特筆すべきリスクは挙げられていません。</p>;
  }

  return (
    <ul className="space-y-3">
      {risks.map((risk, i) => (
        <li key={i} className="rounded-lg border border-zinc-200 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-zinc-900">{risk.title}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${LIKELIHOOD_STYLE[risk.likelihood]}`}
            >
              {LIKELIHOOD_LABEL[risk.likelihood]}
            </span>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
              {IMPACT_LABEL[risk.impact]}
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-600">{risk.description}</p>
        </li>
      ))}
    </ul>
  );
}
