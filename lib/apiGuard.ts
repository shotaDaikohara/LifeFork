import { auth } from "@/auth";
import { isAllowedEmail } from "@/lib/allowedEmails";
import { checkRateLimit } from "@/lib/rateLimit";
import { ResearchError } from "@/lib/errors";

/**
 * /api/interview, /api/research 共通の認証・認可・Rate Limitガード。
 * 設計書「LifeFork_システム基本設計_v0.4」14.1章・14.2章に対応。
 *
 * - 未認証は unauthorized (401)。
 * - 認証済みでもホワイトリスト対象外は forbidden (403)。
 *   （signIn コールバックで既に弾いているが、画面側のログイン状態だけに
 *   依存しない方針のためAPI側でも再検証する）
 * - ユーザー単位のRate Limitを超過した場合は app_rate_limited (429)。
 *
 * @returns 認証・認可・Rate Limitを通過したユーザーのメールアドレス
 */
export async function requireAuthorizedUser(): Promise<string> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    throw new ResearchError("unauthorized", "ログインが必要です。");
  }
  if (!isAllowedEmail(email)) {
    throw new ResearchError("forbidden", "このアカウントは利用が許可されていません。");
  }

  const rateLimit = checkRateLimit(email);
  if (!rateLimit.allowed) {
    throw new ResearchError(
      "app_rate_limited",
      `リクエストが多すぎます。${rateLimit.retryAfterSec}秒後に再度お試しください。`,
    );
  }

  return email;
}
