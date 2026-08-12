"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { GoalType } from "@/types/research";
import { saveProfileAndGoal, clearResultAndError } from "@/lib/researchSession";

const AGE_RANGES = ["20代前半", "20代後半", "30代前半", "30代後半", "40代", "50代以上"];

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

export default function InputPage() {
  const router = useRouter();

  const [goalDescription, setGoalDescription] = useState("");
  const [goalType, setGoalType] = useState<GoalType>("career_change");
  const [name, setName] = useState("");
  const [ageRange, setAgeRange] = useState("");
  const [currentRole, setCurrentRole] = useState("");
  const [yearsOfExperience, setYearsOfExperience] = useState("");
  const [currentIncome, setCurrentIncome] = useState("");
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
    if (!currentRole.trim()) {
      setError("いまのお仕事を入力してください。");
      return;
    }

    const fields: Record<string, string> = {
      currentRole: currentRole.trim(),
    };
    if (name.trim()) fields.name = name.trim();
    if (ageRange) fields.ageRange = ageRange;
    if (yearsOfExperience.trim()) fields.yearsOfExperience = yearsOfExperience.trim();
    if (currentIncome.trim()) fields.currentIncomeManYen = currentIncome.trim();

    clearResultAndError();
    saveProfileAndGoal({ fields }, { type: goalType, description: goalDescription.trim() });
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

        <div className="card" style={{ marginTop: 26 }}>
          <h3>もう少し、いまのことを教えてください</h3>
          <p className="small">リサーチの土台になります</p>

          <div className="fieldgrid">
            <label className="field">
              <span className="lb">お名前（任意・デモ表示用）</span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 山田 太郎" />
            </label>

            <label className="field">
              <span className="lb">年代</span>
              <select value={ageRange} onChange={(e) => setAgeRange(e.target.value)}>
                <option value="">選択してください</option>
                {AGE_RANGES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>

            <label className="field full">
              <span className="lb">
                いまのお仕事<span className="req">*</span>
              </span>
              <input
                type="text"
                value={currentRole}
                onChange={(e) => setCurrentRole(e.target.value)}
                placeholder="例: SaaS企業の法人営業"
              />
            </label>

            <label className="field">
              <span className="lb">いまの職種での経験年数</span>
              <input
                type="text"
                value={yearsOfExperience}
                onChange={(e) => setYearsOfExperience(e.target.value)}
                placeholder="例: 5年"
              />
            </label>

            <label className="field">
              <span className="lb">現在の年収（万円）</span>
              <input
                type="text"
                inputMode="numeric"
                value={currentIncome}
                onChange={(e) => setCurrentIncome(e.target.value)}
                placeholder="例: 550"
              />
            </label>
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
