# OrcaRouterルーティング設計（ドラフト）

作成日: 2026-08-14
ステータス: **ドラフト・未着手**（一次情報が未検証のため、着手前にコンソール確認が必須）

## 0. この文書の位置づけと確認状況

OrcaRouterの「auto選択 / Cascade / 並列実行+Judge」というメリットを、[docs/api-cost.md](api-cost.md) に記載の現行実装（用途ごとにモデルを環境変数で固定）に取り込むための設計案。

**確認できたこと**
- `https://api.orcarouter.ai/v1`（OpenAI互換API）は実際に稼働しており、本プロジェクトから接続実績がある。
- `orcarouter/auto` という仮想モデルIDが存在し、ワークスペース単位で戦略（`cheapest` / `balanced` / `quality` / `adaptive` / `gated_adaptive`）を設定できる、という記述が公式ドキュメント連携先（promptfoo provider docs）にある。

**確認できなかったこと（要ログイン確認）**
- `https://docs.orcarouter.ai/routing/routing-dsl` は403（ログイン必須）で本文を取得できなかった。
- Routing DSL（YAML + CEL式によるルーティング定義、`parallel`/`arbiter`/`on_low_confidence`等）の構文例は、公式ブログ記事・プレスリリースからの二次引用のみで、一次ドキュメントで裏取りできていない。
- これらの記事に出てくるモデルID（`claude-opus-4.8`、`claude-sonnet-4.6`等）は現行のClaude 5世代（Opus 5 / Sonnet 5 / Haiku 4.5 / Fable 5）と命名が異なり、記事自体の鮮度・正確性が不明。**この構文案をそのままコンソールに入力できる保証はない。**
- 現在の契約プラン・APIキーでRouting DSL機能自体が有効かどうか。

→ 本設計は「この構文であろう」という**仮説段階のドラフト**です。着手前に必ず [1. 着手前チェックリスト](#1-着手前チェックリスト) を消化してください。

## 1. 着手前チェックリスト

- [ ] `https://www.orcarouter.ai/console/routing` にログインし、Routing DSLがプランに含まれているか確認する
- [ ] コンソールの「モデルカタログ」で実際に指定可能なモデルID一覧（特にClaude系の現行世代表記）を確認する
- [ ] `orcarouter/auto` の候補モデルプールから、出力トークン上限が低いsearch系モデル（`*-search-preview`等）を除外できるか確認する（[lib/OrcaRouterClient.ts:35-39](../lib/OrcaRouterClient.ts#L35-L39) で判明済みの実測不具合の再発防止に必須）
- [ ] Routing DSLで定義したnamed router経由でも `response_format: json_schema` / `json_object` が機能するか、小規模に試験する
- [ ] レスポンス（またはヘッダー）に、実際に選ばれたモデル名・Cascade昇格の有無などのメタ情報が含まれるか確認する（UIでの可視化に使えるか）

## 2. 現状（再掲）

| 用途 | 呼び出し箇所 | 環境変数 | 現在値 |
|---|---|---|---|
| ヒアリング質問生成 | `/api/interview` | `ORCAROUTER_MODEL` | `openai/gpt-4o-mini`（固定） |
| 基礎調査（Pass1） | `/api/research` 内 | `ORCAROUTER_FACT_MODEL` | `openai/gpt-4o-mini-search-preview`（固定） |
| 詳細生成（Pass2） | `/api/research` 内 | `ORCAROUTER_MODEL` | `openai/gpt-4o-mini`（固定） |

いずれもOrcaRouterの自動選択・Cascade・並列Judgeを使わず、固定モデル運用になっている。理由は search系モデルの出力トークン上限（実測1,000〜1,500）でPass2のJSONが途中で切れる不具合を避けるため（[lib/OrcaRouterClient.ts:35-39](../lib/OrcaRouterClient.ts#L35-L39)）。

## 3. 段階的ロールアウト方針

チェックリストの検証結果次第で構文・実現可否が変わるため、**低リスク・低変更量から順に**進める。

### Step1: ヒアリングのみ `orcarouter/auto`（adaptive戦略）に切り替え

- 対象: `/api/interview` のみ（[app/api/interview/route.ts](../app/api/interview/route.ts)）
- 変更: `ORCAROUTER_MODEL` を `orcarouter/auto` に戻す。コンソールでこのワークスペースの戦略を `adaptive` に設定。
- コード変更: なし（環境変数のみ）
- 狙い: 出力が軽量（実測248トークン程度）でPass2のトークン上限問題の影響を受けにくい用途に限定し、まず「質問内容を見て自動選択」を安全に検証する。
- 検証方法: 「Webデザイナーに転職したい」のような軽い自由記述と、複雑な自由記述とで、応答に含まれるモデル情報（取得できれば）や応答速度・品質の違いを比較する。

### Step2: リサーチPass2にCascade（低信頼時の昇格）を導入

- 対象: `/api/research` の詳細生成のみ（[app/api/research/route.ts:53](../app/api/research/route.ts#L53)）
- 前提: チェックリストで「named routerでも json_schema が機能する」「search系モデルを候補から除外できる」ことを確認済みであること
- 想定構文（**未検証・要コンソール確認**）:

```yaml
version: 1
rules:
  - id: lifefork-research
    when: true
    use: { model: "openai/gpt-4o-mini" }   # primary（現行固定モデルと同等）
    on_low_confidence:
      signals: [self_doubt]                 # 「難問っぽい」信号。実際に使えるsignal名は要確認
      use: { model: "openai/gpt-4o" }        # 昇格先。search系は使わない
```

- コード変更: `ORCAROUTER_MODEL` をこのnamed router名に向けるだけ（`lib/OrcaRouterClient.ts` の呼び出し構造は変更不要）
- 現行の「schema検証失敗→同一モデルへ2回目リトライ」ロジック（[app/api/research/route.ts:59-70](../app/api/research/route.ts#L59-L70)）は、フォーマット崩れのセーフティネットとしてそのまま残す。Cascadeが担うのは「難問だから質を上げる」判断であり、役割が異なる。

### Step3（余裕があれば）: 並列実行+Judgeを高難度時のみ限定適用

- 対象: `/api/research` の詳細生成のうち、難易度が高いと判定された場合のみ
- 想定構文（**未検証・要コンソール確認**）:

```yaml
use:
  parallel:
    - { model: "openai/gpt-4o" }
    - { model: "<Claude系モデルID・要確認>" }
  arbiter:
    strategy: best_of_n
    model: "<judge用モデルID・要確認>"
```

- コスト・レイテンシへの影響が大きいため（[docs/api-cost.md](api-cost.md) の試算で通常構成比8倍以上）、難易度判定で明確に高難度なケースのみに絞る。難易度判定自体をOrcaRouter側のCEL式（`when: difficulty >= 0.6` 等、構文未確認）に任せるか、アプリ側で簡易ヒント（自由記述の文字数・「比較」「実現可能性」等のキーワード有無）を渡すかは、Step1・2の実測結果を見て決める。
- Vercelの `maxDuration=120`（[app/api/research/route.ts:18](../app/api/research/route.ts#L18)）に収まるかは別途レイテンシ実測が必要。

## 4. デモでの可視化案

チェックリストで「レスポンスに選択モデル・昇格有無のメタ情報が含まれる」ことが確認できれば、UIに一言添える（例:「複雑な相談のため上位モデルで再検討しました」）。取得できない場合は、最低限 `orcaRouterHealthInfo()`（[lib/OrcaRouterClient.ts:53](../lib/OrcaRouterClient.ts#L53)）に用途ごとの割当router名を出す程度に留める。

## 5. スケジュール感（ハッカソン提出 8/15想定）

残り時間が少ないため、**Step1のみを確実に動かして実演できる状態にすることを優先**する。Step2・3は本ドラフトとして残し、提出後の本実装候補とする。

| ステップ | 所要目安 | 提出への影響 |
|---|---|---|
| チェックリスト確認（コンソールログイン） | 15〜30分 | 必須。ここで詰まればStep1以降は保留 |
| Step1実装・検証 | 30分〜1時間 | デモに「auto選択」を1点追加できる |
| Step2以降 | 半日〜（Routing DSL構文の実機検証込み） | 提出には間に合わない前提。設計書として残す |
