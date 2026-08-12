"use client";

import { useEffect, useRef, useState } from "react";

const X_LABELS = ["いま", "1年後", "3年後", "5年後"];

export interface ChartLine {
  id: string;
  label: string;
  color: string;
  isBase: boolean;
  isSelected: boolean;
  values: number[]; // 4点
}

interface TrendChartProps {
  lines: ChartLine[];
  unit: string;
  formatValue: (v: number) => string;
}

function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 1.5 ? 1.5 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 3 ? 3 : n <= 4 ? 4 : n <= 5 ? 5 : 10) * p;
}

/** UI案 renderChart() の SVGグラフ描画ロジックを移植したもの。 */
export function TrendChart({ lines, unit, formatValue }: TrendChartProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const update = () => setWidth(Math.max(300, el.clientWidth));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const isNarrow = width < 480;
  const H = isNarrow ? 250 : 300;
  const PL = isNarrow ? 44 : 56;
  const PR = isNarrow ? 46 : 66;
  const PT = 30;
  const PB = 34;

  const all = lines.flatMap((l) => l.values);
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  const pad = (hi - lo) * 0.16 || 10;
  lo = lo < 0 ? lo - pad : Math.max(0, lo - pad);
  hi = hi + pad;
  const step = niceStep((hi - lo) / 4);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;

  const x = (i: number) => PL + (i * (width - PL - PR)) / 3;
  const y = (v: number) => PT + ((hi - v) / (hi - lo)) * (H - PT - PB);

  const gridValues: number[] = [];
  for (let v = lo; v <= hi + 0.001; v += step) gridValues.push(v);

  const order = [...lines].sort((a, b) => {
    const score = (l: ChartLine) => (l.isBase ? 0 : l.isSelected ? 2 : 1);
    return score(a) - score(b);
  });

  return (
    <div ref={boxRef} style={{ width: "100%", overflow: "hidden" }}>
      <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} style={{ display: "block" }}>
        <text x={4} y={12} fontSize={10.5} fill="#B0A090" fontWeight={700}>
          単位：{unit}
        </text>
        {gridValues.map((v, i) => {
          const zero = Math.abs(v) < 0.001;
          return (
            <g key={i}>
              <line
                x1={PL}
                y1={y(v)}
                x2={width - PR + 6}
                y2={y(v)}
                stroke={zero ? "#D9C7B2" : "#F2E7DA"}
                strokeWidth={zero ? 1.6 : 1}
                strokeDasharray={zero ? undefined : "3 4"}
              />
              <text x={PL - 8} y={y(v) + 4} fontSize={isNarrow ? 9.5 : 10.5} fill="#B0A090" textAnchor="end">
                {v}
              </text>
            </g>
          );
        })}
        {X_LABELS.map((lb, i) => (
          <g key={lb}>
            <line x1={x(i)} y1={PT} x2={x(i)} y2={H - PB} stroke="#F6EEE4" strokeWidth={1} />
            <text
              x={x(i)}
              y={H - PB + 20}
              fontSize={isNarrow ? 10 : 11.5}
              fill="#8A7A6B"
              textAnchor="middle"
              fontWeight={700}
            >
              {lb}
            </text>
          </g>
        ))}
        {order.map((line) => {
          const on = !line.isBase && line.isSelected;
          const pts = line.values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
          const last = line.values[3];
          return (
            <g key={line.id}>
              <polyline
                points={pts}
                fill="none"
                stroke={line.color}
                strokeWidth={on ? 4 : line.isBase ? 2 : 2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={line.isBase ? "6 5" : undefined}
                opacity={on ? 1 : line.isBase ? 0.75 : 0.42}
              />
              {!line.isBase &&
                line.values.map((v, i) => (
                  <circle
                    key={i}
                    cx={x(i)}
                    cy={y(v)}
                    r={on ? 5 : 3.2}
                    fill="#fff"
                    stroke={line.color}
                    strokeWidth={on ? 3 : 2}
                    opacity={on ? 1 : 0.5}
                  />
                ))}
              <text
                x={width - PR + 11}
                y={y(last) + 4}
                fontSize={isNarrow ? 10 : 11.5}
                fill={line.color}
                fontWeight={800}
                opacity={on ? 1 : line.isBase ? 0.85 : 0.55}
              >
                {formatValue(last)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
