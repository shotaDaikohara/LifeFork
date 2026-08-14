# API利用設計（モデル・コスト）

前提: LLM呼び出しは全て OrcaRouter（OpenAI互換ルーター、`baseURL: https://api.orcarouter.ai/v1`）経由。
料金は **OrcaRouterが接続先モデルのOpenAI公式価格に準拠している前提**で試算（OrcaRouter独自の上乗せ有無は未確認）。実際の価格は `GET /v1/models`（OrcaRouter）のレスポンスから取得（2026-08-14）。

## 1. 現在利用中のモデルと切り替え方法

| 用途 | 呼び出し箇所 | 環境変数 | 現在値 | Web Search |
|---|---|---|---|---|
| ヒアリング質問生成 | `/api/interview` | `ORCAROUTER_MODEL` | `openai/gpt-4o-mini` | なし |
| 基礎調査（Pass1） | `/api/research` 内 | `ORCAROUTER_FACT_MODEL` | `openai/gpt-4o-mini-search-preview` | あり |
| 詳細生成（Pass2） | `/api/research` 内 | `ORCAROUTER_MODEL` | `openai/gpt-4o-mini` | なし（search系モデルの出力上限〈実測1,000〜1,500トークン〉回避のため意図的に無効） |

**切り替え方法**: Vercel Environment Variables の `ORCAROUTER_MODEL` / `ORCAROUTER_FACT_MODEL` を書き換えて再デプロイするだけ（コード変更不要、`lib/OrcaRouterClient.ts` が実行時に読む）。`ORCAROUTER_FACT_MODEL` を空にするとPass1自体をスキップする。

## 2. 性能グレード比較（松竹梅）

| グレード | 構成 | ヒアリング / Pass1 / Pass2 | 1回あたり | 現状比 |
|---|---|---|---|---|
| 🍃 梅（エコ性能・現行） | 2パス、Web Searchは基礎調査のみ | gpt-4o-mini / gpt-4o-mini-search-preview / gpt-4o-mini | **約$0.03（≒4.5円）** | 1x |
| 🎋 竹（推奨性能） | Pass1は検索ネイティブ機、Pass2はgpt-5世代の標準モデル | gpt-5.1 / gpt-5-search-api / gpt-5.1 | **約$0.23（≒34円）** | 約7.7x |
| 🌲 松（最高性能） | Pass2をカタログ最上位の推論モデルに | gpt-5.1 / gpt-5-search-api / gpt-5.5-pro | **約$1.4〜$3.3（≒210〜490円）** | 約47〜110x |

いずれもWeb Search呼び出し課金（$25/1,000回、想定6回）が全体の主要コストを占める。竹・松の差はPass2モデルの単価差（gpt-5.1: $1.25/$10 per M → gpt-5.5-pro: $30/$180 per M）による。

### 🍃 梅（エコ性能）— 現状構成・実測値

「いちご農園を始めたい」テーマで実際にAPIを呼び出し、トークン数を実測。

| 呼び出し | input | output | 料金 |
|---|---|---|---|
| ヒアリング生成 | 1,568 | 248 | $0.0004 |
| 基礎調査（トークン分 + Web Search1回） | 961 | 763 | $0.0256 |
| 詳細生成（8,226中7,040がキャッシュ） | 8,226 | 5,292 | $0.0039 |
| **合計** | | | **約$0.030** |

### 🎋 竹（推奨性能）

現行の `gpt-4o` 系より新しく、単価もむしろ安い `gpt-5.1` / `gpt-5-search-api`（いずれも $1.25/$10 per Mトークン）に統一する案。入力・出力トークン量は現状と同程度と仮定、Web Search呼び出しは6回想定（「今のまま」＋3道それぞれの代替ルート裏付け）。

### 🌲 松（最高性能）

Pass2のみカタログ最上位の推論モデル `gpt-5.5-pro`（$30/$180 per Mトークン）に置き換える案。推論モデルは可視出力の裏で「隠れ思考トークン」も課金されることがあり、その分を加味してレンジで試算（下限=可視出力のみ／上限=可視出力の2倍相当）。

**運用上の注意**: 実運用投入前に、応答時間（推論モデルは数分単位になりうる）・現行の `maxDuration=120`（Vercel）との整合・JSON Schema出力の安定性を実機で検証すること。

## 3. OrcaRouterモデル別価格（参考、2026-08-14実測、$/1Mトークン）

| モデル | prompt | completion |
|---|---|---|
| gpt-4o-mini（梅・現行） | $0.15 | $0.60 |
| gpt-5.1 / gpt-5-search-api（竹） | $1.25 | $10 |
| gpt-4o-search-preview | $2.5 | $10 |
| claude-opus-5 | $5 | $25 |
| gpt-5-pro | $15 | $120 |
| gpt-5.2-pro | $21 | $168 |
| gpt-5.5-pro（松） | $30 | $180 |
| gpt-5.4-pro | $60 | $270 |
