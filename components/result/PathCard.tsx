import type { CurrentIncome, Outlook, Risk, TargetIncome } from "@/types/research";
import { IncomeRange } from "./IncomeRange";
import { RiskList } from "./RiskList";

export function PathCard({
  variant,
  title,
  outlook,
  income,
  steps,
  risks,
}: {
  variant: "current" | "target";
  title: string;
  outlook: Outlook;
  income: CurrentIncome | TargetIncome;
  steps: string[];
  risks: Risk[];
}) {
  const accent = variant === "current" ? "border-zinc-300" : "border-indigo-300";
  const badge =
    variant === "current"
      ? "bg-zinc-100 text-zinc-600"
      : "bg-indigo-50 text-indigo-700";

  return (
    <div className={`card border-t-4 ${accent}`}>
      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badge}`}>
        {variant === "current" ? "今の道を続ける" : "検討している道"}
      </span>
      <h3 className="mt-2 text-lg font-bold text-zinc-900">{title}</h3>

      <div className="mt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          将来性
        </h4>
        <p className="mt-1 text-sm text-zinc-700">{outlook.summary}</p>
        {outlook.evidence.length > 0 && (
          <ul className="mt-1 space-y-0.5 text-xs text-zinc-500">
            {outlook.evidence.map((e, i) => (
              <li key={i}>・{e}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          年収
        </h4>
        <div className="mt-1">
          <IncomeRange income={income} />
        </div>
      </div>

      {steps.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            実現手段
          </h4>
          <ol className="mt-1 list-decimal space-y-1 pl-4 text-sm text-zinc-700">
            {steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
      )}

      <div className="mt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          リスク
        </h4>
        <div className="mt-1">
          <RiskList risks={risks} />
        </div>
      </div>
    </div>
  );
}
