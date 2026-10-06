import { test } from "node:test";
import assert from "node:assert/strict";
import { align, buyHold, equalWeight, momentum, run, stats, trendFilter, withMarketFilter, type Universe } from "../lib/portfolio.ts";
import { syntheticCandles } from "../lib/synthetic.ts";

const bench = syntheticCandles(1, 100, 0.0004, 0.01, 800);
const series = Object.fromEntries([2, 3, 4, 5, 6].map((s, i) => [`S${s}`, syntheticCandles(s, 50, (i - 2) * 0.001, 0.015, 800)]));
const u = align(bench, { SPY: bench, ...series });

test("buy and hold tracks the price from the day after the first fill", () => {
  const r = run(u, buyHold("SPY"), 260, 0);
  const c = u.closes.SPY;
  // First month-end after start sets weights; they apply after the fill day.
  const fillDay = u.dates.findIndex((_, t) => t > 260 && u.dates[t - 1].slice(0, 7) !== u.dates[t].slice(0, 7));
  const last = u.dates.length - 1;
  const expected = (c[last] as number) / (c[fillDay] as number);
  assert.ok(Math.abs(r.equity[last] / r.equity[fillDay] - expected) < 1e-9);
});

test("strategies only use data up to the signal day", () => {
  const t = 500;
  const cut: Universe = { dates: u.dates.slice(0, t + 1), closes: Object.fromEntries(Object.entries(u.closes).map(([k, v]) => [k, v.slice(0, t + 1)])) };
  const syms = Object.keys(series);
  for (const s of [momentum(syms, 2), equalWeight(syms), trendFilter("SPY"), withMarketFilter(momentum(syms, 2), "SPY")]) {
    assert.deepEqual(s(u, t), s(cut, t));
  }
});

test("momentum picks the strongest trailing performers", () => {
  const w = momentum(Object.keys(series), 2)(u, 700);
  assert.equal(Object.keys(w).length, 2);
  assert.ok(Object.values(w).every((x) => Math.abs(x - 0.5) < 1e-12));
});

test("costs reduce returns and stats are sane", () => {
  const syms = Object.keys(series);
  const a = run(u, momentum(syms, 2), 260, 0);
  const b = run(u, momentum(syms, 2), 260, 50);
  const last = u.dates.length - 1;
  assert.ok(b.equity[last] < a.equity[last]);
  const st = stats(u.dates, a.equity, 260, last);
  assert.ok(st.maxDD <= 0 && st.vol > 0 && st.years > 2);
});
