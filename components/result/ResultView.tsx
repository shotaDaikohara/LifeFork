"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Goal, InterviewAnswer, ResearchResult } from "@/types/research";
import { clearResultAndError } from "@/lib/researchSession";
import { PathsSection } from "./PathsSection";
import { TunerSection } from "./TunerSection";
import { ActionSection } from "./ActionSection";

export const PATH_COLORS: Record<string, string> = {
  current: "#A9A29A",
};
const ACCENT_COLORS = ["#2A9D74", "#D4405F", "#E8681C"];

const NAV_ITEMS = [
  { id: "r1", icon: "💬", title: "AIのこたえ", subtitle: "やれる？ やれない？" },
  { id: "r2", icon: "🛤", title: "進める3つの道", subtitle: "選んだ先の未来を読む" },
  { id: "r3", icon: "🎚", title: "条件を変える", subtitle: "「もしも」を試してみる" },
  { id: "r4", icon: "👟", title: "はじめの一歩", subtitle: "あしたから何をするか" },
];

export function ResultView({
  result,
  goal,
  answers,
}: {
  result: ResearchResult;
  goal: Goal;
  answers: InterviewAnswer[];
}) {
  const router = useRouter();

  const pathColors = useMemo(() => {
    const map: Record<string, string> = { current: PATH_COLORS.current };
    result.targetPaths.forEach((p, i) => {
      map[p.id] = ACCENT_COLORS[i % ACCENT_COLORS.length];
    });
    return map;
  }, [result.targetPaths]);

  const initialPathId = result.targetPaths.find((p) => p.recommended)?.id ?? result.targetPaths[0]?.id;
  const [curPathId, setCurPathId] = useState(initialPathId);
  const [activeNav, setActiveNav] = useState("r1");

  const curPath = result.targetPaths.find((p) => p.id === curPathId) ?? result.targetPaths[0];

  useEffect(() => {
    const onScroll = () => {
      let cur = "r1";
      for (const item of NAV_ITEMS) {
        const el = document.getElementById(item.id);
        if (el && el.getBoundingClientRect().top <= 160) cur = item.id;
      }
      setActiveNav(cur);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function goSec(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const goalTypeLabel = goal.type === "career_change" ? "転職" : "独立";

  return (
    <div className="wide" style={{ paddingTop: 14 }}>
      <div className="result-layout">
        <aside className="sidenav" id="sidenav">
          <div className="navhead">この結果でわかること</div>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`navitem ${activeNav === item.id ? "on" : ""}`}
              onClick={() => goSec(item.id)}
            >
              <span className="ni-ic">{item.icon}</span>
              <span className="ni-t">
                <b>{item.title}</b>
                <small>{item.subtitle}</small>
              </span>
            </button>
          ))}

          <div className="myinput">
            <div className="mi-h">あなたが入力した内容</div>
            <div className="mi-dream">
              <i>{goalTypeLabel === "転職" ? "💼" : "🚀"}</i>
              {goal.description}
            </div>
            <dl style={{ margin: 0 }}>
              {answers.map((a) => (
                <div className="mi-row" key={a.questionId}>
                  <dt>{a.question ?? a.questionId}</dt>
                  <dd>{a.answer}</dd>
                </div>
              ))}
            </dl>
            <button
              className="mi-edit"
              onClick={() => {
                clearResultAndError();
                router.push("/");
              }}
            >
              入力しなおす
            </button>
          </div>
        </aside>

        <div className="result-main">
          {/* 1. こたえ */}
          <section className="rsec" id="r1">
            <div className="sec-h">
              <div className="no">1</div>
              <h2>まずは、こたえから</h2>
            </div>
            <div className="verdict">
              <span className="pill o">AIのこたえ</span>
              <div className="ans">{result.summary.headline}</div>
              <div className="body">{result.summary.comparisonConclusion}</div>
              <div className="facts">
                <div className="fact">
                  <div className="l">いま向いてる度</div>
                  <div className="v">
                    {result.summary.fitScore}
                    <small>/100</small>
                  </div>
                </div>
                <div className="fact">
                  <div className="l">準備できるお金</div>
                  <div className="v">
                    {result.summary.availableFundsManYen}
                    <small>万円</small>
                  </div>
                </div>
                <div className="fact">
                  <div className="l">生活できる期間</div>
                  <div className="v">
                    {result.summary.survivalMonths}
                    <small>か月</small>
                  </div>
                </div>
                <div className="fact">
                  <div className="l">{result.summary.relevantExperienceLabel}</div>
                  <div className="v">
                    {result.summary.relevantExperienceYears}
                    <small>年</small>
                  </div>
                </div>
              </div>
            </div>

            <div className="card" style={{ marginTop: 12 }}>
              <div className="sec-h" style={{ marginBottom: 14 }}>
                <h2 style={{ fontSize: 16 }}>足りているもの・足りないもの</h2>
              </div>
              <div className="checks2">
                <div>
                  <div className="chead ok">✓ 足りているもの</div>
                  {result.checks
                    .filter((c) => c.status === "ok")
                    .map((c, i) => (
                      <div className="check" key={i}>
                        <span className="st ok">✓</span>
                        <div className="tx">
                          {c.title}
                          <small>{c.detail}</small>
                        </div>
                      </div>
                    ))}
                </div>
                <div>
                  <div className="chead ng">✕ 足りないもの</div>
                  {result.checks
                    .filter((c) => c.status === "ng")
                    .map((c, i) => (
                      <div className="check" key={i}>
                        <span className="st ng">✕</span>
                        <div className="tx">
                          {c.title}
                          <small>{c.detail}</small>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
            {result.limitations.length > 0 && (
              <p className="tiny" style={{ margin: "12px 4px 0" }}>
                {result.limitations.join(" / ")}
              </p>
            )}
          </section>

          {curPath && (
            <PathsSection result={result} curPath={curPath} onSelectPath={setCurPathId} />
          )}

          {curPath && (
            <TunerSection
              result={result}
              curPath={curPath}
              pathColors={pathColors}
              onSelectPath={setCurPathId}
            />
          )}

          {curPath && <ActionSection result={result} curPath={curPath} pathColors={pathColors} goal={goal} />}
        </div>
      </div>

      <div className="dock mobile-only">
        <div className="inner">
          <button className="btn" onClick={() => goSec("r4")}>
            ⚡️ 最初の一歩を見る
          </button>
        </div>
      </div>
    </div>
  );
}
