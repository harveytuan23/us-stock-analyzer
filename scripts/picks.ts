// Usage: node scripts/picks.ts [--synthetic]
// Computes the monthly momentum list and writes data/picks.json for the /picks page.
import { writeFileSync } from "node:fs";
import YahooFinance from "yahoo-finance2";
import { align, lastMonthEnd, momentumRanking } from "../lib/portfolio.ts";
import { SP100 } from "../lib/universe.ts";
import { syntheticCandles } from "../lib/synthetic.ts";
import type { Candle } from "../lib/types.ts";
import type { Picks } from "../lib/picks.ts";

const TOP = 10;
const synthetic = process.argv.includes("--synthetic");
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const period1 = new Date(Date.now() - 2.2 * 365.25 * 864e5);

async function load(symbol: string, i: number): Promise<Candle[]> {
  if (synthetic) return syntheticCandles(i + 1, 100, 0.0003 + (i % 7) * 0.0001, 0.016, 520);
  const chart = await yf.chart(symbol, { period1, interval: "1d", return: "array" });
  return chart.quotes
    .filter((q) => q.close != null)
    .map((q) => {
      const c = (q.adjclose ?? q.close)!;
      return { time: q.date.toISOString().slice(0, 10), open: c, high: c, low: c, close: c, volume: 0 };
    });
}

const data: Record<string, Candle[]> = {};
for (const [i, s] of ["SPY", ...SP100].entries()) {
  try {
    data[s] = await load(s, i);
  } catch (e) {
    console.log(`✗ ${s}: ${e instanceof Error ? e.message : e}`);
  }
}
const symbols = SP100.filter((s) => data[s]);
if (symbols.length < 80) throw new Error(`only ${symbols.length} symbols loaded, refusing to publish a list`);
const u = align(data.SPY, data);
const today = u.dates.length - 1;
const signal = lastMonthEnd(u.dates, today);
const prevSignal = lastMonthEnd(u.dates, signal - 1);

const ranked = momentumRanking(u, symbols, signal);
const prevTop = new Set(momentumRanking(u, symbols, prevSignal).slice(0, TOP).map((x) => x.symbol));
const top = ranked.slice(0, TOP);
const topSet = new Set(top.map((x) => x.symbol));
const live = momentumRanking(u, symbols, today);

const names: Record<string, string> = {};
if (!synthetic) {
  const want = [...new Set([...top, ...live.slice(0, 15)].map((x) => x.symbol).concat([...prevTop]))];
  try {
    const qs = await yf.quote(want);
    for (const q of qs) names[q.symbol] = q.shortName ?? q.longName ?? q.symbol;
  } catch (e) {
    console.log("names unavailable:", e instanceof Error ? e.message : e);
  }
}
const px = (s: string, t: number) => u.closes[s][t] as number;

const out: Picks = {
  generatedAt: new Date().toISOString(),
  signalDate: u.dates[signal],
  priceDate: u.dates[today],
  universe: symbols.length,
  holdings: top.map((x, i) => ({
    rank: i + 1,
    symbol: x.symbol,
    name: names[x.symbol] ?? x.symbol,
    momentum: x.score,
    signalPrice: px(x.symbol, signal),
    price: px(x.symbol, today),
    status: prevTop.has(x.symbol) ? "續抱" : "新買進",
  })),
  sells: [...prevTop].filter((s) => !topSet.has(s)).map((s) => ({
    symbol: s,
    name: names[s] ?? s,
    rank: ranked.findIndex((x) => x.symbol === s) + 1,
  })),
  watch: live.slice(0, 15).map((x, i) => ({
    rank: i + 1,
    symbol: x.symbol,
    name: names[x.symbol] ?? x.symbol,
    momentum: x.score,
    inList: topSet.has(x.symbol),
  })),
  market: { spy: px("SPY", today), spySignal: px("SPY", signal) },
};
writeFileSync("data/picks.json", JSON.stringify(out, null, 1) + "\n");
console.log(`signal ${out.signalDate}: ${out.holdings.map((h) => h.symbol).join(", ")}; sells: ${out.sells.map((s) => s.symbol).join(", ") || "none"}`);
