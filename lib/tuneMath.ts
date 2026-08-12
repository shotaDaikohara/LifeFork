import type { TrendSeries, TuneFactors } from "@/types/research";

/**
 * UI案の条件シミュレーション（貯金・準備期間・週の時間・引っ越し可否のスライダー）を
 * クライアント側で近似再計算するためのロジック。
 * AIは呼び出さず、AIが生成した tuneFactors（目安の感度）を使って
 * series（グラフ用の数値系列）を条件に応じて補正する。
 */

export interface Conditions {
  savings: number; // 万円
  prepMonths: number;
  weeklyHours: number;
  relocation: boolean;
}

export const DEFAULT_CONDITIONS: Conditions = {
  savings: 800,
  prepMonths: 15,
  weeklyHours: 8,
  relocation: true,
};

const MAX_SAVINGS = 2000;
const MAX_PREP_MONTHS = 36;
const MAX_WEEKLY_HOURS = 30;

/**
 * そのパスの「うまくいく確率」の目安（5〜95）。
 *
 * AIが生成する4つの sensitivity は互いに独立した0-100の値であり、単純合算すると
 * 容易に100を超えて全パスが95にクランプされてしまう（2026-08-12 実機確認で発覚）。
 * そのため平均を取ったうえでさらに1/2に抑え、base同士の差が結果を支配しやすくする
 * （UI案のTUNE係数も、手動調整により base の差が主な決め手になっていた）。
 */
export function rateOf(tune: TuneFactors, c: Conditions): number {
  const savingsRatio = c.savings / MAX_SAVINGS;
  const prepRatio = c.prepMonths / MAX_PREP_MONTHS;
  const hoursRatio = c.weeklyHours / MAX_WEEKLY_HOURS;
  const relocationRatio = c.relocation ? 1 : 0;

  const weightedContribution =
    (tune.savingsSensitivity * savingsRatio +
      tune.prepMonthsSensitivity * prepRatio +
      tune.weeklyHoursSensitivity * hoursRatio +
      tune.relocationSensitivity * relocationRatio) /
    8;

  return Math.max(5, Math.min(95, tune.base + weightedContribution));
}

/**
 * 条件を反映した系列を返す。tune が null（＝「今のまま」パス）の場合は
 * 行動を起こさない前提のため常に元の系列のまま返す。
 */
export function seriesOf(
  metric: keyof TrendSeries,
  series: TrendSeries,
  tune: TuneFactors | null,
  conditions: Conditions,
): number[] {
  const base = series[metric];
  if (!tune) return base;

  const f = Math.max(
    0.6,
    Math.min(1.25, rateOf(tune, conditions) / rateOf(tune, DEFAULT_CONDITIONS)),
  );

  if (metric === "savings") {
    const d = conditions.savings - DEFAULT_CONDITIONS.savings;
    return base.map((v, i) => Math.round(v + d * (1 - i * 0.14)));
  }
  if (metric === "income") {
    return base.map((v, i) => (i === 0 ? v : Math.round(v * (0.72 + 0.28 * f))));
  }
  // dreamCloseness / satisfaction は 0-100 のスコア
  return base.map((v, i) => (i === 0 ? v : Math.round(Math.min(100, v * f))));
}

export function isDefaultConditions(c: Conditions): boolean {
  return (
    c.savings === DEFAULT_CONDITIONS.savings &&
    c.prepMonths === DEFAULT_CONDITIONS.prepMonths &&
    c.weeklyHours === DEFAULT_CONDITIONS.weeklyHours &&
    c.relocation === DEFAULT_CONDITIONS.relocation
  );
}
