import { test } from "node:test";
import assert from "node:assert/strict";
import { bollinger, ema, macd, rsi, sma } from "../lib/indicators.ts";
import { analyzeAll } from "../lib/analysis.ts";
import { syntheticCandles } from "../lib/synthetic.ts";

test("sma and ema basics", () => {
  assert.deepEqual(sma([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
  const e = ema([1, 2, 3, 4, 5], 3);
  assert.equal(e[2], 2);
  assert.equal(e[3], 3); // 4*0.5 + 2*0.5
});

test("rsi matches Wilder reference (StockCharts example, unrounded)", () => {
  const closes = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.0, 46.03, 46.41, 46.22, 45.64];
  const r = rsi(closes, 14);
  assert.ok(Math.abs((r[14] as number) - 70.46) < 0.01, `got ${r[14]}`);
  assert.ok(Math.abs((r[15] as number) - 66.25) < 0.01, `got ${r[15]}`);
});

test("rsi is 100 on a straight rally and macd/bollinger align", () => {
  const up = Array.from({ length: 60 }, (_, i) => 100 + i);
  assert.equal(rsi(up)[59], 100);
  const m = macd(up);
  assert.ok((m.line[59] as number) > 0);
  assert.equal(m.signal.findIndex((v) => v != null), 25 + 8);
  const bb = bollinger(Array(30).fill(10));
  assert.equal(bb.upper[29], 10);
});

test("analysis: strong uptrend + strong fundamentals → buy-side stance", () => {
  const candles = syntheticCandles(7, 100, 0.002, 0.012);
  const res = analyzeAll("TEST", candles, {
    name: "Test", forwardPE: 15, pegRatio: 0.8, revenueGrowth: 0.25, earningsGrowth: 0.3,
    grossMargins: 0.6, operatingMargins: 0.3, returnOnEquity: 0.3, debtToEquity: 30, freeCashflow: 1e10,
  });
  assert.equal(res.technical.trend, "多頭");
  assert.equal(res.fundamental.grade, "A");
  assert.ok(["積極買進", "逢低布局"].includes(res.strategy.stance), res.strategy.stance);
  const s = res.strategy;
  assert.ok(s.stopLoss < s.entryLow && s.entryLow <= s.entryHigh && s.entryHigh <= res.technical.price + 1e-9);
  assert.ok(s.target1 > res.technical.price && s.target2 >= s.target1);
});

test("analysis: downtrend + weak fundamentals → defensive stance", () => {
  const candles = syntheticCandles(3, 100, -0.002, 0.015);
  const res = analyzeAll("BAD", candles, {
    name: "Bad", trailingPE: 80, revenueGrowth: -0.1, earningsGrowth: -0.4,
    grossMargins: 0.15, operatingMargins: 0.02, returnOnEquity: 0.02, debtToEquity: 300, freeCashflow: -5e8,
  });
  assert.equal(res.technical.trend, "空頭");
  assert.equal(res.fundamental.grade, "F");
  assert.ok(["減碼", "避開"].includes(res.strategy.stance), res.strategy.stance);
});
