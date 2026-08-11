import { auth, signOut } from "@/auth";

/**
 * ログイン中のみ表示する共通ヘッダー。ユーザーへ現在のログインアカウントと
 * ログアウト手段を明示する（設計書には明記されないが、認証必須化に伴う最低限のUX）。
 */
export async function Header() {
  const session = await auth();
  if (!session?.user?.email) return null;

  return (
    <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 sm:px-6">
      <span className="text-sm font-semibold text-zinc-900">LifeFork</span>
      <div className="flex items-center gap-3">
        <span className="text-xs text-zinc-500">{session.user.email}</span>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button
            type="submit"
            className="text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-700"
          >
            ログアウト
          </button>
        </form>
      </div>
    </header>
  );
}
