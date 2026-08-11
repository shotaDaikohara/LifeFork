"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ResearchResult } from "@/types/research";
import { clearResultAndError, loadError, loadResult } from "@/lib/researchSession";
import { PathCard } from "@/components/result/PathCard";

export default function ResultPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const r = loadResult();
    const e = loadError();
    if (!r && !e) {
      router.replace("/");
      return;
    }
    // sessionStorage (外部ストア) からの初期読み込みのため、effect内でのsetStateは意図的。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResult(r);
    setError(e);
    setReady(true);
  }, [router]);

  if (!ready) return null;

  if (error) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <p className="text-sm font-medium text-indigo-600">STEP 4 / 4</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900">
          リサーチに失敗しました
        </h1>
        <p className="mt-3 max-w-md text-sm text-red-600">{error}</p>
        <p className="mt-2 max-w-md text-xs text-zinc-500">
          結果は捏造せず表示していません。時間を置くか、入力内容を見直して再度お試しください。
        </p>
        <div className="mt-8 flex gap-3">
          <button
            className="btn-secondary"
            onClick={() => {
              clearResultAndError();
              router.push("/interview");
            }}
          >
            ヒアリングに戻る
          </button>
          <button
            className="btn-primary"
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

  if (!result) return null;

  return (
    <main className="flex flex-1 justify-center px-4 py-10 sm:py-16">
      <div className="w-full max-w-4xl">
        <p className="text-sm font-medium text-indigo-600">STEP 4 / 4</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
          {result.summary.headline}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-700">
          {result.summary.comparisonConclusion}
        </p>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <PathCard
            variant="current"
            title={result.currentPath.title}
            outlook={result.currentPath.outlook}
            income={result.currentPath.income}
            steps={result.currentPath.steps}
            risks={result.currentPath.risks}
          />
          <PathCard
            variant="target"
            title={result.targetPath.title}
            outlook={result.targetPath.outlook}
            income={result.targetPath.income}
            steps={result.targetPath.steps}
            risks={result.targetPath.risks}
          />
        </div>

        {result.sources.length > 0 && (
          <section className="card mt-6">
            <h2 className="text-sm font-semibold text-zinc-900">根拠・参考情報</h2>
            <ul className="mt-2 space-y-1 text-sm text-zinc-600">
              {result.sources.map((s, i) => (
                <li key={i}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 underline underline-offset-2 hover:text-indigo-700"
                  >
                    {s.title}
                  </a>
                  <span className="text-zinc-400"> — {s.usedFor}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {result.limitations.length > 0 && (
          <section className="card mt-6 border-amber-200 bg-amber-50">
            <h2 className="text-sm font-semibold text-amber-800">この結果の限界・前提の不確実性</h2>
            <ul className="mt-2 space-y-1 text-sm text-amber-800">
              {result.limitations.map((l, i) => (
                <li key={i}>・{l}</li>
              ))}
            </ul>
          </section>
        )}

        <p className="mt-6 text-xs text-zinc-400">
          本結果はAIによる初期リサーチであり、正確性・再現性を保証するものではありません。意思決定の最終判断材料としては使用しないでください。
        </p>

        <div className="mt-8 flex gap-3">
          <button
            className="btn-secondary"
            onClick={() => {
              clearResultAndError();
              router.push("/");
            }}
          >
            別の未来を調べる
          </button>
        </div>
      </div>
    </main>
  );
}
