# LifeFork

転職・独立を「ふと思いついたが、まだ本格的に調べていない人」向けの初期リサーチプロトタイプです。
プロフィール・希望する将来像・ヒアリング回答を入力すると、「今の道を続けた未来」と「その道に進んだ未来」を
**将来性 / 年収 / 実現手段 / リスク** の同じ軸で比較し、Web画面に表示します。

設計書: `LifeFork_システム基本設計_v0.2`（ハッカソンGit提出用プロトタイプ）に基づく実装です。

> 本システムはハッカソン向けMVPです。出力の再現性・精度は保証しません。
> 発表用に人手で検証したサンプルは [`demo/champion.html`](./demo/champion.html) を参照してください（Liveシステムとは分離した別成果物です）。

## 画面フロー

```
S01 入力 → S02 ヒアリング → S03 リサーチ中 → S04 比較結果
  (/)      (/interview)      (/researching)     (/result)
```

1. **S01 入力** — プロフィール（職種・経験年数・現在の年収など）と、検討したい将来像（転職 or 独立）を入力します。
2. **S02 ヒアリング** — 追加のヒアリング質問（`data/interview/questions.json`）に回答します。質問は転職/独立で一部出し分けられます。
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

`ORCAROUTER_API_KEY` を設定していない状態でも画面遷移までは確認できますが、
`POST /api/research` はエラーを返します（サーバー起動時ではなく、リクエスト時にエラーとなります）。

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
| `ORCAROUTER_WEB_SEARCH` | - | `true` にすると `web_search_options` を付与しWeb Searchを有効化します。未設定時は `false`。対応未確認のモデルで `true` にすると400エラーになる場合があります。 |

### Web Search対応モデルについて（設計書9.5章）

`/api/pricing`（認証不要）でOrcaRouterの全モデルの価格・対応パラメータを確認できます。`supported_parameters` に `web_search_options` を含むモデルが実検索候補です（2026-08-12時点で確認できたのは `openai/gpt-4o-search-preview` 系・`openai/gpt-5-search-api` 系）。
このうち `openai/gpt-4o-mini-search-preview` は、`response_format: json_schema` と `web_search_options` を併用してもJSON構造を維持しつつ実URLを含む回答を返すことを確認済みです。価格・提供状況は変動するため、切り替え前に同様の疎通確認を行ってください。

## API

### `POST /api/research`

ユーザー入力を受け取り、比較結果（`ResearchResult`）を返します。

- リクエスト/レスポンスの意味構造は [`types/research.ts`](./types/research.ts) を参照してください。
- ステータスコード: `200`(正常) / `400`(入力不正) / `429`(レート制限) / `502`(上流エラー・応答検証失敗) / `504`(タイムアウト) / `500`(その他)
- AIの応答はプロンプト（`prompts/research_system.md`）に基づき構造化JSON（`ResearchResult`）で取得し、`lib/ResultValidator.ts` で zod スキーマ検証します。検証に失敗した場合は1回のみフォーマット修正を促して再試行し、それでも失敗すればエラーとして結果を返します（結果を捏造しません）。

### `GET /api/health`

アプリの設定状況を確認します（APIキーの値は含みません）。

## ディレクトリ構成

```
app/
  page.tsx                 # S01 入力
  interview/page.tsx       # S02 ヒアリング
  researching/page.tsx     # S03 リサーチ中
  result/page.tsx          # S04 比較結果
  api/research/route.ts    # POST /api/research (ResearchController)
  api/health/route.ts      # GET /api/health
components/result/         # 比較結果表示コンポーネント
lib/
  OrcaRouterClient.ts       # OrcaRouter (OpenAI互換API) 呼び出し
  PromptBuilder.ts          # システムプロンプト + ユーザー入力の組み立て
  ResultValidator.ts        # ResearchResult のスキーマ検証
  researchSession.ts        # 画面間の一時状態受け渡し (sessionStorage、DBなし)
  errors.ts                 # アプリケーションエラー定義
prompts/research_system.md  # LLMへのシステムプロンプト本文（外部ファイル管理）
data/interview/questions.json # ヒアリング質問定義
types/research.ts           # ドメイン型 (zodスキーマが単一の情報源)
demo/champion.html          # 発表用チャンピオンデータのサンプル（Liveシステムと分離）
```

## データの扱い

- ユーザー入力・リサーチ結果はサーバーに永続化しません（DBなし）。ブラウザの `sessionStorage` にのみ一時保持し、タブを閉じると消えます。
- `ORCAROUTER_API_KEY` はサーバー環境変数としてのみ扱い、ブラウザへは送信しません。
- `.env` / `.env.local` はGit管理対象外です。`.env.example` のみコミットしています。

## 既知の制約・未確定事項

設計書18章に基づき、以下はこのリポジトリでは未確定・簡易実装です。今後の学生/デザイナー作業やOrcaRouter疎通結果に応じて調整してください。

- ワイヤーフレーム・最終的なUIデザインは未確定です。本実装は画面の「目的」を満たす簡易UIです。
- プロフィールの入力項目・ヒアリング質問（`data/interview/questions.json`）は暫定内容です。
- `prompts/research_system.md` の文面は暫定です。実運用前に内容を見直してください。
- OrcaRouterで使用する最終モデル/ルーターは、Web Searchの実発火を確認したうえで `ORCAROUTER_MODEL` に設定してください。
- `demo/champion.html` は開発時に作成したサンプルです。発表用の最終版は改めて作成してください。
- ログイン/DB/履歴/決済/管理画面/複雑なエージェントループは実装対象外です。
