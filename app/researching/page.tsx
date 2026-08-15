"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ApiErrorBody, ResearchMode, ResearchRequest, ResearchResult } from "@/types/research";
import type { AgenticStepStateInput as AgenticStepState } from "@/types/agenticSearch";
import {
  loadAnswers,
  loadGoal,
  loadMode,
  loadProfile,
  saveError,
  saveResult,
} from "@/lib/researchSession";

// 実測（README.md参照）: eco はPass1+Pass2合計で1分前後。
// normal（エージェント型検索、docs/pass1-agentic-search-design.md）はユーザー指定の
// 下限（実クエリ数約100回相当≒25サイクル）まで検索を続けるため、最大40分程度かかりうる。
const WAIT_HINT: Record<ResearchMode, string> = {
  eco: "だいたい1分くらいで終わります",
  normal: "じっくり調べるモードのため、30〜40分ほどかかることがあります",
};

const LOG_LINES = [
  "実際の制度・相場を確認しています",
  "似た条件の事例を集めています",
  "収入レンジと必要な準備を整理しています",
  "進める道の候補を組み立てています",
  "リスクと対策を整理しています",
];

interface StepContinueBody {
  status: "continue";
  state: AgenticStepState;
  progress: { cycle: number; totalNumRequests: number };
}
interface StepDoneBody {
  status: "done";
  result: ResearchResult;
  progress: { cycle: number; totalNumRequests: number };
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new Error(errBody?.error?.message ?? `リクエストに失敗しました（status ${res.status}）。`);
  }
  return res.json() as Promise<T>;
}

/**
 * mode: "normal" 用。1サイクル=1リクエストのポーリングで
 * `/api/research/step` を繰り返し呼ぶ（docs/pass1-agentic-search-design.md 参照。
 * サーバー1回の実行時間に収まらないため、クライアント側でループする設計）。
 */
async function runAgenticResearch(
  request: Pick<ResearchRequest, "profile" | "goal">,
  onProgress: (totalNumRequests: number) => void,
): Promise<ResearchResult> {
  let state: AgenticStepState | undefined;
  // 安全弁: サーバー側のSTEP_MAX_CYCLES(30)より少し余裕を持たせた上限。
  for (let i = 0; i < 40; i++) {
    const body = await postJson<StepContinueBody | StepDoneBody>("/api/research/step", {
      profile: request.profile,
      goal: request.goal,
      state,
    });
    if (body.status === "done") {
      onProgress(body.progress.totalNumRequests);
      return body.result;
    }
    onProgress(body.progress.totalNumRequests);
    state = body.state;
  }
  throw new Error("調査が完了しませんでした（想定外に長くかかっています）。");
}

export default function ResearchingPage() {
  const router = useRouter();
  const startedRef = useRef(false);
  const [activeLine, setActiveLine] = useState(0);
  const [done, setDone] = useState(false);
  const [mode, setMode] = useState<ResearchMode>("normal");
  const [searchCount, setSearchCount] = useState(0);

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

    (async () => {
      try {
        if (mode === "eco") {
          const body: ResearchRequest = { profile, goal, answers, mode };
          const result = await postJson<ResearchResult>("/api/research", body);
          saveResult(result);
        } else {
          const result = await runAgenticResearch({ profile, goal }, (n) => setSearchCount(n));
          saveResult(result);
        }
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
      {mode === "normal" && searchCount > 0 && (
        <p className="small" style={{ marginTop: 4 }}>
          検索中... {searchCount}回目
        </p>
      )}
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
