"use client";

import { useEffect, useRef, useState } from "react";
import type { ResearchResult, TargetPath, YearScene } from "@/types/research";
import { Cites } from "@/lib/citations";

/* 選択肢カードが画面上部に貼りついたか判定する境界（UI案 updateStuck() の limit）。 */
const STUCK_LIMIT_DESKTOP = 60;
const STUCK_LIMIT_MOBILE = 120;

const PATH_EMOJI = ["🌱", "🚀", "🎯"];
const PATH_BG = ["var(--mint-lt)", "var(--berry-lt)", "var(--orange-lt)"];
const YEAR_LABELS: Record<"y1" | "y3" | "y5", string> = { y1: "1年後", y3: "3年後", y5: "5年後" };

export function PathsSection({
  result,
  curPath,
  onSelectPath,
}: {
  result: ResearchResult;
  curPath: TargetPath;
  onSelectPath: (id: string) => void;
}) {
  const [year, setYear] = useState<"y1" | "y3" | "y5">("y1");
  const integRef = useRef<HTMLDivElement>(null);
  const [pointerLeft, setPointerLeft] = useState<number | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    function updatePointer() {
      const card = document.querySelector(`.pcard[data-p="${curPath.id}"]`) as HTMLElement | null;
      const integ = integRef.current;
      if (!card || !integ) return;
      const c = card.getBoundingClientRect();
      const p = integ.getBoundingClientRect();
      if (!p.width) return;
      setPointerLeft(Math.round(c.left + c.width / 2 - p.left));
    }
    updatePointer();
    // UI案同様、ウィンドウ幅が変わった際もカードと三角形の位置を追従させる。
    window.addEventListener("resize", updatePointer);
    return () => window.removeEventListener("resize", updatePointer);
  }, [curPath.id]);

  useEffect(() => {
    // 進める道のカードが画面上部に貼りついたら、コンパクト表示に切り替える
    // （UI案 updateStuck()）。
    function updateStuck() {
      const sentinel = sentinelRef.current;
      if (!sentinel) return;
      const limit = window.innerWidth >= 900 ? STUCK_LIMIT_DESKTOP : STUCK_LIMIT_MOBILE;
      setStuck(sentinel.getBoundingClientRect().top < limit);
    }
    updateStuck();
    window.addEventListener("scroll", updateStuck, { passive: true });
    window.addEventListener("resize", updateStuck);
    return () => {
      window.removeEventListener("scroll", updateStuck);
      window.removeEventListener("resize", updateStuck);
    };
  }, []);

  const scene: YearScene = curPath.yearlyScenes[year];
  const baseScene: YearScene = result.currentPath.yearlyScenes[year];

  return (
    <>
      <div className="rsec" id="r2" style={{ marginTop: 26 }}>
        <div className="sec-h">
          <h2 style={{ fontSize: 17 }}>進める道は、3つあります</h2>
          <div className="small">選ぶと、この下がぜんぶ切り替わります</div>
        </div>
      </div>

      <div ref={sentinelRef} />
      <div className={`pcards-wrap ${stuck ? "stuck" : ""}`}>
        <div className="pcards">
          {result.targetPaths.map((p, i) => (
            <button
              key={p.id}
              data-p={p.id}
              className={`pcard ${p.id === curPath.id ? "on" : ""}`}
              onClick={() => onSelectPath(p.id)}
            >
              {p.recommended && <span className="rec pill o">⭐️ おすすめ</span>}
              <div className="ph">
                <div className="em" style={{ background: PATH_BG[i % PATH_BG.length] }}>
                  {PATH_EMOJI[i % PATH_EMOJI.length]}
                </div>
                <div>
                  <div className="nm">{p.title}</div>
                  <div className="tg">{p.tagline}</div>
                </div>
              </div>
              <div className="pm">
                {p.metrics.map((m, mi) => (
                  <div key={mi}>
                    <span>{m.label}</span>
                    <b>{m.value}</b>
                  </div>
                ))}
              </div>
            </button>
          ))}
        </div>
      </div>

      <section>
        <div className="integ" ref={integRef} style={pointerLeft !== null ? ({ "--px": `${pointerLeft}px` } as React.CSSProperties) : undefined}>
          <div className="integ-in">
            <div className="lft">
              <div className="ph" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 13,
                    display: "grid",
                    placeItems: "center",
                    fontSize: 19,
                    flex: "none",
                    background: PATH_BG[result.targetPaths.findIndex((p) => p.id === curPath.id) % PATH_BG.length],
                  }}
                >
                  {PATH_EMOJI[result.targetPaths.findIndex((p) => p.id === curPath.id) % PATH_EMOJI.length]}
                </div>
                <div>
                  <h3 style={{ margin: 0 }}>{curPath.title}</h3>
                  <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{curPath.tagline}</div>
                </div>
              </div>
              <p className="lead" style={{ fontSize: 13.5, lineHeight: 1.95 }}>
                {curPath.detail}
              </p>
              <Cites indexes={curPath.sourceIndex} sources={result.sources} />
            </div>

            <div className="scene">
              <div className="tabs" style={{ marginBottom: 16 }}>
                {(["y1", "y3", "y5"] as const).map((y) => (
                  <button key={y} className={year === y ? "on" : ""} onClick={() => setYear(y)}>
                    {YEAR_LABELS[y]}
                  </button>
                ))}
              </div>
              <div className="when">{YEAR_LABELS[year]} の あなた</div>
              <div className="ttl">{scene.headline}</div>
              <div className="txt">{scene.narrative}</div>
              <div className="scene-stats">
                {scene.stats.map((s, i) => (
                  <div className="sstat" key={i}>
                    <div className="l">{s.label}</div>
                    <div className="v">{s.value}</div>
                  </div>
                ))}
                <div style={{ gridColumn: "1/-1" }}>
                  <Cites indexes={curPath.sourceIndex} sources={result.sources} />
                </div>
              </div>
              <div className="basecmp">
                <div className="bch">くらべる基準 ／ 同じころ、今のままだと</div>
                <div className="bct">{baseScene.headline}</div>
                <div className="bcs">
                  {baseScene.stats.map((s, i) => (
                    <span key={i}>
                      <i>{s.label}</i>
                      {s.value}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
