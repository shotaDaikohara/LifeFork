import { signIn } from "@/auth";

/**
 * ログイン画面。設計書14.1章の方針により、Googleアカウント認証のみを提供する。
 * ホワイトリスト対象外のアカウントは auth.ts の signIn コールバックで拒否され、
 * NextAuthにより ?error=AccessDenied 付きでこの画面へ戻ってくる。
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
        LifeFork にログイン
      </h1>
      <p className="mt-2 max-w-sm text-sm text-zinc-600">
        本システムの利用には、事前登録されたGoogleアカウントでのログインが必要です。
      </p>

      {error && (
        <p className="mt-4 max-w-sm text-sm text-red-600">
          {error === "AccessDenied"
            ? "このGoogleアカウントは利用が許可されていません。"
            : "ログインに失敗しました。もう一度お試しください。"}
        </p>
      )}

      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/" });
        }}
        className="mt-8"
      >
        <button type="submit" className="btn-primary">
          Googleでログイン
        </button>
      </form>
    </main>
  );
}
