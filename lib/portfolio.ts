import type { Candle } from "./types.ts";

// Monthly-rebalanced portfolio backtests on adjusted closes.
// Timing: signals use the close of the last trading day of a month (day t);
// trades fill at the close of day t+1; new weights earn returns from day t+2.
// Nothing after day t is visible to the signal.

export type Weights = Record<string, number>; // symbol -> weight, sum <= 1 (rest is cash)

export interface Universe {
  dates: string[]; // benchmark trading days
  closes: Record<string, (number | null)[]>; // aligned to dates; null = not trading yet
}

export function align(bench: Candle[], series: Record<string, Candle[]>): Universe {
  const dates = bench.map((c) => c.time);
  const closes: Universe["closes"] = {};
  for (const [s, cs] of Object.entries(series)) {
    const m = new Map(cs.map((c) => [c.time, c.close]));
    let last: number | null = null;
    closes[s] = dates.map((d) => {
      const v = m.get(d);
      if (v != null) last = v;
      return v ?? last; // carry forward over the odd missing day
    });
  }
  return { dates, closes };
}

export type Strategy = (u: Universe, t: number) => Weights;

const ret = (c: (number | null)[], t: number, back: number) => {
  const a = c[t - back];
  const b = c[t];
  return a != null && b != null ? b / a - 1 : null;
};

const sma = (c: (number | null)[], t: number, n: number) => {
  if (t + 1 < n) return null;
  let s = 0;
  for (let i = t - n + 1; i <= t; i++) {
    if (c[i] == null) return null;
    s += c[i] as number;
  }
  return s / n;
};

export const buyHold = (symbol: string): Strategy => () => ({ [symbol]: 1 });

export const equalWeight = (symbols: string[]): Strategy => (u, t) => {
  const live = symbols.filter((s) => u.closes[s]?.[t] != null);
  return Object.fromEntries(live.map((s) => [s, 1 / live.length]));
};

// Faber-style trend filter: hold `symbol` while it closes above its 200-day average.
export const trendFilter = (symbol: string, n = 200): Strategy => (u, t) => {
  const c = u.closes[symbol];
  const m = sma(c, t, n);
  return m != null && (c[t] as number) > m ? { [symbol]: 1 } : {};
};

// Classic 12-1 momentum: rank by the return from 12 months ago to 1 month ago,
// hold the top `top` names equally weighted.
export const momentum = (symbols: string[], top = 10, lookback = 252, skip = 21): Strategy => (u, t) => {
  const scored = symbols
    .map((s) => {
      const c = u.closes[s];
      if (!c || c[t] == null || c[t - lookback] == null) return null;
      const r = ret(c.slice(0, t - skip + 1), t - skip, lookback - skip);
      return r == null ? null : { s, r };
    })
    .filter((x): x is { s: string; r: number } => x != null)
    .sort((a, b) => b.r - a.r)
    .slice(0, top);
  return Object.fromEntries(scored.map((x) => [x.s, 1 / scored.length]));
};

// Run `inner` only while the market (`gate`) is above its 200-day average; cash otherwise.
export const withMarketFilter = (inner: Strategy, gate: string, n = 200): Strategy => (u, t) => {
  const c = u.closes[gate];
  const m = sma(c, t, n);
  return m != null && (c[t] as number) > m ? inner(u, t) : {};
};

export function isMonthEnd(dates: string[], t: number) {
  return t + 1 >= dates.length || dates[t + 1].slice(0, 7) !== dates[t].slice(0, 7);
}

export interface RunResult {
  equity: number[]; // aligned to dates, starts at 1 on `start`
  start: number;
  holdings: { date: string; weights: Weights }[];
  turnover: number;
}

export function run(u: Universe, strat: Strategy, start: number, costBps = 10): RunResult {
  const n = u.dates.length;
  const equity: number[] = new Array(n).fill(NaN);
  equity[start] = 1;
  let held: Weights = {};
  let pending: Weights | null = null;
  const holdings: RunResult["holdings"] = [];
  let turnover = 0;
  const cost = costBps / 10000;

  for (let t = start; t < n; t++) {
    if (t > start) {
      let r = 0;
      for (const [s, w] of Object.entries(held)) {
        const c = u.closes[s];
        const a = c[t - 1];
        const b = c[t];
        if (a != null && b != null) r += w * (b / a - 1);
      }
      equity[t] = equity[t - 1] * (1 + r);
      // Drift weights with prices so turnover is measured against what we actually hold.
      const grown: Weights = {};
      let total = 1 - Object.values(held).reduce((x, y) => x + y, 0);
      for (const [s, w] of Object.entries(held)) {
        const c = u.closes[s];
        const g = c[t - 1] != null && c[t] != null ? (c[t] as number) / (c[t - 1] as number) : 1;
        grown[s] = w * g;
        total += grown[s];
      }
      for (const s of Object.keys(grown)) grown[s] /= total;
      held = grown;
    }
    if (pending) {
      const keys = new Set([...Object.keys(held), ...Object.keys(pending)]);
      let tv = 0;
      for (const k of keys) tv += Math.abs((pending[k] ?? 0) - (held[k] ?? 0));
      turnover += tv;
      equity[t] *= 1 - tv * cost;
      held = pending;
      pending = null;
    }
    if (isMonthEnd(u.dates, t) && t + 1 < n) {
      pending = strat(u, t);
      holdings.push({ date: u.dates[t], weights: pending });
    }
  }
  return { equity, start, holdings, turnover };
}

export interface Stats {
  cagr: number;
  vol: number;
  sharpe: number;
  maxDD: number;
  total: number;
  years: number;
}

export function stats(dates: string[], equity: number[], from: number, to: number): Stats {
  const e = equity.slice(from, to + 1);
  const rets = e.slice(1).map((v, i) => v / e[i] - 1);
  const years = (Date.parse(dates[to]) - Date.parse(dates[from])) / (365.25 * 864e5);
  const total = e[e.length - 1] / e[0] - 1;
  const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length || 1));
  let peak = -Infinity;
  let dd = 0;
  for (const v of e) {
    peak = Math.max(peak, v);
    dd = Math.min(dd, v / peak - 1);
  }
  return {
    cagr: (1 + total) ** (1 / years) - 1,
    vol: sd * Math.sqrt(252),
    sharpe: sd ? (mean / sd) * Math.sqrt(252) : 0,
    maxDD: dd,
    total,
    years,
  };
}
