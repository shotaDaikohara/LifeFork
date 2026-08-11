"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { GoalType } from "@/types/research";
import { saveProfileAndGoal, clearResultAndError } from "@/lib/researchSession";

const AGE_RANGES = ["20代前半", "20代後半", "30代前半", "30代後半", "40代", "50代以上"];

export default function InputPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [ageRange, setAgeRange] = useState("");
  const [currentRole, setCurrentRole] = useState("");
  const [yearsOfExperience, setYearsOfExperience] = useState("");
  const [currentIncome, setCurrentIncome] = useState("");
  const [goalType, setGoalType] = useState<GoalType>("career_change");
  const [goalDescription, setGoalDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!currentRole.trim()) {
      setError("現在の職種・業界を入力してください。");
      return;
    }
    if (!goalDescription.trim()) {
      setError("検討したい将来像を入力してください。");
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
    saveProfileAndGoal(
      { fields },
      { type: goalType, description: goalDescription.trim() },
    );
    router.push("/interview");
  }

  return (
    <main className="flex flex-1 justify-center px-4 py-10 sm:py-16">
      <div className="w-full max-w-xl">
        <p className="text-sm font-medium text-indigo-600">STEP 1 / 4</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
          あなたの今と、検討したい未来を教えてください
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          入力内容をもとに、今の道を続けた場合と転職・独立した場合の未来をリサーチします。
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-8">
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-zinc-900">プロフィール</h2>

            <Field label="お名前（任意・デモ表示用）">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
                placeholder="例: 山田 太郎"
              />
            </Field>

            <Field label="年代（任意）">
              <select
                value={ageRange}
                onChange={(e) => setAgeRange(e.target.value)}
                className="input"
              >
                <option value="">選択してください</option>
                {AGE_RANGES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="現在の職種・業界" required>
              <input
                value={currentRole}
                onChange={(e) => setCurrentRole(e.target.value)}
                className="input"
                placeholder="例: SaaS企業の法人営業"
              />
            </Field>

            <Field label="現在の職種での経験年数（任意）">
              <input
                value={yearsOfExperience}
                onChange={(e) => setYearsOfExperience(e.target.value)}
                className="input"
                placeholder="例: 5年"
              />
            </Field>

            <Field label="現在の年収（万円・任意）">
              <input
                value={currentIncome}
                onChange={(e) => setCurrentIncome(e.target.value)}
                className="input"
                placeholder="例: 550"
                inputMode="numeric"
              />
            </Field>
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-zinc-900">検討したい将来像</h2>

            <Field label="検討している方向性" required>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-zinc-700">
                  <input
                    type="radio"
                    name="goalType"
                    checked={goalType === "career_change"}
                    onChange={() => setGoalType("career_change")}
                  />
                  転職
                </label>
                <label className="flex items-center gap-2 text-sm text-zinc-700">
                  <input
                    type="radio"
                    name="goalType"
                    checked={goalType === "independence"}
                    onChange={() => setGoalType("independence")}
                  />
                  独立
                </label>
              </div>
            </Field>

            <Field label="検討したい将来像を具体的に教えてください" required>
              <textarea
                value={goalDescription}
                onChange={(e) => setGoalDescription(e.target.value)}
                className="input min-h-28"
                placeholder="例: IT業界のプロダクトマネージャーへの転職を考えている"
              />
            </Field>
          </section>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button type="submit" className="btn-primary w-full">
            次へ（ヒアリング）
          </button>
        </form>
      </div>
    </main>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-zinc-700">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}
