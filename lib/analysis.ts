import type { Candle, Fundamentals } from "./types.ts";
import { atr, bollinger, last, macd, rsi, sma } from "./indicators.ts";

export type Verdict = "bull" | "bear" | "neutral";

export interface Signal {
  name: string;
  value: string;
  verdict: Verdict;
  note: string;
}

export interface TechnicalReport {
  score: number; // -100 (very bearish) .. 100 (very bullish)
  trend: "多頭" | "空頭" | "盤整";
  signals: Signal[];
  support: number;
  resistance: number;
  atr: number;
  price: number;
  change1d: number;
  change1m: number;
  change1y: number;
}

export interface FundamentalItem {
  group: "估值" | "成長" | "獲利" | "財務體質" | "股東回報";
  label: string;
  value: string;
  verdict: Verdict;
  note: string;
}

export interface FundamentalReport {
  score: number; // 0..100
  grade: "A" | "B" | "C" | "D" | "F";
  items: FundamentalItem[];
}

export interface StrategyReport {
  stance: "積極買進" | "逢低布局" | "持有觀望" | "減碼" | "避開";
  composite: number; // 0..100
  entryLow: number;
  entryHigh: number;
  stopLoss: number;
  target1: number;
  target2: number;
  riskReward: number;
  positionHint: string;
  commentary: string[];
  risks: string[];
}

const pct = (v: number | undefined, digits = 1) =>
  v == null ? "—" : `${(v * 100).toFixed(digits)}%`;
const num = (v: number | undefined, digits = 2) => (v == null ? "—" : v.toFixed(digits));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function analyzeTechnicals(candles: Candle[]): TechnicalReport {
  const close = candles.map((c) => c.close);
  const high = candles.map((c) => c.high);
  const low = candles.map((c) => c.low);
  const vol = candles.map((c) => c.volume);
  const price = close[close.length - 1];
  const signals: Signal[] = [];
  let score = 0;

  const ma20 = last(sma(close, 20));
  const ma50 = last(sma(close, 50));
  const ma200 = last(sma(close, 200));
  const ma50Prev = last(sma(close, 50), 10);

  // Trend: price vs. the 50/200-day averages and their alignment.
  let trend: TechnicalReport["trend"] = "盤整";
  if (ma50 != null && ma200 != null) {
    if (price > ma50 && ma50 > ma200) trend = "多頭";
    else if (price < ma50 && ma50 < ma200) trend = "空頭";
    const golden = ma50 > ma200;
    signals.push({
      name: "均線排列 (50/200日)",
      value: `MA50 ${ma50.toFixed(2)} / MA200 ${ma200.toFixed(2)}`,
      verdict: golden ? "bull" : "bear",
      note: golden
        ? "50 日線在 200 日線之上，長期趨勢偏多（黃金交叉格局）。"
        : "50 日線在 200 日線之下，長期趨勢偏空（死亡交叉格局），逆勢做多要格外小心。",
    });
    score += golden ? 20 : -20;
    const above200 = price > ma200;
    signals.push({
      name: "股價 vs 200日線",
      value: `${(((price - ma200) / ma200) * 100).toFixed(1)}%`,
      verdict: above200 ? "bull" : "bear",
      note: above200
        ? "站穩 200 日線，機構眼中的『牛熊分界』在腳下。"
        : "跌破 200 日線，多數大型基金不會在這裡積極加碼。",
    });
    score += above200 ? 15 : -15;
  }
  if (ma20 != null && ma50 != null && ma50Prev != null) {
    const rising = ma50 > ma50Prev;
    signals.push({
      name: "短中期動能 (20日線)",
      value: `MA20 ${ma20.toFixed(2)}，MA50 ${rising ? "上彎" : "下彎"}`,
      verdict: price > ma20 && rising ? "bull" : price < ma20 && !rising ? "bear" : "neutral",
      note:
        price > ma20 && rising
          ? "股價在 20 日線上方且 50 日線上彎，短線動能健康。"
          : price < ma20 && !rising
            ? "股價跌落 20 日線且 50 日線下彎，短線仍在修正。"
            : "短線動能分歧，等方向明確再動手。",
    });
    score += price > ma20 && rising ? 10 : price < ma20 && !rising ? -10 : 0;
  }

  const r = last(rsi(close, 14));
  if (r != null) {
    let verdict: Verdict = "neutral";
    let note = "RSI 位於中性區間，沒有過熱也沒有恐慌。";
    if (r >= 70) {
      verdict = "bear";
      note = "RSI 超過 70，短線過熱。強勢股可以更熱，但這裡追高的風險報酬不划算。";
      score -= 10;
    } else if (r <= 30) {
      verdict = "bull";
      note = "RSI 低於 30，短線超賣。若基本面沒壞，常是分批承接的機會。";
      score += 10;
    } else if (r >= 50) {
      verdict = "bull";
      note = "RSI 在 50 以上，買方仍佔上風。";
      score += 5;
    } else {
      verdict = "bear";
      note = "RSI 在 50 以下，賣方略佔上風。";
      score -= 5;
    }
    signals.push({ name: "RSI (14)", value: r.toFixed(1), verdict, note });
  }

  const m = macd(close);
  const mh = last(m.hist);
  const mhPrev = last(m.hist, 1);
  const ml = last(m.line);
  if (mh != null && mhPrev != null && ml != null) {
    const crossUp = mhPrev <= 0 && mh > 0;
    const crossDown = mhPrev >= 0 && mh < 0;
    const verdict: Verdict = mh > 0 ? "bull" : "bear";
    signals.push({
      name: "MACD (12,26,9)",
      value: `DIF ${ml.toFixed(2)}，柱狀 ${mh.toFixed(2)}`,
      verdict,
      note: crossUp
        ? "MACD 剛出現黃金交叉，動能由空翻多。"
        : crossDown
          ? "MACD 剛出現死亡交叉，動能由多翻空。"
          : mh > 0
            ? mh > mhPrev
              ? "柱狀體為正且擴大，多方動能增強中。"
              : "柱狀體為正但收斂，多方力道放緩。"
            : mh < mhPrev
              ? "柱狀體為負且擴大，空方動能增強中。"
              : "柱狀體為負但收斂，賣壓正在減輕。",
    });
    score += crossUp ? 15 : crossDown ? -15 : mh > 0 ? 8 : -8;
  }

  const bb = bollinger(close);
  const up = last(bb.upper);
  const lo = last(bb.lower);
  const mid = last(bb.mid);
  if (up != null && lo != null && mid != null) {
    const b = (price - lo) / (up - lo || 1);
    const width = (up - lo) / mid;
    let verdict: Verdict = "neutral";
    let note = `位於通道中段 (%B ${(b * 100).toFixed(0)}%)。`;
    if (b > 1) {
      verdict = "bear";
      note = "股價突破上軌，短線偏離過大，容易拉回。";
      score -= 5;
    } else if (b < 0) {
      verdict = "bull";
      note = "股價跌破下軌，短線超跌，留意反彈。";
      score += 5;
    }
    if (width < 0.08) note += " 通道極度收窄，大行情可能即將發動。";
    signals.push({
      name: "布林通道 (20,2)",
      value: `上 ${up.toFixed(2)} / 中 ${mid.toFixed(2)} / 下 ${lo.toFixed(2)}`,
      verdict,
      note,
    });
  }

  // Volume: today's volume against its 20-day average, signed by the day's move.
  const vAvg = last(sma(vol, 20));
  if (vAvg && close.length > 1) {
    const ratio = vol[vol.length - 1] / vAvg;
    const upDay = price >= close[close.length - 2];
    const verdict: Verdict = ratio > 1.5 ? (upDay ? "bull" : "bear") : "neutral";
    signals.push({
      name: "成交量",
      value: `${ratio.toFixed(2)} 倍均量`,
      verdict,
      note:
        ratio > 1.5
          ? upDay
            ? "帶量上漲，有資金進場。"
            : "帶量下跌，有資金在出貨，要提高警覺。"
          : "量能平穩，沒有明顯的資金異動。",
    });
    score += verdict === "bull" ? 5 : verdict === "bear" ? -5 : 0;
  }

  const lookback = candles.slice(-60);
  const support = Math.min(...lookback.map((c) => c.low));
  const resistance = Math.max(...lookback.map((c) => c.high));
  const a = last(atr(high, low, close)) ?? price * 0.02;
  const back = (n: number) => close[Math.max(0, close.length - 1 - n)];

  return {
    score: clamp(Math.round(score), -100, 100),
    trend,
    signals,
    support,
    resistance,
    atr: a,
    price,
    change1d: price / back(1) - 1,
    change1m: price / back(21) - 1,
    change1y: price / back(252) - 1,
  };
}

export function analyzeFundamentals(f: Fundamentals): FundamentalReport {
  const items: FundamentalItem[] = [];
  let points = 0;
  let max = 0;
  const add = (item: FundamentalItem, weight = 1) => {
    items.push(item);
    max += weight;
    points += item.verdict === "bull" ? weight : item.verdict === "neutral" ? weight / 2 : 0;
  };

  if (f.trailingPE != null || f.forwardPE != null) {
    const pe = f.forwardPE ?? f.trailingPE!;
    add({
      group: "估值",
      label: "本益比 (P/E)",
      value: `近12月 ${num(f.trailingPE, 1)} / 預估 ${num(f.forwardPE, 1)}`,
      verdict: pe < 0 ? "bear" : pe < 18 ? "bull" : pe < 35 ? "neutral" : "bear",
      note:
        pe < 0
          ? "公司目前虧損，本益比沒有參考意義，要看營收與現金流。"
          : pe < 18
            ? "估值低於大盤長期平均（約 16–20 倍），有安全邊際。"
            : pe < 35
              ? "估值合理到偏高，需要成長來撐。"
              : "估值昂貴，市場已經預支了很多好消息。",
    });
  }
  if (f.pegRatio != null && f.pegRatio > 0) {
    add({
      group: "估值",
      label: "PEG",
      value: num(f.pegRatio),
      verdict: f.pegRatio < 1 ? "bull" : f.pegRatio < 2 ? "neutral" : "bear",
      note:
        f.pegRatio < 1
          ? "以成長率來看估值便宜，這是彼得林區最愛的格局。"
          : f.pegRatio < 2
            ? "成長與估值大致相稱。"
            : "成長追不上估值。",
    });
  }
  if (f.priceToBook != null) {
    add(
      {
        group: "估值",
        label: "股價淨值比 (P/B)",
        value: num(f.priceToBook),
        verdict: f.priceToBook < 3 ? "bull" : f.priceToBook < 10 ? "neutral" : "bear",
        note: "輕資產科技股 P/B 普遍偏高，金融、工業股更適合用這個指標。",
      },
      0.5,
    );
  }
  if (f.revenueGrowth != null) {
    add(
      {
        group: "成長",
        label: "營收年增率",
        value: pct(f.revenueGrowth),
        verdict: f.revenueGrowth > 0.1 ? "bull" : f.revenueGrowth > 0 ? "neutral" : "bear",
        note:
          f.revenueGrowth > 0.2
            ? "營收高速成長，生意正在擴張。"
            : f.revenueGrowth > 0.1
              ? "營收穩健雙位數成長。"
              : f.revenueGrowth > 0
                ? "營收小幅成長，成長動能普通。"
                : "營收衰退，要弄清楚是景氣循環還是競爭力流失。",
      },
      1.5,
    );
  }
  if (f.earningsGrowth != null) {
    add({
      group: "成長",
      label: "盈餘年增率",
      value: pct(f.earningsGrowth),
      verdict: f.earningsGrowth > 0.1 ? "bull" : f.earningsGrowth > 0 ? "neutral" : "bear",
      note: f.earningsGrowth > f.revenueGrowth! ? "盈餘成長快於營收，營運槓桿正在發揮。" : "盈餘成長未超越營收，留意成本壓力。",
    });
  }
  if (f.grossMargins != null) {
    add({
      group: "獲利",
      label: "毛利率",
      value: pct(f.grossMargins),
      verdict: f.grossMargins > 0.5 ? "bull" : f.grossMargins > 0.25 ? "neutral" : "bear",
      note: f.grossMargins > 0.5 ? "高毛利代表有定價權或護城河。" : "毛利率普通，產品差異化有限或屬於薄利產業。",
    });
  }
  if (f.operatingMargins != null) {
    add({
      group: "獲利",
      label: "營業利益率",
      value: pct(f.operatingMargins),
      verdict: f.operatingMargins > 0.2 ? "bull" : f.operatingMargins > 0.08 ? "neutral" : "bear",
      note: "本業賺錢的效率，比淨利率更能反映經營實力。",
    });
  }
  if (f.returnOnEquity != null) {
    add(
      {
        group: "獲利",
        label: "股東權益報酬率 (ROE)",
        value: pct(f.returnOnEquity),
        verdict: f.returnOnEquity > 0.15 ? "bull" : f.returnOnEquity > 0.08 ? "neutral" : "bear",
        note:
          f.returnOnEquity > 0.15
            ? "ROE 長期高於 15% 是巴菲特挑股票的基本門檻。"
            : "ROE 偏低，資本運用效率有待加強。",
      },
      1.5,
    );
  }
  if (f.debtToEquity != null) {
    const de = f.debtToEquity / 100;
    add({
      group: "財務體質",
      label: "負債權益比",
      value: `${de.toFixed(2)} 倍`,
      verdict: de < 0.5 ? "bull" : de < 1.5 ? "neutral" : "bear",
      note: de < 0.5 ? "財務槓桿低，景氣反轉時抗壓性強。" : de < 1.5 ? "槓桿適中。" : "負債偏高，升息或景氣下行時壓力大。",
    });
  }
  if (f.currentRatio != null) {
    add(
      {
        group: "財務體質",
        label: "流動比率",
        value: num(f.currentRatio),
        verdict: f.currentRatio > 1.5 ? "bull" : f.currentRatio > 1 ? "neutral" : "bear",
        note: f.currentRatio > 1 ? "短期償債能力足夠。" : "流動資產不足以支應短期負債，要看現金流是否穩定。",
      },
      0.5,
    );
  }
  if (f.freeCashflow != null) {
    add(
      {
        group: "財務體質",
        label: "自由現金流",
        value: formatBig(f.freeCashflow),
        verdict: f.freeCashflow > 0 ? "bull" : "bear",
        note: f.freeCashflow > 0 ? "公司真的有在產生現金，這是最難作假的數字。" : "自由現金流為負，成長靠燒錢，要看資金能撐多久。",
      },
      1.5,
    );
  }
  if (f.dividendYield != null && f.dividendYield > 0) {
    add(
      {
        group: "股東回報",
        label: "殖利率",
        value: pct(f.dividendYield, 2),
        verdict: f.payoutRatio != null && f.payoutRatio > 0.9 ? "bear" : "bull",
        note:
          f.payoutRatio != null && f.payoutRatio > 0.9
            ? `配息率 ${pct(f.payoutRatio, 0)}，配得比賺得多，股息可能難以持續。`
            : `配息率 ${pct(f.payoutRatio, 0)}，股息有獲利支撐。`,
      },
      0.5,
    );
  }

  const score = max ? Math.round((points / max) * 100) : 50;
  const grade = score >= 80 ? "A" : score >= 65 ? "B" : score >= 50 ? "C" : score >= 35 ? "D" : "F";
  return { score, grade, items };
}

export function buildStrategy(
  symbol: string,
  t: TechnicalReport,
  fr: FundamentalReport,
  f: Fundamentals,
): StrategyReport {
  // Fundamentals decide WHAT to own, technicals decide WHEN: weight 55/45.
  const techNorm = (t.score + 100) / 2;
  const composite = Math.round(fr.score * 0.55 + techNorm * 0.45);
  const stance: StrategyReport["stance"] =
    composite >= 72 ? "積極買進" : composite >= 58 ? "逢低布局" : composite >= 45 ? "持有觀望" : composite >= 32 ? "減碼" : "避開";

  const p = t.price;
  // Entry zone: between nearby support and current price, never wider than 2 ATR.
  const entryLow = Math.max(t.support, p - 2 * t.atr);
  const entryHigh = stance === "積極買進" ? p : Math.max(entryLow, p - 0.5 * t.atr);
  // Stop just under support, but never more than 2.5 ATR or less than 1 ATR below entry.
  const stopLoss = Math.min(Math.max(t.support * 0.98, entryLow - 2.5 * t.atr), entryLow - t.atr);
  const risk = (entryLow + entryHigh) / 2 - stopLoss;
  const target1 = Math.max(t.resistance, p + 2 * risk);
  const target2 = Math.max(
    f.targetMeanPrice && f.targetMeanPrice > target1 ? f.targetMeanPrice : 0,
    p + 3.5 * risk,
  );
  const riskReward = (target1 - (entryLow + entryHigh) / 2) / (risk || 1);

  const bulls = t.signals.filter((s) => s.verdict === "bull").length;
  const bears = t.signals.filter((s) => s.verdict === "bear").length;
  const goodF = fr.items.filter((i) => i.verdict === "bull").map((i) => i.label);
  const badF = fr.items.filter((i) => i.verdict === "bear").map((i) => i.label);

  const commentary: string[] = [];
  commentary.push(
    `${symbol} 目前技術面屬於「${t.trend}」格局，${t.signals.length} 個技術訊號中 ${bulls} 個偏多、${bears} 個偏空；基本面評等 ${fr.grade}（${fr.score} 分）。綜合評分 ${composite} 分，我的看法是「${stance}」。`,
  );
  if (goodF.length) commentary.push(`這家公司的強項在 ${goodF.slice(0, 4).join("、")}。`);
  if (badF.length) commentary.push(`需要盯緊的是 ${badF.slice(0, 4).join("、")}，這些是空頭會拿來做文章的地方。`);

  const advice: Record<StrategyReport["stance"], string> = {
    積極買進:
      "基本面和技術面同時站在你這邊，這種時候不需要等完美價位。可以先建立 1/2 部位，拉回到進場區下緣再補齊。",
    逢低布局:
      "公司體質不錯，但現在的位置不是最甜的。不要追，在進場區分 2–3 批掛單，用時間換取更好的成本。",
    持有觀望:
      "多空訊號混雜，這時候最好的部位往往是現金。已經持有的可以續抱並守住停損；空手的等趨勢表態再說。",
    減碼:
      "優勢正在流失，持有者應該把部位降下來、把獲利落袋。五十年來我學到的一件事：先想會虧多少，再想能賺多少。",
    避開:
      "基本面和技術面都不支持，便宜可以更便宜。市場上好公司多得是，不必在這裡跟趨勢作對。",
  };
  commentary.push(advice[stance]);
  if (t.trend === "空頭" && fr.score >= 65)
    commentary.push("好公司遇到空頭走勢，常是長線資金的機會，但一定要等股價重新站回 50 日線再加碼，不要接落下的刀。");
  if (t.trend === "多頭" && fr.score < 40)
    commentary.push("走勢強但基本面撐不住，這種行情多半靠資金和題材推動，只適合短線操作，嚴設停損。");

  const risks: string[] = [];
  if (f.beta != null && f.beta > 1.3) risks.push(`Beta ${f.beta.toFixed(2)}，波動大於大盤，大盤回檔時跌幅通常更深。`);
  if ((f.forwardPE ?? f.trailingPE ?? 0) > 40) risks.push("高估值股對財報和利率特別敏感，一季不如預期就可能重挫。");
  if (f.debtToEquity != null && f.debtToEquity > 150) risks.push("負債偏高，利率維持高檔會壓縮獲利。");
  if (f.fiftyTwoWeekHigh && p > f.fiftyTwoWeekHigh * 0.97) risks.push("股價接近 52 週高點，獲利了結賣壓可能出現。");
  if (t.signals.some((s) => s.name.startsWith("RSI") && s.verdict === "bear" && parseFloat(s.value) >= 70))
    risks.push("RSI 過熱，短線拉回機率高。");
  risks.push("財報公布日前後波動放大，建議避開財報前一週重押。");

  const positionHint =
    stance === "積極買進"
      ? "單一個股不超過總資金 10%；以停損距離計算，單筆最大虧損控制在總資金 1–2%。"
      : stance === "逢低布局"
        ? "先建 3–5% 試單，確認支撐有效再加碼，單筆最大虧損控制在總資金 1%。"
        : "目前不建議新增部位；已持有者守住停損。";

  return { stance, composite, entryLow, entryHigh, stopLoss, target1, target2, riskReward, positionHint, commentary, risks };
}

export function formatBig(v?: number) {
  if (v == null) return "—";
  const a = Math.abs(v);
  if (a >= 1e12) return `${(v / 1e12).toFixed(2)} 兆`;
  if (a >= 1e8) return `${(v / 1e8).toFixed(1)} 億`;
  if (a >= 1e4) return `${(v / 1e4).toFixed(1)} 萬`;
  return v.toFixed(0);
}

export function analyzeAll(symbol: string, candles: Candle[], f: Fundamentals) {
  const technical = analyzeTechnicals(candles);
  const fundamental = analyzeFundamentals(f);
  const strategy = buildStrategy(symbol, technical, fundamental, f);
  return { technical, fundamental, strategy };
}
export type Analysis = ReturnType<typeof analyzeAll>;
