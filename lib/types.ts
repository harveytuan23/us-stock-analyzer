export interface Candle {
  time: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Fundamentals {
  name: string;
  sector?: string;
  industry?: string;
  summary?: string;
  price?: number;
  currency?: string;
  marketCap?: number;
  trailingPE?: number;
  forwardPE?: number;
  pegRatio?: number;
  priceToBook?: number;
  trailingEps?: number;
  forwardEps?: number;
  revenueGrowth?: number; // YoY, 0.12 = 12%
  earningsGrowth?: number;
  grossMargins?: number;
  operatingMargins?: number;
  profitMargins?: number;
  returnOnEquity?: number;
  debtToEquity?: number; // Yahoo reports as percent, 150 = 1.5x
  currentRatio?: number;
  freeCashflow?: number;
  totalCash?: number;
  totalDebt?: number;
  dividendYield?: number;
  payoutRatio?: number;
  beta?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  targetMeanPrice?: number;
  recommendationKey?: string;
  numberOfAnalystOpinions?: number;
}

export interface StockData {
  symbol: string;
  candles: Candle[];
  fundamentals: Fundamentals;
  source: string;
  asOf: string;
}
