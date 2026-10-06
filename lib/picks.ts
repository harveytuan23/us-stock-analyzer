export interface Picks {
  generatedAt: string;
  signalDate: string; // month-end close the list was computed from
  priceDate: string; // latest close used for "since signal" returns
  universe: number;
  holdings: {
    rank: number;
    symbol: string;
    name: string;
    momentum: number; // 12-1 month return
    signalPrice: number;
    price: number;
    status: "新買進" | "續抱";
  }[];
  sells: { symbol: string; name: string; rank: number }[];
  watch: { rank: number; symbol: string; name: string; momentum: number; inList: boolean }[];
  market: { spy: number; spySignal: number };
}
