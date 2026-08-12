import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ResearchRequest } from "@/types/research";
import type { InterviewRequest } from "@/types/interview";
import type { FactFindingResponse } from "@/types/factFinding";

const RESEARCH_SYSTEM_PROMPT_PATH = path.join(
  process.cwd(),
  "prompts",
  "research_system.md",
);
const RESEARCH_FACTS_PROMPT_PATH = path.join(
  process.cwd(),
  "prompts",
  "research_facts.md",
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
 * prompts/research_facts.md を読み込み、プロフィール・将来像と結合する（Pass1: 基礎調査）。
 */
export async function buildFactFindingPrompt(
  request: Pick<ResearchRequest, "profile" | "goal">,
): Promise<BuiltPrompt> {
  const system = await readFile(RESEARCH_FACTS_PROMPT_PATH, "utf-8");

  const userPayload = {
    profile: request.profile,
    goal: request.goal,
  };

  const user = [
    "以下はユーザー入力です。この内容に関連する事実をWeb検索で調べ、FactFinding の JSON を生成してください。",
    "",
    "```json",
    JSON.stringify(userPayload, null, 2),
    "```",
  ].join("\n");

  return { system, user };
}

/**
 * prompts/research_system.md を読み込み、ユーザー入力と結合する（Pass2: 詳細生成）。
 *
 * 設計書 11章の方針により、プロンプト本文はコードへ埋め込まず外部ファイルで管理する。
 * v0.3 でヒアリング質問は動的生成 (POST /api/interview) に変更されたため、
 * 質問文は静的ファイルではなく answers[].question（クライアントから再送される値）
 * から取得する。DBを持たないため、質問セットはサーバー側に保持していない。
 *
 * @param factFinding Pass1で取得した基礎調査結果。取得できなかった場合は省略可。
 */
export async function buildResearchPrompt(
  request: ResearchRequest,
  factFinding?: FactFindingResponse,
): Promise<BuiltPrompt> {
  const system = await readFile(RESEARCH_SYSTEM_PROMPT_PATH, "utf-8");

  const answers = request.answers.map((a) => ({
    question: a.question ?? a.questionId,
    answer: a.answer,
  }));

  const userPayload: Record<string, unknown> = {
    profile: request.profile,
    goal: request.goal,
    interviewAnswers: answers,
  };

  if (factFinding && (factFinding.facts.length > 0 || factFinding.sources.length > 0)) {
    userPayload.researchedFacts = factFinding.facts;
    userPayload.researchedSources = factFinding.sources;
  }

  const user = [
    "以下はユーザー入力です。この内容に基づいて ResearchResult の JSON を生成してください。",
    factFinding && factFinding.facts.length > 0
      ? "researchedFacts / researchedSources は事前のWeb検索で確認できた事実です。内容と矛盾しないようにし、根拠として使えるものは sources に反映してください。存在しない情報を新たに作り出さないこと。"
      : "",
    "",
    "```json",
    JSON.stringify(userPayload, null, 2),
    "```",
  ]
    .filter(Boolean)
    .join("\n");

  return { system, user };
}
