import { NextResponse } from "next/server";
import { searchSymbols } from "@/lib/data/yahoo.ts";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q) return NextResponse.json([]);
  try {
    return NextResponse.json(await searchSymbols(q));
  } catch {
    return NextResponse.json([]);
  }
}
