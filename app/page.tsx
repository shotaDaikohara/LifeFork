"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { GoalType, ResearchMode } from "@/types/research";
import { saveProfileAndGoal, saveMode, clearResultAndError } from "@/lib/researchSession";

const SUGGESTIONS: {
  emoji: string;
  bg: string;
  title: string;
  tag: string;
  goalType: GoalType;
  description: string;
}[] = [
  {
    emoji: "💻",
    bg: "var(--sky-lt)",
    title: "別の業界に転職したい",
    tag: "未経験からの職種チェンジ",
    goalType: "career_change",
    description: "IT業界のプロダクトマネージャーへの転職を考えている",
  },
  {
    emoji: "☕️",
    bg: "var(--sun-lt)",
    title: "カフェを開きたい",
    tag: "飲食・独立開業・自分の店",
    goalType: "independence",
    description: "カフェを開きたい",
  },
  {
    emoji: "🍓",
    bg: "var(--berry-lt)",
    title: "いちご農園をやりたい",
    tag: "農業・地方移住・新規就農",
    goalType: "independence",
    description: "いちご農園をやりたい",
  },
];

/**
 * S01 入力（UI案 s-theme に準拠）。
 * プロフィールの基本情報（年代・職種・経験年数・年収・貯金・家族構成・時期など）は
 * ここでは尋ねず、AI動的ヒアリング（S02）側の質問に委ねる（UI案のCOMMON_Qに相当）。
 */
export default function InputPage() {
  const router = useRouter();

  const [goalDescription, setGoalDescription] = useState("");
  const [goalType, setGoalType] = useState<GoalType>("career_change");
  const [mode, setMode] = useState<ResearchMode>("normal");
  const [error, setError] = useState<string | null>(null);

  function pickSuggestion(s: (typeof SUGGESTIONS)[number]) {
    setGoalDescription(s.description);
    setGoalType(s.goalType);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!goalDescription.trim()) {
      setError("やってみたいことを入力してください。");
      return;
    }

    clearResultAndError();
    saveProfileAndGoal({ fields: {} }, { type: goalType, description: goalDescription.trim() });
    saveMode(mode);
    router.push("/interview");
  }

  return (
    <main className="stage">
      <form id="s01-form" onSubmit={handleSubmit} className="narrow" style={{ paddingTop: 26 }}>
        <div className="ai">
          <div className="face">🍴</div>
          <div className="bub">
            やってみたいこと、なんですか？
            <br />
            まだ ぼんやりでも大丈夫です。
          </div>
        </div>

        <div className="bigfield">
          <span style={{ fontSize: 19 }}>✎</span>
          <input
            value={goalDescription}
            onChange={(e) => setGoalDescription(e.target.value)}
            placeholder="いちご農園をやりたい"
            autoComplete="off"
          />
        </div>
        <p className="tiny" style={{ margin: "10px 4px 0" }}>
          「〜になりたい」「〜を始めたい」のような書き方でOK
        </p>

        <div style={{ marginTop: 20 }}>
          <div className="seg" role="group" aria-label="検討している方向性">
            <button
              type="button"
              className={goalType === "career_change" ? "on" : ""}
              onClick={() => setGoalType("career_change")}
            >
              転職を考えている
            </button>
            <button
              type="button"
              className={goalType === "independence" ? "on" : ""}
              onClick={() => setGoalType("independence")}
            >
              独立を考えている
            </button>
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <div className="seg" role="group" aria-label="調べ方">
            <button
              type="button"
              className={mode === "normal" ? "on" : ""}
              onClick={() => setMode("normal")}
            >
              じっくり調べる
            </button>
            <button
              type="button"
              className={mode === "eco" ? "on" : ""}
              onClick={() => setMode("eco")}
            >
              さくっと調べる（エコ）
            </button>
          </div>
          <p className="tiny" style={{ margin: "8px 4px 0" }}>
            じっくり調べるは、相談内容に応じて使うAIモデルの判断をAIルーター自身に任せます。さくっと調べるは常に軽量モデルで低コストに固定します
          </p>
        </div>

        <div style={{ marginTop: 24 }}>
          <p className="small" style={{ marginBottom: 10, fontWeight: 800, color: "var(--ink-2)" }}>
            よく相談されるテーマ
          </p>
          <div className="suggest">
            {SUGGESTIONS.map((s) => (
              <button
                type="button"
                key={s.title}
                className="sug"
                onClick={() => pickSuggestion(s)}
              >
                <div className="ic" style={{ background: s.bg }}>
                  {s.emoji}
                </div>
                <div>
                  <b>{s.title}</b>
                  <div className="small">{s.tag}</div>
                </div>
                <div className="go">›</div>
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="small" style={{ color: "var(--berry)", marginTop: 16 }}>
            {error}
          </p>
        )}

        <div style={{ height: 100 }} />
      </form>

      <div className="dock on">
        <div className="inner">
          <button type="submit" form="s01-form" className="btn">
            これで調べてもらう
          </button>
        </div>
      </div>
    </main>
  );
}
