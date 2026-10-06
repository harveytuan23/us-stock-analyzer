# 美股老手分析台

輸入美股代號，自動產生三份報告：

- **技術分析**：K 線、MA20/50/200、布林通道、成交量、RSI、MACD，逐項判讀多空，並算出近 60 日支撐壓力與 ATR。
- **基本面分析**：估值（P/E、PEG、P/B）、成長（營收、盈餘年增）、獲利（毛利率、營業利益率、ROE）、財務體質（負債權益比、流動比率、自由現金流）、股東回報（殖利率、配息率），給 A–F 評等。
- **策略建議**：基本面 55% + 技術面 45% 綜合評分，給出「積極買進／逢低布局／持有觀望／減碼／避開」、進場區間、停損、兩個目標價、風險報酬比、部位控管與風險提醒。

資料來源為 Yahoo Finance（透過 `yahoo-finance2`，免費、免金鑰）。顏色採台股習慣：紅漲綠跌。

## 本機執行

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # 指標與策略單元測試
```

需要 Node 22 以上。

## 部署到 Vercel（免費）

1. 在 GitHub 建立一個新 repo，把這個資料夾推上去。
2. 到 vercel.com 用 GitHub 登入，Import 該 repo，全部用預設值按 Deploy。
3. 不需要設定任何環境變數。

## 程式結構

| 路徑 | 用途 |
| --- | --- |
| `lib/indicators.ts` | 指標計算（SMA、EMA、RSI、MACD、布林、ATR），純函式 |
| `lib/analysis.ts` | 技術判讀、基本面評分、策略產生 |
| `lib/data/yahoo.ts` | 資料抓取，要換資料商只改這個檔 |
| `app/api/analyze` | `GET /api/analyze?symbol=AAPL` 回傳資料加分析結果 |
| `components/` | 圖表與儀表板 |
| `demo/entry.tsx` | 離線預覽版（模擬資料） |

本站內容由規則式模型自動產生，僅供研究參考，不構成投資建議。
