"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ApiErrorBody, InterviewAnswer } from "@/types/research";
import type { InterviewQuestion } from "@/types/interview";
import { loadGoal, loadProfile, saveAnswers } from "@/lib/researchSession";

type Status = "loading" | "ready" | "error";

export default function InterviewPage() {
  const router = useRouter();
  const startedRef = useRef(false);

  const [status, setStatus] = useState<Status>("loading");
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const profile = loadProfile();
    const goal = loadGoal();
    if (!profile || !goal) {
      router.replace("/");
      return;
    }

    (async () => {
      try {
        const res = await fetch("/api/interview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile, goal }),
        });

        if (!res.ok) {
          const errBody = (await res.json().catch(() => null)) as ApiErrorBody | null;
          throw new Error(
            errBody?.error?.message ?? `質問の生成に失敗しました（status ${res.status}）。`,
          );
        }

        const data = (await res.json()) as { questions: InterviewQuestion[] };
        setQuestions(data.questions);
        setStatus("ready");
      } catch (err) {
        setLoadError(
          err instanceof Error ? err.message : "質問の生成中に不明なエラーが発生しました。",
        );
        setStatus("error");
      }
    })();
  }, [router]);

  function handleChange(id: string, value: string) {
    setValues((prev) => ({ ...prev, [id]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    for (const q of questions) {
      if (q.required && !values[q.id]?.trim()) {
        setFormError(`「${q.label}」は必須項目です。`);
        return;
      }
    }

    const answers: InterviewAnswer[] = questions
      .filter((q) => values[q.id]?.trim())
      .map((q) => ({ questionId: q.id, question: q.label, answer: values[q.id].trim() }));

    saveAnswers(answers);
    router.push("/researching");
  }

  if (status === "loading") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <p className="text-sm font-medium text-indigo-600">STEP 2 / 4</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900">
          追加の質問を準備しています
        </h1>
        <div className="mt-8 flex items-center gap-3">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
          <p className="text-sm text-zinc-600">
            入力内容をもとに、リサーチに必要な質問を最大4問生成しています…
          </p>
        </div>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <p className="text-sm font-medium text-indigo-600">STEP 2 / 4</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900">
          質問の生成に失敗しました
        </h1>
        <p className="mt-3 max-w-md text-sm text-red-600">{loadError}</p>
        <div className="mt-8 flex gap-3">
          <button className="btn-secondary" onClick={() => router.push("/")}>
            入力からやり直す
          </button>
          <button
            className="btn-primary"
            onClick={() => {
              startedRef.current = false;
              setStatus("loading");
              setLoadError(null);
              // 再マウントと同等の効果を得るため簡易的にリロードする。
              window.location.reload();
            }}
          >
            もう一度試す
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 justify-center px-4 py-10 sm:py-16">
      <div className="w-full max-w-xl">
        <p className="text-sm font-medium text-indigo-600">STEP 2 / 4</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
          もう少し詳しく教えてください
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          入力内容をもとにAIが生成した質問です。回答は任意項目も含まれます。
        </p>

        {questions.length === 0 ? (
          <div className="mt-8 space-y-6">
            <p className="text-sm text-zinc-600">
              追加で確認すべき不足条件は見つかりませんでした。このままリサーチに進めます。
            </p>
            <div className="flex gap-3">
              <button className="btn-secondary" onClick={() => router.push("/")}>
                戻る
              </button>
              <button
                className="btn-primary flex-1"
                onClick={() => {
                  saveAnswers([]);
                  router.push("/researching");
                }}
              >
                リサーチを開始する
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-6">
            {questions.map((q) => (
              <label key={q.id} className="block">
                <span className="mb-1 block text-sm text-zinc-700">
                  {q.label}
                  {q.required && <span className="ml-1 text-red-500">*</span>}
                </span>
                {q.type === "text" && (
                  <input
                    className="input"
                    value={values[q.id] ?? ""}
                    onChange={(e) => handleChange(q.id, e.target.value)}
                  />
                )}
                {q.type === "single_select" && (
                  <select
                    className="input"
                    value={values[q.id] ?? ""}
                    onChange={(e) => handleChange(q.id, e.target.value)}
                  >
                    <option value="">選択してください</option>
                    {q.options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                )}
              </label>
            ))}

            {formError && <p className="text-sm text-red-600">{formError}</p>}

            <div className="flex gap-3">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => router.push("/")}
              >
                戻る
              </button>
              <button type="submit" className="btn-primary flex-1">
                リサーチを開始する
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
