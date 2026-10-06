"use client";
import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  type Time,
} from "lightweight-charts";
import type { Candle } from "@/lib/types.ts";
import { bollinger, macd, rsi, sma, type Series } from "@/lib/indicators.ts";

const UP = "#e5484d"; // Taiwan convention: red = up
const DOWN = "#30a46c";

function line(candles: Candle[], s: Series) {
  return candles.flatMap((c, i) => (s[i] == null ? [] : [{ time: c.time as Time, value: s[i] as number }]));
}

export default function StockChart({ candles, levels }: {
  candles: Candle[];
  levels?: { stopLoss: number; target1: number; entryLow: number; entryHigh: number };
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const css = getComputedStyle(document.documentElement);
    const text = css.getPropertyValue("--muted").trim() || "#888";
    const grid = css.getPropertyValue("--grid").trim() || "#eee";
    const chart = createChart(ref.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: text,
        panes: { separatorColor: grid },
      },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      timeScale: { borderColor: grid },
      rightPriceScale: { borderColor: grid },
    });
    const close = candles.map((c) => c.close);

    const price = chart.addSeries(CandlestickSeries, {
      upColor: UP, downColor: DOWN, borderVisible: false, wickUpColor: UP, wickDownColor: DOWN,
    });
    price.setData(candles.map((c) => ({ ...c, time: c.time as Time })));
    const ma = (p: number, color: string, title: string) =>
      chart.addSeries(LineSeries, { color, lineWidth: 1, title, priceLineVisible: false, lastValueVisible: false })
        .setData(line(candles, sma(close, p)));
    ma(20, "#f59e0b", "MA20");
    ma(50, "#3b82f6", "MA50");
    ma(200, "#a855f7", "MA200");
    const bb = bollinger(close);
    for (const s of [bb.upper, bb.lower]) {
      chart.addSeries(LineSeries, {
        color: "#94a3b8", lineWidth: 1, lineStyle: LineStyle.Dotted, priceLineVisible: false, lastValueVisible: false,
      }).setData(line(candles, s));
    }
    if (levels) {
      price.createPriceLine({ price: levels.stopLoss, color: DOWN, lineStyle: LineStyle.Dashed, title: "停損" });
      price.createPriceLine({ price: levels.target1, color: UP, lineStyle: LineStyle.Dashed, title: "目標1" });
      price.createPriceLine({ price: levels.entryLow, color: "#0ea5e9", lineStyle: LineStyle.Dotted, title: "進場下緣" });
    }

    chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, title: "成交量" }, 1)
      .setData(candles.map((c, i) => ({
        time: c.time as Time, value: c.volume,
        color: i && c.close < candles[i - 1].close ? DOWN + "88" : UP + "88",
      })));

    const r = chart.addSeries(LineSeries, { color: "#8b5cf6", lineWidth: 1, title: "RSI" }, 2);
    r.setData(line(candles, rsi(close)));
    r.createPriceLine({ price: 70, color: DOWN, lineStyle: LineStyle.Dotted, axisLabelVisible: false });
    r.createPriceLine({ price: 30, color: UP, lineStyle: LineStyle.Dotted, axisLabelVisible: false });

    const m = macd(close);
    chart.addSeries(HistogramSeries, { title: "MACD 柱" }, 3).setData(
      candles.flatMap((c, i) => m.hist[i] == null ? [] : [{
        time: c.time as Time, value: m.hist[i] as number, color: (m.hist[i] as number) >= 0 ? UP : DOWN,
      }]),
    );
    chart.addSeries(LineSeries, { color: "#3b82f6", lineWidth: 1, title: "DIF" }, 3).setData(line(candles, m.line));
    chart.addSeries(LineSeries, { color: "#f59e0b", lineWidth: 1, title: "訊號" }, 3).setData(line(candles, m.signal));

    const panes = chart.panes();
    [5, 1, 1.4, 1.4].forEach((f, i) => panes[i]?.setStretchFactor(f));
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, candles.length - 180), to: candles.length + 3 });
    return () => chart.remove();
  }, [candles, levels]);

  return <div ref={ref} className="chart" />;
}
