// Independent audit of the momentum strategy (second-opinion thread). Read-only use of lib/.
// Usage: node audit/audit.ts [--synthetic]
import YahooFinance from "yahoo-finance2";
import { align, equalWeight, momentum, run, stats, buyHold, isMonthEnd, type Universe } from "../lib/portfolio.ts";
import { syntheticCandles } from "../lib/synthetic.ts";
import type { Candle } from "../lib/types.ts";
import { SP100 } from "../lib/universe.ts";

const synthetic = process.argv.includes("--synthetic");
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

// Approximate S&P 100 membership around 2011 (from memory, not an official list),
// intersected with today's members. Removes names that joined the index after big runs.
const LEGACY = `AAPL MSFT AMZN GOOGL BRK-B JPM V UNH XOM MA JNJ PG HD COST MRK WMT CVX KO BAC ORCL PEP MCD CSCO ABT WFC DIS IBM GE QCOM CAT TXN VZ AMGN PFE CMCSA PM UNP T LOW HON GS MS C LMT MDT BMY GILD MO USB F CVS COP SO NKE UPS BA INTC TGT CL LLY ELV RTX`.split(" ");

async function load(symbol: string, i: number): Promise<Candle[]> {
  if (synthetic) return syntheticCandles(i + 1, 100, 0.0003 + (i % 7) * 0.0001, 0.016, 252 * 16);
  const chart = await yf.chart(symbol, { period1: new Date("2010-01-01"), interval: "1d", return: "array" });
  return chart.quotes.filter((q) => q.close != null).map((q) => {
    const c = (q.adjclose ?? q.close)!;
    return { time: q.date.toISOString().slice(0, 10), open: c, high: c, low: c, close: c, volume: 0 };
  });
}

const data: Record<string, Candle[]> = {};
for (const [i, s] of ["SPY", ...SP100].entries()) {
  try { data[s] = await load(s, i); } catch (e) { console.log(`x ${s}`); }
}
const all = SP100.filter((s) => data[s]);
const legacy = LEGACY.filter((s) => data[s]);
const u: Universe = align(data.SPY, data);
const start = synthetic ? 260 : u.dates.findIndex((d) => d >= "2011-01-01");
const split = synthetic ? Math.floor((start + u.dates.length) * 0.6) : u.dates.findIndex((d) => d >= "2021-01-01");
const end = u.dates.length - 1;
const p = (v: number) => `${(v * 100).toFixed(1)}%`;

function monthly(eq: number[]) {
  const idx: number[] = [];
  for (let t = start; t <= end; t++) if (t === start || isMonthEnd(u.dates, t)) idx.push(t);
  return idx.slice(1).map((t, i) => ({ t, r: eq[t] / eq[idx[i]] - 1 }));
}
function regress(y: number[], x: number[]) {
  const n = y.length, mx = x.reduce((a, b) => a + b) / n, my = y.reduce((a, b) => a + b) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
  const beta = sxy / sxx, alpha = my - beta * mx;
  const res = y.map((v, i) => v - alpha - beta * x[i]);
  const se = Math.sqrt(res.reduce((a, b) => a + b * b, 0) / (n - 2) / n);
  return { alpha, beta, t: alpha / se };
}
function tstat(d: number[]) {
  const n = d.length, m = d.reduce((a, b) => a + b) / n;
  const sd = Math.sqrt(d.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1));
  return { m, t: m / (sd / Math.sqrt(n)) };
}

const spy = run(u, buyHold("SPY"), start);
const spyM = monthly(spy.equity);

function report(label: string, syms: string[], top = 10, bps = 10) {
  const mom = run(u, momentum(syms, top), start, bps);
  const ew = run(u, equalWeight(syms), start, bps);
  const line = (name: string, eq: number[]) => {
    const f = stats(u.dates, eq, start, end), i = stats(u.dates, eq, start, split - 1), o = stats(u.dates, eq, split - 1, end);
    return `${name.padEnd(28)} full ${p(f.cagr)} sh ${f.sharpe.toFixed(2)} dd ${p(f.maxDD)} vol ${p(f.vol)} | in ${p(i.cagr)} sh ${i.sharpe.toFixed(2)} | out ${p(o.cagr)} sh ${o.sharpe.toFixed(2)} dd ${p(o.maxDD)}`;
  };
  console.log(`\n== ${label} (${syms.length} names, top ${top}, ${bps}bps) ==`);
  console.log(line("momentum", mom.equity));
  console.log(line("equal weight", ew.equity));
  const mm = monthly(mom.equity), em = monthly(ew.equity);
  for (const [nm, from, to] of [["full", 0, mm.length], ["out", mm.findIndex((x) => x.t >= split), mm.length]] as const) {
    const y = mm.slice(from, to).map((x) => x.r), xs = spyM.slice(from, to).map((x) => x.r), e = em.slice(from, to).map((x) => x.r);
    const reg = regress(y, xs);
    const vsEw = tstat(y.map((v, k) => v - e[k]));
    const win = y.filter((v, k) => v > xs[k]).length / y.length;
    console.log(`  [${nm}] CAPM alpha ${p(reg.alpha * 12)}/yr beta ${reg.beta.toFixed(2)} t=${reg.t.toFixed(2)} | vs EW ${p(vsEw.m * 12)}/yr t=${vsEw.t.toFixed(2)} | months beating SPY ${p(win)} (n=${y.length})`);
  }
  return mom;
}

const momAll = report("Current S&P 100 (as in report)", all);
report("Legacy members only (~2011 list)", legacy);
report("Current S&P 100, 30bps", all, 10, 30);
report("Current S&P 100, 50bps", all, 10, 50);

// Contribution by ticker for the headline strategy.
const contrib: Record<string, number> = {};
const months: Record<string, number> = {};
const hold = momAll.holdings;
for (let h = 0; h < hold.length; h++) {
  const t0 = u.dates.indexOf(hold[h].date) + 1;
  const t1 = h + 1 < hold.length ? u.dates.indexOf(hold[h + 1].date) + 1 : end;
  for (const [s, w] of Object.entries(hold[h].weights)) {
    const c = u.closes[s];
    if (c[t0] == null || c[t1] == null) continue;
    contrib[s] = (contrib[s] ?? 0) + Math.log(1 + w * ((c[t1] as number) / (c[t0] as number) - 1));
    months[s] = (months[s] ?? 0) + 1;
  }
}
const totalLog = Object.values(contrib).reduce((a, b) => a + b, 0);
const ranked = Object.entries(contrib).sort((a, b) => b[1] - a[1]);
console.log(`\n== Contribution (approx log points, total ${totalLog.toFixed(2)}) ==`);
for (const [s, v] of ranked.slice(0, 15)) console.log(`${s.padEnd(6)} ${v.toFixed(3)} (${p(v / totalLog)}) months held ${months[s]} ${LEGACY.includes(s) ? "" : "<- not in ~2011 list"}`);
const late = ranked.filter(([s]) => !LEGACY.includes(s)).reduce((a, [, v]) => a + v, 0);
console.log(`Share from names not in ~2011 list: ${p(late / totalLog)}`);
const topN = (n: number) => ranked.slice(0, n).reduce((a, [, v]) => a + v, 0) / totalLog;
console.log(`Top 3 names share: ${p(topN(3))}, top 5: ${p(topN(5))}`);
console.log("Worst:", ranked.slice(-5).map(([s, v]) => `${s} ${v.toFixed(3)}`).join(", "));
