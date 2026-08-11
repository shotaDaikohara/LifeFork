"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { GoalType, InterviewQuestion } from "@/types/research";
import questionsData from "@/data/interview/questions.json";
import { loadGoal, loadProfile, saveAnswers } from "@/lib/researchSession";

const allQuestions = questionsData as InterviewQuestion[];

export default function InterviewPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [goalType, setGoalType] = useState<GoalType | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const profile = loadProfile();
    const goal = loadGoal();
    if (!profile || !goal) {
      router.replace("/");
      return;
    }
    // sessionStorage (外部ストア) からの初期読み込みのため、effect内でのsetStateは意図的。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGoalType(goal.type);
    setReady(true);
  }, [router]);

  const questions = useMemo(
    () =>
      allQuestions.filter(
        (q) => !q.appliesTo || (goalType !== null && q.appliesTo.includes(goalType)),
      ),
    [goalType],
  );

  if (!ready) return null;

  function handleChange(id: string, value: string) {
    setValues((prev) => ({ ...prev, [id]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    for (const q of questions) {
      if (q.required && !values[q.id]?.trim()) {
        setError(`「${q.label}」は必須項目です。`);
        return;
      }
    }

    const answers = questions
      .filter((q) => values[q.id]?.trim())
      .map((q) => ({ questionId: q.id, answer: values[q.id].trim() }));

    saveAnswers(answers);
    router.push("/researching");
  }

  return (
    <main className="flex flex-1 justify-center px-4 py-10 sm:py-16">
      <div className="w-full max-w-xl">
        <p className="text-sm font-medium text-indigo-600">STEP 2 / 4</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
          もう少し詳しく教えてください
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          回答は任意項目も含まれます。わかる範囲で構いません。
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          {questions.map((q) => (
            <label key={q.id} className="block">
              <span className="mb-1 block text-sm text-zinc-700">
                {q.label}
                {q.required && <span className="ml-1 text-red-500">*</span>}
              </span>
              {q.type === "textarea" && (
                <textarea
                  className="input min-h-24"
                  placeholder={q.placeholder}
                  value={values[q.id] ?? ""}
                  onChange={(e) => handleChange(q.id, e.target.value)}
                />
              )}
              {q.type === "text" && (
                <input
                  className="input"
                  placeholder={q.placeholder}
                  value={values[q.id] ?? ""}
                  onChange={(e) => handleChange(q.id, e.target.value)}
                />
              )}
              {q.type === "select" && (
                <select
                  className="input"
                  value={values[q.id] ?? ""}
                  onChange={(e) => handleChange(q.id, e.target.value)}
                >
                  <option value="">選択してください</option>
                  {q.options?.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              )}
            </label>
          ))}

          {error && <p className="text-sm text-red-600">{error}</p>}

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
      </div>
    </main>
  );
}
