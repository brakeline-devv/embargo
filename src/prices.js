// Latest closing prices from Yahoo Finance, cached once per day in data/prices.json.
// Used only to value open lots for harvest scans; checks on a planned trade take the price you pass in.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dataFile } from "./paths.js";

const FILE = dataFile("prices.json");
const today = () => new Date().toISOString().slice(0, 10);
const load = () => { try { return existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {}; } catch { return {}; } };

async function fetchClose(sym, timeoutMs) {
  const y = sym.replace(".", "-");
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(y)}?range=5d&interval=1d`,
    { signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": "Mozilla/5.0" } });
  const res = (await r.json())?.chart?.result?.[0];
  const price = res?.meta?.regularMarketPrice ?? res?.indicators?.quote?.[0]?.close?.filter((c) => c > 0).at(-1);
  if (!(price > 0)) throw new Error(`no price for ${sym}`);
  return price;
}

/** @returns {Promise<{prices: Record<string, number>, missing: string[]}>} */
export async function latestPrices(symbols, { timeoutMs = 8000 } = {}) {
  const cache = load(), day = today(), prices = {}, missing = [];
  await Promise.all([...new Set(symbols)].map(async (s) => {
    if (cache[s]?.day === day) { prices[s] = cache[s].price; return; }
    try { prices[s] = await fetchClose(s, timeoutMs); cache[s] = { day, price: prices[s] }; }
    catch { if (cache[s]) prices[s] = cache[s].price; else missing.push(s); }
  }));
  try { writeFileSync(FILE, JSON.stringify(cache)); } catch { /* read-only disk */ }
  return { prices, missing };
}
