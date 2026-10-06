// Usage: node scripts/strategies.ts [--synthetic]
// Backtests evidence-based monthly strategies over ~15 years and prints a report.
// Rules use textbook parameters fixed in advance (no tuning); 2011–2020 is the
// in-sample period and 2021 onward is the out-of-sample check.
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import YahooFinance from "yahoo-finance2";
import { align, buyHold, equalWeight, momentum, run, stats, trendFilter, withMarketFilter, type Strategy } from "../lib/portfolio.ts";
import { syntheticCandles } from "../lib/synthetic.ts";
import type { Candle } from "../lib/types.ts";
import { SECTORS, SP100 as STOCKS } from "../lib/universe.ts";

const FIRST = "2010-01-01";
const SPLIT = "2021-01-01";

const synthetic = process.argv.includes("--synthetic");
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

async function load(symbol: string, i: number): Promise<Candle[]> {
  if (synthetic) return syntheticCandles(i + 1, 100, 0.0003 + (i % 7) * 0.0001, 0.016, 252 * 16);
  const chart = await yf.chart(symbol, { period1: new Date(FIRST), interval: "1d", return: "array" });
  return chart.quotes
    .filter((q) => q.close != null)
    .map((q) => {
      const c = (q.adjclose ?? q.close)!;
      return { time: q.date.toISOString().slice(0, 10), open: c, high: c, low: c, close: c, volume: q.volume ?? 0 };
    });
}

const all = ["SPY", ...SECTORS, ...STOCKS];
const data: Record<string, Candle[]> = {};
const failed: string[] = [];
for (const [i, s] of all.entries()) {
  try {
    data[s] = await load(s, i);
  } catch (e) {
    failed.push(s);
    console.log(`✗ ${s}: ${e instanceof Error ? e.message : e}`);
  }
}
if (!data.SPY) throw new Error("SPY could not be loaded");
const stocks = STOCKS.filter((s) => data[s]);
const sectors = SECTORS.filter((s) => data[s]);
const u = align(data.SPY, data);
const start = u.dates.findIndex((d) => d >= (synthetic ? u.dates[260] : "2011-01-01"));
const split = synthetic ? Math.floor((start + u.dates.length) * 0.6) : u.dates.findIndex((d) => d >= SPLIT);
const end = u.dates.length - 1;

const strategies: { key: string; name: string; desc: string; s: Strategy }[] = [
  { key: "spy", name: "S&P 500 買進持有", desc: "基準：買 SPY 放著不動", s: buyHold("SPY") },
  { key: "ew", name: "S&P 100 等權重", desc: "基準：100 檔平均分配，每月再平衡", s: equalWeight(stocks) },
  { key: "spyTrend", name: "S&P 500 + 200日線濾網", desc: "SPY 月底在 200 日線上就持有，否則轉現金", s: trendFilter("SPY") },
  { key: "mom10", name: "個股動能 Top 10", desc: "每月買過去 12 個月（扣最近 1 個月）漲最多的 10 檔", s: momentum(stocks, 10) },
  { key: "mom10f", name: "個股動能 Top 10 + 大盤濾網", desc: "同上，但 SPY 跌破 200 日線時全數轉現金", s: withMarketFilter(momentum(stocks, 10), "SPY") },
  { key: "sec3", name: "類股 ETF 動能 Top 3", desc: "每月買動能最強的 3 個類股 ETF", s: momentum(sectors, 3) },
  { key: "sec3f", name: "類股 ETF 動能 Top 3 + 大盤濾網", desc: "同上，加大盤濾網", s: withMarketFilter(momentum(sectors, 3), "SPY") },
  { key: "mom5", name: "（穩健度）個股動能 Top 5", desc: "檢查持股數改變後結果是否依然成立", s: momentum(stocks, 5) },
  { key: "mom20", name: "（穩健度）個股動能 Top 20", desc: "同上", s: momentum(stocks, 20) },
];

const results = strategies.map((st) => {
  const r = run(u, st.s, start);
  const yearly: Record<string, number> = {};
  let prevIdx = start;
  for (let t = start + 1; t <= end; t++) {
    if (t === end || u.dates[t + 1].slice(0, 4) !== u.dates[t].slice(0, 4)) {
      yearly[u.dates[t].slice(0, 4)] = r.equity[t] / r.equity[prevIdx] - 1;
      prevIdx = t;
    }
  }
  const last = r.holdings[r.holdings.length - 1];
  return {
    ...st,
    full: stats(u.dates, r.equity, start, end),
    inSample: stats(u.dates, r.equity, start, split - 1),
    outSample: stats(u.dates, r.equity, split - 1, end),
    yearly,
    turnoverPerYear: r.turnover / stats(u.dates, r.equity, start, end).years,
    latest: last,
  };
});

// What each strategy would hold if the month ended today (preview only).
const today = end;
const preview = Object.fromEntries(strategies.map((st) => [st.key, st.s(u, today)]));

const p = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;
const md: string[] = [];
md.push(`# 策略回測${synthetic ? "（模擬資料）" : ""}`, "");
md.push(`期間 ${u.dates[start]} 至 ${u.dates[end]}；樣本內 ${u.dates[start]}–${u.dates[split - 1]}，樣本外 ${u.dates[split]} 起。個股 ${stocks.length} 檔、類股 ETF ${sectors.length} 檔${failed.length ? `；無法取得 ${failed.join(", ")}` : ""}。每單位換手扣 0.1% 成本。`, "");
for (const [label, key] of [["全期間", "full"], ["樣本內（2011–2020）", "inSample"], ["樣本外（2021–今）", "outSample"]] as const) {
  md.push(`## ${label}`, "", "| 策略 | 年化報酬 | 年化波動 | 夏普值 | 最大回撤 | 總報酬 |", "|---|---:|---:|---:|---:|---:|");
  for (const r of results) {
    const s = r[key];
    md.push(`| ${r.name} | ${p(s.cagr)} | ${p(s.vol)} | ${s.sharpe.toFixed(2)} | ${p(s.maxDD)} | ${p(s.total, 0)} |`);
  }
  md.push("");
}
const years = Object.keys(results[0].yearly);
md.push("## 逐年報酬", "", `| 策略 | ${years.join(" | ")} |`, `|---|${years.map(() => "---:").join("|")}|`);
for (const r of results) md.push(`| ${r.name} | ${years.map((y) => p(r.yearly[y] ?? NaN, 0)).join(" | ")} |`);
md.push("", "## 若今天是月底，各策略會持有", "");
for (const st of strategies.slice(2)) {
  const w = preview[st.key];
  md.push(`- ${st.name}：${Object.keys(w).length ? Object.keys(w).join(", ") : "現金"}`);
}
md.push("", "換手率（每年）：" + results.map((r) => `${r.name} ${r.turnoverPerYear.toFixed(1)}`).join("、"));

mkdirSync("reports", { recursive: true });
writeFileSync("reports/strategies.md", md.join("\n"));
writeFileSync("reports/strategies.json", JSON.stringify({ dates: [u.dates[start], u.dates[split], u.dates[end]], failed, results, preview }, null, 1));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join("\n"));
console.log("\n" + md.join("\n"));
