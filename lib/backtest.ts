import type { Candle } from "./types.ts";
import { analyzeTechnicals, buildStrategy, type FundamentalReport, type Verdict } from "./analysis.ts";

// Walk-forward backtest of the technical side of the analysis. On each day the
// analysis only sees candles up to and including that day; trades fill at the
// next day's open. Fundamentals are excluded on purpose: the data source only
// has today's fundamentals, and using them for past dates would leak the future.

const WINDOW = 320; // enough history for MA200 plus warm-up, keeps each step cheap
const HORIZONS = [5, 20, 60] as const;
const NEUTRAL_FUNDAMENTALS: FundamentalReport = { score: 50, grade: "C", items: [] };

export interface DaySignal {
  i: number;
  score: number;
  verdicts: Record<string, Verdict>;
  stopLoss: number;
  target1: number;
}

export interface Trade {
  symbol: string;
  entryDate: string;
  exitDate: string;
  entry: number;
  exit: number;
  ret: number;
  days: number;
  reason: "停損" | "目標價" | "訊號轉弱" | "期末";
}

export interface SymbolResult {
  symbol: string;
  days: number;
  forward: { score: number; signals: Record<string, Verdict>; ret: Record<number, number | null> }[];
  trades: Trade[];
  strategyReturn: number;
  buyHoldReturn: number;
  strategyMaxDD: number;
  buyHoldMaxDD: number;
  exposure: number; // share of days in the market
}

export interface BacktestOptions {
  entryScore: number; // buy when technical score >= this
  exitScore: number; // sell when technical score <= this
  costBps: number; // round-trip cost per trade, in basis points
}

export const DEFAULT_OPTIONS: BacktestOptions = { entryScore: 40, exitScore: -10, costBps: 10 };

export function signalsFor(candles: Candle[]): DaySignal[] {
  const out: DaySignal[] = [];
  for (let i = 250; i < candles.length; i++) {
    const view = candles.slice(Math.max(0, i + 1 - WINDOW), i + 1);
    const t = analyzeTechnicals(view);
    const s = buildStrategy("", t, NEUTRAL_FUNDAMENTALS, { name: "" });
    out.push({
      i,
      score: t.score,
      verdicts: Object.fromEntries(t.signals.map((x) => [x.name, x.verdict])),
      stopLoss: s.stopLoss,
      target1: s.target1,
    });
  }
  return out;
}

function maxDrawdown(equity: number[]) {
  let peak = -Infinity;
  let dd = 0;
  for (const v of equity) {
    peak = Math.max(peak, v);
    dd = Math.min(dd, v / peak - 1);
  }
  return dd;
}

export function backtestSymbol(symbol: string, candles: Candle[], opts = DEFAULT_OPTIONS): SymbolResult {
  const sigs = signalsFor(candles);
  const close = candles.map((c) => c.close);

  const forward = sigs.map((s) => ({
    score: s.score,
    signals: s.verdicts,
    ret: Object.fromEntries(
      HORIZONS.map((h) => [h, s.i + h < candles.length ? close[s.i + h] / close[s.i] - 1 : null]),
    ) as Record<number, number | null>,
  }));

  // Trading simulation: long-only, one position at a time. Signals are read at
  // the close; orders fill at the next open. Equity is marked to market daily.
  const trades: Trade[] = [];
  const half = opts.costBps / 20000;
  const sigAt = new Map(sigs.map((s) => [s.i, s]));
  const first = sigs[0]?.i ?? candles.length;
  let pos: { entry: number; entryIdx: number; stop: number; target: number } | null = null;
  let pendingEntry: DaySignal | null = null;
  let pendingExit = false;
  let equity = 1;
  let inMarket = 0;
  const curve: number[] = [];

  const exit = (i: number, px: number, ref: number, reason: Trade["reason"]) => {
    equity *= (px / ref) * (1 - half);
    trades.push({
      symbol,
      entryDate: candles[pos!.entryIdx].time,
      exitDate: candles[i].time,
      entry: pos!.entry,
      exit: px,
      ret: px / pos!.entry - 1 - 2 * half,
      days: i - pos!.entryIdx,
      reason,
    });
    pos = null;
  };

  for (let i = first; i < candles.length; i++) {
    const c = candles[i];
    const prev = close[i - 1];
    if (pos && pendingExit) {
      exit(i, c.open, prev, "訊號轉弱");
    } else if (!pos && pendingEntry) {
      pos = { entry: c.open, entryIdx: i, stop: pendingEntry.stopLoss, target: pendingEntry.target1 };
      equity *= 1 - half;
    }
    pendingEntry = null;
    pendingExit = false;

    if (pos) {
      inMarket++;
      const ref = pos.entryIdx === i ? pos.entry : prev;
      // A day that touches both stop and target counts as a stop (the worse case).
      if (c.low <= pos.stop) exit(i, Math.min(c.open, pos.stop), ref, "停損");
      else if (c.high >= pos.target) exit(i, Math.max(c.open, pos.target), ref, "目標價");
      else equity *= c.close / ref;
    }

    const s = sigAt.get(i);
    if (s && i + 1 < candles.length) {
      if (pos && s.score <= opts.exitScore) pendingExit = true;
      if (!pos && s.score >= opts.entryScore) pendingEntry = s;
    }
    curve.push(equity);
  }
  if (pos) exit(candles.length - 1, close[close.length - 1], close[close.length - 1], "期末");

  const bh = close.slice(first);
  return {
    symbol,
    days: sigs.length,
    forward,
    trades,
    strategyReturn: equity - 1,
    buyHoldReturn: bh[bh.length - 1] / bh[0] - 1,
    strategyMaxDD: maxDrawdown(curve),
    buyHoldMaxDD: maxDrawdown(bh),
    exposure: inMarket / Math.max(1, sigs.length),
  };
}

export const BUCKETS = [
  { label: "強烈偏空 (≤ -40)", lo: -101, hi: -40 },
  { label: "偏空 (-39 ~ -11)", lo: -40, hi: -10 },
  { label: "中性 (-10 ~ 10)", lo: -10, hi: 10 },
  { label: "偏多 (11 ~ 39)", lo: 10, hi: 39 },
  { label: "強烈偏多 (≥ 40)", lo: 39, hi: 101 },
];

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);

export function summarize(results: SymbolResult[]) {
  const rows = results.flatMap((r) => r.forward);
  const stat = (subset: typeof rows, h: number) => {
    const rs = subset.map((r) => r.ret[h]).filter((x): x is number => x != null);
    return { n: rs.length, avg: mean(rs), winRate: rs.filter((x) => x > 0).length / (rs.length || 1) };
  };

  const baseline = Object.fromEntries(HORIZONS.map((h) => [h, stat(rows, h)]));
  const buckets = BUCKETS.map((b) => ({
    label: b.label,
    ...Object.fromEntries(HORIZONS.map((h) => [h, stat(rows.filter((r) => r.score > b.lo && r.score <= b.hi), h)])),
  }));

  const signalNames = [...new Set(rows.flatMap((r) => Object.keys(r.signals)))];
  const signals = signalNames.map((name) => ({
    name,
    bull: stat(rows.filter((r) => r.signals[name] === "bull"), 20),
    bear: stat(rows.filter((r) => r.signals[name] === "bear"), 20),
  }));

  const trades = results.flatMap((r) => r.trades);
  const byReason = Object.fromEntries(
    (["目標價", "停損", "訊號轉弱", "期末"] as const).map((k) => [k, trades.filter((t) => t.reason === k).length]),
  );
  return {
    baseline,
    buckets,
    signals,
    trading: {
      trades: trades.length,
      winRate: trades.filter((t) => t.ret > 0).length / (trades.length || 1),
      avgTrade: mean(trades.map((t) => t.ret)),
      avgDays: mean(trades.map((t) => t.days)),
      byReason,
      perSymbol: results.map((r) => ({
        symbol: r.symbol,
        strategy: r.strategyReturn,
        buyHold: r.buyHoldReturn,
        strategyMaxDD: r.strategyMaxDD,
        buyHoldMaxDD: r.buyHoldMaxDD,
        exposure: r.exposure,
        trades: r.trades.length,
      })),
      beatBuyHold: results.filter((r) => r.strategyReturn > r.buyHoldReturn).length,
      avgStrategy: mean(results.map((r) => r.strategyReturn)),
      avgBuyHold: mean(results.map((r) => r.buyHoldReturn)),
      avgStrategyDD: mean(results.map((r) => r.strategyMaxDD)),
      avgBuyHoldDD: mean(results.map((r) => r.buyHoldMaxDD)),
    },
  };
}
export type Summary = ReturnType<typeof summarize>;
