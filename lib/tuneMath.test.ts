import { describe, expect, it } from "vitest";
import { DEFAULT_CONDITIONS, isDefaultConditions, rateOf, seriesOf, type Conditions } from "@/lib/tuneMath";
import type { TrendSeries, TuneFactors } from "@/types/research";

function tune(overrides: Partial<TuneFactors> = {}): TuneFactors {
  return {
    base: 50,
    savingsSensitivity: 0,
    prepMonthsSensitivity: 0,
    weeklyHoursSensitivity: 0,
    relocationSensitivity: 0,
    ...overrides,
  };
}

describe("rateOf", () => {
  it("全sensitivityが0のときはbaseがそのまま返る（条件に依存しない）", () => {
    expect(rateOf(tune({ base: 50 }), DEFAULT_CONDITIONS)).toBe(50);
    expect(rateOf(tune({ base: 50 }), { ...DEFAULT_CONDITIONS, savings: 2000 })).toBe(50);
  });

  it("5〜95の範囲にクランプされる（下限）", () => {
    const rate = rateOf(tune({ base: 0 }), DEFAULT_CONDITIONS);
    expect(rate).toBe(5);
  });

  it("5〜95の範囲にクランプされる（上限）", () => {
    const maxTune = tune({
      base: 90,
      savingsSensitivity: 100,
      prepMonthsSensitivity: 100,
      weeklyHoursSensitivity: 100,
      relocationSensitivity: 100,
    });
    const maxConditions: Conditions = {
      savings: 2000,
      prepMonths: 36,
      weeklyHours: 30,
      relocation: true,
    };
    // weightedContribution = (100+100+100+100)/8 * 1 = 50 → base 90 + 50 = 140 → 95にクランプ
    expect(rateOf(maxTune, maxConditions)).toBe(95);
  });

  it("条件が良いほど（各ratioが上がるほど）sensitivityが正の寄与をする", () => {
    const t = tune({
      base: 50,
      savingsSensitivity: 100,
      prepMonthsSensitivity: 100,
      weeklyHoursSensitivity: 100,
      relocationSensitivity: 100,
    });
    const low = rateOf(t, { savings: 0, prepMonths: 0, weeklyHours: 0, relocation: false });
    const high = rateOf(t, { savings: 2000, prepMonths: 36, weeklyHours: 30, relocation: true });
    expect(low).toBeLessThan(high);
  });
});

describe("seriesOf", () => {
  const series: TrendSeries = {
    income: [300, 320, 400, 500],
    savings: [100, 150, 200, 300],
    dreamCloseness: [20, 40, 60, 80],
    satisfaction: [50, 55, 60, 70],
  };

  it("tuneがnull（今のままパス）のときは元の系列をそのまま返す", () => {
    expect(seriesOf("income", series, null, DEFAULT_CONDITIONS)).toEqual(series.income);
    expect(seriesOf("savings", series, null, { ...DEFAULT_CONDITIONS, savings: 0 })).toEqual(
      series.savings,
    );
  });

  it("条件がデフォルトのままなら income/dreamCloseness/satisfaction は変化しない（f=1）", () => {
    const t = tune({ base: 50, savingsSensitivity: 50 });
    expect(seriesOf("income", series, t, DEFAULT_CONDITIONS)).toEqual(series.income);
    expect(seriesOf("dreamCloseness", series, t, DEFAULT_CONDITIONS)).toEqual(series.dreamCloseness);
    expect(seriesOf("satisfaction", series, t, DEFAULT_CONDITIONS)).toEqual(series.satisfaction);
  });

  it("savings は貯金条件の差分(d)に応じて年ごとに逓減しながら加減算される", () => {
    const t = tune({ base: 50 });
    const conditions: Conditions = { ...DEFAULT_CONDITIONS, savings: 1200 }; // d = 400
    const result = seriesOf("savings", series, t, conditions);
    // base[i] + d * (1 - i * 0.14) を四捨五入した値と一致する
    const expected = series.savings.map((v, i) => Math.round(v + 400 * (1 - i * 0.14)));
    expect(result).toEqual(expected);
  });

  it("income の0年目（いま）は条件によらず常に元の値のまま", () => {
    const t = tune({ base: 90, savingsSensitivity: 100 });
    const conditions: Conditions = { ...DEFAULT_CONDITIONS, savings: 2000 };
    const result = seriesOf("income", series, t, conditions);
    expect(result[0]).toBe(series.income[0]);
  });

  it("dreamCloseness/satisfaction は100を超えない", () => {
    const t = tune({
      base: 90,
      savingsSensitivity: 100,
      prepMonthsSensitivity: 100,
      weeklyHoursSensitivity: 100,
      relocationSensitivity: 100,
    });
    const conditions: Conditions = { savings: 2000, prepMonths: 36, weeklyHours: 30, relocation: true };
    const highSatisfaction: TrendSeries = { ...series, satisfaction: [90, 95, 98, 99] };
    const result = seriesOf("satisfaction", highSatisfaction, t, conditions);
    for (const v of result) {
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});

describe("isDefaultConditions", () => {
  it("DEFAULT_CONDITIONSそのものはtrue", () => {
    expect(isDefaultConditions(DEFAULT_CONDITIONS)).toBe(true);
    expect(isDefaultConditions({ ...DEFAULT_CONDITIONS })).toBe(true);
  });

  it("いずれか1項目でも異なればfalse", () => {
    expect(isDefaultConditions({ ...DEFAULT_CONDITIONS, savings: 900 })).toBe(false);
    expect(isDefaultConditions({ ...DEFAULT_CONDITIONS, prepMonths: 12 })).toBe(false);
    expect(isDefaultConditions({ ...DEFAULT_CONDITIONS, weeklyHours: 10 })).toBe(false);
    expect(isDefaultConditions({ ...DEFAULT_CONDITIONS, relocation: false })).toBe(false);
  });
});
