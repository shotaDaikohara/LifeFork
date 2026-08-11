import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ResearchRequest } from "@/types/research";
import type { InterviewRequest } from "@/types/interview";

const RESEARCH_SYSTEM_PROMPT_PATH = path.join(
  process.cwd(),
  "prompts",
  "research_system.md",
);
const INTERVIEW_SYSTEM_PROMPT_PATH = path.join(
  process.cwd(),
  "prompts",
  "interview_system.md",
);

export interface BuiltPrompt {
  system: string;
  user: string;
}

/**
 * prompts/interview_system.md を読み込み、プロフィール・将来像と結合する。
 *
 * 設計書 11章の方針により、プロンプト本文はコードへ埋め込まず外部ファイルで管理する。
 */
export async function buildInterviewPrompt(
  request: InterviewRequest,
): Promise<BuiltPrompt> {
  const system = await readFile(INTERVIEW_SYSTEM_PROMPT_PATH, "utf-8");

  const userPayload = {
    profile: request.profile,
    goal: request.goal,
  };

  const user = [
    "以下はユーザー入力です。この内容に基づいて InterviewResponse の JSON を生成してください。",
    "",
    "```json",
    JSON.stringify(userPayload, null, 2),
    "```",
  ].join("\n");

  return { system, user };
}

/**
 * prompts/research_system.md を読み込み、ユーザー入力と結合する。
 *
 * 設計書 11章の方針により、プロンプト本文はコードへ埋め込まず外部ファイルで管理する。
 * v0.3 でヒアリング質問は動的生成 (POST /api/interview) に変更されたため、
 * 質問文は静的ファイルではなく answers[].question（クライアントから再送される値）
 * から取得する。DBを持たないため、質問セットはサーバー側に保持していない。
 */
export async function buildResearchPrompt(
  request: ResearchRequest,
): Promise<BuiltPrompt> {
  const system = await readFile(RESEARCH_SYSTEM_PROMPT_PATH, "utf-8");

  const answers = request.answers.map((a) => ({
    question: a.question ?? a.questionId,
    answer: a.answer,
  }));

  const userPayload = {
    profile: request.profile,
    goal: request.goal,
    interviewAnswers: answers,
  };

  const user = [
    "以下はユーザー入力です。この内容に基づいて ResearchResult の JSON を生成してください。",
    "",
    "```json",
    JSON.stringify(userPayload, null, 2),
    "```",
  ].join("\n");

  return { system, user };
}
