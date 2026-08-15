"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ApiErrorBody, ResearchMode, ResearchRequest } from "@/types/research";
import {
  loadAnswers,
  loadGoal,
  loadMode,
  loadProfile,
  saveError,
  saveResult,
} from "@/lib/researchSession";

// 実測（README.md参照）: eco はPass1+Pass2合計で1分前後、normal（3段階オーケストレーション
// +Pass2）はさらに長くなりうる。実測より短い固定値を表示すると「フリーズした？」という
// 不安を招くため、モードごとに違う目安文言を出す。
const WAIT_HINT: Record<ResearchMode, string> = {
  eco: "だいたい1分くらいで終わります",
  normal: "じっくり調べるモードのため、1〜2分ほどかかることがあります",
};

const LOG_LINES = [
  "実際の制度・相場を確認しています",
  "似た条件の事例を集めています",
  "収入レンジと必要な準備を整理しています",
  "進める道の候補を組み立てています",
  "リスクと対策を整理しています",
];

export default function ResearchingPage() {
  const router = useRouter();
  const startedRef = useRef(false);
  const [activeLine, setActiveLine] = useState(0);
  const [done, setDone] = useState(false);
  const [mode, setMode] = useState<ResearchMode>("normal");

  useEffect(() => {
    if (done) return;
    const id = setInterval(() => {
      setActiveLine((i) => Math.min(i + 1, LOG_LINES.length - 1));
    }, 2600);
    return () => clearInterval(id);
  }, [done]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const profile = loadProfile();
    const goal = loadGoal();
    if (!profile || !goal) {
      router.replace("/");
      return;
    }
    const answers = loadAnswers();
    const mode = loadMode();
    // sessionStorage (外部ストア) からの初期読み込みのため、effect内でのsetStateは意図的。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(mode);

    const body: ResearchRequest = { profile, goal, answers, mode };

    (async () => {
      try {
        const res = await fetch("/api/research", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errBody = (await res.json().catch(() => null)) as ApiErrorBody | null;
          throw new Error(
            errBody?.error?.message ?? `リサーチに失敗しました（status ${res.status}）。`,
          );
        }

        const result = await res.json();
        saveResult(result);
      } catch (err) {
        saveError(err instanceof Error ? err.message : "リサーチ中に不明なエラーが発生しました。");
      } finally {
        setActiveLine(LOG_LINES.length - 1);
        setDone(true);
        setTimeout(() => router.push("/result"), 500);
      }
    })();
  }, [router]);

  return (
    <main className="stage narrow loading">
      <div className="spin">
        <i />
      </div>
      <div>
        <h2>
          あなたの未来を
          <br />
          調べています
        </h2>
        <p className="small" style={{ marginTop: 8 }}>
          実際の制度・相場・失敗例をあたっています
        </p>
      </div>
      <div className="log">
        {LOG_LINES.map((line, i) => {
          const isDone = done || i < activeLine;
          const isOn = i <= activeLine;
          return (
            <div key={line} className={`${isOn ? "on" : ""} ${isDone ? "done" : ""}`}>
              <span className="ic">{isDone ? "✓" : "▸"}</span>
              <span>{line}</span>
            </div>
          );
        })}
      </div>
      <p className="tiny">{WAIT_HINT[mode]}</p>
    </main>
  );
}
