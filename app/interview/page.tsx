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
  const [qi, setQi] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);

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

  function finish(finalValues: Record<string, string>) {
    const answers: InterviewAnswer[] = questions
      .filter((q) => finalValues[q.id]?.trim())
      .map((q) => ({ questionId: q.id, question: q.label, answer: finalValues[q.id].trim() }));
    saveAnswers(answers);
    router.push("/researching");
  }

  function goNext(finalValues: Record<string, string>) {
    if (qi < questions.length - 1) {
      setQi(qi + 1);
      window.scrollTo(0, 0);
    } else {
      finish(finalValues);
    }
  }

  function answer(id: string, value: string) {
    const next = { ...values, [id]: value };
    setValues(next);
    setTimeout(() => goNext(next), 220);
  }

  function skipQ() {
    goNext(values);
  }

  function prevQ() {
    if (qi > 0) setQi(qi - 1);
    else router.push("/");
  }

  if (status === "loading") {
    return (
      <main className="stage loading">
        <div className="spin">
          <i />
        </div>
        <div>
          <h2>
            追加の質問を
            <br />
            準備しています
          </h2>
          <p className="small" style={{ marginTop: 8 }}>
            入力内容をもとに、リサーチに必要な質問を最大4問選んでいます
          </p>
        </div>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="stage loading">
        <div>
          <h2>質問の準備に失敗しました</h2>
          <p className="small" style={{ marginTop: 8, color: "var(--berry)" }}>
            {loadError}
          </p>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button className="btn ghost auto" onClick={() => router.push("/")}>
            入力からやり直す
          </button>
          <button className="btn auto" onClick={() => window.location.reload()}>
            もう一度試す
          </button>
        </div>
      </main>
    );
  }

  if (questions.length === 0) {
    return (
      <main className="stage narrow" style={{ paddingTop: 26 }}>
        <div className="ai">
          <div className="face">🍴</div>
          <div className="bub">
            追加で確認すべきことは見つかりませんでした。
            <br />
            このままリサーチに進めます。
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
          <button className="btn ghost auto" onClick={() => router.push("/")}>
            戻る
          </button>
          <button className="btn" style={{ flex: 1 }} onClick={() => finish(values)}>
            リサーチを開始する
          </button>
        </div>
      </main>
    );
  }

  const q = questions[qi];
  const progress = (qi / questions.length) * 100;

  return (
    <main className="stage narrow">
      <div className="qhead">
        <button className="back" onClick={prevQ} aria-label="前の質問へ">
          ←
        </button>
        <div className="progress">
          <div className="bar">
            <i style={{ width: `${progress}%` }} />
          </div>
          <div className="lb">
            <span>
              {qi + 1}問目 / {questions.length}問
            </span>
            <span>{qi === questions.length - 1 ? "これで最後です" : `あと${questions.length - qi - 1}問`}</span>
          </div>
        </div>
      </div>

      <div className="qcard">
        <div className="qwhy">
          <span className="ic">💡</span>
          <span>{q.why}</span>
        </div>
        <div className="qtitle">{q.label}</div>

        {q.type === "single_select" ? (
          <div className="opts">
            {q.options.map((opt) => (
              <button
                key={opt}
                className={`opt ${values[q.id] === opt ? "on" : ""}`}
                onClick={() => answer(q.id, opt)}
              >
                <span>{opt}</span>
                <span className="ck">{values[q.id] === opt ? "✓" : ""}</span>
              </button>
            ))}
          </div>
        ) : (
          <TextAnswer
            key={q.id}
            initial={values[q.id] ?? ""}
            required={q.required}
            onSubmit={(value) => answer(q.id, value)}
          />
        )}

        <div className="qskip">
          <button className="textlink" onClick={skipQ}>
            わからない・答えたくない
          </button>
        </div>
      </div>

      <p className="tiny" style={{ textAlign: "center", marginTop: 16 }}>
        答えなかった項目は、同じ条件の人の平均でAIが補います
      </p>
    </main>
  );
}

function TextAnswer({
  initial,
  required,
  onSubmit,
}: {
  initial: string;
  required: boolean;
  onSubmit: (value: string) => void;
}) {
  const [text, setText] = useState(initial);

  function submit() {
    if (required && !text.trim()) return;
    onSubmit(text.trim());
  }

  return (
    <div className="field">
      <input
        type="text"
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder="回答を入力"
      />
      <button className="btn" style={{ marginTop: 14 }} onClick={submit}>
        次へ
      </button>
    </div>
  );
}
