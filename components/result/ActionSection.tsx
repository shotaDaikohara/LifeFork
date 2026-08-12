"use client";

import { useRouter } from "next/navigation";
import type { Goal, ResearchResult, TargetPath } from "@/types/research";
import { clearResultAndError } from "@/lib/researchSession";

const HANDOFF_BY_GOAL: Record<Goal["type"], { icon: string; title: string; sub: string; bg: string }[]> = {
  career_change: [
    { icon: "🤝", title: "転職エージェント相談", sub: "希望条件に合う求人を紹介してもらう", bg: "var(--mint-lt)" },
    { icon: "💬", title: "業界の人に話を聞く", sub: "OB訪問・カジュアル面談サービス", bg: "var(--sun-lt)" },
    { icon: "📚", title: "学びなおしの給付金", sub: "教育訓練給付で受講料が戻ります", bg: "var(--sky-lt)" },
  ],
  independence: [
    { icon: "🏦", title: "開業資金の相談", sub: "日本政策金融公庫などの創業融資", bg: "var(--sky-lt)" },
    { icon: "📋", title: "開業に使える補助金", sub: "地域・業種ごとの補助制度を探す", bg: "var(--sun-lt)" },
    { icon: "🧑‍🏫", title: "先輩オーナーに話を聞く", sub: "同じ道を歩んだ人の実例を知る", bg: "var(--mint-lt)" },
  ],
};

export function ActionSection({
  result,
  curPath,
  pathColors,
  goal,
}: {
  result: ResearchResult;
  curPath: TargetPath;
  pathColors: Record<string, string>;
  goal: Goal;
}) {
  const router = useRouter();
  const handoffItems = HANDOFF_BY_GOAL[goal.type];

  return (
    <section className="rsec section" id="r4">
      <div className="sec-h">
        <div className="no">4</div>
        <h2>じゃあ、何から始めましょうか</h2>
      </div>

      <div className="actfor">
        <span className="af-nm">
          <i style={{ background: pathColors[curPath.id] }} />
          {curPath.title}
        </span>
        を選んだ場合
        {curPath.recommended && <span className="pill o" style={{ marginLeft: 8 }}>⭐️ AIのおすすめ</span>}
      </div>

      <div className="firststep">
        <div className="lb">まずはこれだけ</div>
        <div className="big">{curPath.firstStep.headline}</div>
        <div className="txt">{curPath.firstStep.body}</div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3 style={{ marginBottom: 2 }}>そのあとの流れ</h3>
        <div className="tl">
          {curPath.plan.map((step, i) => (
            <div className="tlrow" key={i}>
              <div className="w">{step.period}</div>
              <div className="t">
                <b>{step.title}</b>
                <div className="small">{step.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 22 }}>
        <h3 style={{ fontSize: 16, marginBottom: 2 }}>もう少し先まで進みたくなったら</h3>
        <div className="handoff">
          {handoffItems.map((h) => (
            <button className="hoff" key={h.title} disabled title="このデモでは連携していません">
              <div className="ic" style={{ background: h.bg }}>
                {h.icon}
              </div>
              <div>
                <b>{h.title}</b>
                <div className="small">{h.sub}</div>
              </div>
              <div className="go">›</div>
            </button>
          ))}
        </div>
      </div>

      <div className="paywall" style={{ marginTop: 22 }}>
        <span className="pill o">今月の無料ぶんを使いました</span>
        <h3 style={{ fontSize: 18, margin: "6px 0 8px" }}>別のテーマも調べてみますか？</h3>
        <p className="small" style={{ marginBottom: 16 }}>
          「カフェ」「地元にUターン」など、
          <br />
          もう1本ぶんのリサーチは <b style={{ color: "var(--ink)" }}>300円</b> です。
        </p>
        <button className="btn auto" disabled title="このデモでは課金機能は実装していません">
          もう1つ調べる
        </button>
        <p className="tiny" style={{ marginTop: 12 }}>来月1日になると、また無料で1回使えます</p>
      </div>

      {result.sources.length > 0 && (
        <div className="card" style={{ marginTop: 22 }}>
          <h3 style={{ marginBottom: 10 }}>根拠・参考情報</h3>
          <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
            {result.sources.map((s, i) => (
              <li key={i} className="small">
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="textlink" style={{ color: "var(--orange-dk)" }}>
                  {s.title}
                </a>
                <span style={{ color: "var(--muted)" }}> — {s.usedFor}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ textAlign: "center", marginTop: 26 }}>
        <button
          className="btn ghost auto"
          onClick={() => {
            clearResultAndError();
            router.push("/");
          }}
        >
          最初からやりなおす
        </button>
        <p className="tiny" style={{ marginTop: 20, maxWidth: 520, marginLeft: "auto", marginRight: "auto" }}>
          ※ 「いま向いてる度」や条件シミュレーションの確率は、AIによる目安の推定であり、厳密な計算に基づくものではありません。
          <br />
          {result.sources.length === 0 && "根拠として提示できる参考情報は見つかりませんでした。"}
        </p>
      </div>
    </section>
  );
}
