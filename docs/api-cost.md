# API利用設計（モデル・コスト）

前提: LLM呼び出しは全て OrcaRouter（OpenAI互換ルーター、`baseURL: https://api.orcarouter.ai/v1`）経由。
料金は **OrcaRouterが接続先モデルのOpenAI公式価格に準拠している前提**で試算（OrcaRouter独自の上乗せ有無は未確認）。

## 1. 現在利用中のモデルと切り替え方法

| 用途 | 呼び出し箇所 | 環境変数 | 現在値 | Web Search |
|---|---|---|---|---|
| ヒアリング質問生成 | `/api/interview` | `ORCAROUTER_MODEL` | `openai/gpt-4o-mini` | なし |
| 基礎調査（Pass1） | `/api/research` 内 | `ORCAROUTER_FACT_MODEL` | `openai/gpt-4o-mini-search-preview` | あり |
| 詳細生成（Pass2） | `/api/research` 内 | `ORCAROUTER_MODEL` | `openai/gpt-4o-mini` | なし（search系モデルの出力上限〈実測1,000〜1,500トークン〉回避のため意図的に無効） |

**切り替え方法**: Vercel Environment Variables の `ORCAROUTER_MODEL` / `ORCAROUTER_FACT_MODEL` を書き換えて再デプロイするだけ（コード変更不要、`lib/OrcaRouterClient.ts` が実行時に読む）。`ORCAROUTER_FACT_MODEL` を空にするとPass1自体をスキップする。

## 2. 現状の1回あたり利用料金（実測ベース）

「いちご農園を始めたい」テーマで実際にAPIを呼び出し、トークン数を実測（2026-08-14）。

| 呼び出し | モデル | input | output | 料金 |
|---|---|---|---|---|
| ヒアリング生成 | gpt-4o-mini | 1,568 | 248 | $0.0004 |
| 基礎調査（トークン分） | gpt-4o-mini-search-preview | 961 | 763 | $0.0006 |
| 基礎調査（Web Search呼び出し、$25/1,000回） | — | — | — | $0.0250 |
| 詳細生成（8,226中7,040がキャッシュ） | gpt-4o-mini | 8,226 | 5,292 | $0.0039 |
| **1回のリサーチ実行合計** | | | | **約 $0.030（≒4.5円 @150円/$）** |

→ **Web Search呼び出し課金が全体の8割強**を占める支配的コスト要因。トークン代自体はごく小さい。

## 3. フルスペック改良時の試算（上位モデル化 + Pass2もWeb Search対応）

想定構成: ヒアリングは `gpt-4o`、基礎調査＋詳細生成は `gpt-4o-search-preview` に統合し1回のWeb Search付き呼び出しで完結させる（現行の2パス構成を解消）。

前提: 入力 約8,000トークン、出力 約6,500トークン（現行Pass1+Pass2合計6,055トークンよりやや厚めの想定）、Web Search呼び出しは3道それぞれの裏付けのため2回。

| 呼び出し | モデル | 料金 |
|---|---|---|
| ヒアリング生成 | gpt-4o | $0.0064 |
| 統合リサーチ（トークン分） | gpt-4o-search-preview | $0.0850 |
| 統合リサーチ（Web Search呼び出し2回） | — | $0.0500 |
| **1回のリサーチ実行合計** | | **約 $0.14（≒21円 @150円/$）** |

→ 現状比で**約4.7倍**。月100回の利用でも $14（≒2,100円）程度に収まる規模感。

**注意**: 現行構成でPass2にsearch系モデルを使わない理由は「出力トークンが1,000〜1,500程度で打ち切られる」という実測不具合（`gpt-4o-mini-search-preview`）。フルサイズの `gpt-4o-search-preview` で同じ制約が解消するかは未検証のため、本格導入前に実機検証が必要。
