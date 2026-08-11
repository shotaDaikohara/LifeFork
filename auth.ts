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
  providers: [
    Google({
      authorization: { params: { scope: "openid email profile" } },
    }),
  ],
  pages: {
    signIn: "/login",
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
