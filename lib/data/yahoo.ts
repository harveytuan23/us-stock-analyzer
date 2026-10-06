import YahooFinance from "yahoo-finance2";
import type { Candle, Fundamentals, StockData } from "../types.ts";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export async function fetchStock(symbol: string): Promise<StockData> {
  const period1 = new Date(Date.now() - 2 * 365 * 24 * 3600 * 1000);
  const [chart, summary] = await Promise.all([
    yf.chart(symbol, { period1, interval: "1d", return: "array" }),
    yf.quoteSummary(symbol, {
      modules: ["price", "summaryDetail", "defaultKeyStatistics", "financialData", "assetProfile"],
    }),
  ]);

  const candles: Candle[] = chart.quotes
    .filter((q) => q.open != null && q.high != null && q.low != null && q.close != null)
    .map((q) => ({
      time: q.date.toISOString().slice(0, 10),
      open: q.open!,
      high: q.high!,
      low: q.low!,
      close: q.close!,
      volume: q.volume ?? 0,
    }));

  const p = summary.price;
  const sd = summary.summaryDetail;
  const ks = summary.defaultKeyStatistics;
  const fd = summary.financialData;
  const ap = summary.assetProfile;

  const fundamentals: Fundamentals = {
    name: p?.longName ?? p?.shortName ?? symbol,
    sector: ap?.sector ?? undefined,
    industry: ap?.industry ?? undefined,
    summary: ap?.longBusinessSummary ?? undefined,
    price: p?.regularMarketPrice ?? fd?.currentPrice,
    currency: p?.currency ?? undefined,
    marketCap: sd?.marketCap ?? p?.marketCap,
    trailingPE: sd?.trailingPE,
    forwardPE: sd?.forwardPE ?? ks?.forwardPE,
    pegRatio: ks?.pegRatio,
    priceToBook: ks?.priceToBook,
    trailingEps: ks?.trailingEps,
    forwardEps: ks?.forwardEps,
    revenueGrowth: fd?.revenueGrowth,
    earningsGrowth: fd?.earningsGrowth,
    grossMargins: fd?.grossMargins,
    operatingMargins: fd?.operatingMargins,
    profitMargins: fd?.profitMargins,
    returnOnEquity: fd?.returnOnEquity,
    debtToEquity: fd?.debtToEquity,
    currentRatio: fd?.currentRatio,
    freeCashflow: fd?.freeCashflow,
    totalCash: fd?.totalCash,
    totalDebt: fd?.totalDebt,
    dividendYield: sd?.dividendYield,
    payoutRatio: sd?.payoutRatio,
    beta: sd?.beta,
    fiftyTwoWeekHigh: sd?.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: sd?.fiftyTwoWeekLow,
    targetMeanPrice: fd?.targetMeanPrice,
    recommendationKey: fd?.recommendationKey,
    numberOfAnalystOpinions: fd?.numberOfAnalystOpinions,
  };

  return {
    symbol: symbol.toUpperCase(),
    candles,
    fundamentals,
    source: "Yahoo Finance",
    asOf: new Date().toISOString(),
  };
}

export async function searchSymbols(q: string) {
  const res = await yf.search(q, { quotesCount: 8, newsCount: 0 });
  return res.quotes
    .filter((x): x is typeof x & { symbol: string } => "symbol" in x && typeof x.symbol === "string")
    .filter((x) => x.quoteType === "EQUITY" || x.quoteType === "ETF")
    .map((x) => ({
      symbol: x.symbol,
      name: ("longname" in x && x.longname) || ("shortname" in x && x.shortname) || x.symbol,
      exchange: "exchDisp" in x ? x.exchDisp : undefined,
    }));
}
