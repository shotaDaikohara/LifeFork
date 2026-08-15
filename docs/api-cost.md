# API利用設計（モデル・コスト）

対象範囲: LLM（OrcaRouter経由）の呼び出しコストのみ。`handoff`（エージェント・専門家への相談リンク）や`paywall`（追加リサーチの課金）は`disabled`のモック実装であり本ドキュメントの対象外（[components/result/ActionSection.tsx](../components/result/ActionSection.tsx)）。性能グレード（松竹梅＝モデル選択・リサーチ構成）とは独立した別軸の未実装機能であり、モデルを松にしても自動的に実装されるものではない。

前提: LLM呼び出しは全て OrcaRouter（OpenAI互換ルーター、`baseURL: https://api.orcarouter.ai/v1`）経由。料金は **OrcaRouterが接続先モデルのOpenAI公式価格に準拠している前提**で試算する（OrcaRouter独自の上乗せ有無は未確認）。モデル価格は `GET /v1/models`（OrcaRouter）のレスポンスから取得（2026-08-14）。

**Web Search呼び出し課金は実在する（OpenAI公式 [developers.openai.com/api/docs/pricing](https://developers.openai.com/api/docs/pricing) の Tools セクションで確認済み）**。ツール種別・モデル区分ごとに料金が分かれており、本ドキュメントで使うモデルには以下が対応する:

| ツール区分 | 該当モデル | 料金 |
|---|---|---|
| Web search preview（非推論モデル向け） | `gpt-4o-search-preview` / `gpt-4o-mini-search-preview`（梅で使用） | **$25.00 / 1,000回** ＋ Search content tokensは無料 |
| Web search（全モデル共通）/ Web search preview（推論モデル向け、gpt-5系含む） | `gpt-5-search-api`（竹・松で使用） | **$10.00 / 1,000回** ＋ Search content tokensは通常のトークン単価で課金 |

`GET /v1/models`（OrcaRouter）のレスポンスにはこの課金が別項目として出てこない（`pricing`オブジェクトは`prompt`/`completion`の2項目のみ）が、これはOrcaRouterの料金ページ（「billed per token at the upstream provider's published rate」「we add nothing on top of token costs」）が指す“トークン課金”とは別枠のツール利用料であり、上流（OpenAI）側で実在が確認できる以上、**本ドキュメントでは課金ありを前提とする**。OrcaRouterがこの分をそのまま転嫁しているかどうかの最終確認（実際の請求）は未了。

**妥当性チェック**: $10.00〜$25.00 / 1,000回（1回あたり$0.01〜$0.025、≒1.5〜3.75円）という単価は、他社の検索API（Google Custom Search JSON API: $5/1,000クエリ＝$0.005/回、SerpApi: 目安$0.01/回程度）と比べて同水準〜やや高めであり、特別に安すぎる数字ではない。

## 1. 利用モデルと切り替え方法

| 用途 | 呼び出し箇所 | 環境変数 | 現在値 | Web Search |
|---|---|---|---|---|
| ヒアリング質問生成 | `/api/interview` | `ORCAROUTER_MODEL` | `openai/gpt-4o-mini` | なし |
| 基礎調査（Pass1、mode: eco） | `/api/research` 内 | `ORCAROUTER_FACT_MODEL` | `openai/gpt-4o-mini-search-preview` | あり（Chat Completions `web_search_options`） |
| 基礎調査（Pass1、mode: normal） | `/api/research/step`（クライアントがポーリング） | `ORCAROUTER_AGENTIC_MODEL` | `openai/gpt-5.1` | あり（Responses API `web_search`ツール、[docs/pass1-agentic-search-design.md](pass1-agentic-search-design.md)） |
| 詳細生成（Pass2） | `/api/research` または `/api/research/step`（最終ステップ内） | `ORCAROUTER_MODEL` または `ORCAROUTER_MODEL_AUTO`（mode: normal） | `openai/gpt-4o-mini` / `orcarouter/auto` | なし（search系モデルの出力上限〈実測1,000〜1,500トークン〉を回避するため意図的に無効） |

**切り替え方法**: Vercel Environment Variables の該当変数を書き換えて再デプロイする（コード変更不要、`lib/OrcaRouterClient.ts` が実行時に読む）。`ORCAROUTER_FACT_MODEL` を空にするとPass1（mode: eco）自体をスキップする設計。

## 2. リサーチ設計（Pass1 / Pass2の役割分担）

- **Pass1**: Web検索を行い、事実・相場・制度情報を収集する担当。検索を行うのはこのステップのみ。
- **Pass2**（`prompts/research_system.md`）: Pass1が集めた事実と一般知識のみを根拠に、比較結果（`ResearchResult`）を構造化生成する担当。Pass2自身は検索しない（詳細: [docs/pass1-agentic-search-design.md](pass1-agentic-search-design.md) 3.2節、統合を検証した上で不採用と判断）。

Pass1の実装は `mode`（`eco` / `normal`）によって異なる。

### mode: "eco" — 単一呼び出し（`app/api/research/route.ts`）

`prompts/research_facts.md` を1回のAPI呼び出しに渡し、ベースラインの事実と代替ルートの探索をまとめて任せる。低コストだがカバレッジは不安定（4回試行して5対象すべてに実在の出典が付いた回は0回）。同期の単一リクエストで完結する。

### mode: "normal" — エージェント型検索・非同期ポーリング方式（`lib/researchAgent.ts` + `app/api/research/step/route.ts`）

検索回数をアプリ側で固定設計せず、`Responses API` の `web_search` ツールにモデル自身が何回検索するかを委ねる。検索ターン（Web Search可）と自己判定ターン（Web Searchなし・構造化出力のみ）を交互に呼び、モデル自身が「もう十分か／まだ何が足りないか」を判定して停止する。詳細設計・実測根拠は [docs/pass1-agentic-search-design.md](pass1-agentic-search-design.md) を参照。

**アーキテクチャ（2026-08-15改訂）**: 「人間が本気で人生設計をするなら100回以上の検索を行うはず」という要求水準に対し、**下限サイクル数をアプリ側で強制する設計は採用していない**（一度実装したが、自己判定を無視して回数を強制するのは設計原則に反するとして撤回した）。代わりに**自己判定の基準を厳格化**した:

- カテゴリ網羅に加えて、(1)条件の異なる複数の実例（成功例・苦戦した例、都市部・地方など）、(2)重要な数値の複数情報源による裏付け、(3)3箇所以上の具体的な地域比較、(4)楽観・標準・悲観の複数シナリオでの収支、(5)失敗・撤退リスクの定量化、(6)3〜5年以上の長期見通し、を要求する。1つでも満たさなければ`missing_categories`に具体的に列挙させる。
- 検索回数はこの厳しい基準を満たすまで**自然に**継続した結果であり、アプリ側の目標値ではない。上限（`STEP_MAX_CYCLES = 30`）はコスト・レイテンシの安全弁としてのみ存在する。
- **検索回数の単位に注意**: `web_search_call`アイテムの個数（イベント数）と、実際のクエリ数（レスポンスの`tool_usage.web_search.num_requests`）は別物で、1イベントあたり平均4クエリを内包する。検索回数は必ず`num_requests`基準で数える。
- 収束後、会話全体を抽出ターンで軽量な `facts`/`sources` に変換してPass2へ渡す。

**非同期化した理由**: 上記の基準で実際に深掘りすると、1サイクル（検索ターン＋判定ターン）あたり実測約50〜120秒かかり、Web Search実行回数が実測5サイクル時点で28回（`num_requests`基準）に達してもまだ収束しない（3章参照、収束時の最終値は計測中）。想定される全サイクル数まで単一の同期HTTPリクエストで待たせると、Vercelの1回の関数実行時間（Fluid Compute有効時でも最大300秒）を大幅に超える。そのため**1呼び出し=1サイクルの粒度に分割し、クライアント（`app/researching/page.tsx`）が`POST /api/research/step`を繰り返しポーリングする**方式にした。サーバー側に新たな永続化（KV/DB）は持ち込まず、状態（`previousResponseId`・サイクル数・累積クエリ数・次の指示文）は毎回レスポンスとしてクライアントへ返し、次回リクエストにそのまま含めてもらう。

## 3. トークン数の設計根拠（Pass2、スキーマ構造に基づく実測内訳）

`prompts/research_system.md` と `types/research.ts`（`researchResultSchema`）を `tiktoken`（`o200k_base`）で計測。Pass2に渡す入力（システムプロンプト＋JSON Schema＋ヒアリング回答＋Pass1の事実）とスキーマが要求する出力構造はモデルを変えても同一のため、**入出力トークン数の土台は全グレード共通**として扱う。

### 入力（リクエストごとに固定される部分）

| 構成要素 | トークン数 | 備考 |
|---|---|---|
| `research_system.md`（システムプロンプト本文） | 5,758 | 固定 |
| `researchResultSchema`（JSON Schema定義、`response_format`で毎回送信） | 2,349 | 固定 |
| ヒアリング回答・プロフィール・Pass1の事実 | 約120〜300（mode: eco）／数百〜1,000超（mode: normal、Pass1のfacts量に応じて増加） | 変動 |
| **合計** | **約8,200〜8,300（mode: eco基準）** | 実測値8,226と整合。固定分8,107はプロンプトキャッシュ対象（実測でも7,040トークンがキャッシュ扱い） |

### 出力（生成されたJSONの構造別トークン数）

| フィールド | トークン数 | 出力全体比 | スキーマ上の制約（`types/research.ts`） |
|---|---|---|---|
| `summary` | 167 | 4% | 固定4項目（fitScore/availableFunds/survivalPeriod/relevantExperience） |
| `currentPath` | 682 | 16% | 「今のまま」1件、`yearlyScenes`(y1/y3/y5)必須 |
| `targetPaths`×3 | 3,164 | **72%** | `targetPaths.length(3)` で必ず3件固定。1件あたり約1,000〜1,100トークン |
| `checks` | 138 | 3% | `min(3).max(8)` |
| `sources` | 212 | 5% | 可変 |
| **合計** | **約4,400〜5,300** | | `targetPaths.length(3)`固定により出力の7割超を`targetPaths`が占める |

## 4. 性能グレード比較（松竹梅）— TOBE（2026-08-15改訂版）

**竹グレードは非同期ポーリング方式に変わったため、想定コスト・所要時間が大きく変わる。以下は暫定値であり、収束までの完全な実測（進行中）が終わり次第、確定値に更新する。**

| グレード | 構成 | 想定所要時間 | Pass1 実クエリ数（`num_requests`基準） | ヒアリング / Pass1 / Pass2 | 1回あたり（暫定） | 現状比 |
|---|---|---|---|---|---|---|
| 🍃 梅（エコ性能・現行） | mode: eco（単一同期呼び出し） | 約1分 | **0〜1回**（不安定。下記参照） | gpt-4o-mini（固定） / gpt-4o-mini-search-preview（固定） / gpt-4o-mini（固定） | **約$0.030（≒4.5円）** | 1x |
| 🎋 竹（推奨性能） | mode: normal（非同期ポーリング、厳格化した自己判定基準で自然収束） | **未確定（5サイクル時点で28回・約8分経過してもまだ継続中。収束すれば数十分規模の見込み）** | **未確定（5サイクル時点で28回、収束前）** | gpt-5.1（固定） / gpt-5.1（固定） / `orcarouter/auto`※ | **未確定（暫定下限 約$0.6〜1.0、下記参照）** | 未確定 |
| 🌲 松（最高性能） | mode: normal ＋ Pass2をgpt-5.5-proに固定 | 竹と同じ＋Pass2分 | 竹と同じ | gpt-5.1（固定） / gpt-5.1（固定） / gpt-5.5-pro（固定・提案） | 竹の暫定値＋Pass2差額（$1.2〜2.2） | 未確定 |

※ 竹（`mode: "normal"`）のPass2は実際には固定モデルではなく `ORCAROUTER_MODEL_AUTO`（既定 `orcarouter/auto`）を使い、「どのモデルを割り当てるか」の判断自体をOrcaRouterのルーティングに委ねる設計（[README.md](../README.md) 参照）。表中の「gpt-5.1」はauto routingが実際に何を選ぶか確定できないため、**コスト試算のための代表値（想定される着地点）** であり、固定の指定ではない。

Web Search課金は冒頭の表の通りモデル区分で単価が異なる: 梅（`gpt-4o-mini-search-preview`）は$25/1,000回、竹・松（`gpt-5.1`、推論モデル区分）は$10/1,000回（**この区分適用は未確認の仮定**、[docs/pass1-agentic-search-design.md 5章](pass1-agentic-search-design.md)のチェックリスト参照）。

### 🍃 梅（エコ性能、変更なし）

| 呼び出し | API呼び出し回数 | うちWeb Search回数 | input | output | 料金 |
|---|---|---|---|---|---|
| ヒアリング生成 | 1回 | 0回 | 1,568 | 248 | $0.0004 |
| 基礎調査 | 1回 | 1回（実測は0〜1回、不安定） | 961 | 763 | $0.0256 |
| 詳細生成 | 1回 | 0回 | 8,226（中7,040がキャッシュ） | 5,292 | $0.0039 |
| **合計** | **3回** | **1回** | | | **約$0.030** |

### 🎋 竹（推奨性能）— 厳格化した自己判定基準での実測（進行中）

`lib/OrcaRouterClient.ts`の判定基準を、単なるカテゴリ網羅から「複数実例・複数情報源での裏付け・3地域以上の比較・複数シナリオの収支・リスク定量化・長期見通し」を要求する内容に強化した（[docs/pass1-agentic-search-design.md](pass1-agentic-search-design.md)）。下限サイクル数はアプリ側で強制しない。実測（テーマ: independence「いちご農園をやりたい」、`gpt-5.1`）:

| サイクル | 累積実クエリ数（`num_requests`） | 所要時間（このサイクル） | 判定 |
|---|---|---|---|
| 1 | 4 | 47.9秒 | 不十分 |
| 2 | 12 | 110.4秒 | 不十分 |
| 3 | 20 | 113.1秒 | 不十分 |
| 4 | 24 | 121.3秒 | 不十分 |
| 5 | 28 | 104.3秒 | 不十分 |
| 6以降 | 計測中 | — | — |

5サイクル時点の平均ペース: 約99秒/サイクル、約5.6実クエリ/サイクル。このペースが続くと仮定すると、実クエリ数100回到達には約18サイクル・約30分、収束（`sufficient: true`）はそれ以降になる可能性がある。**これはあくまで途中経過からの外挿であり、確定値ではない。**

**暫定コスト試算（5サイクル分の実測トークンを基に外挿、確定ではない）**: 竹の旧実測（3サイクル・82,516 input / 12,448 output トークンで約$0.31〜0.37）から、サイクル数が5〜8倍程度に伸びる想定で単純外挿すると、Pass1のトークン課金だけで**$1.5〜2.5程度**になる可能性がある。ただし判定プロンプトの厳格化で1サイクルあたりの入力トークンも増えているため、正確な値は収束後の実測でしか確定できない。**現時点でこれ以上精度の高い金額を示すのは根拠不足であり、あえて出さない。**

### 🌲 松（最高性能）

Pass2のみカタログ最上位の推論モデル `gpt-5.5-pro`（$30/$180 per Mトークン）に置き換える。ヒアリング・Pass1は竹の（未確定な）値と同じ。Pass2差額は以下の通り変わらない:

Pass2: 入力8,300×$30/1M=$0.249、出力5,300×$180/1M=$0.954 → **$1.20**（可視出力のみの下限値）。
推論系モデルは可視出力の裏で「隠れ思考トークン」も課金されるケースがあるため、可視出力の2倍を仮置きした上限値も併記: 出力10,600×$180/1M=$1.908 → Pass2で**$2.16**（この倍率は未実測の目安）。

**運用上の注意**: 非同期ポーリング方式（`app/api/research/step/route.ts`）は1呼び出し=1サイクルのため、Vercelの1回の関数実行時間（Fluid Compute有効時でも最大300秒）には収まる設計だが、**全体の所要時間（数十分規模）はユーザー体験として許容できるか別途検討が必要**。`maxDuration`は280秒に設定済みだが、これはVercelのFluid Computeが有効であることが前提。**デプロイ前にVercelのプロジェクト設定でFluid Computeが有効になっているか必ず確認すること**（未確認・未設定の場合、本番でタイムアウトする）。

## 5. OrcaRouterモデル別価格（参考、2026-08-14時点、$/1Mトークン）

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
