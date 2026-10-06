import { createRoot } from "react-dom/client";
import Dashboard, { type Result } from "../components/Dashboard.tsx";
import { analyzeAll } from "../lib/analysis.ts";
import { syntheticCandles } from "../lib/synthetic.ts";
import type { Fundamentals } from "../lib/types.ts";

// Fictional tickers with simulated prices and made-up fundamentals, so the
// preview runs without a server. Nothing here is real market data.
const DEMO: Record<string, { seed: number; start: number; drift: number; vol: number; f: Fundamentals }> = {
  GROW: { seed: 7, start: 120, drift: 0.0018, vol: 0.017, f: {
    name: "示範成長科技（虛構）", sector: "科技", industry: "半導體", marketCap: 8.2e11, trailingPE: 38, forwardPE: 27, pegRatio: 0.9,
    priceToBook: 14, revenueGrowth: 0.31, earningsGrowth: 0.42, grossMargins: 0.68, operatingMargins: 0.34, returnOnEquity: 0.41,
    debtToEquity: 35, currentRatio: 2.4, freeCashflow: 2.1e10, beta: 1.6, targetMeanPrice: 0, numberOfAnalystOpinions: 40 } },
  VALU: { seed: 11, start: 60, drift: 0.0004, vol: 0.011, f: {
    name: "示範價值消費（虛構）", sector: "必需消費", industry: "飲料", marketCap: 2.4e11, trailingPE: 16, forwardPE: 14.5, pegRatio: 1.8,
    priceToBook: 4.1, revenueGrowth: 0.04, earningsGrowth: 0.06, grossMargins: 0.58, operatingMargins: 0.27, returnOnEquity: 0.38,
    debtToEquity: 160, currentRatio: 1.1, freeCashflow: 9.5e9, dividendYield: 0.031, payoutRatio: 0.68, beta: 0.6 } },
  WEAK: { seed: 3, start: 90, drift: -0.0016, vol: 0.022, f: {
    name: "示範轉型零售（虛構）", sector: "非必需消費", industry: "百貨零售", marketCap: 6.5e9, trailingPE: 72, forwardPE: 45,
    priceToBook: 1.2, revenueGrowth: -0.08, earningsGrowth: -0.35, grossMargins: 0.22, operatingMargins: 0.02, returnOnEquity: 0.03,
    debtToEquity: 240, currentRatio: 0.9, freeCashflow: -4.2e8, beta: 1.4 } },
};

async function load(symbol: string): Promise<Result> {
  const d = DEMO[symbol];
  if (!d) throw new Error(`預覽版只有示範代號：${Object.keys(DEMO).join("、")}。真實股票要部署後才能查。`);
  const candles = syntheticCandles(d.seed, d.start, d.drift, d.vol);
  const last = candles[candles.length - 1].close;
  const closes = candles.slice(-252);
  const f: Fundamentals = {
    ...d.f, price: last,
    fiftyTwoWeekHigh: Math.max(...closes.map((c) => c.high)),
    fiftyTwoWeekLow: Math.min(...closes.map((c) => c.low)),
    targetMeanPrice: d.f.numberOfAnalystOpinions ? last * 1.18 : undefined,
  };
  return { symbol, candles, fundamentals: f, source: "模擬資料（非真實行情）", asOf: new Date().toISOString(), analysis: analyzeAll(symbol, candles, f) };
}

createRoot(document.getElementById("root")!).render(
  <Dashboard
    load={load}
    quick={Object.keys(DEMO)}
    banner={<p className="banner">這是介面預覽：股價與財報都是模擬的虛構公司，用來展示分析邏輯。部署到網站後會換成 Yahoo Finance 真實資料。</p>}
  />,
);
