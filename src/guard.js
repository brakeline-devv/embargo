// What the agent asks before it acts: "if I sell this now, do I keep the loss?", "if I buy this now, do I wash
// a loss I already took?", "which losses are worth harvesting today?", "what does this year look like?"
// Everything here is read-only: it replays the ledger plus one planned trade and reports what would happen.

import { run, addDays, toDay, r2, isLongTerm } from "./engine.js";
import { relation, sameSecurity, swapsFor } from "./identical.js";

const today = () => new Date().toISOString().slice(0, 10);
const money = (x) => (x < 0 ? "-$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
const sum = (a, f) => r2(a.reduce((s, x) => s + f(x), 0));
const DEFAULTS = { strict: true, shortRate: 0.24, longRate: 0.15 };

function identicalSet(symbol, symbols, strict) {
  return [...new Set(symbols)].filter((s) => s !== symbol && sameSecurity(symbol, s, strict)).map((s) => ({ ticker: s, why: relation(symbol, s).why }));
}

/** Planned sale: gain or loss, how much of a loss the wash-sale rule would take back, and how to avoid it. */
export function checkSell(txs, p, o = {}) {
  const opt = { ...DEFAULTS, ...o };
  const symbol = String(p.symbol || "").toUpperCase(), date = p.date || today(), price = Number(p.price);
  if (!symbol || !(price > 0)) throw new Error("symbol and price are required");
  const before = run(txs.filter((t) => t.date <= date), opt);
  const heldQty = sum(before.lots.filter((l) => l.symbol === symbol), (l) => l.qty);
  if (!(heldQty > 0)) return { symbol, verdict: "not held", message: `No ${symbol} shares on record as of ${date}.` };
  const qty = Math.min(Number(p.qty) || heldQty, heldQty);
  const planned = { id: "planned-sell", date, symbol, side: "sell", qty, price, fees: Number(p.fees || 0) };
  const r = run([...txs.filter((t) => t.date <= date), planned], opt);
  const parts = r.sales.filter((s) => s.sellId === "planned-sell");
  const gain = sum(parts, (s) => s.gain), disallowed = sum(parts, (s) => s.disallowed);
  const out = {
    symbol, date, qty, price, heldQty,
    lotsSold: parts.map((s) => ({ bought: s.boughtOn, holdingFrom: s.acquired, qty: s.qty, basis: s.basis, proceeds: s.proceeds, gain: s.gain, term: s.term, disallowed: s.disallowed, washedBy: s.replacedBy })),
    gain, disallowed, reportable: r2(gain + disallowed),
    shortTerm: sum(parts.filter((s) => s.term === "short"), (s) => s.gain + s.disallowed),
    longTerm: sum(parts.filter((s) => s.term === "long"), (s) => s.gain + s.disallowed),
  };
  if (gain >= 0) {
    out.verdict = "gain";
    out.message = `Selling ${qty} ${symbol} at $${price} realizes a ${money(gain)} gain (${out.shortTerm ? "short-term " + money(out.shortTerm) : ""}${out.shortTerm && out.longTerm ? ", " : ""}${out.longTerm ? "long-term " + money(out.longTerm) : ""}). The wash-sale rule only applies to losses.`;
    const soon = parts.filter((s) => s.term === "short").map((s) => addDays(s.acquired, 366)).sort()[0];
    if (soon && toDay(soon) - toDay(date) <= 60) out.tip = `Some of these shares turn long-term on ${soon}; waiting would move that gain to the lower long-term rate.`;
    return out;
  }
  const blockers = parts.flatMap((s) => s.replacedBy).filter((b) => b.date <= date);
  const rebuyAfter = addDays(date, 31);
  out.avoidBuyingUntil = rebuyAfter;
  out.identical = identicalSet(symbol, [...txs.map((t) => t.symbol), "SPY", "VOO", "IVV", "QQQ", "QQQM", "GOOG", "GOOGL"], opt.strict);
  out.swaps = swapsFor(symbol, opt.strict);
  if (disallowed > 0.005) {
    out.verdict = "wash sale";
    const latest = blockers.map((b) => b.date).sort().at(-1);
    out.message = `${money(-gain)} loss, but ${money(disallowed)} of it would be disallowed: you bought ${blockers.map((b) => `${r2(b.qty)} ${b.symbol} on ${b.date}`).join(", ")} within 30 days before this sale. The disallowed part is not lost, it moves into the cost basis of those shares.`;
    const whole = qty < heldQty ? checkSell(txs, { ...p, qty: heldQty }, opt) : null;
    out.ways = [
      latest ? `wait: selling on or after ${addDays(latest, 31)} keeps the whole loss (31 days after your last ${symbol} purchase), if nothing identical is bought again` : null,
      whole && whole.disallowed < disallowed - 0.005 ? `sell the whole position (${r2(heldQty)} shares): the recent shares get sold too, so ${whole.disallowed > 0.005 ? "only " + money(whole.disallowed) + " is" : "nothing is"} disallowed` : null,
      "or accept it: the loss is deferred, not gone, and comes back when the replacement shares are sold",
    ].filter(Boolean);
  } else {
    out.verdict = "clean loss";
    out.message = `${money(-gain)} loss you keep, as long as you don't buy ${symbol}${out.identical.length ? " or " + out.identical.map((x) => x.ticker).join("/") : ""} until ${rebuyAfter}. Buying it back sooner would wash the loss.`;
  }
  out.estTaxSaved = r2(-(Math.min(0, out.shortTerm) * opt.shortRate + Math.min(0, out.longTerm) * opt.longRate));
  return out;
}

/** Planned purchase: would it wash a loss already taken in the last 30 days? */
export function checkBuy(txs, p, o = {}) {
  const opt = { ...DEFAULTS, ...o };
  const symbol = String(p.symbol || "").toUpperCase(), date = p.date || today(), qty = Number(p.qty);
  if (!symbol || !(qty > 0)) throw new Error("symbol and qty are required");
  const planned = { id: "planned-buy", date, symbol, side: "buy", qty, price: Number(p.price) || 0 };
  const base = run(txs, opt), withBuy = run([...txs, planned], opt);
  const hits = withBuy.sales.filter((s) => s.replacedBy.some((b) => b.buyId === "planned-buy"))
    .map((s) => ({ soldOn: s.date, symbol: s.symbol, qty: s.qty, loss: -s.gain, disallowed: s.replacedBy.filter((b) => b.buyId === "planned-buy").reduce((x, b) => x + b.basisAdded, 0) }));
  const disallowed = sum(hits, (h) => h.disallowed);
  // loss sales of anything identical in the last 30 days that still have unmatched shares → the safe date
  const open = base.sales.filter((s) => s.gain < 0 && sameSecurity(symbol, s.symbol, opt.strict) && toDay(s.date) >= toDay(date) - 30 && toDay(s.date) <= toDay(date)
    && s.qty - s.replacedBy.reduce((x, b) => x + b.qty, 0) > 1e-9);
  const safeFrom = open.length ? addDays(open.map((s) => s.date).sort().at(-1), 31) : null;
  if (disallowed < 0.005) return { symbol, date, qty, verdict: "clear", message: `Buying ${qty} ${symbol} on ${date} does not wash any loss.${safeFrom ? "" : ""}` };
  return {
    symbol, date, qty, verdict: "would wash", disallowed, washes: hits, safeFrom,
    message: `Buying ${qty} ${symbol} on ${date} would disallow ${money(disallowed)} of losses you took on ${[...new Set(hits.map((h) => h.soldOn))].join(", ")}. Wait until ${safeFrom} or buy something that is not substantially identical.`,
    swaps: swapsFor(symbol, opt.strict),
  };
}

/** Open positions valued at current prices, with per-lot unrealized gain and holding term. */
export function positions(txs, prices, o = {}) {
  const opt = { ...DEFAULTS, ...o }, asOf = o.asOf || today();
  const { lots, warnings } = run(txs.filter((t) => t.date <= asOf), opt);
  const by = {};
  for (const l of lots) {
    const px = prices[l.symbol];
    const p = (by[l.symbol] ||= { symbol: l.symbol, qty: 0, basis: 0, price: px ?? null, value: null, unrealized: null, lots: [] });
    p.qty = r2(p.qty + l.qty); p.basis = r2(p.basis + l.qty * l.cost);
    p.lots.push({ bought: l.boughtOn, holdingFrom: l.acquired, qty: r2(l.qty), cost: l.cost, term: isLongTerm(l.acquired, asOf) ? "long" : "short",
      unrealized: px == null ? null : r2(l.qty * (px - l.cost)), washAdjusted: l.washAdj ? l.washAdj : undefined, longTermOn: isLongTerm(l.acquired, asOf) ? undefined : addDays(l.acquired, 366) });
  }
  for (const p of Object.values(by)) if (p.price != null) { p.value = r2(p.qty * p.price); p.unrealized = r2(p.value - p.basis); }
  return { asOf, positions: Object.values(by).sort((a, b) => (a.unrealized ?? 0) - (b.unrealized ?? 0)), warnings };
}

/** Losses worth harvesting today: simulate selling each losing position whole, rank by estimated tax saved. */
export function harvest(txs, prices, o = {}) {
  const opt = { ...DEFAULTS, ...o }, asOf = o.asOf || today(), minLoss = o.minLoss ?? 100;
  const { positions: pos } = positions(txs, prices, { ...opt, asOf });
  const ideas = [];
  for (const p of pos) {
    if (p.price == null || p.unrealized == null || p.unrealized > -minLoss) continue;
    const c = checkSell(txs, { symbol: p.symbol, qty: p.qty, price: p.price, date: asOf }, opt);
    if (c.verdict === "gain" || -c.reportable < minLoss) continue;
    const gainLots = p.lots.filter((l) => (l.unrealized ?? 0) > 0);
    ideas.push({
      symbol: p.symbol, qty: p.qty, price: p.price, unrealized: p.unrealized, harvestableLoss: r2(-c.reportable), disallowed: c.disallowed,
      shortTerm: c.shortTerm, longTerm: c.longTerm, estTaxSaved: c.estTaxSaved, verdict: c.verdict,
      avoidBuyingUntil: c.avoidBuyingUntil, swaps: c.swaps,
      note: gainLots.length ? `${gainLots.length} of the ${p.lots.length} lots are at a gain; selling the whole position nets them against the losses (FIFO accounts can't pick lots).` : undefined,
    });
  }
  // a swap must not be something we are harvesting too (or identical to it): buying it would wash that loss
  for (const i of ideas) i.swaps = i.swaps.filter((s) => !ideas.some((j) => sameSecurity(j.symbol, s.ticker, opt.strict)));
  ideas.sort((a, b) => b.estTaxSaved - a.estTaxSaved);
  return { asOf, rates: { shortTerm: opt.shortRate, longTerm: opt.longRate }, totalLoss: sum(ideas, (i) => i.harvestableLoss), totalTaxSaved: sum(ideas, (i) => i.estTaxSaved), ideas,
    reminder: "Net capital losses offset gains first, then up to $3,000 a year of ordinary income; the rest carries forward. Estimates only, not tax advice." };
}

/** Realized gains and losses for one tax year, with every wash sale listed. */
export function taxReport(txs, year, o = {}) {
  const opt = { ...DEFAULTS, ...o };
  const y = String(year || new Date().getUTCFullYear());
  const { sales, warnings } = run(txs, opt);
  const inYear = sales.filter((s) => s.date.startsWith(y));
  const block = (term) => { const a = inYear.filter((s) => s.term === term); return { proceeds: sum(a, (s) => s.proceeds), basis: sum(a, (s) => s.basis), gainLoss: sum(a, (s) => s.gain), washDisallowed: sum(a, (s) => s.disallowed), reportable: sum(a, (s) => s.reportable) }; };
  const short = block("short"), long = block("long"), net = r2(short.reportable + long.reportable);
  return {
    year: y, sales: inYear.length, shortTerm: short, longTerm: long, net,
    deductibleAgainstIncome: net < 0 ? Math.max(net, -3000) : 0, carryForward: net < -3000 ? r2(net + 3000) : 0,
    washSales: inYear.filter((s) => s.disallowed > 0).map((s) => ({ soldOn: s.date, symbol: s.symbol, qty: s.qty, loss: r2(-s.gain), disallowed: s.disallowed, replacedBy: s.replacedBy })),
    warnings, note: "Wash-sale adjusted, FIFO lots. Your broker's 1099-B is the official record; it does not see trades in other accounts.",
  };
}
