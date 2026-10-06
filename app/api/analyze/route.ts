import { NextResponse } from "next/server";
import { fetchStock } from "@/lib/data/yahoo.ts";
import { analyzeAll } from "@/lib/analysis.ts";

export async function GET(req: Request) {
  const symbol = new URL(req.url).searchParams.get("symbol")?.trim().toUpperCase();
  if (!symbol || !/^[A-Z0-9.\-^]{1,12}$/.test(symbol)) {
    return NextResponse.json({ error: "請輸入有效的股票代號，例如 AAPL" }, { status: 400 });
  }
  try {
    const data = await fetchStock(symbol);
    if (data.candles.length < 60) {
      return NextResponse.json({ error: `${symbol} 的歷史資料不足，無法分析` }, { status: 422 });
    }
    return NextResponse.json(
      { ...data, analysis: analyzeAll(symbol, data.candles, data.fundamentals) },
      { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=600" } },
    );
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: `找不到 ${symbol} 或資料來源暫時無法連線` }, { status: 502 });
  }
}
