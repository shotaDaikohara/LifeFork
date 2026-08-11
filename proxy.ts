import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * S01〜S04画面をGoogleログイン必須にする（設計書 7章「認証前提」）。
 * Next.js 16 の Proxy 規約 (旧 Middleware) に基づくファイル。
 * auth() はJWTセッション戦略のためcookie検証のみで完結し、DBアクセスを伴わない
 * ため、Proxyのガイダンスが言う optimistic check の範囲に収まる。
 *
 * API Route (/api/interview, /api/research) はここでは保護せず、
 * 各 route.ts 内で auth() によりセッションを検証し 401/403 を返す
 * （「ログイン画面の制御だけをAPI保護として扱わない」方針、設計書14.1章）。
 */
export default auth((req) => {
  if (!req.auth) {
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }
});

export const config = {
  matcher: ["/", "/interview", "/researching", "/result"],
};
