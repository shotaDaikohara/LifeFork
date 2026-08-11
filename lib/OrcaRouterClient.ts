import OpenAI from "openai";
import { z } from "zod";
import { researchResultSchema } from "@/types/research";
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
// 最終的な厳密検証は ResultValidator (zod) 側で行う。
const researchResultJsonSchema = z.toJSONSchema(researchResultSchema, {
  target: "draft-7",
});
// OpenAI互換APIの response_format.json_schema は $schema キーを想定していないため除去する。
delete (researchResultJsonSchema as { $schema?: string }).$schema;

export interface ChatMessages {
  system: string;
  user: string;
}

/**
 * OrcaRouter へ ResearchResult 生成を依頼する。
 * 失敗種別 (レート制限 / 上流エラー / タイムアウト) を ResearchError として分類する。
 *
 * @param retryHint 直前の応答がスキーマ検証に失敗した場合、修正を促す追加メッセージ
 */
export async function requestResearchCompletion(
  messages: ChatMessages,
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
  const webSearchParams = webSearchEnabled ? { web_search_options: {} } : {};

  const attemptWithSchema = async () => {
    return openai.chat.completions.create({
      model,
      messages: chatMessages,
      ...webSearchParams,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "research_result",
          schema: researchResultJsonSchema as Record<string, unknown>,
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
