import type { CurrentIncome, TargetIncome } from "@/types/research";

function formatYen(value: number): string {
  return `${value.toLocaleString("ja-JP")}円`;
}

export function IncomeRange({ income }: { income: CurrentIncome | TargetIncome }) {
  const hasCurrent = "current" in income;

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        {hasCurrent && (
          <div>
            <span className="text-xs text-zinc-500">現在</span>{" "}
            <span className="text-lg font-semibold text-zinc-900">
              {formatYen((income as CurrentIncome).current)}
            </span>
          </div>
        )}
        <div>
          <span className="text-xs text-zinc-500">3年後（想定レンジ）</span>{" "}
          <span className="text-lg font-semibold text-zinc-900">
            {formatYen(income.year3Base)}
          </span>
          <span className="ml-1 text-xs text-zinc-500">
            （{formatYen(income.year3Low)} 〜 {formatYen(income.year3High)}）
          </span>
        </div>
      </div>
      {income.assumptions.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-zinc-500">
          {income.assumptions.map((a, i) => (
            <li key={i}>・{a}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
