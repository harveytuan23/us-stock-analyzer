// One-off fundamentals snapshot, printed as JSON to the CI log.
import YahooFinance from "yahoo-finance2";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const symbols = ["ETN", "VRT", "SPY"];
const out: Record<string, unknown> = {};
for (const s of symbols) {
  try {
    const r = await yf.quoteSummary(s, {
      modules: ["price", "summaryDetail", "financialData", "defaultKeyStatistics", "earningsTrend", "assetProfile"],
    });
    const fd = r.financialData, sd = r.summaryDetail, ks = r.defaultKeyStatistics;
    const chart = await yf.chart(s, { period1: new Date(Date.now() - 3 * 365 * 864e5), interval: "1mo", return: "array" });
    out[s] = {
      name: r.price?.longName, industry: r.assetProfile?.industry, employees: r.assetProfile?.fullTimeEmployees,
      price: r.price?.regularMarketPrice, cap: sd?.marketCap, hi52: sd?.fiftyTwoWeekHigh, lo52: sd?.fiftyTwoWeekLow,
      beta: sd?.beta, div: sd?.dividendYield, tpe: sd?.trailingPE, fpe: sd?.forwardPE ?? ks?.forwardPE, peg: ks?.pegRatio,
      ps: sd?.priceToSalesTrailing12Months, pb: ks?.priceToBook, evEbitda: ks?.enterpriseToEbitda,
      rev: fd?.totalRevenue, rg: fd?.revenueGrowth, eg: fd?.earningsGrowth, gm: fd?.grossMargins, om: fd?.operatingMargins,
      pm: fd?.profitMargins, roe: fd?.returnOnEquity, de: fd?.debtToEquity, cash: fd?.totalCash, debt: fd?.totalDebt,
      fcf: fd?.freeCashflow, ocf: fd?.operatingCashflow, target: fd?.targetMeanPrice, targetLo: fd?.targetLowPrice,
      targetHi: fd?.targetHighPrice, rec: fd?.recommendationKey, analysts: fd?.numberOfAnalystOpinions,
      shortPct: ks?.shortPercentOfFloat,
      trend: r.earningsTrend?.trend?.map((t) => ({ p: t.period, g: t.growth, eps: t.earningsEstimate?.avg, rev: t.revenueEstimate?.avg, revG: t.revenueEstimate?.growth })),
      monthly: chart.quotes.filter((q) => q.close != null).map((q) => [q.date.toISOString().slice(0, 7), Math.round(q.close! * 100) / 100]),
    };
  } catch (e) {
    out[s] = { err: String(e).slice(0, 150) };
  }
}
console.log("SCREEN_JSON " + JSON.stringify(out));
