import type { ApiErrorBody } from "@/types/research";

/**
 * API層〜OrcaRouterClient層で共通して使うアプリケーションエラー。
 * `code` は ApiErrorBody.error.code と対応し、Route Handler で HTTP status に変換する。
 */
export class ResearchError extends Error {
  code: ApiErrorBody["error"]["code"];

  constructor(code: ApiErrorBody["error"]["code"], message: string) {
    super(message);
    this.name = "ResearchError";
    this.code = code;
  }
}

export function statusForErrorCode(code: ApiErrorBody["error"]["code"]): number {
  switch (code) {
    case "invalid_request":
      return 400;
    case "rate_limited":
      return 429;
    case "upstream_error":
      return 502;
    case "timeout":
      return 504;
    case "invalid_response":
      return 502;
    case "internal_error":
    default:
      return 500;
  }
}
