import Image from "next/image";
import { signIn } from "@/auth";

/**
 * ログイン画面（UI案 ランディング/hero を流用）。
 * 設計書14.1章の方針により、Googleアカウント認証のみを提供する。
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
    <main className="stage">
      <div className="hero">
        <div className="hero-copy">
          <div className="hero-kicker">誰もがふと思いつく人生の分岐点を</div>
          <h1>
            「諦めた後悔」ではなく
            <br />
            <em>「検討した結果」</em>に変えたい。
          </h1>
          <p className="lead">
            転職や独立、ふと思いついたその道を、AIが30秒で調べます。
            <br />
            <b>その道に進んだ未来</b>と<b>今のままの未来</b>を、並べて見られます。
          </p>

          <div className="usecases">
            <span>🍓 いちご農園をやりたい</span>
            <span>☕️ カフェを開きたい</span>
            <span>💻 別の業界に転職したい</span>
            <span>🐕 トリマーになりたい</span>
          </div>

          <div className="hero-cta">
            {error && (
              <p className="tiny" style={{ color: "var(--berry)", marginBottom: 12 }}>
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
            >
              <button type="submit" className="btn google">
                <svg width="19" height="19" viewBox="0 0 48 48">
                  <path
                    fill="#4285F4"
                    d="M45 24.5c0-1.6-.1-2.7-.4-4H24v7.3h12c-.2 2-1.5 5-4.4 7l6.8 5.2C42.3 36.3 45 30.9 45 24.5z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 46c5.9 0 10.8-1.9 14.4-5.3l-6.8-5.2c-1.8 1.3-4.3 2.2-7.6 2.2-5.8 0-10.7-3.8-12.5-9l-7 5.4C8.1 41.1 15.4 46 24 46z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M11.5 28.7c-.5-1.4-.7-2.9-.7-4.7s.3-3.3.7-4.7l-7-5.4C3.3 16.9 2.5 20.3 2.5 24s.8 7.1 2 10.1l7-5.4z"
                  />
                  <path
                    fill="#EA4335"
                    d="M24 10.9c4.1 0 6.9 1.8 8.5 3.3l6.2-6C34.8 4.7 29.9 2.5 24 2.5 15.4 2.5 8.1 7.4 4.5 14l7 5.4c1.8-5.2 6.7-8.5 12.5-8.5z"
                  />
                </svg>
                Googleではじめる
              </button>
            </form>
            <p className="tiny" style={{ textAlign: "center", marginTop: 12 }}>
              毎月1回まで無料。名前の登録もアンケートもありません。
            </p>
          </div>
        </div>

        {/* UI案のイラストをそのまま採用（人生の分岐点に立つ人物）。 */}
        <div className="hero-art">
          <Image src="/hero-art.webp" alt="" width={1000} height={464} priority />
        </div>
      </div>
    </main>
  );
}
