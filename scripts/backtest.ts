// Usage: node scripts/backtest.ts [--synthetic] [SYMBOL ...]
// Writes reports/backtest.md and reports/backtest.json.
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import YahooFinance from "yahoo-finance2";
import { backtestSymbol, summarize, DEFAULT_OPTIONS, type SymbolResult } from "../lib/backtest.ts";
import { syntheticCandles } from "../lib/synthetic.ts";
import type { Candle } from "../lib/types.ts";

const DEFAULT_SYMBOLS = [
  "SPY", "QQQ", "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "AVGO",
  "JPM", "V", "MA", "BAC", "UNH", "JNJ", "LLY", "PFE", "XOM", "CVX",
  "WMT", "COST", "KO", "PEP", "MCD", "NKE", "DIS", "HD", "CAT", "BA",
  "INTC", "AMD", "NFLX", "CRM", "ORCL",
];
const YEARS = 6; // 1 year of warm-up for MA200, then ~5 years of signals

const args = process.argv.slice(2);
const synthetic = args.includes("--synthetic");
const symbols = args.filter((a) => !a.startsWith("--"));
const list = symbols.length ? symbols : DEFAULT_SYMBOLS;

async function load(symbol: string, i: number): Promise<Candle[]> {
  if (synthetic) return syntheticCandles(i + 1, 100, 0.0004, 0.018, 252 * YEARS);
  const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
  const chart = await yf.chart(symbol, {
    period1: new Date(Date.now() - YEARS * 365.25 * 864e5),
    interval: "1d",
    return: "array",
  });
  return chart.quotes
    .filter((q) => q.open != null && q.high != null && q.low != null && q.close != null)
    .map((q) => {
      // Use split/dividend-adjusted prices so returns are total returns.
      const f = q.adjclose != null && q.close ? q.adjclose / q.close! : 1;
      return {
        time: q.date.toISOString().slice(0, 10),
        open: q.open! * f, high: q.high! * f, low: q.low! * f, close: q.close! * f,
        volume: q.volume ?? 0,
      };
    });
}

const results: SymbolResult[] = [];
const failed: string[] = [];
let start = "", end = "";
for (const [i, s] of list.entries()) {
  try {
    const candles = await load(s, i);
    if (candles.length < 400) throw new Error(`only ${candles.length} candles`);
    start = start && start < candles[250].time ? start : candles[250].time;
    end = end > candles[candles.length - 1].time ? end : candles[candles.length - 1].time;
    results.push(backtestSymbol(s, candles));
    console.log(`✓ ${s} (${candles.length} days)`);
  } catch (e) {
    failed.push(s);
    console.log(`✗ ${s}: ${e instanceof Error ? e.message : e}`);
  }
}
if (!results.length) {
  console.error("No symbols could be loaded.");
  process.exit(1);
}

const sum = summarize(results);
const p = (v: number, d = 1) => (Number.isFinite(v) ? `${(v * 100).toFixed(d)}%` : "—");
const sp = (v: number, d = 2) => (Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${(v * 100).toFixed(d)}%` : "—");
type Stat = { n: number; avg: number; winRate: number };

const md: string[] = [];
md.push(`# 回測報告${synthetic ? "（模擬資料）" : ""}`, "");
md.push(`期間 ${start} 至 ${end}，${results.length} 檔標的${failed.length ? `（無法取得：${failed.join(", ")}）` : ""}。`);
md.push(`只回測技術面；進場條件：技術分數 ≥ ${DEFAULT_OPTIONS.entryScore}，出場：分數 ≤ ${DEFAULT_OPTIONS.exitScore}、觸及停損或目標價 1；每筆來回成本 ${DEFAULT_OPTIONS.costBps / 100}%。`, "");

md.push("## 1. 技術分數能不能預測未來報酬", "");
md.push("| 技術分數區間 | 天數 | 5日後平均 | 20日後平均 | 20日後上漲機率 | 60日後平均 |", "|---|---:|---:|---:|---:|---:|");
for (const b of sum.buckets as unknown as ({ label: string } & Record<number, Stat>)[]) {
  md.push(`| ${b.label} | ${b[20].n} | ${sp(b[5].avg)} | ${sp(b[20].avg)} | ${p(b[20].winRate)} | ${sp(b[60].avg)} |`);
}
const base = sum.baseline as Record<number, Stat>;
md.push(`| **所有日子（基準）** | ${base[20].n} | ${sp(base[5].avg)} | ${sp(base[20].avg)} | ${p(base[20].winRate)} | ${sp(base[60].avg)} |`, "");

md.push("## 2. 個別技術訊號（20 日後）", "");
md.push("| 訊號 | 判讀偏多時 平均 / 上漲機率 | 判讀偏空時 平均 / 上漲機率 | 差距 |", "|---|---:|---:|---:|");
for (const s of sum.signals) {
  md.push(`| ${s.name} | ${sp(s.bull.avg)} / ${p(s.bull.winRate)} (${s.bull.n}) | ${sp(s.bear.avg)} / ${p(s.bear.winRate)} (${s.bear.n}) | ${sp(s.bull.avg - s.bear.avg)} |`);
}
md.push("");

const t = sum.trading;
md.push("## 3. 照訊號買賣 vs 買進持有", "");
md.push(`- 交易 ${t.trades} 筆，勝率 ${p(t.winRate)}，平均每筆 ${sp(t.avgTrade)}，平均持有 ${t.avgDays.toFixed(0)} 天`);
md.push(`- 出場原因：目標價 ${t.byReason["目標價"]}、停損 ${t.byReason["停損"]}、訊號轉弱 ${t.byReason["訊號轉弱"]}、期末 ${t.byReason["期末"]}`);
md.push(`- 策略平均總報酬 ${sp(t.avgStrategy, 1)}，買進持有 ${sp(t.avgBuyHold, 1)}；${t.beatBuyHold}/${results.length} 檔贏過買進持有`);
md.push(`- 平均最大回撤：策略 ${p(t.avgStrategyDD)}，買進持有 ${p(t.avgBuyHoldDD)}`, "");
md.push("| 代號 | 策略報酬 | 買進持有 | 策略最大回撤 | 持有最大回撤 | 在場時間 | 交易數 |", "|---|---:|---:|---:|---:|---:|---:|");
for (const r of t.perSymbol) {
  md.push(`| ${r.symbol} | ${sp(r.strategy, 1)} | ${sp(r.buyHold, 1)} | ${p(r.strategyMaxDD)} | ${p(r.buyHoldMaxDD)} | ${p(r.exposure, 0)} | ${r.trades} |`);
}
md.push("");

mkdirSync("reports", { recursive: true });
writeFileSync("reports/backtest.md", md.join("\n"));
writeFileSync("reports/backtest.json", JSON.stringify({ start, end, failed, options: DEFAULT_OPTIONS, summary: sum }, null, 1));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join("\n"));
console.log("\n" + md.join("\n"));
