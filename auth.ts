import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isAllowedEmail } from "@/lib/allowedEmails";

/**
 * Auth.js (NextAuth v5) 設定。
 *
 * 設計書「LifeFork_システム基本設計_v0.4」 2章・14.1章に対応。
 * - 認証方式は Google OpenID Connect。スコープは openid / email / profile の最小限。
 * - 認証後に email_verified=true かつ ALLOWED_EMAILS に含まれるメールアドレスのみ
 *   ログインを許可する（signIn コールバックで拒否）。
 * - ログイン画面の制御だけをAPI保護として扱わず、/api/interview と /api/research は
 *   各リクエストで auth() によりサーバー側セッション検証を行う（各 route.ts 参照）。
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  // VercelのProduction/Previewはデプロイごとにホスト名が変わり得るため、
  // ホスト検証 (UntrustedHost) を明示的に信頼する。
  trustHost: true,
  providers: [
    Google({
      // Auth.js v5 は既定で AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET を自動参照するが、
      // 設計書20.4章の変数名 (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) に合わせるため明示的に渡す。
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: { params: { scope: "openid email profile" } },
    }),
  ],
  pages: {
    signIn: "/login",
    // AccessDenied等のエラーはデフォルトで pages.error (未指定なら組み込みの
    // /api/auth/error ページ) に飛ぶため、明示的に /login を指定してカスタム
    // ログイン画面のエラーメッセージ表示に合流させる。
    error: "/login",
  },
  callbacks: {
    async signIn({ profile }) {
      const email = profile?.email;
      const emailVerified = profile?.email_verified === true;
      if (!emailVerified) return false;
      return isAllowedEmail(email);
    },
  },
});
