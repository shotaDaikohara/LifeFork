import Link from "next/link";
import { auth, signOut } from "@/auth";

/**
 * ログイン中のみ表示する共通ヘッダー（UI案 topbar）。
 * ユーザーへ現在のログインアカウントとログアウト手段を明示する。
 */
export async function Header() {
  const session = await auth();
  if (!session?.user?.email) return null;

  return (
    <div className="topbar">
      <Link href="/" className="logo">
        <i>🍴</i>LifeFork
      </Link>
      <div className="spacer" />
      <div className="who">
        <span className="av" />
        {session.user.email}
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button type="submit">ログアウト</button>
        </form>
      </div>
    </div>
  );
}
