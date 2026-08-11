/**
 * Google OIDCログインの利用者制限（ホワイトリスト）。
 * 設計書 14.1章: ALLOWED_EMAILS はサーバー側環境変数で管理し、ブラウザへ公開しない。
 */
function parseAllowedEmails(): Set<string> {
  return new Set(
    (process.env.ALLOWED_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return parseAllowedEmails().has(email.toLowerCase());
}
