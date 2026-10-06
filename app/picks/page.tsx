import Link from "next/link";
import raw from "@/data/picks.json";
import type { Picks } from "@/lib/picks.ts";

export const metadata = { title: "本月名單 · 美股老手分析台" };

const picks = raw as Picks;
const pct = (v: number, d = 1) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(d)}%`;
const tone = (v: number) => (v >= 0 ? "up" : "down");

function nextMonthEnd(signalDate: string) {
  const d = new Date(signalDate + "T00:00:00Z");
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 2, 0));
  return `${end.getUTCMonth() + 1}/${end.getUTCDate()}`;
}

export default function PicksPage() {
  const ready = picks.holdings.length > 0;
  const avg = ready
    ? picks.holdings.reduce((a, h) => a + h.price / h.signalPrice - 1, 0) / picks.holdings.length
    : 0;
  const spy = picks.market.spySignal ? picks.market.spy / picks.market.spySignal - 1 : 0;

  return (
    <main className="wrap">
      <header className="top">
        <h1>本月名單</h1>
        <nav style={{ marginLeft: "auto" }}>
          <Link href="/"><button>個股分析</button></Link>
        </nav>
      </header>

      <section className="panel" style={{ borderRadius: 12 }}>
        <h3 style={{ marginTop: 0 }}>規則（經 15 年回測驗證）</h3>
        <p>每月最後一個交易日收盤後，從 S&amp;P 100 選出「過去 12 個月、扣掉最近 1 個月」漲最多的 10 檔，<strong>隔天平均分配資金買進</strong>。下個月底重新排名：<strong>掉出前 10 名就賣出</strong>，新進榜的買進，其餘續抱。</p>
        <p className="meta">回測 2011–2026：年化約 23%，同期 S&amp;P 500 約 14%；但波動較大，16 年中有 4 年輸給大盤，最大跌幅約 -33%。股票池用今天的成分股，實際報酬可能較低。</p>
      </section>

      {!ready && <p className="banner">名單產生中，請稍後再來。</p>}

      {ready && (
        <>
          <section className="scores">
            <div className="score neutral"><span>名單依據</span><strong>{picks.signalDate}</strong><small>收盤資料，下次更新 {nextMonthEnd(picks.signalDate)}</small></div>
            <div className={`score ${avg >= spy ? "bull" : "bear"}`}><span>名單至今表現</span><strong className={tone(avg)}>{pct(avg)}</strong><small>S&amp;P 500 {pct(spy)}（至 {picks.priceDate}）</small></div>
            <div className="score neutral"><span>本月異動</span><strong>{picks.holdings.filter((h) => h.status === "新買進").length} 買 / {picks.sells.length} 賣</strong><small>其餘續抱</small></div>
          </section>

          <section className="panel" style={{ borderRadius: 12 }}>
            <h3 style={{ marginTop: 0 }}>持有名單（各 10%）</h3>
            <table className="sig">
              <thead><tr><th>#</th><th>代號</th><th>動作</th><th>12-1 月動能</th><th>名單價</th><th>現價</th><th>至今</th></tr></thead>
              <tbody>
                {picks.holdings.map((h) => (
                  <tr key={h.symbol}>
                    <td>{h.rank}</td>
                    <td><Link href={`/?symbol=${h.symbol}`}><strong>{h.symbol}</strong></Link> {h.name !== h.symbol && <span className="meta">{h.name}</span>}</td>
                    <td><span className={`tag ${h.status === "新買進" ? "bull" : "neutral"}`}>{h.status}</span></td>
                    <td className="mono">{pct(h.momentum, 0)}</td>
                    <td className="mono">${h.signalPrice.toFixed(2)}</td>
                    <td className="mono">${h.price.toFixed(2)}</td>
                    <td className={`mono ${tone(h.price / h.signalPrice - 1)}`}>{pct(h.price / h.signalPrice - 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {picks.sells.length > 0 && (
              <>
                <h3>本月賣出</h3>
                <p>{picks.sells.map((s) => `${s.symbol}（跌到第 ${s.rank} 名）`).join("、")}</p>
              </>
            )}
            <p className="meta">價格為除權息調整後收盤價。</p>
          </section>

          <section className="panel" style={{ borderRadius: 12, marginTop: 14 }}>
            <h3 style={{ marginTop: 0 }}>即時排名（若今天是月底）</h3>
            <p className="meta">用 {picks.priceDate} 收盤計算，只供觀察，月底才是正式換股。</p>
            <table className="sig">
              <thead><tr><th>#</th><th>代號</th><th>12-1 月動能</th><th>月底若維持</th></tr></thead>
              <tbody>
                {picks.watch.map((w) => (
                  <tr key={w.symbol}>
                    <td>{w.rank}</td>
                    <td><Link href={`/?symbol=${w.symbol}`}><strong>{w.symbol}</strong></Link> {w.name !== w.symbol && <span className="meta">{w.name}</span>}</td>
                    <td className="mono">{pct(w.momentum, 0)}</td>
                    <td>{w.inList ? (w.rank <= 10 ? "續抱" : <span className="tag bear">可能賣出</span>) : w.rank <= 10 ? <span className="tag bull">可能新進</span> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

      <footer className="foot">
        名單由固定規則自動產生，每個交易日收盤後更新價格。過去績效不代表未來，本站內容僅供研究參考，不構成投資建議；投資前請自行判斷並承擔風險。
      </footer>
    </main>
  );
}
