// Tax-lot engine with the IRS wash-sale rule (Publication 550, "Wash Sales").
//
// Replays every buy and sell in date order:
//   - sells close lots first-in, first-out (FIFO, the Robinhood default)
//   - a sale at a loss is checked against purchases of substantially identical stock from 30 days before
//     to 30 days after the sale date (a 61-day window)
//   - replacement shares are matched oldest purchase first, one replacement share per sold share; a share
//     already used as a replacement can't be used again
//   - the disallowed loss moves into the basis of the replacement shares, and the holding period of the
//     sold shares is added to theirs (so a short-term loss can turn the replacement long-term sooner)
//   - if fewer replacement shares were bought than were sold, only that fraction of the loss is disallowed
//   - gains are never affected
//
// Known simplification: shares bought inside the window but already sold again before the loss sale are not
// counted as replacements. Options, IRAs and a spouse's account (which can also trigger the rule) are not seen.

import { sameSecurity } from "./identical.js";

const DAY = 86_400_000;
const EPS = 1e-9;
export const toDay = (d) => Math.round(Date.parse(d + "T00:00:00Z") / DAY);
export const fromDay = (n) => new Date(n * DAY).toISOString().slice(0, 10);
export const addDays = (d, n) => fromDay(toDay(d) + n);
export const r2 = (x) => Math.round(x * 100) / 100;

/** Held more than one year: sold after the first anniversary of the acquisition date. */
export function isLongTerm(acquired, sold) {
  const a = new Date(acquired + "T00:00:00Z");
  const anniversary = Date.UTC(a.getUTCFullYear() + 1, a.getUTCMonth(), a.getUTCDate()) / DAY;
  return toDay(sold) > anniversary;
}

/** Validates, upper-cases and orders transactions (by date, then by the order they were given). */
export function normalize(txs) {
  return txs.map((t, i) => {
    const side = String(t.side || "").toLowerCase();
    const date = String(t.date || "").slice(0, 10);
    const qty = Number(t.qty), price = Number(t.price), fees = Number(t.fees || 0);
    if (!["buy", "sell"].includes(side)) throw new Error(`transaction ${i + 1}: side must be buy or sell`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(toDay(date))) throw new Error(`transaction ${i + 1}: date must be YYYY-MM-DD`);
    if (!(qty > 0)) throw new Error(`transaction ${i + 1}: qty must be above 0`);
    if (!(price >= 0)) throw new Error(`transaction ${i + 1}: price must be 0 or more`);
    const symbol = String(t.symbol || "").trim().toUpperCase();
    if (!symbol) throw new Error(`transaction ${i + 1}: symbol missing`);
    return { id: String(t.id ?? `t${i + 1}`), date, symbol, side, qty, price, fees, seq: i, note: t.note };
  }).sort((a, b) => toDay(a.date) - toDay(b.date) || a.seq - b.seq);
}

/**
 * @param {Array<{date,symbol,side,qty,price,fees?,id?}>} txs
 * @param {{strict?: boolean}} opt strict (default true) also treats funds tracking the same index as identical
 * @returns {{ lots: object[], sales: object[], warnings: string[] }}
 */
export function run(txs, opt = {}) {
  const strict = opt.strict !== false;
  const list = normalize(txs);
  const pending = new Map();                                   // buy id -> wash adjustments waiting for that buy
  const capLeft = new Map(list.filter((t) => t.side === "buy").map((b) => [b.id, b.qty]));
  const lots = [], sales = [], warnings = [];
  let lotSeq = 0;
  const newLot = (t, qty, cost, acquired, extra = {}) => ({ id: `L${++lotSeq}`, buyId: t.id, symbol: t.symbol, boughtOn: t.date, seq: t.seq, acquired, qty, cost, free: qty, washAdj: 0, washFrom: [], ...extra });

  for (const t of list) {
    if (t.side === "buy") {
      const per = t.price + t.fees / t.qty;
      let left = t.qty;
      for (const p of pending.get(t.id) || []) {
        lots.push(newLot(t, p.qty, per + p.add / p.qty, addDays(t.date, -p.tackDays), { free: 0, washAdj: p.add, washFrom: [p.from] }));
        left -= p.qty;
      }
      if (left > EPS) lots.push(newLot(t, left, per, t.date));
      continue;
    }

    // ---- sell: close lots FIFO by purchase date
    const per = t.price - t.fees / t.qty;
    const held = lots.filter((l) => l.symbol === t.symbol && l.qty > EPS).sort((a, b) => toDay(a.boughtOn) - toDay(b.boughtOn) || a.seq - b.seq);
    const have = held.reduce((s, l) => s + l.qty, 0);
    if (have < t.qty - EPS) warnings.push(`${t.date} sell ${t.qty} ${t.symbol}: only ${r2(have)} shares on record, the rest has no known cost basis and is skipped`);
    let need = Math.min(t.qty, have);
    const parts = [];
    for (const l of held) {
      if (need <= EPS) break;
      const k = Math.min(need, l.qty);
      parts.push({ lot: { ...l }, qty: k });
      l.washAdj = l.qty > EPS ? l.washAdj * (l.qty - k) / l.qty : 0;
      l.qty -= k; l.free = Math.min(l.free, l.qty); need -= k;
    }
    for (let i = lots.length - 1; i >= 0; i--) if (lots[i].qty <= EPS) lots.splice(i, 1);

    for (const { lot, qty } of parts) {
      const proceeds = qty * per, basis = qty * lot.cost, gain = proceeds - basis;
      const sale = { sellId: t.id, date: t.date, symbol: t.symbol, qty, price: t.price, proceeds: r2(proceeds), basis: r2(basis), gain: r2(gain),
        acquired: lot.acquired, boughtOn: lot.boughtOn, lotId: lot.id, term: isLongTerm(lot.acquired, t.date) ? "long" : "short",
        disallowed: 0, replacedBy: [], washAdjIn: r2(lot.washAdj * qty / lot.qty) };
      if (gain < -EPS) {
        const loss = -gain, heldDays = toDay(t.date) - toDay(lot.acquired), lo = toDay(t.date) - 30, hi = toDay(t.date) + 30;
        // replacement candidates: shares still held that were bought in the 30 days up to the sale, then buys in the 30 days after
        const past = lots.filter((l) => l.free > EPS && sameSecurity(t.symbol, l.symbol, strict) && toDay(l.boughtOn) >= lo && toDay(l.boughtOn) <= toDay(t.date))
          .map((l) => ({ kind: "held", l, day: toDay(l.boughtOn), seq: l.seq, cap: l.free }));
        const future = list.filter((b) => b.side === "buy" && b.seq !== t.seq && (toDay(b.date) > toDay(t.date) || (toDay(b.date) === toDay(t.date) && b.seq > t.seq)) && toDay(b.date) <= hi
          && sameSecurity(t.symbol, b.symbol, strict) && capLeft.get(b.id) > EPS && !lots.some((l) => l.buyId === b.id))
          .map((b) => ({ kind: "future", b, day: toDay(b.date), seq: b.seq, cap: capLeft.get(b.id) }));
        let want = qty;
        for (const c of [...past, ...future].sort((a, b) => a.day - b.day || a.seq - b.seq)) {
          if (want <= EPS) break;
          const take = Math.min(want, c.cap), piece = loss * take / qty;
          if (c.kind === "held") {
            const l = c.l;
            const adj = { cost: l.cost + piece / take, acquired: addDays(l.acquired, -heldDays) };
            if (take < l.qty - EPS) {                       // split off the replacement shares as their own lot
              lots.push({ ...l, id: `L${++lotSeq}`, qty: take, free: 0, cost: adj.cost, acquired: adj.acquired, washAdj: l.washAdj * take / l.qty + piece, washFrom: [...l.washFrom, t.id] });
              l.washAdj = l.washAdj * (l.qty - take) / l.qty; l.qty -= take; l.free -= take;
            } else { Object.assign(l, adj, { free: l.free - take, washAdj: l.washAdj + piece, washFrom: [...l.washFrom, t.id] }); }
            capLeft.set(l.buyId, Math.max(0, (capLeft.get(l.buyId) || 0) - take));
            sale.replacedBy.push({ buyId: l.buyId, date: l.boughtOn, symbol: l.symbol, qty: take, basisAdded: r2(piece) });
          } else {
            const b = c.b;
            if (!pending.has(b.id)) pending.set(b.id, []);
            pending.get(b.id).push({ qty: take, add: piece, tackDays: heldDays, from: t.id });
            capLeft.set(b.id, capLeft.get(b.id) - take);
            sale.replacedBy.push({ buyId: b.id, date: b.date, symbol: b.symbol, qty: take, basisAdded: r2(piece) });
          }
          sale.disallowed += piece; want -= take;
        }
        sale.disallowed = r2(sale.disallowed);
      }
      sale.reportable = r2(sale.gain + sale.disallowed);          // what goes on the tax form after the wash adjustment
      sales.push(sale);
    }
  }
  lots.sort((a, b) => a.symbol.localeCompare(b.symbol) || toDay(a.boughtOn) - toDay(b.boughtOn) || a.seq - b.seq);
  return { lots: lots.map((l) => ({ ...l, cost: Math.round(l.cost * 1e4) / 1e4, washAdj: r2(l.washAdj) })), sales, warnings };
}
