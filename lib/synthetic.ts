import type { Candle } from "./types.ts";

// Deterministic simulated price path (seeded random walk with drift) for the
// offline demo and tests. Not market data.
export function syntheticCandles(seed: number, start: number, drift: number, vol: number, days = 500): Candle[] {
  let s = seed >>> 0;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const gauss = () => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
  const out: Candle[] = [];
  const d = new Date(Date.UTC(2024, 7, 1));
  let price = start;
  while (out.length < days) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    const open = price * (1 + gauss() * vol * 0.3);
    const close = open * (1 + drift + gauss() * vol);
    const high = Math.max(open, close) * (1 + Math.abs(gauss()) * vol * 0.5);
    const low = Math.min(open, close) * (1 - Math.abs(gauss()) * vol * 0.5);
    out.push({ time: d.toISOString().slice(0, 10), open, high, low, close, volume: Math.round(5e7 * (1 + Math.abs(gauss()))) });
    price = close;
  }
  return out;
}
