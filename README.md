# LifeFork

転職・独立を「ふと思いついたが、まだ本格的に調べていない人」向けの初期リサーチプロトタイプです。
プロフィール・希望する将来像・AIが生成する追加ヒアリングへの回答を入力すると、「今の道を続けた未来」と「その道に進んだ未来」を
**将来性 / 年収 / 実現手段 / リスク** の同じ軸で比較し、Web画面に表示します。

設計書: `LifeFork_システム基本設計_v0.4`（ハッカソンGit提出用プロトタイプ）に基づく実装です。

> 本システムはハッカソン向けMVPです。出力の再現性・精度は保証しません。
> 発表用に人手で検証したサンプルは [`demo/champion.html`](./demo/champion.html) を参照してください（Liveシステムとは分離した別成果物です）。

## 画面フロー

```
[未認証] → Googleログイン (ホワイトリスト判定)
   ↓
S01 入力 → S02 ヒアリング(AI動的生成) → S03 リサーチ中 → S04 比較結果
  (/)      (/interview)                  (/researching)     (/result)
```

0. **ログイン** — `/`〜`/result` はログイン必須です。未認証の場合 `/login` へ誘導され、Googleアカウントでログインします。事前登録（`ALLOWED_EMAILS`）されたメールアドレス以外は利用できません。
1. **S01 入力** — プロフィール（職種・経験年数・現在の年収など）と、検討したい将来像（転職 or 独立）を入力します。
2. **S02 ヒアリング** — `POST /api/interview` を呼び出し、S01の入力をもとにOrcaRouterが最大4問の追加質問を**1回だけ**生成します。回答ごとの逐次質問生成（多段ヒアリング）は行いません。
3. **S03 リサーチ中** — `POST /api/research` を呼び出し、OrcaRouter経由でリサーチ結果を取得します。
4. **S04 比較結果** — 「今の道」と「検討している道」を並べて表示します。取得・検証に失敗した場合は結果を捏造せずエラーを表示します。

## セットアップ

### 前提

- Node.js 20.19+ / 22.13+ 推奨（`package.json` の engines に準拠する Node.js LTS）
- OrcaRouter の APIキー（[https://www.orcarouter.ai](https://www.orcarouter.ai) で取得）
- Google Cloud Console で発行した OAuth 2.0 クライアント（後述）

### Google OAuthクライアントの準備

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) で OAuth 2.0 クライアントID（種類: ウェブ アプリケーション）を作成する。
2. 承認済みのリダイレクトURIに以下を追加する。
   - ローカル: `http://localhost:3000/api/auth/callback/google`
   - 本番(Vercel): `https://<project>.vercel.app/api/auth/callback/google`
3. 発行された クライアントID / クライアントシークレット を控える（`.env.local` / Vercel環境変数に設定）。
4. OAuth同意画面のスコープは `openid` / `email` / `profile` の最小構成で問題ありません。

### 手順

```bash
# 1. 依存関係をインストール
npm install

# 2. 環境変数ファイルを作成
cp .env.example .env.local
# .env.local を編集し、ORCAROUTER_API_KEY / GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / AUTH_SECRET / ALLOWED_EMAILS を設定する
# AUTH_SECRET は `npx auth secret` または `openssl rand -base64 32` で生成できます

# 3. 開発サーバーを起動
npm run dev
```

[http://localhost:3000](http://localhost:3000) を開くと未ログインの場合は `/login` へリダイレクトされます。
`ALLOWED_EMAILS` に登録したGoogleアカウントでログインすると S01 入力画面が表示されます。

`ORCAROUTER_API_KEY` を設定していない状態では `POST /api/interview` の時点でエラーになります
（サーバー起動時ではなく、リクエスト時にエラーとなります）。

### 動作確認

```bash
npm run build   # 型チェック込みの本番ビルド
npm run lint    # ESLint
```

`GET /api/health` で現在のOrcaRouter接続設定・Auth.js設定状況を確認できます。APIキー・シークレットの値そのものは返しません。

```bash
curl http://localhost:3000/api/health
```

## 環境変数

`.env.example` を参照してください。

| 変数名 | 必須 | 説明 |
| --- | --- | --- |
| `ORCAROUTER_API_KEY` | ✅ | OrcaRouterのAPIキー。サーバー側でのみ使用し、ブラウザへは渡しません。 |
| `ORCAROUTER_BASE_URL` | - | OrcaRouterのBase URL。未設定時は `https://api.orcarouter.ai/v1`。 |
| `ORCAROUTER_MODEL` | - | 使用するモデル/ルーターID。未設定時は `orcarouter/auto`。`openai/gpt-4o-mini-search-preview` は実検索(`url_citation`)の発火と`response_format`併用を確認済みです。 |
| `ORCAROUTER_TIMEOUT_MS` | - | OrcaRouter呼び出しのタイムアウト（ミリ秒）。未設定時は `55000`。 |
| `ORCAROUTER_WEB_SEARCH` | - | `true` にすると `POST /api/research`（ヒアリング生成では不要なため付与しません）に `web_search_options` を付与しWeb Searchを有効化します。未設定時は `false`。 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | ✅ | Google Cloud ConsoleでのOAuthクライアント情報。 |
| `AUTH_SECRET` | ✅ | Auth.jsのセッション署名用シークレット。 |
| `ALLOWED_EMAILS` | ✅ | ログインを許可するGoogleアカウントのメールアドレス（カンマ区切り、サーバー側のみ参照）。 |
| `RATE_LIMIT_PER_MINUTE` | - | ユーザー単位Rate Limitの上限（回/分）。未設定時は `10`。 |

### Web Search対応モデルについて（設計書9.5章）

`/api/pricing`（認証不要）でOrcaRouterの全モデルの価格・対応パラメータを確認できます。`supported_parameters` に `web_search_options` を含むモデルが実検索候補です（2026-08-12時点で確認できたのは `openai/gpt-4o-search-preview` 系・`openai/gpt-5-search-api` 系）。
このうち `openai/gpt-4o-mini-search-preview` は、`response_format: json_schema` と `web_search_options` を併用してもJSON構造を維持しつつ実URLを含む回答を返すことを確認済みです。価格・提供状況は変動するため、切り替え前に同様の疎通確認を行ってください。

## 認証・認可・API乱用防止（設計書v0.4 14章）

- **認証**: Google OpenID Connectを [Auth.js](https://authjs.dev)（`next-auth@5`）で実装（[`auth.ts`](./auth.ts)）。スコープは `openid email profile` の最小構成。
- **認可（ホワイトリスト）**: `signIn` コールバックで `email_verified=true` かつ `ALLOWED_EMAILS` に含まれるメールアドレスのみログインを許可します（[`lib/allowedEmails.ts`](./lib/allowedEmails.ts)）。対象外のGoogleアカウントは `/login?error=AccessDenied` に戻されます。
- **画面保護**: [`proxy.ts`](./proxy.ts)（Next.js 16の Proxy、旧Middleware）が `/` `/interview` `/researching` `/result` への未認証アクセスを `/login` へリダイレクトします。JWTセッションのcookie検証のみで完結するため、DBアクセスを伴わない「optimistic check」の範囲で実装しています。
- **APIのサーバー側セッション検証**: 画面のログイン状態だけに依存せず、`POST /api/interview` と `POST /api/research` は [`lib/apiGuard.ts`](./lib/apiGuard.ts) の `requireAuthorizedUser()` で毎リクエスト検証します。未認証は `401 unauthorized`、ホワイトリスト対象外は `403 forbidden` を返します。
- **API乱用防止（ユーザー単位Rate Limit）**: [`lib/rateLimit.ts`](./lib/rateLimit.ts) が、ログイン済みメールアドレスをキーに `/api/interview` と `/api/research` をまとめて1つの固定ウィンドウ（既定 10回/分）で制限し、超過時は `429 app_rate_limited` を返します。
  - 設計書はVercel WAF（IP単位）を第一候補としていますが、v0.4でログイン必須化されたことに合わせ、本実装はユーザー単位で制御しています。
  - 実装はサーバーレス関数のメモリ内カウンタです。Vercel上で複数インスタンスが並行動作する場合、実効レートはやや緩くなり得るベストエフォートの防御です（MVPの割り切り）。

## API

### `POST /api/interview`

プロフィール・将来像を受け取り、リサーチに必要な追加ヒアリング質問（`InterviewQuestion[]`、最大4問）を返します。ログイン必須。

- リクエスト/レスポンスの意味構造は [`types/interview.ts`](./types/interview.ts) を参照してください。
- 質問生成プロンプトは [`prompts/interview_system.md`](./prompts/interview_system.md)（外部ファイル管理）。
- 既に入力済みの情報は再質問しない方針で、`lib/InterviewValidator.ts` で zod スキーマ検証します。検証失敗時は1回のみフォーマット修正を促して再試行します。
- 回答ごとに質問を再生成する多段ヒアリングは行いません（1回生成のみ）。

### `POST /api/research`

ユーザー入力（プロフィール・将来像・ヒアリング回答）を受け取り、比較結果（`ResearchResult`）を返します。ログイン必須。

- リクエスト/レスポンスの意味構造は [`types/research.ts`](./types/research.ts) を参照してください。
- ステータスコード: `200`(正常) / `400`(入力不正) / `401`(未認証) / `403`(ホワイトリスト対象外) / `429`(アプリRate Limit超過 or OrcaRouterレート制限) / `502`(上流エラー・応答検証失敗) / `504`(タイムアウト) / `500`(その他)
- AIの応答はプロンプト（`prompts/research_system.md`）に基づき構造化JSON（`ResearchResult`）で取得し、`lib/ResultValidator.ts` で zod スキーマ検証します。検証に失敗した場合は1回のみフォーマット修正を促して再試行し、それでも失敗すればエラーとして結果を返します（結果を捏造しません）。
- ヒアリング質問はDBに保存しないため、動的生成された質問文はクライアントが `answers[].question` として再送します。

### `GET /api/health`

アプリの設定状況（OrcaRouter接続設定・Auth.js設定の有無）を確認します。APIキー・シークレットの値は含みません。認証不要。

## ディレクトリ構成

```
app/
  page.tsx                    # S01 入力
  interview/page.tsx          # S02 ヒアリング (AI動的生成・回答)
  researching/page.tsx        # S03 リサーチ中
  result/page.tsx             # S04 比較結果
  login/page.tsx               # ログイン画面
  api/auth/[...nextauth]/route.ts  # Auth.js ハンドラ
  api/interview/route.ts      # POST /api/interview (InterviewController)
  api/research/route.ts       # POST /api/research (ResearchController)
  api/health/route.ts         # GET /api/health
auth.ts                       # Auth.js設定 (Google OIDC + ホワイトリスト判定)
proxy.ts                      # 画面のログイン必須化 (Next.js 16 Proxy、旧Middleware)
components/
  Header.tsx                  # ログイン中のみ表示する共通ヘッダー
  result/                     # 比較結果表示コンポーネント
lib/
  OrcaRouterClient.ts          # OrcaRouter (OpenAI互換API) 呼び出し (interview/research 共通)
  PromptBuilder.ts             # システムプロンプト + ユーザー入力の組み立て
  InterviewValidator.ts        # InterviewResponse のスキーマ検証
  ResultValidator.ts           # ResearchResult のスキーマ検証
  allowedEmails.ts             # ALLOWED_EMAILS ホワイトリスト判定
  apiGuard.ts                  # API向け 認証・認可・Rate Limit ガード
  rateLimit.ts                 # ユーザー単位 Rate Limit (Fixed Window)
  researchSession.ts           # 画面間の一時状態受け渡し (sessionStorage、DBなし)
  errors.ts                    # アプリケーションエラー定義
prompts/
  interview_system.md          # ヒアリング質問生成プロンプト（外部ファイル管理）
  research_system.md           # リサーチ用システムプロンプト（外部ファイル管理）
types/
  interview.ts                  # InterviewQuestion等のドメイン型
  research.ts                   # ResearchResult等のドメイン型 (zodスキーマが単一の情報源)
demo/champion.html            # 発表用チャンピオンデータのサンプル（Liveシステムと分離）
```

## データの扱い

- ユーザー入力・リサーチ結果・生成された質問はサーバーに永続化しません（DBなし）。ブラウザの `sessionStorage` にのみ一時保持し、タブを閉じると消えます。
- ログインセッションはAuth.jsのJWT（cookie）で管理し、ユーザー情報をDBへ保存しません。
- `ORCAROUTER_API_KEY` / `GOOGLE_CLIENT_SECRET` / `AUTH_SECRET` はサーバー環境変数としてのみ扱い、ブラウザへは送信しません。
- `.env` / `.env.local` はGit管理対象外です。`.env.example` のみコミットしています。

## デプロイ（Vercel）— 設計書20章

1. このリポジトリをGitHubへpushする（本リポジトリは `main` ブランチを Production とする想定）。
2. [Vercel](https://vercel.com) で「Import Project」からこのGitHubリポジトリを選択する（Next.jsはゼロコンフィグに近い形でデプロイ可能）。
3. Google Cloud ConsoleのOAuthクライアントに、本番リダイレクトURI `https://<project>.vercel.app/api/auth/callback/google` を追加する。
4. Vercel Project Settings → Environment Variables に以下を設定する（`NEXT_PUBLIC_` を付けない = サーバー側のみで参照される）。`ORCAROUTER_API_KEY` / `GOOGLE_CLIENT_SECRET` / `AUTH_SECRET` はSensitive Environment Variablesとして設定する。

   | 変数名 | 値の例 |
   | --- | --- |
   | `ORCAROUTER_API_KEY` | `<secret>`（Sensitive） |
   | `ORCAROUTER_BASE_URL` | `https://api.orcarouter.ai/v1` |
   | `ORCAROUTER_MODEL` | `openai/gpt-4o-mini-search-preview` など疎通確認済みのモデルID |
   | `ORCAROUTER_WEB_SEARCH` | `true`（Web Search対応モデルを使う場合） |
   | `GOOGLE_CLIENT_ID` | `<google oauth client id>` |
   | `GOOGLE_CLIENT_SECRET` | `<secret>`（Sensitive） |
   | `AUTH_SECRET` | `<secret>`（Sensitive） |
   | `ALLOWED_EMAILS` | `user1@gmail.com,user2@gmail.com` |
   | `RATE_LIMIT_PER_MINUTE` | `10` |

5. Production Deployment の公開URL（`https://<project>.vercel.app`）が審査・デモ用URLになる。公開URL自体はインターネットから到達可能だが、利用には`ALLOWED_EMAILS`登録済みのGoogleアカウントでのログインが必須（設計書20.2章）。
6. Live API障害時にチャンピオンデータへ自動フォールバックする処理は実装しない（設計書20.6章）。発表用チャンピオンHTML（`demo/champion.html`）はLive APIの成否に依存しない別成果物として使用する。

## 既知の制約・未確定事項

設計書18章に基づき、以下はこのリポジトリでは未確定・簡易実装です。今後の学生/デザイナー作業やOrcaRouter疎通結果に応じて調整してください。

- ワイヤーフレーム・最終的なUIデザインは未確定です。本実装は画面の「目的」を満たす簡易UIです。
- プロフィールの最終入力項目は暫定です。
- `prompts/interview_system.md` / `prompts/research_system.md` の文面は暫定です。実運用前に内容を見直してください。
- OrcaRouterで使用する最終モデル/ルーターは、Web Searchの実発火を確認したうえで `ORCAROUTER_MODEL` に設定してください。
- `demo/champion.html` は開発時に作成したサンプルです。発表用の最終版は改めて作成してください。
- ユーザー単位Rate Limitはメモリ内実装のベストエフォートです（上記「認証・認可・API乱用防止」参照）。
- DB/履歴/決済/管理画面/ロール権限管理/複雑なエージェントループ/回答ごとの逐次ヒアリング生成は実装対象外です。
