import OpenAI from "openai";
import { z } from "zod";
import { researchResultSchema } from "@/types/research";
import { interviewResponseSchema } from "@/types/interview";
import { ResearchError } from "@/lib/errors";

/**
 * OrcaRouter (OpenAI互換API) クライアント。
 *
 * 設計書 9章の方針:
 * - サーバー側からのみ呼び出す (このファイルは Route Handler 経由でのみ import される)。
 * - モデルIDはコードに直書きせず環境変数で切替可能にする。
 * - response_format / JSON Schema を利用可能なモデルを優先しつつ、
 *   非対応時は json_object + プロンプト指示で代替する。
 * - /v1/chat/completions を第一候補とする。将来的に呼び出し方式が変わっても
 *   このクライアントの内部のみを変更すれば良いよう、呼び出し口を集約する。
 *
 * InterviewController (/api/interview) と ResearchController (/api/research) の
 * 両方から使われるため、構造化出力の呼び出しロジックは requestStructuredCompletion に
 * 集約し、各エンドポイント向けの薄いラッパーを提供する。
 */

const DEFAULT_BASE_URL = "https://api.orcarouter.ai/v1";
const DEFAULT_MODEL = "orcarouter/auto";
const DEFAULT_TIMEOUT_MS = 55_000;

function getEnv() {
  const apiKey = process.env.ORCAROUTER_API_KEY;
  const baseURL = process.env.ORCAROUTER_BASE_URL || DEFAULT_BASE_URL;
  const model = process.env.ORCAROUTER_MODEL || DEFAULT_MODEL;
  const timeoutMs = Number(process.env.ORCAROUTER_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  // 設計書9.5章: Web Searchの実発火をモデル/ルートごとに確認したうえで有効化する。
  // 対応が未確認のモデルではデフォルトで無効。
  const webSearchEnabled = process.env.ORCAROUTER_WEB_SEARCH === "true";
  return { apiKey, baseURL, model, timeoutMs, webSearchEnabled };
}

export function isOrcaRouterConfigured(): boolean {
  return Boolean(process.env.ORCAROUTER_API_KEY);
}

export function orcaRouterHealthInfo() {
  const { baseURL, model, webSearchEnabled } = getEnv();
  return {
    configured: isOrcaRouterConfigured(),
    baseUrl: baseURL,
    model,
    webSearchEnabled,
  };
}

let client: OpenAI | null = null;

function getClient(): OpenAI {
  const { apiKey, baseURL, timeoutMs } = getEnv();
  if (!apiKey) {
    throw new ResearchError(
      "internal_error",
      "ORCAROUTER_API_KEY が設定されていません。.env.example を参考に .env.local を作成してください。",
    );
  }
  if (!client) {
    client = new OpenAI({ apiKey, baseURL, timeout: timeoutMs, maxRetries: 0 });
  }
  return client;
}

// JSON Schema strict モードは default キーワード等を許容しないため false とする。
// 最終的な厳密検証は各 Validator (zod) 側で行う。
function toJsonSchema(schema: z.core.$ZodType): Record<string, unknown> {
  const jsonSchema = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown> & {
    $schema?: string;
  };
  // OpenAI互換APIの response_format.json_schema は $schema キーを想定していない。
  delete jsonSchema.$schema;
  return jsonSchema;
}

const researchResultJsonSchema = toJsonSchema(researchResultSchema);
const interviewResponseJsonSchema = toJsonSchema(interviewResponseSchema);

export interface ChatMessages {
  system: string;
  user: string;
}

interface StructuredCompletionOptions {
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  /** Web Search を付与するか。質問生成 (interview) では不要なため research のみ true にする。 */
  useWebSearch?: boolean;
}

/**
 * OrcaRouter へ構造化出力 (JSON) の生成を依頼する共通処理。
 * 失敗種別 (レート制限 / 上流エラー / タイムアウト) を ResearchError として分類する。
 *
 * @param retryHint 直前の応答がスキーマ検証に失敗した場合、修正を促す追加メッセージ
 */
async function requestStructuredCompletion(
  messages: ChatMessages,
  { schemaName, jsonSchema, useWebSearch }: StructuredCompletionOptions,
  retryHint?: string,
): Promise<string> {
  const { model, webSearchEnabled } = getEnv();
  const openai = getClient();

  const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: messages.system },
    { role: "user", content: messages.user },
  ];
  if (retryHint) {
    chatMessages.push({ role: "user", content: retryHint });
  }

  // web_search_options は gpt-4o-*-search-preview 等、対応が確認できたモデルでのみ付与する。
  const webSearchParams = useWebSearch && webSearchEnabled ? { web_search_options: {} } : {};

  const attemptWithSchema = async () => {
    return openai.chat.completions.create({
      model,
      messages: chatMessages,
      ...webSearchParams,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: schemaName,
          schema: jsonSchema,
          strict: false,
        },
      },
    });
  };

  const attemptWithJsonObject = async () => {
    return openai.chat.completions.create({
      model,
      messages: chatMessages,
      ...webSearchParams,
      response_format: { type: "json_object" },
    });
  };

  let response;
  try {
    response = await attemptWithSchema();
  } catch (err) {
    // モデル/ルーターが json_schema 未対応の場合は json_object にフォールバックする。
    if (isRetryableFormatError(err)) {
      response = await withServerErrorRetry(attemptWithJsonObject);
    } else {
      throw toResearchError(err);
    }
  }

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new ResearchError(
      "invalid_response",
      "OrcaRouterからの応答に本文が含まれていません。",
    );
  }
  return content;
}

/**
 * OrcaRouter へ ResearchResult 生成を依頼する。設計書 9章 / 10章に対応。
 */
export async function requestResearchCompletion(
  messages: ChatMessages,
  retryHint?: string,
): Promise<string> {
  return requestStructuredCompletion(
    messages,
    { schemaName: "research_result", jsonSchema: researchResultJsonSchema, useWebSearch: true },
    retryHint,
  );
}

/**
 * OrcaRouter へ追加ヒアリング質問 (InterviewResponse) の生成を依頼する。設計書 8.1章に対応。
 * ヒアリング質問生成では最新情報の検索は不要なため Web Search は付与しない。
 */
export async function requestInterviewCompletion(
  messages: ChatMessages,
  retryHint?: string,
): Promise<string> {
  return requestStructuredCompletion(
    messages,
    { schemaName: "interview_response", jsonSchema: interviewResponseJsonSchema, useWebSearch: false },
    retryHint,
  );
}

async function withServerErrorRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isServerError(err)) {
      // 5xx は設計書13章に従い1回のみ再試行する。
      return await fn();
    }
    throw toResearchError(err);
  }
}

function isRetryableFormatError(err: unknown): boolean {
  const status = getStatus(err);
  // response_format 非対応は 400 系で返るルーターが多いため、そのケースのみ json_object にフォールバックする。
  return status === 400 || status === 422;
}

function isServerError(err: unknown): boolean {
  const status = getStatus(err);
  return typeof status === "number" && status >= 500;
}

function getStatus(err: unknown): number | undefined {
  if (err && typeof err === "object" && "status" in err) {
    const status = (err as { status?: unknown }).status;
    return typeof status === "number" ? status : undefined;
  }
  return undefined;
}

function toResearchError(err: unknown): ResearchError {
  if (err instanceof ResearchError) return err;

  const status = getStatus(err);
  const message = err instanceof Error ? err.message : "OrcaRouter呼び出しに失敗しました。";

  if (err instanceof OpenAI.APIConnectionTimeoutError) {
    return new ResearchError("timeout", "OrcaRouterへのリクエストがタイムアウトしました。");
  }
  if (status === 429) {
    return new ResearchError("rate_limited", "OrcaRouterのレート制限に達しました。時間を置いて再試行してください。");
  }
  if (typeof status === "number" && status >= 500) {
    return new ResearchError("upstream_error", `OrcaRouter/上流モデルでエラーが発生しました (status ${status})。`);
  }
  if (typeof status === "number" && status >= 400) {
    return new ResearchError("upstream_error", `OrcaRouterへのリクエストが拒否されました: ${message}`);
  }
  return new ResearchError("upstream_error", message);
}
