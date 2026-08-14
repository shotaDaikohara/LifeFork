import OpenAI from "openai";
import { z } from "zod";
import { researchResultSchema } from "@/types/research";
import { interviewResponseSchema } from "@/types/interview";
import { factFindingResponseSchema, topicFindingResponseSchema } from "@/types/factFinding";
import { researchCandidatesSchema } from "@/types/researchCandidates";
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
const DEFAULT_TIMEOUT_MS = 45_000;
// Pass1(基礎調査)は軽量出力想定のため短めに設定し、Vercel maxDuration(60s)内で
// Pass1 + Pass2 の合計が収まるようにする。
const DEFAULT_FACT_TIMEOUT_MS = 15_000;
// Pass1オーケストレーション（mode: "normal"、lib/researchOrchestrator.ts）の
// ステージ2/3は1トピックだけを扱う軽量呼び出しのため、さらに短く・並列実行前提で設定する。
const DEFAULT_GROUNDING_TIMEOUT_MS = 12_000;

function getEnv() {
  const apiKey = process.env.ORCAROUTER_API_KEY;
  const baseURL = process.env.ORCAROUTER_BASE_URL || DEFAULT_BASE_URL;
  const model = process.env.ORCAROUTER_MODEL || DEFAULT_MODEL;
  // 基礎調査 (Pass1) 専用モデル。search系モデルは出力トークンが実測1,000〜1,500程度に
  // 制限されており、3道比較を含む大きな ResearchResult (Pass2) を直接生成させると
  // 出力が途中で切れる (2026-08-12 実測)。そのため Web Search はこの軽量な事実調査
  // ステップのみで使い、詳細生成は常に Web Search なしの ORCAROUTER_MODEL で行う。
  // 未設定の場合は基礎調査自体をスキップする。
  const factModel = process.env.ORCAROUTER_FACT_MODEL || undefined;
  // 通常モード（mode: "normal"）でPass2に使うモデルID。「このリクエストにどのモデルを
  // 割り当てるべきか」の判断そのものをOrcaRouterに委ねるのが狙いのため、既定値は
  // orcarouter/auto（OrcaRouter自身のRouterが選ぶ）とする。アプリ側では難易度判定や
  // 昇格判断のロジックを一切持たない。設計は docs/orcarouter-routing-design.md 参照。
  const modelAuto = process.env.ORCAROUTER_MODEL_AUTO || DEFAULT_MODEL;
  const timeoutMs = Number(process.env.ORCAROUTER_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  const factTimeoutMs = Number(process.env.ORCAROUTER_FACT_TIMEOUT_MS) || DEFAULT_FACT_TIMEOUT_MS;
  const groundingTimeoutMs = Number(process.env.ORCAROUTER_GROUNDING_TIMEOUT_MS) || DEFAULT_GROUNDING_TIMEOUT_MS;
  // 設計書9.5章: Web Searchの実発火をモデル/ルートごとに確認したうえで有効化する。
  // 対応が未確認のモデルではデフォルトで無効。
  const webSearchEnabled = process.env.ORCAROUTER_WEB_SEARCH === "true";
  return { apiKey, baseURL, model, factModel, modelAuto, timeoutMs, factTimeoutMs, groundingTimeoutMs, webSearchEnabled };
}

/**
 * 通常モード（mode: "normal"）でPass2に使うモデルID。「どのモデルを使うべきか」の
 * 判断をアプリ側では行わず、OrcaRouterの orcarouter/auto（既定）にそのまま委ねる。
 * エコモード（mode: "eco"）はこれを使わず、常に ORCAROUTER_MODEL（固定・低コストモデル
 * を想定）のみを使う。判断そのものを省略してコストを優先するモードという位置づけ。
 */
export function getModelAuto(): string {
  return getEnv().modelAuto;
}

/**
 * CompletionResult から、実際に選ばれたモデル・ルーターをクライアントへ可視化するための
 * レスポンスヘッダーを組み立てる。デモ・デバッグ用途（設計は docs/orcarouter-routing-design.md 参照）。
 */
export function routerDebugHeaders(result: Pick<CompletionResult, "resolvedModel" | "router">): Record<string, string> {
  const headers: Record<string, string> = {};
  if (result.resolvedModel) headers["X-LifeFork-Resolved-Model"] = result.resolvedModel;
  if (result.router) headers["X-LifeFork-Router"] = result.router;
  return headers;
}

export function isOrcaRouterConfigured(): boolean {
  return Boolean(process.env.ORCAROUTER_API_KEY);
}

export function orcaRouterHealthInfo() {
  const { baseURL, model, factModel, modelAuto, webSearchEnabled } = getEnv();
  return {
    configured: isOrcaRouterConfigured(),
    baseUrl: baseURL,
    model,
    factModel: factModel ?? null,
    modelAuto,
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
const factFindingJsonSchema = toJsonSchema(factFindingResponseSchema);
const researchCandidatesJsonSchema = toJsonSchema(researchCandidatesSchema);
const topicFindingJsonSchema = toJsonSchema(topicFindingResponseSchema);

export interface ChatMessages {
  system: string;
  user: string;
}

/**
 * OrcaRouterのレスポンス。`x-orca-resolved-model` / `x-orca-router` ヘッダーから、
 * 実際にリクエストを処理した実モデルIDと適用ルーター名を取得する。
 * `orcarouter/auto` 等のRoutingを使う場合に「どのモデルが選ばれたか」を
 * ログ・UIへ可視化するために利用する（設計は docs/orcarouter-routing-design.md 参照）。
 */
export interface CompletionResult {
  content: string;
  resolvedModel: string | null;
  router: string | null;
}

interface StructuredCompletionOptions {
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  /** Web Search を付与するか。詳細生成 (research/interview) では出力上限の制約により使わない。 */
  useWebSearch?: boolean;
  /** モデルのオーバーライド。省略時は ORCAROUTER_MODEL を使う（基礎調査のみ ORCAROUTER_FACT_MODEL を使う）。 */
  model?: string;
  /** タイムアウトのオーバーライド (ms)。省略時は ORCAROUTER_TIMEOUT_MS を使う。 */
  timeoutMs?: number;
}

/**
 * OrcaRouter へ構造化出力 (JSON) の生成を依頼する共通処理。
 * 失敗種別 (レート制限 / 上流エラー / タイムアウト) を ResearchError として分類する。
 *
 * @param retryHint 直前の応答がスキーマ検証に失敗した場合、修正を促す追加メッセージ
 */
async function requestStructuredCompletion(
  messages: ChatMessages,
  { schemaName, jsonSchema, useWebSearch, model: modelOverride, timeoutMs: timeoutOverride }: StructuredCompletionOptions,
  retryHint?: string,
): Promise<CompletionResult> {
  const { model: defaultModel, webSearchEnabled, timeoutMs: defaultTimeoutMs } = getEnv();
  const model = modelOverride ?? defaultModel;
  const requestTimeoutMs = timeoutOverride ?? defaultTimeoutMs;
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

  // .withResponse() で生レスポンスも取得し、x-orca-resolved-model / x-orca-router から
  // 「orcarouter/auto 等のRoutingで実際にどのモデルが選ばれたか」を可視化できるようにする。
  const attemptWithSchema = async () => {
    return openai.chat.completions
      .create(
        {
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
        },
        { timeout: requestTimeoutMs },
      )
      .withResponse();
  };

  const attemptWithJsonObject = async () => {
    return openai.chat.completions
      .create(
        {
          model,
          messages: chatMessages,
          ...webSearchParams,
          response_format: { type: "json_object" },
        },
        { timeout: requestTimeoutMs },
      )
      .withResponse();
  };

  let result;
  try {
    result = await attemptWithSchema();
  } catch (err) {
    // モデル/ルーターが json_schema 未対応の場合は json_object にフォールバックする。
    if (isRetryableFormatError(err)) {
      result = await withServerErrorRetry(attemptWithJsonObject);
    } else {
      throw toResearchError(err);
    }
  }

  const content = result.data.choices[0]?.message?.content;
  if (!content) {
    throw new ResearchError(
      "invalid_response",
      "OrcaRouterからの応答に本文が含まれていません。",
    );
  }
  const resolvedModel = result.response.headers.get("x-orca-resolved-model");
  const router = result.response.headers.get("x-orca-router");
  return { content, resolvedModel, router };
}

/**
 * OrcaRouter へ ResearchResult 生成 (Pass2: 詳細生成) を依頼する。設計書 9章 / 10章に対応。
 * search系モデルの出力上限制約を回避するため、常に ORCAROUTER_MODEL (Web Searchなし)
 * で呼び出す。最新情報は Pass1 (requestFactFindingCompletion) の結果を
 * PromptBuilder 経由でプロンプトに埋め込むことで補う。
 */
export async function requestResearchCompletion(
  messages: ChatMessages,
  retryHint?: string,
  modelOverride?: string,
): Promise<CompletionResult> {
  return requestStructuredCompletion(
    messages,
    { schemaName: "research_result", jsonSchema: researchResultJsonSchema, useWebSearch: false, model: modelOverride },
    retryHint,
  );
}

/**
 * OrcaRouter へ基礎調査 (Pass1) を依頼する。ORCAROUTER_FACT_MODEL が未設定の場合は
 * 呼び出し元 (ResearchController) でスキップされる想定。
 */
export function isFactFindingConfigured(): boolean {
  return Boolean(getEnv().factModel);
}

export async function requestFactFindingCompletion(messages: ChatMessages): Promise<CompletionResult> {
  const { factModel, factTimeoutMs } = getEnv();
  if (!factModel) {
    throw new ResearchError(
      "internal_error",
      "ORCAROUTER_FACT_MODEL が設定されていません。",
    );
  }
  return requestStructuredCompletion(messages, {
    schemaName: "fact_finding",
    jsonSchema: factFindingJsonSchema,
    useWebSearch: true,
    model: factModel,
    timeoutMs: factTimeoutMs,
  });
}

/**
 * OrcaRouter へ Pass1オーケストレーション ステージ1（候補生成）を依頼する。
 * Web検索は行わない（`useWebSearch: false`）。`ORCAROUTER_FACT_MODEL` を流用するが
 * 検索なしのため実質どのモデルでもよい（設計は docs/api-cost.md 参照）。
 */
export async function requestCandidatesCompletion(messages: ChatMessages): Promise<CompletionResult> {
  const { factModel, factTimeoutMs } = getEnv();
  if (!factModel) {
    throw new ResearchError(
      "internal_error",
      "ORCAROUTER_FACT_MODEL が設定されていません。",
    );
  }
  return requestStructuredCompletion(messages, {
    schemaName: "research_candidates",
    jsonSchema: researchCandidatesJsonSchema,
    useWebSearch: false,
    model: factModel,
    timeoutMs: factTimeoutMs,
  });
}

/**
 * OrcaRouter へ Pass1オーケストレーション ステージ2/3（個別グラウンディング・深掘り）を
 * 依頼する。1トピックだけを扱う軽量呼び出しで、`lib/researchOrchestrator.ts` から
 * 複数トピック分を並列に呼び出される想定のため、タイムアウトを短めに設定する。
 */
export async function requestGroundingCompletion(messages: ChatMessages): Promise<CompletionResult> {
  const { factModel, groundingTimeoutMs } = getEnv();
  if (!factModel) {
    throw new ResearchError(
      "internal_error",
      "ORCAROUTER_FACT_MODEL が設定されていません。",
    );
  }
  return requestStructuredCompletion(messages, {
    schemaName: "topic_finding",
    jsonSchema: topicFindingJsonSchema,
    useWebSearch: true,
    model: factModel,
    timeoutMs: groundingTimeoutMs,
  });
}

/**
 * OrcaRouter へ追加ヒアリング質問 (InterviewResponse) の生成を依頼する。設計書 8.1章に対応。
 * ヒアリング質問生成では最新情報の検索は不要なため Web Search は付与しない。
 */
export async function requestInterviewCompletion(
  messages: ChatMessages,
  retryHint?: string,
): Promise<CompletionResult> {
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
