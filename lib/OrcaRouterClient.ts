import OpenAI from "openai";
import { z } from "zod";
import { researchResultSchema } from "@/types/research";
import { interviewResponseSchema } from "@/types/interview";
import { factFindingResponseSchema, mergedFactFindingSchema, type MergedFactFinding } from "@/types/factFinding";
import { agenticJudgmentSchema, type AgenticJudgment } from "@/types/agenticSearch";
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
// Pass1 エージェント型検索（mode: "normal"、lib/researchAgent.ts）の検索ターン。
// 実測(docs/pass1-agentic-search-design.md 5章)で1ターン最大110秒程度かかるケースがあるため、
// 通常のFACT_TIMEOUTより長めに確保する。
const DEFAULT_AGENTIC_SEARCH_TIMEOUT_MS = 120_000;
// 自己判定ターンはWeb Searchを行わないが、判定基準を厳格化（7項目のチェック、
// 会話履歴も長くなる）した結果、実測でサイクルが進むほど60秒を超えてタイムアウトする
// ケースが確認された（cycle6で発生）。抽出ターン（最大40件のfacts生成）も同じ関数を
// 共用するため、両者を賄える値に余裕を持たせている。
const DEFAULT_AGENTIC_JUDGMENT_TIMEOUT_MS = 120_000;

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
  // Pass1 エージェント型検索（lib/researchAgent.ts）専用モデル。ORCAROUTER_FACT_MODEL
  // （既定: gpt-4o-mini-search-preview、Chat Completions + web_search_options 前提）は
  // Responses API 自体に対応していない（2026-08-15 実測: 400 "not supported with the
  // Responses API"）。そのため Responses API の web_search ツールに対応したモデルを
  // 別env varで指定する。docs/pass1-agentic-search-design.md 参照。
  const agenticModel = process.env.ORCAROUTER_AGENTIC_MODEL || "openai/gpt-5.1";
  const agenticSearchTimeoutMs =
    Number(process.env.ORCAROUTER_AGENTIC_SEARCH_TIMEOUT_MS) || DEFAULT_AGENTIC_SEARCH_TIMEOUT_MS;
  const agenticJudgmentTimeoutMs =
    Number(process.env.ORCAROUTER_AGENTIC_JUDGMENT_TIMEOUT_MS) || DEFAULT_AGENTIC_JUDGMENT_TIMEOUT_MS;
  // 設計書9.5章: Web Searchの実発火をモデル/ルートごとに確認したうえで有効化する。
  // 対応が未確認のモデルではデフォルトで無効。
  const webSearchEnabled = process.env.ORCAROUTER_WEB_SEARCH === "true";
  return {
    apiKey,
    baseURL,
    model,
    factModel,
    modelAuto,
    timeoutMs,
    factTimeoutMs,
    agenticModel,
    agenticSearchTimeoutMs,
    agenticJudgmentTimeoutMs,
    webSearchEnabled,
  };
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
const agenticJudgmentJsonSchema = toJsonSchema(agenticJudgmentSchema);
const mergedFactFindingJsonSchema = toJsonSchema(mergedFactFindingSchema);

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

// ---------------------------------------------------------------------------
// Pass1 エージェント型検索（mode: "normal"、lib/researchAgent.ts）
//
// Chat Completions の web_search_options（1呼び出し=実質1クエリ、アプリ側が検索回数を
// 事前に固定設計する必要がある）から、Responses API の web_search ツール
// （モデル自身が1呼び出し内で必要な分だけ反復的に検索する）へ移行した。
// 検索回数の設計をアプリ側の人力からモデル自身の判断へ移す狙い。
// 設計・実測根拠: docs/pass1-agentic-search-design.md
// ---------------------------------------------------------------------------

export interface AgenticSearchTurnResult {
  responseId: string;
  outputText: string;
  /** `web_search_call`アイテムの個数（イベント数）。実クエリ数ではないので検索回数の指標には使わないこと。 */
  searchCallCount: number;
  /**
   * 実際に実行された検索クエリ数（`tool_usage.web_search.num_requests`、公式フィールド）。
   * 1つの`web_search_call`イベントが複数クエリを内包しうるため（実測で平均4件/イベント）、
   * 検索回数を計測・報告する際は必ずこちらを使うこと（docs/pass1-agentic-search-design.md 7章）。
   */
  numRequests: number;
}

/**
 * 検索ターン（Web Search可）。初回は `instructions`（research_facts.md 相当の方針）と
 * `input`（ユーザー入力）を渡す。2ターン目以降は `previousResponseId` で会話を継続し、
 * `instructions` は省略する（前ターンまでの会話履歴に含まれるため）。
 * 1回のAPI呼び出し内で何回検索するかはモデルに委ね、アプリ側では固定しない。
 */
export async function requestAgenticSearchTurn(params: {
  instructions?: string;
  input: string;
  previousResponseId?: string;
}): Promise<AgenticSearchTurnResult> {
  const { agenticModel, agenticSearchTimeoutMs } = getEnv();
  const openai = getClient();
  try {
    const res = await openai.responses.create(
      {
        model: agenticModel,
        instructions: params.instructions,
        input: params.input,
        tools: [{ type: "web_search" }],
        previous_response_id: params.previousResponseId,
      },
      { timeout: agenticSearchTimeoutMs },
    );
    const searchCallCount = (res.output ?? []).filter(
      (item) => (item as { type?: string }).type === "web_search_call",
    ).length;
    const numRequests =
      (res as unknown as { tool_usage?: { web_search?: { num_requests?: number } } }).tool_usage?.web_search
        ?.num_requests ?? 0;
    return { responseId: res.id, outputText: res.output_text ?? "", searchCallCount, numRequests };
  } catch (err) {
    throw toResearchError(err);
  }
}

/**
 * 自己判定ターン（Web Searchなし・構造化出力のみ）。検索ターンと同じ呼び出しに
 * 同居させると検索よりスキーマ充足が優先され検索が発火しなくなる問題が実測で
 * 確認されているため、必ず別呼び出しに分離する（docs/pass1-agentic-search-design.md 3.2節）。
 */
export async function requestAgenticJudgmentTurn(params: {
  previousResponseId: string;
}): Promise<{ responseId: string; judgment: AgenticJudgment }> {
  const { agenticModel, agenticJudgmentTimeoutMs } = getEnv();
  const openai = getClient();
  try {
    const res = await openai.responses.create(
      {
        model: agenticModel,
        input:
          "ここまでの調査内容を振り返ってください。これは片手間の下調べではなく、" +
          "人が実際に会社を辞める・住む場所を変えるといった人生の意思決定に使うための調査です。" +
          "人間が本気で同じ調査をするなら、100回以上の検索・比較・裏取りを行うはずです。" +
          "その水準に対して、本当に十分と言えますか？ 以下の観点を全て満たしているか、厳しく確認してください: " +
          "(1) 検討すべき重要なカテゴリ（観点）が網羅されているか。" +
          "(2) **各カテゴリについて、実例が最低1件ではなく、条件の異なる複数件（例:成功例と苦戦した例、" +
          "都市部と地方、若年層と中高年など）揃っているか**。1件しかない実例は「まだ薄い」とみなすこと。" +
          "(3) **金額・条件など重要な数値が、2つ以上の独立した情報源で相互に裏付けられているか**" +
          "（1つの情報源にしか出てこない数字は未検証として扱う）。" +
          "(4) **少なくとも3つ以上の異なる地域・自治体を具体的に比較できているか**" +
          "（「地域差がある」という一般論ではなく、具体的な地域名ごとの制度・金額の違い）。" +
          "(5) 収支シミュレーションについて、楽観的・標準的・悲観的な複数シナリオの数字があるか" +
          "（単一の平均値だけでは不十分）。" +
          "(6) 失敗・撤退した場合の具体的なリスクとその発生率・対処法まで調べられているか。" +
          "(7) 1〜2年目だけでなく、3〜5年以上先の長期的な見通しまで調べられているか。" +
          "1つでも満たしていない観点があれば不十分とみなし、missing_categories に、" +
          "何が・どのレベルまで足りないかが分かる具体的な文言で列挙してください" +
          "（例:「◯◯制度について、都市部以外の地域での実例をもう1件」のように、既にある情報との違いが" +
          "わかる形にすること。同じ指摘の繰り返しにならないよう、前回までの調査で埋まった点は除くこと）。" +
          "全てを満たしていれば十分です。十分なら missing_categories は空配列にしてください。",
        previous_response_id: params.previousResponseId,
        text: {
          format: {
            type: "json_schema",
            name: "sufficiency_judgment",
            schema: agenticJudgmentJsonSchema,
            strict: true,
          },
        },
      },
      { timeout: agenticJudgmentTimeoutMs },
    );
    const judgment = agenticJudgmentSchema.parse(JSON.parse(res.output_text ?? "{}"));
    return { responseId: res.id, judgment };
  } catch (err) {
    throw toResearchError(err);
  }
}

/**
 * 抽出ターン（Web Searchなし・構造化出力のみ）。検索ターンの自由記述な会話全体を、
 * Pass2 (`requestResearchCompletion`) が読める軽量な facts/sources 構造へ変換する。
 *
 * @param unresolvedGaps スタール検出（docs/pass1-agentic-search-design.md 9.1条件2）で
 * 打ち切った場合、検索では埋まらなかった残りの観点（直前の判定ターンの`missing_categories`）。
 * 指定された場合、それらがPass1では確認できなかった旨をfactsに明記させ、Pass2側で
 * 妥当な推定・統合を行えるよう引き継ぐ（同ドキュメント9.4節）。
 */
export async function requestAgenticExtractionTurn(params: {
  previousResponseId: string;
  unresolvedGaps?: string[];
}): Promise<MergedFactFinding> {
  const { agenticModel, agenticJudgmentTimeoutMs } = getEnv();
  const openai = getClient();
  const gapsNote =
    params.unresolvedGaps && params.unresolvedGaps.length > 0
      ? " 加えて、以下の観点は検索を尽くしても十分な裏付けが見つからなかったため、" +
        "「◯◯については実例・裏付けとなる情報が見つからなかった」という形でfactsに明記してください" +
        `（捏造せず、未確認であること自体を事実として記録する）: ${params.unresolvedGaps.join("、")}`
      : "";
  try {
    const res = await openai.responses.create(
      {
        model: agenticModel,
        input:
          "ここまでの調査会話全体から、確認できた事実を facts（最大40件、1〜2文の簡潔な箇条書き）として抽出し、" +
          "実際に参照した出典を sources（title, url）としてまとめてください。捏造しないこと。" +
          gapsNote,
        previous_response_id: params.previousResponseId,
        text: {
          format: {
            type: "json_schema",
            name: "fact_extraction",
            schema: mergedFactFindingJsonSchema,
            strict: true,
          },
        },
      },
      { timeout: agenticJudgmentTimeoutMs },
    );
    return mergedFactFindingSchema.parse(JSON.parse(res.output_text ?? "{}"));
  } catch (err) {
    throw toResearchError(err);
  }
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
