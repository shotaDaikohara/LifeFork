"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Goal, InterviewAnswer, ResearchResult } from "@/types/research";
import { clearResultAndError } from "@/lib/researchSession";
import { Cites } from "@/lib/citations";
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
            <div className="verdict">
              <span className="pill p">AIのこたえ</span>
              <div className="ans">{result.summary.headline}</div>
              <div className="lead1">
                {result.summary.lead}
                <Cites indexes={result.summary.leadSourceIndexes} sources={result.sources} />
              </div>
            </div>
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
