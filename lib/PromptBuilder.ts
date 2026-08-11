import { readFile } from "node:fs/promises";
import path from "node:path";
import type { InterviewQuestion, ResearchRequest } from "@/types/research";
import interviewQuestions from "@/data/interview/questions.json";

const SYSTEM_PROMPT_PATH = path.join(
  process.cwd(),
  "prompts",
  "research_system.md",
);

export interface BuiltPrompt {
  system: string;
  user: string;
}

/**
 * prompts/research_system.md を読み込み、ユーザー入力と結合する。
 *
 * 設計書 11章の方針により、プロンプト本文はコードへ埋め込まず外部ファイルで管理する。
 */
export async function buildResearchPrompt(
  request: ResearchRequest,
): Promise<BuiltPrompt> {
  const system = await readFile(SYSTEM_PROMPT_PATH, "utf-8");

  const questionMap = new Map(
    (interviewQuestions as InterviewQuestion[]).map((q) => [q.id, q.label]),
  );

  const answers = request.answers.map((a) => ({
    question: questionMap.get(a.questionId) ?? a.questionId,
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
