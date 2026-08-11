# LifeFork

転職・独立を「ふと思いついたが、まだ本格的に調べていない人」向けの初期リサーチプロトタイプです。
プロフィール・希望する将来像・AIが生成する追加ヒアリングへの回答を入力すると、「今の道を続けた未来」と「その道に進んだ未来」を
**将来性 / 年収 / 実現手段 / リスク** の同じ軸で比較し、Web画面に表示します。

設計書: `LifeFork_システム基本設計_v0.3`（ハッカソンGit提出用プロトタイプ）に基づく実装です。

> 本システムはハッカソン向けMVPです。出力の再現性・精度は保証しません。
> 発表用に人手で検証したサンプルは [`demo/champion.html`](./demo/champion.html) を参照してください（Liveシステムとは分離した別成果物です）。

## 画面フロー

```
S01 入力 → S02 ヒアリング(AI動的生成) → S03 リサーチ中 → S04 比較結果
  (/)      (/interview)                  (/researching)     (/result)
```

1. **S01 入力** — プロフィール（職種・経験年数・現在の年収など）と、検討したい将来像（転職 or 独立）を入力します。
2. **S02 ヒアリング** — `POST /api/interview` を呼び出し、S01の入力をもとにOrcaRouterが最大4問の追加質問を**1回だけ**生成します。回答ごとの逐次質問生成（多段ヒアリング）は行いません。
3. **S03 リサーチ中** — `POST /api/research` を呼び出し、OrcaRouter経由でリサーチ結果を取得します。
4. **S04 比較結果** — 「今の道」と「検討している道」を並べて表示します。取得・検証に失敗した場合は結果を捏造せずエラーを表示します。

## セットアップ

### 前提

- Node.js 20.19+ / 22.13+ 推奨（`package.json` の engines に準拠する Node.js LTS）
- OrcaRouter の APIキー（[https://www.orcarouter.ai](https://www.orcarouter.ai) で取得）

### 手順

```bash
# 1. 依存関係をインストール
npm install

# 2. 環境変数ファイルを作成
cp .env.example .env.local
# .env.local を編集し、ORCAROUTER_API_KEY を設定する

# 3. 開発サーバーを起動
npm run dev
```

[http://localhost:3000](http://localhost:3000) を開くと S01 入力画面が表示されます。

`ORCAROUTER_API_KEY` を設定していない状態では `POST /api/interview` の時点でエラーになります
（サーバー起動時ではなく、リクエスト時にエラーとなります）。

### 動作確認

```bash
npm run build   # 型チェック込みの本番ビルド
npm run lint    # ESLint
```

`GET /api/health` で現在の OrcaRouter 接続設定（キーの有無・Base URL・モデル名）を確認できます。
APIキーの値そのものは返しません。

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
| `ORCAROUTER_WEB_SEARCH` | - | `true` にすると `POST /api/research`（ヒアリング生成では不要なため付与しません）に `web_search_options` を付与しWeb Searchを有効化します。未設定時は `false`。対応未確認のモデルで `true` にすると400エラーになる場合があります。 |

### Web Search対応モデルについて（設計書9.5章）

`/api/pricing`（認証不要）でOrcaRouterの全モデルの価格・対応パラメータを確認できます。`supported_parameters` に `web_search_options` を含むモデルが実検索候補です（2026-08-12時点で確認できたのは `openai/gpt-4o-search-preview` 系・`openai/gpt-5-search-api` 系）。
このうち `openai/gpt-4o-mini-search-preview` は、`response_format: json_schema` と `web_search_options` を併用してもJSON構造を維持しつつ実URLを含む回答を返すことを確認済みです。価格・提供状況は変動するため、切り替え前に同様の疎通確認を行ってください。

## API

### `POST /api/interview`

プロフィール・将来像を受け取り、リサーチに必要な追加ヒアリング質問（`InterviewQuestion[]`、最大4問）を返します。

- リクエスト/レスポンスの意味構造は [`types/interview.ts`](./types/interview.ts) を参照してください。
- 質問生成プロンプトは [`prompts/interview_system.md`](./prompts/interview_system.md)（外部ファイル管理）。
- 既に入力済みの情報は再質問しない方針で、`lib/InterviewValidator.ts` で zod スキーマ検証します。検証失敗時は1回のみフォーマット修正を促して再試行します。
- 回答ごとに質問を再生成する多段ヒアリングは行いません（1回生成のみ）。

### `POST /api/research`

ユーザー入力（プロフィール・将来像・ヒアリング回答）を受け取り、比較結果（`ResearchResult`）を返します。

- リクエスト/レスポンスの意味構造は [`types/research.ts`](./types/research.ts) を参照してください。
- ステータスコード: `200`(正常) / `400`(入力不正) / `429`(レート制限) / `502`(上流エラー・応答検証失敗) / `504`(タイムアウト) / `500`(その他)
- AIの応答はプロンプト（`prompts/research_system.md`）に基づき構造化JSON（`ResearchResult`）で取得し、`lib/ResultValidator.ts` で zod スキーマ検証します。検証に失敗した場合は1回のみフォーマット修正を促して再試行し、それでも失敗すればエラーとして結果を返します（結果を捏造しません）。
- ヒアリング質問はDBに保存しないため、動的生成された質問文はクライアントが `answers[].question` として再送します。

### `GET /api/health`

アプリの設定状況を確認します（APIキーの値は含みません）。

## ディレクトリ構成

```
app/
  page.tsx                 # S01 入力
  interview/page.tsx       # S02 ヒアリング (AI動的生成・回答)
  researching/page.tsx     # S03 リサーチ中
  result/page.tsx          # S04 比較結果
  api/interview/route.ts   # POST /api/interview (InterviewController)
  api/research/route.ts    # POST /api/research (ResearchController)
  api/health/route.ts      # GET /api/health
components/result/         # 比較結果表示コンポーネント
lib/
  OrcaRouterClient.ts       # OrcaRouter (OpenAI互換API) 呼び出し (interview/research 共通)
  PromptBuilder.ts          # システムプロンプト + ユーザー入力の組み立て
  InterviewValidator.ts     # InterviewResponse のスキーマ検証
  ResultValidator.ts        # ResearchResult のスキーマ検証
  researchSession.ts        # 画面間の一時状態受け渡し (sessionStorage、DBなし)
  errors.ts                 # アプリケーションエラー定義
prompts/
  interview_system.md       # ヒアリング質問生成プロンプト（外部ファイル管理）
  research_system.md        # リサーチ用システムプロンプト（外部ファイル管理）
types/
  interview.ts               # InterviewQuestion等のドメイン型
  research.ts                 # ResearchResult等のドメイン型 (zodスキーマが単一の情報源)
demo/champion.html          # 発表用チャンピオンデータのサンプル（Liveシステムと分離）
```

## データの扱い

- ユーザー入力・リサーチ結果・生成された質問はサーバーに永続化しません（DBなし）。ブラウザの `sessionStorage` にのみ一時保持し、タブを閉じると消えます。
- `ORCAROUTER_API_KEY` はサーバー環境変数としてのみ扱い、ブラウザへは送信しません。
- `.env` / `.env.local` はGit管理対象外です。`.env.example` のみコミットしています。

## デプロイ（Vercel）— 設計書20章

1. このリポジトリをGitHubへpushする（本リポジトリは `main` ブランチを Production とする想定）。
2. [Vercel](https://vercel.com) で「Import Project」からこのGitHubリポジトリを選択する（Next.jsはゼロコンフィグに近い形でデプロイ可能）。
3. Vercel Project Settings → Environment Variables に以下を設定する（`NEXT_PUBLIC_` を付けない = サーバー側のみで参照される）。

   | 変数名 | 値の例 |
   | --- | --- |
   | `ORCAROUTER_API_KEY` | `<secret>` |
   | `ORCAROUTER_BASE_URL` | `https://api.orcarouter.ai/v1` |
   | `ORCAROUTER_MODEL` | `openai/gpt-4o-mini-search-preview` など疎通確認済みのモデルID |
   | `ORCAROUTER_WEB_SEARCH` | `true`（Web Search対応モデルを使う場合） |

4. Production Deployment の公開URL（`https://<project>.vercel.app`）が審査・デモ用URLになる。認証は設けず一般公開とする（MVP方針）。
5. Live API障害時にチャンピオンデータへ自動フォールバックする処理は実装しない（設計書20.6章）。発表用チャンピオンHTML（`demo/champion.html`）はLive APIの成否に依存しない別成果物として使用する。

## 既知の制約・未確定事項

設計書18章に基づき、以下はこのリポジトリでは未確定・簡易実装です。今後の学生/デザイナー作業やOrcaRouter疎通結果に応じて調整してください。

- ワイヤーフレーム・最終的なUIデザインは未確定です。本実装は画面の「目的」を満たす簡易UIです。
- プロフィールの最終入力項目は暫定です。
- `prompts/interview_system.md` / `prompts/research_system.md` の文面は暫定です。実運用前に内容を見直してください。
- OrcaRouterで使用する最終モデル/ルーターは、Web Searchの実発火を確認したうえで `ORCAROUTER_MODEL` に設定してください。
- `demo/champion.html` は開発時に作成したサンプルです。発表用の最終版は改めて作成してください。
- ログイン/DB/履歴/決済/管理画面/複雑なエージェントループ/回答ごとの逐次ヒアリング生成は実装対象外です。
