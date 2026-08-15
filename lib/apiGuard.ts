import { auth } from "@/auth";
import { checkRateLimit } from "@/lib/rateLimit";
import { ResearchError } from "@/lib/errors";

/**
 * /api/interview, /api/research 共通の認証・Rate Limitガード。
 *
 * - 未認証は unauthorized (401)。
 *   （利用者を特定のメールアドレスに絞るホワイトリストは廃止。2026-08-16。
 *   Googleアカウントでログイン済みであれば利用できる）
 * - ユーザー単位のRate Limitを超過した場合は app_rate_limited (429)。
 *
 * @returns 認証・Rate Limitを通過したユーザーのメールアドレス
 */
export async function requireAuthorizedUser(): Promise<string> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    throw new ResearchError("unauthorized", "ログインが必要です。");
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
