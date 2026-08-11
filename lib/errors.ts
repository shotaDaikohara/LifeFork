import { NextResponse } from "next/server";
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

/**
 * Route Handler の catch 節で使う共通のエラーレスポンス変換。
 * ResearchError 以外の例外は internal_error として扱う。
 */
export function toErrorResponse(err: unknown): NextResponse<ApiErrorBody> {
  const appError =
    err instanceof ResearchError
      ? err
      : new ResearchError(
          "internal_error",
          err instanceof Error ? err.message : "サーバーで予期しないエラーが発生しました。",
        );

  const body: ApiErrorBody = {
    error: { code: appError.code, message: appError.message },
  };
  return NextResponse.json(body, { status: statusForErrorCode(appError.code) });
}
