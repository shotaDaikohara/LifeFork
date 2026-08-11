"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ApiErrorBody, ResearchRequest } from "@/types/research";
import {
  loadAnswers,
  loadGoal,
  loadProfile,
  saveError,
  saveResult,
} from "@/lib/researchSession";

const PROGRESS_MESSAGES = [
  "将来性を調査しています…",
  "収入水準を調査しています…",
  "実現手段を整理しています…",
  "主要リスクを整理しています…",
];

export default function ResearchingPage() {
  const router = useRouter();
  const startedRef = useRef(false);
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setMessageIndex((i) => (i + 1) % PROGRESS_MESSAGES.length);
    }, 2200);
    return () => clearInterval(id);
  }, []);

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

    const body: ResearchRequest = { profile, goal, answers };

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
        router.push("/result");
      }
    })();
  }, [router]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <p className="text-sm font-medium text-indigo-600">STEP 3 / 4</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
        リサーチ中です
      </h1>
      <div className="mt-8 flex items-center gap-3">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
        <p className="text-sm text-zinc-600">{PROGRESS_MESSAGES[messageIndex]}</p>
      </div>
      <p className="mt-10 max-w-sm text-xs text-zinc-400">
        表示内容は目安であり、実際の処理状況と厳密に同期しているものではありません。
      </p>
    </main>
  );
}
