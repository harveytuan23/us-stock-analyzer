import { test } from "node:test";
import assert from "node:assert/strict";
import { backtestSymbol, signalsFor, summarize } from "../lib/backtest.ts";
import { analyzeTechnicals } from "../lib/analysis.ts";
import { syntheticCandles } from "../lib/synthetic.ts";

test("signals never look ahead", () => {
  const candles = syntheticCandles(5, 100, 0.0005, 0.015, 400);
  const full = signalsFor(candles);
  const cut = signalsFor(candles.slice(0, 351));
  const day = full.find((s) => s.i === 350)!;
  assert.equal(day.score, cut[cut.length - 1].score);
  assert.equal(day.score, analyzeTechnicals(candles.slice(350 + 1 - 320, 351)).score);
});

test("trades are consistent with prices and equity", () => {
  const candles = syntheticCandles(7, 100, 0.0015, 0.018, 700);
  const r = backtestSymbol("T", candles);
  assert.ok(r.trades.length > 0);
  for (const t of r.trades) {
    assert.ok(t.exitDate >= t.entryDate);
    assert.ok(Math.abs(t.ret - (t.exit / t.entry - 1 - 0.001)) < 1e-9);
  }
  // Equity compounding must equal the product of trade returns (no overlap, no leaks).
  const product = r.trades.reduce((e, t) => e * (1 + t.ret + 0.001) * (1 - 0.0005) ** 2, 1) - 1;
  assert.ok(Math.abs(product - r.strategyReturn) < 1e-9, `${product} vs ${r.strategyReturn}`);
  assert.ok(r.exposure > 0 && r.exposure <= 1);
  assert.ok(r.strategyMaxDD <= 0 && r.buyHoldMaxDD <= 0);
});

test("summary buckets cover every scored day", () => {
  const rs = [1, 2, 3].map((seed) => backtestSymbol(`S${seed}`, syntheticCandles(seed, 100, 0, 0.02, 600)));
  const sum = summarize(rs);
  const total = sum.buckets.reduce((n, b) => n + (b as unknown as Record<number, { n: number }>)[5].n, 0);
  assert.equal(total, sum.baseline[5].n);
});
