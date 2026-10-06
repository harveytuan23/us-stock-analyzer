// One-off fundamentals snapshot of the S&P 100, printed as JSON to the CI log.
import YahooFinance from "yahoo-finance2";
import { SP100 } from "../lib/universe.ts";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const rows: unknown[] = [];
for (const s of SP100) {
  try {
    const r = await yf.quoteSummary(s, {
      modules: ["price", "summaryDetail", "financialData", "assetProfile", "defaultKeyStatistics"],
    });
    const fd = r.financialData, sd = r.summaryDetail;
    rows.push({
      s, name: r.price?.shortName, sector: r.assetProfile?.sector, price: r.price?.regularMarketPrice,
      rg: fd?.revenueGrowth, eg: fd?.earningsGrowth, gm: fd?.grossMargins, om: fd?.operatingMargins,
      roe: fd?.returnOnEquity, de: fd?.debtToEquity, fcf: fd?.freeCashflow,
      fpe: sd?.forwardPE ?? r.defaultKeyStatistics?.forwardPE, tpe: sd?.trailingPE, cap: sd?.marketCap,
    });
  } catch (e) {
    rows.push({ s, err: String(e).slice(0, 100) });
  }
}
console.log("SCREEN_JSON " + JSON.stringify(rows));
