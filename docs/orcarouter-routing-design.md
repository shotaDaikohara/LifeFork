# OrcaRouterルーティング設計

作成日: 2026-08-14
ステータス: **実装・コンソール設定とも完了、提出可**。コード（tsc/eslint/build確認済み）とOrcaRouterコンソール（`auto`ルーターの許可モデル・戦略設定）の両方が揃っている。並列実行+Judge（Step3相当）のみ未着手で今後の拡張候補。

## 0. 背景

LifeForkはLLM呼び出しをすべてOrcaRouter（OpenAI互換ルーター）経由で行っている。当初は用途ごとにモデルIDを環境変数へ直書きしているだけで、OrcaRouterの「auto選択 / Cascade（自動昇格）/ 並列実行+Judge」という強みを一切使っていなかった（[docs/api-cost.md](api-cost.md) 参照）。本ドキュメントはこれを取り込むための設計と、実際の実装内容をまとめる。

## 1. 実機検証結果（2026-08-14）

### 1.1 curl直叩き（`docs.orcarouter.ai`・コンソールがログイン必須で見られなかったため）

| 項目 | 結果 |
|---|---|
| `orcarouter/auto` `orcarouter/fusion` `orcarouter/fusion-flash` `orcarouter/fusion-mini` `orcarouter/free` の実在 | ✅ `/v1/models` で確認（全186モデル中） |
| Claude 5世代（`anthropic/claude-fable-5`、`claude-haiku-4.5`等）がモデルカタログに存在するか | ✅ 存在する |
| レスポンスヘッダーでの可視化情報 | ✅ `x-orca-resolved-model`（実際に選ばれた実モデルID）、`x-orca-router`（適用ルーター名）が返る。**コード変更のみで可視化に使える（実装済み、3章参照）** |
| `response_format: json_schema` と `orcarouter/auto` の併用 | ✅ 問題なく機能した |
| 難易度に応じた自動昇格（初回） | ❌ 軽量質問・難問のいずれを投げても `x-orca-resolved-model` は常に `qwen/qwen3.7-plus` 固定だった |

初回はこの結果から「候補モデルプールがqwen系に限定されている」と推測したが、後述の通りこれは誤りで、実態は**探索フェーズ中のウォームアップ挙動**だった。

### 1.2 コンソール確認（ユーザーがブラウザでログインし、画面を共有）

`auto` ルーターの編集画面を実際に見せてもらい、以下が判明した。

- **許可モデル**: `anthropic/*, openai/gpt-4o, google/*` 他、181モデル。qwen系限定ではなく、Claude/GPT/Geminiを含む幅広い許可設定だった（curlだけでは分からなかった）
- **戦略**: 「アダプティブゲート ― 難易度帯ごとに学習」（おすすめ設定）が選択済み
  - 簡単なリクエスト用プール: `z-ai/glm-5.2, deepseek/deepseek-v4-pro, qwen/qwen3.7-plus`
  - 複雑なリクエスト用プール: `openai/gpt-5.6-terra, anthropic/claude-opus-4.8, anthropic/claude-fable-5`
  - 中間難易度は許可モデルの全リスト（181個）から選択
- 画面の注記: 「適応的はモデルごとに短いウォームアップ期間を経てから選択を主導します。ウォームアップ中はBalancedと同じ挙動になります」— つまり1.1で見た「常にqwen固定」はバグでも制限でもなく、**探索フェーズ中の想定挙動**だった
- 当初の状態は「学習中：6 / 約30回の探索呼び出し」

### 1.3 探索呼び出しを追加実行して学習を進めた

軽量質問・複雑な質問を織り交ぜて計31回（成功29回）を追加で投げ、探索を進めた。

| モデル（簡単プール内） | 回数 |
|---|---|
| `deepseek/deepseek-v4-pro` | 15回 |
| `z-ai/glm-5.2` | 8回 |
| `qwen/qwen3.7-plus` | 6回 |

再度コンソールを確認すると「学習済み：3モデル中2が収束・リーダー deepseek/deepseek-v4-pro（38%）・qwen3.7-plus（38%）・z-ai/glm-5.2（23%）」に変化しており、**簡単プール内でどのモデルが最適かの学習は完了**した。

ただし、この後に975文字の長文・複雑なプロンプトを追加で投げても `deepseek/deepseek-v4-pro`（簡単プール側）のままだった。「学習済み」表示は簡単プール内部の学習を指しており、**簡単/中間/複雑を振り分けるdifficulty判定（ゲート）自体の状態は別**で、コンソール上に専用の進捗表示は見当たらなかった。今回のテストはいずれも単発の短い質問文（`max_tokens=40`で打ち切り）で、LifeFork実際のPass2リクエスト（長いシステムプロンプト＋JSON Schema＋3道比較要求）とは性質が異なるため、複雑プールへの実際の分岐は**LifeForkの本番Pass2プロンプトでの検証が別途必要**という結論で一旦区切った（ハッカソン提出を優先）。

## 2. 実装済み: 「モデル選択の判断」自体を分ける「通常モード / エコモード」

### 設計判断（重要）

最初のドラフトでは「Pass2の1回目出力がスキーマ検証に失敗したら2回目は上位モデルへ昇格する」という**アプリ側の判断ロジック**として実装した。しかしこれは、OrcaRouterの本当の強み――「どのモデルを使うべきかという**判断そのものをマネージド化している**こと」（当初比較表でいう「Cascadeをアプリ/Agentのロジックとして組む」というAWS側のアプローチそのもの）を全く活かせていない、という指摘を受けて設計を変更した。

**変更後の設計**: アプリ側は難易度判定・モデル選択のロジックを一切持たない。「誰が判断するか」だけをモードとして分ける。

- **通常モード**（S01で「じっくり調べる」選択、デフォルト）: 1回目・2回目とも `ORCAROUTER_MODEL_AUTO`（既定 `orcarouter/auto`）を使う。**このリクエストにどのモデルを割り当てるべきかの判断は、毎回OrcaRouter自身に委ねる**
- **エコモード**（「さくっと調べる」選択）: 1回目・2回目とも常に `ORCAROUTER_MODEL`（固定・低コストモデル）のみを使う。**判断そのものを省略してコストを優先する**モード

つまり通常モード/エコモードの違いは「昇格するかどうか」ではなく、「モデル選択の判断をOrcaRouterに委ねるか、判断コストごと省略して固定モデルで済ませるか」という軸になっている。

### 実装箇所

| ファイル | 変更内容 |
|---|---|
| [types/research.ts](../types/research.ts) | `researchModeSchema`（`"normal" \| "eco"`, デフォルト`"normal"`）、`researchRequestSchema.mode` |
| [lib/OrcaRouterClient.ts](../lib/OrcaRouterClient.ts) | `ORCAROUTER_MODEL_AUTO` 環境変数（既定 `orcarouter/auto`）を追加、`getModelAuto()` をexport。`requestResearchCompletion` に `modelOverride` 引数を追加 |
| [app/api/research/route.ts](../app/api/research/route.ts) | `mode === "normal"` なら1回目・2回目とも `getModelAuto()` を、`"eco"` なら未指定（`ORCAROUTER_MODEL`固定）を使う |
| [app/page.tsx](../app/page.tsx) | S01入力画面に「じっくり調べる / さくっと調べる（エコ）」のトグルを追加 |
| [lib/researchSession.ts](../lib/researchSession.ts) | `saveMode` / `loadMode`（sessionStorage経由でS01→S03へ伝搬） |
| `.env.example` | `ORCAROUTER_MODEL_AUTO`（通常モード用、既定 `orcarouter/auto`）を追加。`ORCAROUTER_MODEL` はエコモード専用の固定モデルという位置づけに整理 |

`npx tsc --noEmit` / `npx eslint .` / `npx next build` すべて成功を確認済み（2026-08-14）。

### 既知の制約

1章の通り、コンソール側の設定（許可モデル・Adaptive Gate戦略）はすでに理想形で組まれており、簡単プール内の学習も完了している。一方、**複雑プールへ実際に振り分けられるかはLifeForkの本番Pass2プロンプトで未検証**（1.3節）。通常モードにしても、リクエストの実際の複雑さの伝わり方次第では、当面クロスプロバイダの切り替えを体感できない可能性がある。これはコード変更なしにOrcaRouter側の学習・判定精度が上がるにつれて改善される想定。

## 3. 実装済み: 選択モデルの可視化（`x-orca-resolved-model` / `x-orca-router`）

OrcaRouterのレスポンスヘッダーに実際に処理した実モデルIDが返ることを実機検証で確認した（1章）。`lib/OrcaRouterClient.ts` の全補完呼び出しを `.withResponse()` に変更し、`CompletionResult { content, resolvedModel, router }` として呼び出し元へ返すようにした。`/api/interview` `/api/research` のレスポンスヘッダーに `X-LifeFork-Resolved-Model` / `X-LifeFork-Router` として付与している（`routerDebugHeaders()`）。

現状はAPIレスポンスヘッダーどまりで、フロントUIへの表示（例:「今回はqwen3.7-plusが担当しました」）は未実装。デモで見せたい場合はフロント側の追加実装が必要。

## 4. OrcaRouterだからこそ実現できたこと（AWS Bedrockとの比較）

今回の実装・検証を通して、当初の比較表の主張のうちどこが実機で裏付けられ、AWS構成（Bedrock / AgentCore）だと同じことをするのに何が余分に必要になるかを整理する。

| # | LifeForkでの実装 | OrcaRouterだからできたこと | Bedrockだとどうなるか |
|---|---|---|---|
| 1 | 全用途で単一の `lib/OrcaRouterClient.ts`（OpenAI互換 `/v1/chat/completions` 1本） | Claude・GPT・Gemini・Qwen等、**プロバイダの異なるモデルを同一のリクエスト/レスポンス形式で呼べる**。モデルを切り替えても呼び出しコードは無変更（環境変数のモデルID文字列を変えるだけ） | 各プロバイダでリクエスト/レスポンス形式が異なる。Converse APIである程度統一はされるが、**GPT・Geminiはそもそも Bedrock 上に存在しない**（AWSだけではクロスプロバイダのモデル切り替え自体ができない） |
| 2 | `model: "orcarouter/auto"` を指定するだけ | **1つの仮想モデルIDの裏で181モデル・複数プロバイダ横断のルーティングが行われる**（コンソールで確認済み。簡単/中間/複雑の3段階ゲートで、簡単→ `deepseek` `qwen` `z-ai`系、複雑→ `gpt-5.6-terra` `claude-opus-4.8` `claude-fable-5` と、クロスプロバイダの候補が設定されている） | Bedrock Intelligent Prompt Routingは**同一モデルファミリー内のみ**（例: Claude同士）。GPTやGeminiへは原理的にルーティングできない |
| 3 | 通常モードは1回目・2回目とも `ORCAROUTER_MODEL_AUTO`（既定 `orcarouter/auto`）に投げるだけ（2章） | **「どのモデルを使うべきかという判断そのもの」をアプリコードから完全に排除し、OrcaRouterへマネージド化できた**。アプリ側にif文や難易度判定・信頼度判定のロジックは一切ない。model文字列を切り替えるだけで「判断を誰がするか」を切り替えられる | AWSには「モデル選択の判断をルーター側に委ねる」という概念自体がない。呼び出し側が必ず`modelId`を明示指定する設計のため、判断ロジック（難易度判定・信頼度評価・モデル切替）は常にアプリ/AgentCore側の自前実装になる。**マネージド化された「判断」そのものを買えない** |
| 4 | `orcarouter/fusion` `orcarouter/fusion-mini` `orcarouter/fusion-flash` が `/v1/models` に実在を確認済み（1章） | 「複数モデル並列実行→Judgeが1回答を選ぶ/統合する」という**判断プロセスごと**、既製の仮想モデルIDを指定するだけで呼び出せる可能性がある（中身の並列実行は未検証、3章参照） | 同等の並列実行+Judgeを実現するには、AgentCore等で複数モデルへの並列呼び出し・集約・Judge選定ロジックを自前で組む必要がある。ここでも「判断」はアプリ側の責務になる |
| 5 | `x-orca-resolved-model` / `x-orca-router` ヘッダー（3章） | **ルーターが下した「判断の結果」がAPIレスポンスの標準ヘッダーとして返る**。「今回どう判断したか」をアプリが問い合わせなくても可視化できる | Bedrockは呼び出し時に`modelId`を明示指定する方式のため、動的ルーティングという概念がなく、「実際に処理したモデル」を動的に返す仕組み自体が存在しない |

**まとめ**: 当初の比較表が指す本当の差分は、複数プロバイダを扱えること自体ではなく、**「どのモデルを使うべきか」という判断プロセスそのものをOrcaRouter側にマネージド化できる点**にある。今回の実装（2章）はこれを踏まえ、判断ロジックをアプリ側から完全に排除し、「判断をOrcaRouterに委ねるか（通常モード）／判断ごと省略するか（エコモード）」という軸に統一した。コード側の実装に加え、コンソール側の設定（許可モデル181個・Adaptive Gate戦略）も確認・調整済みで、（1）（2）はアーキテクチャとして裏付けが取れている。（4）の複雑プールへの実際の分岐条件のみ、LifeFork本番プロンプトでの検証が今後の課題として残る（6章）。それでも、**「判断ロジックを一切書かずに済む」というアーキテクチャ自体を実装・設定の両面で実現できており**、Bedrockでは同じ土俵に立つだけでもAgentCore等の判断ロジックを自前実装する必要がある点が、明確な差分と言える。

## 5. 現状の構成（まとめ）

| 用途 | 呼び出し箇所 | 通常モード（判断をOrcaRouterに委ねる） | エコモード（判断を省略） |
|---|---|---|---|
| ヒアリング質問生成 | `/api/interview` | `ORCAROUTER_MODEL` 固定 | 同左（mode概念なし） |
| 基礎調査（Pass1） | `/api/research` 内 | `ORCAROUTER_FACT_MODEL` 固定（ベストエフォート） | 同左 |
| 詳細生成（Pass2）1回目・2回目とも | `/api/research` 内 | `ORCAROUTER_MODEL_AUTO`（既定 `orcarouter/auto`） | `ORCAROUTER_MODEL`（固定・低コスト） |

## 6. 今後の拡張候補（未着手）

- [x] ~~コンソールで`auto`の候補モデルプールをqwen系以外に拡張する~~ → 確認済み。すでに`anthropic/*, openai/gpt-4o, google/*`等181モデルが許可されていた
- [ ] **LifeForkの本番Pass2プロンプト（`lib/PromptBuilder.ts`が組み立てる実際のリクエスト）で、複雑プール（`gpt-5.6-terra`/`claude-opus-4.8`/`claude-fable-5`）へ実際に分岐するか検証する**（1.3節の通り、短文の人工テストでは未確認）
- [ ] 候補モデルプールから search系モデル（`*-search-preview`等、出力トークン上限で問題あり）を除外できるか確認する
- [ ] `orcarouter/fusion` が実際に複数モデル並列実行＋Judgeを行っているか、レスポンス内容を詳しく検証する（現状はresolved-modelが単一モデル名で返るため未確認）
- [ ] Pass2「並列実行+Judge」を高難度ケースのみ限定適用（コスト・レイテンシが重いため対象を絞る。Vercel `maxDuration=120` に収まるかの実測も必要）
- [ ] フロントUIに `X-LifeFork-Resolved-Model` を表示する演出（3章）

## 7. スケジュール感（ハッカソン提出 8/15想定）

コード（Step1・2、選択モデル可視化ヘッダー）とコンソール設定（許可モデル・Adaptive Gate戦略、簡単プールの学習完了）の両方が揃い、**提出可能な状態**。複雑プールへの実分岐検証（並列+Judge含む）は本ドキュメントに残し、提出後の拡張候補とする。
