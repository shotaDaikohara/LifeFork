import { NextResponse } from "next/server";
import { orcaRouterHealthInfo } from "@/lib/OrcaRouterClient";

export const runtime = "nodejs";

/**
 * GET /api/health
 * 設計書 8.3章に対応。デモ前にアプリ設定を確認するためのエンドポイント。
 * APIキー・シークレットの値そのものは返さない。
 */
export async function GET() {
  const orcaRouter = orcaRouterHealthInfo();
  const auth = {
    googleConfigured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    authSecretConfigured: Boolean(process.env.AUTH_SECRET),
    allowedEmailCount: (process.env.ALLOWED_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean).length,
  };

  return NextResponse.json({
    status: "ok",
    orcaRouter,
    auth,
  });
}
