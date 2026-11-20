// Transaction import.
//  - Robinhood "Account activity" CSV export: Activity Date, Process Date, Settle Date, Instrument, Description,
//    Trans Code, Quantity, Price, Amount. Only Buy and Sell rows are trades; dividends, transfers, splits etc. are counted and skipped.
//  - Simple CSV: date,symbol,side,qty,price[,fees] (header row required, any column order).

export function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  text = String(text).replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); cell = ""; if (row.some((x) => x.trim())) rows.push(row); row = []; }
    else cell += c;
  }
  row.push(cell); if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

const num = (s) => {
  const t = String(s ?? "").trim(); if (!t) return NaN;
  const neg = /^\(.*\)$/.test(t) || t.startsWith("-");
  const v = Number(t.replace(/[^0-9.]/g, ""));
  return neg ? -v : v;
};
const isoDate = (s) => {
  const t = String(s || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return "";
  const y = m[3].length === 2 ? "20" + m[3] : m[3];
  return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
};

/** @returns {{ txs: object[], skipped: Record<string, number>, format: string }} */
export function importCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("the CSV has no data rows");
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names) => head.findIndex((h) => names.includes(h));
  const skipped = {}, txs = [];

  if (col("trans code") >= 0 && col("instrument") >= 0) {
    const D = col("activity date"), I = col("instrument"), C = col("trans code"), Q = col("quantity"), P = col("price"), A = col("amount");
    for (const r of rows.slice(1)) {
      const code = (r[C] || "").trim(), sym = (r[I] || "").trim().toUpperCase();
      if (!["Buy", "Sell"].includes(code) || !sym) { const k = code || "(blank)"; skipped[k] = (skipped[k] || 0) + 1; continue; }
      const qty = Math.abs(num(r[Q])), price = Math.abs(num(r[P])), amount = Math.abs(num(r[A]));
      const date = isoDate(r[D]);
      if (!date || !(qty > 0)) { skipped["unreadable"] = (skipped["unreadable"] || 0) + 1; continue; }
      // fees = gap between quantity x price and the cash amount (Robinhood folds regulatory fees into Amount)
      const gross = qty * price, fees = amount > 0 ? Math.max(0, Math.round((code === "Buy" ? amount - gross : gross - amount) * 100) / 100) : 0;
      txs.push({ date, symbol: sym, side: code.toLowerCase(), qty, price, fees: fees < gross * 0.02 ? fees : 0 });
    }
    return { txs, skipped, format: "robinhood" };
  }

  const D = col("date"), S = col("symbol", "ticker"), SD = col("side", "action", "type"), Q = col("qty", "quantity", "shares"), P = col("price"), F = col("fees", "fee");
  if ([D, S, SD, Q, P].some((x) => x < 0)) throw new Error("unknown CSV: expected a Robinhood activity export or columns date,symbol,side,qty,price");
  for (const r of rows.slice(1)) {
    const side = (r[SD] || "").trim().toLowerCase();
    if (!["buy", "sell"].includes(side)) { skipped[side || "(blank)"] = (skipped[side || "(blank)"] || 0) + 1; continue; }
    txs.push({ date: isoDate(r[D]), symbol: (r[S] || "").trim().toUpperCase(), side, qty: Math.abs(num(r[Q])), price: Math.abs(num(r[P])), fees: F >= 0 ? Math.abs(num(r[F])) || 0 : 0 });
  }
  return { txs, skipped, format: "simple" };
}
