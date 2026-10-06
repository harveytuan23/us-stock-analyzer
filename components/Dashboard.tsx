"use client";
import { useCallback, useEffect, useState } from "react";
import StockChart from "./StockChart.tsx";
import type { StockData } from "@/lib/types.ts";
import { formatBig, type Analysis, type Verdict } from "@/lib/analysis.ts";

export type Result = StockData & { analysis: Analysis };
type Tab = "tech" | "fund" | "strategy";

const QUICK = ["AAPL", "NVDA", "MSFT", "TSLA", "AMZN", "GOOGL", "META", "SPY"];
const VERDICT: Record<Verdict, string> = { bull: "偏多", bear: "偏空", neutral: "中性" };

const money = (v: number) => `$${v.toFixed(2)}`;
const pctStr = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)}%`;

export default function Dashboard({ load, banner, nav, quick = QUICK }: {
  load: (symbol: string) => Promise<Result>;
  banner?: React.ReactNode;
  nav?: React.ReactNode;
  quick?: string[];
}) {
  const [input, setInput] = useState("");
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("strategy");

  const run = useCallback(async (sym: string) => {
    const s = sym.trim().toUpperCase();
    if (!s) return;
    setLoading(true);
    setError("");
    try {
      setData(await load(s));
      setInput(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    const fromUrl = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("symbol") : null;
    run(fromUrl ?? quick[0]);
  }, [run, quick]);

  const a = data?.analysis;
  const f = data?.fundamentals;

  return (
    <main className="wrap">
      <header className="top">
        <h1>美股老手分析台</h1>
        {nav}
        <form onSubmit={(e) => { e.preventDefault(); run(input); }} className="search">
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="輸入代號，例如 NVDA" aria-label="股票代號" />
          <button disabled={loading}>{loading ? "分析中…" : "分析"}</button>
        </form>
        <div className="quick">
          {quick.map((q) => <button key={q} onClick={() => run(q)} className={data?.symbol === q ? "on" : ""}>{q}</button>)}
        </div>
      </header>
      {banner}
      {error && <p className="error">{error}</p>}

      {data && a && f && (
        <>
          <section className="quote">
            <div>
              <div className="sym">{data.symbol} <span className="name">{f.name}</span></div>
              <div className="meta">{[f.sector, f.industry].filter(Boolean).join(" · ")}</div>
            </div>
            <div className="px">
              <span className="big">{money(a.technical.price)}</span>
              <span className={a.technical.change1d >= 0 ? "up" : "down"}>{pctStr(a.technical.change1d)}</span>
            </div>
            <dl className="stats">
              <div><dt>1個月</dt><dd className={a.technical.change1m >= 0 ? "up" : "down"}>{pctStr(a.technical.change1m)}</dd></div>
              <div><dt>1年</dt><dd className={a.technical.change1y >= 0 ? "up" : "down"}>{pctStr(a.technical.change1y)}</dd></div>
              <div><dt>市值</dt><dd>{formatBig(f.marketCap)}</dd></div>
              <div><dt>52週區間</dt><dd>{f.fiftyTwoWeekLow?.toFixed(2) ?? "—"} – {f.fiftyTwoWeekHigh?.toFixed(2) ?? "—"}</dd></div>
            </dl>
          </section>

          <section className="scores">
            <Score label="策略建議" value={a.strategy.stance} sub={`綜合 ${a.strategy.composite} 分`} tone={a.strategy.composite >= 58 ? "bull" : a.strategy.composite >= 45 ? "neutral" : "bear"} />
            <Score label="技術面" value={a.technical.trend} sub={`${a.technical.score > 0 ? "+" : ""}${a.technical.score}`} tone={a.technical.score > 15 ? "bull" : a.technical.score < -15 ? "bear" : "neutral"} />
            <Score label="基本面" value={`${a.fundamental.grade} 級`} sub={`${a.fundamental.score} 分`} tone={a.fundamental.score >= 65 ? "bull" : a.fundamental.score >= 45 ? "neutral" : "bear"} />
          </section>

          <StockChart candles={data.candles} levels={a.strategy} />
          <p className="legend"><i style={{ background: "#f59e0b" }} />MA20 <i style={{ background: "#3b82f6" }} />MA50 <i style={{ background: "#a855f7" }} />MA200 <i style={{ background: "#94a3b8" }} />布林通道 · 下方依序為成交量、RSI、MACD</p>

          <nav className="tabs" role="tablist">
            {([["strategy", "策略建議"], ["tech", "技術分析"], ["fund", "基本面分析"]] as const).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
            ))}
          </nav>

          {tab === "strategy" && (
            <section className="panel">
              <div className="levels">
                <Level label="進場區間" value={`${money(a.strategy.entryLow)} – ${money(a.strategy.entryHigh)}`} />
                <Level label="停損" value={money(a.strategy.stopLoss)} tone="bear" />
                <Level label="目標價 1" value={money(a.strategy.target1)} tone="bull" />
                <Level label="目標價 2" value={money(a.strategy.target2)} tone="bull" />
                <Level label="風險報酬比" value={`1 : ${a.strategy.riskReward.toFixed(1)}`} />
                {f.targetMeanPrice && <Level label={`分析師目標均價 (${f.numberOfAnalystOpinions ?? "?"} 位)`} value={money(f.targetMeanPrice)} />}
              </div>
              <h3>老手觀點</h3>
              {a.strategy.commentary.map((c, i) => <p key={i}>{c}</p>)}
              <h3>部位控管</h3>
              <p>{a.strategy.positionHint}</p>
              <h3>風險提醒</h3>
              <ul>{a.strategy.risks.map((r, i) => <li key={i}>{r}</li>)}</ul>
            </section>
          )}

          {tab === "tech" && (
            <section className="panel">
              <div className="levels">
                <Level label="近60日支撐" value={money(a.technical.support)} />
                <Level label="近60日壓力" value={money(a.technical.resistance)} />
                <Level label="ATR(14) 日波動" value={money(a.technical.atr)} />
              </div>
              <table className="sig">
                <thead><tr><th>指標</th><th>數值</th><th>判讀</th><th>解讀</th></tr></thead>
                <tbody>
                  {a.technical.signals.map((s) => (
                    <tr key={s.name}><td>{s.name}</td><td className="mono">{s.value}</td><td><Tag v={s.verdict} /></td><td>{s.note}</td></tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {tab === "fund" && (
            <section className="panel">
              {f.summary && <details><summary>公司簡介</summary><p>{f.summary}</p></details>}
              <table className="sig">
                <thead><tr><th>面向</th><th>項目</th><th>數值</th><th>判讀</th><th>解讀</th></tr></thead>
                <tbody>
                  {a.fundamental.items.map((it) => (
                    <tr key={it.label}><td>{it.group}</td><td>{it.label}</td><td className="mono">{it.value}</td><td><Tag v={it.verdict} /></td><td>{it.note}</td></tr>
                  ))}
                </tbody>
              </table>
              {a.fundamental.items.length === 0 && <p>這檔標的（例如 ETF）沒有可用的財報數據。</p>}
            </section>
          )}

          <footer className="foot">
            資料來源：{data.source}，更新於 {new Date(data.asOf).toLocaleString("zh-TW")}。本站內容為規則式模型自動產生，僅供研究參考，不構成投資建議；投資前請自行判斷並承擔風險。
          </footer>
        </>
      )}
    </main>
  );
}

function Score({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: Verdict }) {
  return <div className={`score ${tone}`}><span>{label}</span><strong>{value}</strong><small>{sub}</small></div>;
}
function Level({ label, value, tone }: { label: string; value: string; tone?: Verdict }) {
  return <div className={`level ${tone ?? ""}`}><span>{label}</span><strong>{value}</strong></div>;
}
function Tag({ v }: { v: Verdict }) {
  return <span className={`tag ${v}`}>{VERDICT[v]}</span>;
}
