"use client";

import { useState } from "react";
import type { ResearchResult, TargetPath, TrendSeries } from "@/types/research";
import { TrendChart, type ChartLine } from "./TrendChart";
import { DEFAULT_CONDITIONS, isDefaultConditions, rateOf, seriesOf, type Conditions } from "@/lib/tuneMath";
import { Cites } from "@/lib/citations";

const METRICS: { key: keyof TrendSeries; label: string; icon: string; unit: string; toDisplay: (v: number) => number }[] = [
  { key: "income", label: "年収", icon: "💰", unit: "万円", toDisplay: (v) => Math.round(v / 10000) },
  { key: "savings", label: "貯金", icon: "🏦", unit: "万円", toDisplay: (v) => Math.round(v / 10000) },
  { key: "dreamCloseness", label: "夢への近さ", icon: "🎯", unit: "点", toDisplay: (v) => v },
  { key: "satisfaction", label: "満足度", icon: "😊", unit: "点", toDisplay: (v) => v },
];

const PATH_COLORS3 = ["#2A9D74", "#D4405F", "#E8681C"];
const CURRENT_COLOR = "#A9A29A";

export function TunerSection({
  result,
  curPath,
  pathColors,
  onSelectPath,
}: {
  result: ResearchResult;
  curPath: TargetPath;
  pathColors: Record<string, string>;
  onSelectPath: (id: string) => void;
}) {
  const [conditions, setConditions] = useState<Conditions>(DEFAULT_CONDITIONS);
  const [metricKey, setMetricKey] = useState<keyof TrendSeries>("income");

  const metric = METRICS.find((m) => m.key === metricKey)!;

  const lines: ChartLine[] = [
    {
      id: "current",
      label: "今のまま（基準）",
      color: CURRENT_COLOR,
      isBase: true,
      isSelected: false,
      values: seriesOf(metricKey, result.currentPath.series, null, conditions).map(metric.toDisplay),
    },
    ...result.targetPaths.map((p, i) => ({
      id: p.id,
      label: p.title,
      color: PATH_COLORS3[i % PATH_COLORS3.length],
      isBase: false,
      isSelected: p.id === curPath.id,
      values: seriesOf(metricKey, p.series, p.tuneFactors, conditions).map(metric.toDisplay),
    })),
  ];

  const rows = result.targetPaths
    .map((p) => ({
      path: p,
      rate: Math.round(rateOf(p.tuneFactors, conditions)),
    }))
    .sort((a, b) => b.rate - a.rate);
  const best = rows[0];
  const changedBest = best.path.id !== result.targetPaths.find((p) => p.recommended)?.id;

  const isDefault = isDefaultConditions(conditions);

  function reset() {
    setConditions(DEFAULT_CONDITIONS);
  }

  let note = "💡 灰色の点線が「今のまま」です。どの道もこの線と比べて意味があるかで判断してください。";
  if (conditions.prepMonths < 6) {
    note = "⚠️ 準備期間を短くすると、確率が大きく下がる道があります。「知らないまま始める」がいちばん効きます。";
  } else if (!conditions.relocation) {
    note = "💡 引っ越しなしだと選べる選択肢が減るため、確率が下がる道があります。";
  } else if (conditions.weeklyHours < 5) {
    note = "💡 週に使える時間が5時間を切ると、準備そのものが進みにくくなります。";
  } else if (conditions.savings >= 1500) {
    note = "💡 お金を増やしても確率があまり伸びない道もあります。足りないのはお金ではなく経験の場合があります。";
  }

  return (
    <div className="rsec" id="r3" style={{ marginTop: 46 }}>
      <div className="sec-h">
        <h2 style={{ fontSize: 17 }}>条件が変われば、こたえも変わります</h2>
        <div className="small">動かすとグラフが変わります</div>
      </div>

      <div className="chartcard">
        <div className="cond-grid">
          <div className="conds">
            <div className="slider">
              <div className="lb">
                <b>💰 準備できる貯金</b>
                <span className="v">{conditions.savings >= 2000 ? "2,000万円以上" : `${conditions.savings.toLocaleString()}万円`}</span>
              </div>
              <input
                type="range"
                min={0}
                max={2000}
                step={50}
                value={conditions.savings}
                onChange={(e) => setConditions({ ...conditions, savings: Number(e.target.value) })}
              />
            </div>
            <div className="slider">
              <div className="lb">
                <b>⏳ 準備にかける期間</b>
                <span className="v">{conditions.prepMonths === 0 ? "すぐ動く" : `${conditions.prepMonths}か月`}</span>
              </div>
              <input
                type="range"
                min={0}
                max={36}
                step={3}
                value={conditions.prepMonths}
                onChange={(e) => setConditions({ ...conditions, prepMonths: Number(e.target.value) })}
              />
            </div>
            <div className="slider">
              <div className="lb">
                <b>🕒 週に使える時間</b>
                <span className="v">{conditions.weeklyHours}時間</span>
              </div>
              <input
                type="range"
                min={0}
                max={30}
                step={1}
                value={conditions.weeklyHours}
                onChange={(e) => setConditions({ ...conditions, weeklyHours: Number(e.target.value) })}
              />
            </div>
            <div className="slider" style={{ marginBottom: 0 }}>
              <div className="lb">
                <b>🏡 引っ越し</b>
              </div>
              <div className="toggle">
                <button
                  className={conditions.relocation ? "on" : ""}
                  onClick={() => setConditions({ ...conditions, relocation: true })}
                >
                  できる
                </button>
                <button
                  className={!conditions.relocation ? "on" : ""}
                  onClick={() => setConditions({ ...conditions, relocation: false })}
                >
                  むずかしい
                </button>
              </div>
            </div>
            <button className="mini-btn" onClick={reset}>
              条件をもとに戻す
            </button>
          </div>

          <div className="charts">
            <div className="mtabs">
              {METRICS.map((m) => (
                <button key={m.key} className={metricKey === m.key ? "on" : ""} onClick={() => setMetricKey(m.key)}>
                  {m.icon} {m.label}
                </button>
              ))}
            </div>
            <TrendChart lines={lines} unit={metric.unit} formatValue={(v) => `${v.toLocaleString()}${metric.unit === "万円" ? "万" : ""}`} />
            <div className="legend">
              {lines.map((l) =>
                l.isBase ? (
                  <span className="lg base" key={l.id}>
                    <i style={{ background: l.color }} />
                    今のまま（基準）
                  </span>
                ) : (
                  <button
                    key={l.id}
                    className={`lg ${l.isSelected ? "on" : ""}`}
                    onClick={() => onSelectPath(l.id)}
                  >
                    <i style={{ background: l.color }} />
                    {l.label}
                  </button>
                ),
              )}
            </div>
            <p className="tiny" style={{ marginTop: 10 }}>
              {isDefault
                ? note
                : `🔄 あなたが変えた条件で引き直しています（貯金${conditions.savings}万・準備${conditions.prepMonths}か月・週${conditions.weeklyHours}時間・引っ越し${conditions.relocation ? "可" : "不可"}）。`}
            </p>
          </div>
        </div>

        <div className="tune-res">
          <div className="trh">この条件での「うまくいく確率」</div>
          <div>
            {rows.map(({ path, rate }) => (
              <div
                key={path.id}
                className={`trow ${path.id === curPath.id ? "sel" : ""}`}
                style={{ "--glow": `${pathColors[path.id]}33` } as React.CSSProperties}
              >
                <div>
                  <div className="tn">
                    <i style={{ background: pathColors[path.id] }} />
                    {path.title}
                    {path.id === best.path.id && <span className="star">⭐️ おすすめ</span>}
                  </div>
                  <div className="tb">
                    <i style={{ width: `${rate}%`, background: pathColors[path.id] }} />
                  </div>
                </div>
                <div className="tv">
                  {rate}
                  <span style={{ fontSize: 10 }}>%</span>
                </div>
              </div>
            ))}
          </div>
          <Cites indexes={result.rateSourceIndex} sources={result.sources} />
          <div className="trbest">
            {changedBest ? (
              <>
                条件が変わったので、おすすめは <b>{best.path.title}</b> になりました。
              </>
            ) : (
              <>
                この条件でのおすすめは <b>{best.path.title}</b> のままです。
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
