import { NextResponse } from "next/server";
import { orcaRouterHealthInfo } from "@/lib/OrcaRouterClient";

export const runtime = "nodejs";

/**
 * GET /api/health
 * 設計書 8.2章に対応。デモ前にアプリ設定を確認するためのエンドポイント。
 * APIキーの値そのものは返さない。
 */
export async function GET() {
  const orcaRouter = orcaRouterHealthInfo();
  return NextResponse.json({
    status: "ok",
    orcaRouter,
  });
}
