# LifeFork

転職・独立を「ふと思いついたが、まだ本格的に調べていない人」向けの初期リサーチプロトタイプです。
プロフィール・希望する将来像・AIが生成する追加ヒアリングへの回答を入力すると、「今のまま」と「そこから進める3つの道」を
**将来性 / 年収 / 実現手段 / リスク** の同じ軸で比較し、Web画面に表示します。

設計書: `LifeFork_システム基本設計_v0.4`（ハッカソンGit提出用プロトタイプ）＋ UI案（`lifefork_demo.html`, 2026-08-12）に基づく実装です。

> 本システムはハッカソン向けMVPです。出力の再現性・精度は保証しません。
> 発表用に人手で検証したサンプルは [`demo/champion.html`](./demo/champion.html) を参照してください（UI案そのものを採用、Liveシステムとは分離した別成果物です）。

## 画面フロー

```
[未認証] → Googleログイン (ホワイトリスト判定)
   ↓
S01 入力 → S02 ヒアリング(AI動的生成) → S03 リサーチ中 → S04 比較結果
  (/)      (/interview)                  (/researching)     (/result)
```

0. **ログイン** — `/`〜`/result` はログイン必須です。未認証の場合 `/login` へ誘導され、Googleアカウントでログインします。事前登録（`ALLOWED_EMAILS`）されたメールアドレス以外は利用できません。
1. **S01 入力** — 「やってみたいこと」（検討したい将来像）と、検討している方向性（転職 or 独立）のみを入力します（UI案準拠。職種・経験年数・年収などの基本情報はここでは尋ねません）。
2. **S02 ヒアリング** — `POST /api/interview` を呼び出し、S01の入力をもとにOrcaRouterが最大4問の追加質問を**1回だけ**生成します。現在の職種・資金面などの基本情報もこの中で優先的に質問されます。回答ごとの逐次質問生成（多段ヒアリング）は行いません。
3. **S03 リサーチ中** — `POST /api/research` を呼び出し、OrcaRouter経由でリサーチ結果を取得します（内部では基礎調査→詳細生成の2段階。基礎調査は`mode`により単一呼び出し/複数段オーケストレーションを切り替え、後述）。
4. **S04 比較結果** — 「今のまま」と、そこから進める3つの道（A/B/C、UI案準拠）を比較表示します。カード選択・年次シーン・条件シミュレーション（貯金/準備期間/週の時間/引っ越し可否をスライダーで動かすとグラフと確率が再計算されるUI）を含みます。取得・検証に失敗した場合は結果を捏造せずエラーを表示します。

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
npm test        # vitest（現状は lib/tuneMath.ts の条件シミュレーション計算のみカバー）
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
| `ORCAROUTER_MODEL` | - | `mode: "eco"` でPass2（詳細生成）に使う固定モデル/ルーターID。未設定時は `orcarouter/auto`。`openai/gpt-4o-mini` で動作確認済み。 |
| `ORCAROUTER_MODEL_AUTO` | - | `mode: "normal"` でPass2に使うモデル/ルーターID。「どのモデルを割り当てるか」の判断をアプリ側では行わずOrcaRouterに委ねる位置づけ。未設定時は `orcarouter/auto`。 |
| `ORCAROUTER_FACT_MODEL` | - | 基礎調査 (Pass1) に使うWeb Search対応モデル。未設定時は基礎調査自体をスキップします。`openai/gpt-4o-mini-search-preview` は実検索(`url_citation`)の発火を確認済み。`mode`に関わらず同じモデルを使う。 |
| `ORCAROUTER_TIMEOUT_MS` | - | Pass2（詳細生成）呼び出しのタイムアウト（ミリ秒）。未設定時は `45000`。 |
| `ORCAROUTER_FACT_TIMEOUT_MS` | - | `mode: "eco"` のPass1（単一呼び出し）のタイムアウト（ミリ秒）。未設定時は `15000`。 |
| `ORCAROUTER_GROUNDING_TIMEOUT_MS` | - | `mode: "normal"` のPass1オーケストレーション、ステージ2/3の1呼び出しあたりのタイムアウト（ミリ秒）。並列実行前提で短めに設定。未設定時は `12000`。 |
| `ORCAROUTER_WEB_SEARCH` | - | `true` にするとPass1（基礎調査）に `web_search_options` を付与しWeb Searchを有効化します。未設定時は `false`。 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | ✅ | Google Cloud ConsoleでのOAuthクライアント情報。 |
| `AUTH_SECRET` | ✅ | Auth.jsのセッション署名用シークレット。 |
| `ALLOWED_EMAILS` | ✅ | ログインを許可するGoogleアカウントのメールアドレス（カンマ区切り、サーバー側のみ参照）。 |
| `RATE_LIMIT_PER_MINUTE` | - | ユーザー単位Rate Limitの上限（回/分）。未設定時は `10`。 |

### リサーチ生成のTwo-passアーキテクチャ（設計書9.5章 + UI案対応）

UI案の「今のまま＋3つの道」比較・年次推移・条件シミュレーションを1回のAIレスポンスで生成すると、`ResearchResult` は約4,700〜6,500トークン相当の大きなJSONになります。ところが2026-08-12時点で実測したところ、Web Search対応の `-search-preview` 系・`gpt-5-search-api` 系モデルは `max_completion_tokens` を明示指定しても**出力が1,000〜1,500トークン程度で強制的に打ち切られ**、大きなJSONを最後まで生成できないことが分かりました。

そのため `POST /api/research` は内部で2段階の呼び出しを行います（[`app/api/research/route.ts`](./app/api/research/route.ts)）。

1. **Pass1（基礎調査）**: Web Search対応の `ORCAROUTER_FACT_MODEL` で、関連する事実・相場・参考URLを取得します（[`prompts/research_facts.md`](./prompts/research_facts.md)）。ベストエフォートで、未設定・失敗時は空のまま次に進みます。**実装は `mode`（リクエストの `mode: "eco" | "normal"`）で切り替わります**（設計・実測の詳細は [`docs/api-cost.md`](./docs/api-cost.md) 参照）。
   - `mode: "eco"`: 1回のAPI呼び出しにまとめて任せます。低コストですが、複数の観点（ベースラインの事実／代替ルートの実在探索）を1回で安定して網羅できるとは限りません。
   - `mode: "normal"`: [`lib/researchOrchestrator.ts`](./lib/researchOrchestrator.ts) が3段階のオーケストレーションを行います。①候補生成（`goal.type`に応じた代替ルート候補を最大6件、Web検索なしで発想）→②個別グラウンディング（ベースライン＋候補ごとに1件、並列でWeb検索し実在を確認。出典が付かない候補は脱落）→③深掘り（グラウンディングに成功した候補のうち情報源が多い上位3件について、具体的な金額・要件を追加取得）。実測で10〜11回のAPI呼び出し・15〜17秒。
2. **Pass2（詳細生成）**: Pass1の結果を [`lib/PromptBuilder.ts`](./lib/PromptBuilder.ts) 経由でプロンプトに埋め込み、Web Searchなしの通常モデル（`mode: "eco"` は `ORCAROUTER_MODEL`、`mode: "normal"` は `ORCAROUTER_MODEL_AUTO`）で `ResearchResult` 全体を生成します。出力トークン上限の制約を受けないため、情報量の多いJSONも最後まで生成できます。

実測（`gpt-4o-mini-search-preview` + `gpt-4o-mini`、`mode: "eco"`）: Pass1 約7〜9秒、Pass2 約50〜65秒、合計1分前後。`app/api/research/route.ts` は `maxDuration = 120` を設定しています（VercelはHobbyプランでも Fluid Compute 有効時は最大300秒まで設定可能）。モデル選択・1回あたりのコスト試算（現状/推奨/最高性能の3グレード）は [`docs/api-cost.md`](./docs/api-cost.md) にまとめています。

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

ユーザー入力（プロフィール・将来像・ヒアリング回答・`mode`）を受け取り、比較結果（`ResearchResult`）を返します。ログイン必須。

- `mode`: `"normal"`（既定、Pass1を3段階オーケストレーションで実行）または `"eco"`（Pass1を単一呼び出しで実行、低コスト）。詳細は上記「Two-passアーキテクチャ」および [`docs/api-cost.md`](./docs/api-cost.md) 参照。
- リクエスト/レスポンスの意味構造は [`types/research.ts`](./types/research.ts) を参照してください。`currentPath`（今のまま）と `targetPaths`（進める道、必ず3件）、各パスの年次シーン（`yearlyScenes.y1/y3/y5`）・グラフ用数値系列（`series`）・条件シミュレーション係数（`tuneFactors`）・チェックリスト（`checks`）を含みます。`summary` には短いリード文（`lead`）に加え、UI案の facts 表示に対応する `fitScore`（いま向いてる度）・`availableFunds`（準備できるお金）・`survivalPeriod`（生活できる期間）・`relevantExperience`（テーマ関連の経験）を含みます（いずれも `{label, value, unit}` の fact 形式）。
- **出典番号参照**: `sources` は `{title, url}` の配列で、`summary.leadSourceIndexes` / 各 fact の `sourceIndex` / `checks[].sourceIndex` / `currentPath.sourceIndex` / `targetPaths[].sourceIndex` / `rateSourceIndex` から、根拠として使った `sources` の1始まりのインデックスを（任意で）参照します。表示側は `lib/citations.tsx`（`Cite`/`Cites`/`CiteIn`）で該当箇所に小さくリンクを添えます。モデルが値を持たない任意項目に `null` を返すことがあるため、`lib/jsonNormalize.ts`（`stripNullValues`）で `null` を「未指定」としてスキーマ検証前に正規化しています。
- ステータスコード: `200`(正常) / `400`(入力不正) / `401`(未認証) / `403`(ホワイトリスト対象外) / `429`(アプリRate Limit超過 or OrcaRouterレート制限) / `502`(上流エラー・応答検証失敗) / `504`(タイムアウト) / `500`(その他)
- 内部は基礎調査(Pass1)→詳細生成(Pass2)の2段階（上記「Two-passアーキテクチャ」参照）。詳細生成の応答はプロンプト（`prompts/research_system.md`）に基づき構造化JSON（`ResearchResult`）で取得し、`lib/ResultValidator.ts` で zod スキーマ検証します。検証に失敗した場合は1回のみフォーマット修正を促して再試行し、それでも失敗すればエラーとして結果を返します（結果を捏造しません）。
- ヒアリング質問はDBに保存しないため、動的生成された質問文はクライアントが `answers[].question` として再送します。
- 「いま向いてる度」等の数値スコアは、設計書10章が定める「根拠の弱い疑似精密スコアは持たせない」という方針の例外です。UI案の要求により、目安であることを明記した上でユーザー判断により追加しています。

### `GET /api/health`

アプリの設定状況（OrcaRouter接続設定・Auth.js設定の有無）を確認します。APIキー・シークレットの値は含みません。認証不要。

## ディレクトリ構成

```
app/
  page.tsx                    # S01 入力 (テーマ入力のみ、UI案準拠)
  interview/page.tsx          # S02 ヒアリング (AI動的生成・1問ずつ回答、UI案デザイン)
  researching/page.tsx        # S03 リサーチ中 (ログ演出、UI案デザイン)
  result/page.tsx             # S04 比較結果
  login/page.tsx               # ログイン画面 (UI案ランディングを流用)
  api/auth/[...nextauth]/route.ts  # Auth.js ハンドラ
  api/interview/route.ts      # POST /api/interview (InterviewController)
  api/research/route.ts       # POST /api/research (ResearchController, Two-pass, mode: eco/normal)
  api/health/route.ts         # GET /api/health
auth.ts                       # Auth.js設定 (Google OIDC + ホワイトリスト判定)
proxy.ts                      # 画面のログイン必須化 (Next.js 16 Proxy、旧Middleware)
components/
  Header.tsx                  # ログイン中のみ表示する共通ヘッダー (UI案 topbar)
  result/
    ResultView.tsx             # S04 全体の状態管理・レイアウト（サイドナビ/こたえ/checks）
    PathsSection.tsx            # 3道カード選択 + 統合パネル（年次シーン）
    TunerSection.tsx            # 条件シミュレーション（スライダー + グラフ + 確率バー）
    TrendChart.tsx               # SVG折れ線グラフ描画
    ActionSection.tsx           # はじめの一歩・プラン・handoff(モック)・paywall(モック)
lib/
  OrcaRouterClient.ts          # OrcaRouter (OpenAI互換API) 呼び出し (interview/research Pass1・Pass2共通)
  PromptBuilder.ts             # システムプロンプト + ユーザー入力の組み立て (Pass1/Pass2)
  researchOrchestrator.ts      # Pass1 (mode: "normal") の3段階オーケストレーション
  InterviewValidator.ts        # InterviewResponse のスキーマ検証
  ResultValidator.ts           # ResearchResult のスキーマ検証
  FactFindingValidator.ts      # Pass1 (基礎調査、mode: "eco") レスポンスのスキーマ検証
  jsonNormalize.ts             # モデル出力のnull正規化 (stripNullValues)
  tuneMath.ts                  # 条件シミュレーションの近似再計算ロジック
  citations.tsx                # 出典番号参照の表示ヘルパー (Cite/Cites/CiteIn)
  allowedEmails.ts             # ALLOWED_EMAILS ホワイトリスト判定
  apiGuard.ts                  # API向け 認証・認可・Rate Limit ガード
  rateLimit.ts                 # ユーザー単位 Rate Limit (Fixed Window)
  researchSession.ts           # 画面間の一時状態受け渡し (sessionStorage、DBなし)
  errors.ts                    # アプリケーションエラー定義
prompts/
  interview_system.md          # ヒアリング質問生成プロンプト（外部ファイル管理）
  research_system.md           # 詳細生成 (Pass2) 用システムプロンプト（外部ファイル管理）
  research_facts.md            # 基礎調査 (Pass1, mode: "eco") 用システムプロンプト（外部ファイル管理）
  research_candidates.md       # Pass1オーケストレーション ステージ1(候補生成)用プロンプト
  research_grounding.md        # Pass1オーケストレーション ステージ2/3(個別グラウンディング・深掘り)用プロンプト
types/
  interview.ts                  # InterviewQuestion等のドメイン型
  research.ts                   # ResearchResult等のドメイン型 (zodスキーマが単一の情報源)
  factFinding.ts                # Pass1 (基礎調査) レスポンスの型
  researchCandidates.ts         # Pass1オーケストレーション ステージ1(候補生成)の型
docs/
  api-cost.md                   # 利用モデル・切り替え方法・1回あたりのコスト試算(現状/推奨/最高性能)
demo/champion.html            # 発表用チャンピオンデータ（UI案 lifefork_demo.html を採用、Liveシステムと分離）
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
   | `ORCAROUTER_MODEL` | `openai/gpt-4o-mini` など、`mode: "eco"` のPass2の出力量に耐えられる通常モデル |
   | `ORCAROUTER_MODEL_AUTO` | `orcarouter/auto` など、`mode: "normal"` のPass2に使うモデル/ルーターID |
   | `ORCAROUTER_FACT_MODEL` | `openai/gpt-4o-mini-search-preview` など疎通確認済みのWeb Search対応モデル |
   | `ORCAROUTER_TIMEOUT_MS` | `80000` |
   | `ORCAROUTER_FACT_TIMEOUT_MS` | `15000` |
   | `ORCAROUTER_GROUNDING_TIMEOUT_MS` | `12000` |
   | `ORCAROUTER_WEB_SEARCH` | `true`（`ORCAROUTER_FACT_MODEL` がWeb Search対応モデルの場合） |
   | `GOOGLE_CLIENT_ID` | `<google oauth client id>` |
   | `GOOGLE_CLIENT_SECRET` | `<secret>`（Sensitive） |
   | `AUTH_SECRET` | `<secret>`（Sensitive） |
   | `ALLOWED_EMAILS` | `user1@gmail.com,user2@gmail.com` |
   | `RATE_LIMIT_PER_MINUTE` | `10` |

   `POST /api/research` は `maxDuration = 120` を設定しています。Vercel Hobbyプランは通常60秒上限ですが、Fluid Compute有効時は300秒まで動作します。

5. Production Deployment の公開URL（`https://<project>.vercel.app`）が審査・デモ用URLになる。公開URL自体はインターネットから到達可能だが、利用には`ALLOWED_EMAILS`登録済みのGoogleアカウントでのログインが必須（設計書20.2章）。
6. Live API障害時にチャンピオンデータへ自動フォールバックする処理は実装しない（設計書20.6章）。発表用チャンピオンHTML（`demo/champion.html`）はLive APIの成否に依存しない別成果物として使用する。

## 既知の制約・未確定事項

設計書18章に基づき、以下はこのリポジトリでは未確定・簡易実装です。今後の学生/デザイナー作業やOrcaRouter疎通結果に応じて調整してください。

- ワイヤーフレーム・最終的なUIデザインは未確定です。本実装は画面の「目的」を満たす簡易UIです。
- プロフィールの最終入力項目は暫定です。
- `prompts/interview_system.md` / `prompts/research_system.md` の文面は暫定です。実運用前に内容を見直してください。
- OrcaRouterで使用する最終モデル/ルーターは、Web Searchの実発火を確認したうえで `ORCAROUTER_FACT_MODEL` に設定してください。
- `demo/champion.html` はUI案(`lifefork_demo.html`)をそのまま採用しています。発表用の最終版として利用する場合は内容を再確認してください。
- ユーザー単位Rate Limitはメモリ内実装のベストエフォートです（上記「認証・認可・API乱用防止」参照）。
- 条件シミュレーション（貯金/準備期間/週の時間/引っ越し可否のスライダー）は、AIが生成した `tuneFactors`（目安の感度）を使ったクライアント側の近似計算です。条件を変えるたびにAIを再呼び出しするわけではありません。
- 「いま向いてる度」「うまくいく確率」等の数値は目安の推定であり、厳密な計算に基づくものではありません。
- ペイウォール（月1回無料・追加300円）と外部ハンドオフ（相談窓口・求人サービス等）はUI案に合わせた見た目のみのモックです。決済処理・外部サービス連携は実装していません。
- DB/履歴/決済/管理画面/ロール権限管理/複雑なエージェントループ/回答ごとの逐次ヒアリング生成は実装対象外です。
