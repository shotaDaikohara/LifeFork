"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Goal, InterviewAnswer, Profile, ResearchResult } from "@/types/research";
import {
  clearResultAndError,
  loadAnswers,
  loadError,
  loadGoal,
  loadProfile,
  loadResult,
} from "@/lib/researchSession";
import { ResultView } from "@/components/result/ResultView";

interface LoadedData {
  result: ResearchResult | null;
  error: string | null;
  profile: Profile | null;
  goal: Goal | null;
  answers: InterviewAnswer[];
}

export default function ResultPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<LoadedData>({
    result: null,
    error: null,
    profile: null,
    goal: null,
    answers: [],
  });

  useEffect(() => {
    const result = loadResult();
    const error = loadError();
    if (!result && !error) {
      router.replace("/");
      return;
    }
    // sessionStorage (外部ストア) からの初期読み込みのため、effect内でのsetStateは意図的。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData({
      result,
      error,
      profile: loadProfile(),
      goal: loadGoal(),
      answers: loadAnswers(),
    });
    setReady(true);
  }, [router]);

  if (!ready) return null;

  if (data.error) {
    return (
      <main className="stage loading">
        <div>
          <h2>リサーチに失敗しました</h2>
          <p className="small" style={{ marginTop: 8, color: "var(--berry)" }}>
            {data.error}
          </p>
          <p className="tiny" style={{ marginTop: 8 }}>
            結果は捏造せず表示していません。時間を置くか、入力内容を見直して再度お試しください。
          </p>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button
            className="btn ghost auto"
            onClick={() => {
              clearResultAndError();
              router.push("/interview");
            }}
          >
            ヒアリングに戻る
          </button>
          <button
            className="btn auto"
            onClick={() => {
              clearResultAndError();
              router.push("/");
            }}
          >
            最初からやり直す
          </button>
        </div>
      </main>
    );
  }

  if (!data.result || !data.profile || !data.goal) return null;

  return (
    <main className="stage">
      <ResultView result={data.result} goal={data.goal} answers={data.answers} />
    </main>
  );
}
