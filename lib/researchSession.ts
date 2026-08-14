"use client";

import type {
  Goal,
  InterviewAnswer,
  Profile,
  ResearchMode,
  ResearchResult,
} from "@/types/research";

/**
 * S01〜S04 の画面間で入力・結果を受け渡すための一時セッションストア。
 * 設計書3章の方針 (DBを持たず、ユーザー入力・結果を永続化しない) に従い、
 * sessionStorage のみを使用しタブを閉じれば消える状態とする。
 */

const KEYS = {
  profile: "lifefork:profile",
  goal: "lifefork:goal",
  answers: "lifefork:answers",
  mode: "lifefork:mode",
  result: "lifefork:result",
  error: "lifefork:error",
} as const;

function isBrowser() {
  return typeof window !== "undefined";
}

function readJson<T>(key: string): T | null {
  if (!isBrowser()) return null;
  const raw = window.sessionStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  if (!isBrowser()) return;
  window.sessionStorage.setItem(key, JSON.stringify(value));
}

export function saveProfileAndGoal(profile: Profile, goal: Goal) {
  writeJson(KEYS.profile, profile);
  writeJson(KEYS.goal, goal);
}

export function loadProfile(): Profile | null {
  return readJson<Profile>(KEYS.profile);
}

export function loadGoal(): Goal | null {
  return readJson<Goal>(KEYS.goal);
}

// 通常モード（自動昇格あり）/ エコモード（昇格なし・低コスト優先）の選択。S01で選び、
// S03（researching）で /api/research に渡す（設計は docs/orcarouter-routing-design.md 参照）。
export function saveMode(mode: ResearchMode) {
  writeJson(KEYS.mode, mode);
}

export function loadMode(): ResearchMode {
  return readJson<ResearchMode>(KEYS.mode) ?? "normal";
}

export function saveAnswers(answers: InterviewAnswer[]) {
  writeJson(KEYS.answers, answers);
}

export function loadAnswers(): InterviewAnswer[] {
  return readJson<InterviewAnswer[]>(KEYS.answers) ?? [];
}

export function saveResult(result: ResearchResult) {
  writeJson(KEYS.result, result);
  if (isBrowser()) window.sessionStorage.removeItem(KEYS.error);
}

export function loadResult(): ResearchResult | null {
  return readJson<ResearchResult>(KEYS.result);
}

export function saveError(message: string) {
  writeJson(KEYS.error, message);
  if (isBrowser()) window.sessionStorage.removeItem(KEYS.result);
}

export function loadError(): string | null {
  return readJson<string>(KEYS.error);
}

export function clearResultAndError() {
  if (!isBrowser()) return;
  window.sessionStorage.removeItem(KEYS.result);
  window.sessionStorage.removeItem(KEYS.error);
}
