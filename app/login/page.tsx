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
        <div className="hero-grid">
          <div>
            <div className="eyebrow">LifeFork ／ 人生分岐AI</div>
            <h1>
              その「いいなあ」、
              <br />
              ちょっと調べてみない？
            </h1>
            <p className="lead">
              転職や独立、ふと思いついたけど
              <br />
              そのままになっていませんか。
              <br />
              <b>その道に進んだ未来</b>と<b>今のままの未来</b>を、
              <br />
              AIが調べて並べてみます。
            </p>
            <div className="usecases">
              <span>🍓 いちご農園をやりたい</span>
              <span>☕️ カフェを開きたい</span>
              <span>💻 別の業界に転職したい</span>
              <span>🐕 トリマーになりたい</span>
            </div>

            <div style={{ marginTop: 26 }}>
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

          <div className="hero-art">
            <svg width="300" height="270" viewBox="0 0 300 270">
              <ellipse cx="150" cy="252" rx="120" ry="12" fill="#F3E4D2" />
              <path
                d="M150 250 C150 210 148 190 140 168 C132 146 118 130 96 116 C74 102 56 92 44 78"
                stroke="#DFCDB8"
                strokeWidth="15"
                fill="none"
                strokeLinecap="round"
                strokeDasharray="1 26"
              />
              <path
                d="M150 250 C150 210 152 190 162 168 C174 142 194 126 218 112 C240 99 254 88 264 74"
                stroke="#FFB877"
                strokeWidth="15"
                fill="none"
                strokeLinecap="round"
                strokeDasharray="1 26"
              />
              <circle cx="150" cy="228" r="13" fill="#FF7A29" />
              <path d="M150 240 L150 250" stroke="#FF7A29" strokeWidth="8" strokeLinecap="round" />
              <g>
                <rect x="14" y="34" width="60" height="46" rx="14" fill="#fff" stroke="#E6D5C2" strokeWidth="2" />
                <text x="44" y="64" fontSize="22" textAnchor="middle">
                  🏢
                </text>
              </g>
              <g>
                <rect x="228" y="26" width="62" height="48" rx="14" fill="#FFF0E3" stroke="#FFB877" strokeWidth="2.5" />
                <text x="259" y="57" fontSize="22" textAnchor="middle">
                  🍓
                </text>
              </g>
              <text x="44" y="102" fontSize="11" textAnchor="middle" fill="#9C8B7A">
                今のまま
              </text>
              <text x="259" y="96" fontSize="11" textAnchor="middle" fill="#E8600F" fontWeight="bold">
                進んだ未来
              </text>
            </svg>
          </div>
        </div>
      </div>
    </main>
  );
}
