"use client";
import Link from "next/link";
import Dashboard, { type Result } from "@/components/Dashboard.tsx";

async function load(symbol: string): Promise<Result> {
  const res = await fetch(`/api/analyze?symbol=${encodeURIComponent(symbol)}`);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "載入失敗");
  return body;
}

export default function Page() {
  return <Dashboard load={load} nav={<Link href="/picks" className="navlink">本月名單 →</Link>} />;
}
