// Engine tests. The first ones follow the examples in IRS Publication 550 ("Wash Sales").
import { test } from "node:test";
import assert from "node:assert/strict";
import { run, isLongTerm } from "../src/engine.js";
import { checkSell, checkBuy, harvest, taxReport } from "../src/guard.js";
import { importCsv } from "../src/csv.js";
import { relation, swapsFor } from "../src/identical.js";

const B = (date, symbol, qty, price) => ({ date, symbol, side: "buy", qty, price });
const S = (date, symbol, qty, price) => ({ date, symbol, side: "sell", qty, price });

test("Pub 550: loss disallowed and added to the basis of the new shares", () => {
  // buy 100 for $1,000, sell for $750, buy 100 again for $800 within 30 days → basis 1,050
  const r = run([B("2026-01-02", "X", 100, 10), S("2026-03-02", "X", 100, 7.5), B("2026-03-20", "X", 100, 8)]);
  assert.equal(r.sales[0].gain, -250);
  assert.equal(r.sales[0].disallowed, 250);
  assert.equal(r.sales[0].reportable, 0);
  assert.equal(r.lots.length, 1);
  assert.equal(Math.round(r.lots[0].qty * r.lots[0].cost * 100) / 100, 1050);
});

test("Pub 550: fewer replacement shares → only that share of the loss is disallowed", () => {
  const r = run([B("2026-01-02", "X", 100, 10), S("2026-03-02", "X", 100, 0), B("2026-03-10", "X", 75, 1)]);
  assert.equal(r.sales[0].gain, -1000);
  assert.equal(r.sales[0].disallowed, 750);
  assert.equal(r.sales[0].reportable, -250);
});

test("Pub 550: replacement shares are matched oldest purchase first", () => {
  // sold 100 at a $1,000 loss, then bought 50 on each of 4 days: only the first two buys absorb it, $500 each
  const r = run([B("2025-09-24", "M", 100, 20), S("2026-02-03", "M", 100, 10), B("2026-02-10", "M", 50, 11), B("2026-02-11", "M", 50, 11), B("2026-02-12", "M", 50, 11), B("2026-02-13", "M", 50, 11)]);
  assert.equal(r.sales[0].disallowed, 1000);
  assert.deepEqual(r.sales[0].replacedBy.map((x) => [x.date, x.qty, x.basisAdded]), [["2026-02-10", 50, 500], ["2026-02-11", 50, 500]]);
  const costs = Object.fromEntries(r.lots.map((l) => [l.boughtOn, l.cost]));
  assert.equal(costs["2026-02-10"], 21);
  assert.equal(costs["2026-02-12"], 11);
});

test("a purchase in the 30 days BEFORE the loss sale also washes it", () => {
  const r = run([B("2026-01-02", "X", 10, 100), B("2026-02-10", "X", 10, 80), S("2026-02-20", "X", 10, 70)]);
  // FIFO sells the January lot at a $300 loss; the February lot (10 days earlier) is the replacement
  assert.equal(r.sales[0].gain, -300);
  assert.equal(r.sales[0].disallowed, 300);
  assert.equal(r.lots[0].cost, 110);
});

test("day 31 is outside the window", () => {
  const r = run([B("2026-01-02", "X", 10, 100), S("2026-03-02", "X", 10, 70), B("2026-04-02", "X", 10, 70)]);
  assert.equal(r.sales[0].disallowed, 0);
  const r30 = run([B("2026-01-02", "X", 10, 100), S("2026-03-02", "X", 10, 70), B("2026-04-01", "X", 10, 70)]);
  assert.equal(r30.sales[0].disallowed, 300);
});

test("gains are never washed", () => {
  const r = run([B("2026-01-02", "X", 10, 50), S("2026-02-02", "X", 10, 70), B("2026-02-10", "X", 10, 70)]);
  assert.equal(r.sales[0].gain, 200);
  assert.equal(r.sales[0].disallowed, 0);
});

test("selling part of a lot at a loss washes against the rest of that same lot", () => {
  const r = run([B("2026-09-01", "AAPL", 30, 262), S("2026-09-15", "AAPL", 15, 241)]);
  assert.equal(r.sales[0].disallowed, 315);
  assert.equal(r.lots[0].qty, 15);
  assert.equal(r.lots[0].cost, 283);
});

test("holding period of the sold shares carries over to the replacement", () => {
  const r = run([B("2025-01-10", "X", 10, 100), S("2025-12-01", "X", 10, 80), B("2025-12-15", "X", 10, 80)]);
  const lot = r.lots[0];
  assert.equal(lot.acquired, "2025-01-24");                 // 325 days held, tacked onto 2025-12-15
  assert.equal(isLongTerm(lot.acquired, "2026-01-26"), true);
  const g = run([B("2025-01-10", "X", 10, 100), S("2025-12-01", "X", 10, 80), B("2025-12-15", "X", 10, 80), S("2026-01-26", "X", 10, 90)]);
  assert.equal(g.sales[1].term, "long");
});

test("a share used as a replacement can't be used again", () => {
  const r = run([B("2026-01-02", "X", 10, 100), B("2026-01-03", "X", 10, 100), S("2026-02-01", "X", 10, 90), S("2026-02-02", "X", 10, 90), B("2026-02-05", "X", 10, 90)]);
  // first sale (Jan 2 lot) washes against the Jan 3 lot; second sale sells that adjusted lot and washes against Feb 5
  assert.equal(r.sales[0].disallowed, 100);
  assert.equal(r.sales[1].gain, -200);
  assert.equal(r.sales[1].disallowed, 200);
  assert.equal(r.lots[0].cost, 110);
});

test("same-index funds wash in strict mode, not in lenient mode", () => {
  const t = [B("2025-10-01", "SPY", 15, 668.4), S("2025-11-03", "SPY", 15, 641.2), B("2025-11-20", "VOO", 15, 592)];
  assert.equal(run(t).sales[0].disallowed, 408);
  assert.equal(run(t, { strict: false }).sales[0].disallowed, 0);
  assert.equal(relation("GOOG", "GOOGL").level, "identical");
  assert.ok(swapsFor("SPY").every((s) => !["VOO", "IVV", "SPLG", "SPY"].includes(s.ticker)));
});

test("check_sell spots the wash and offers ways out", () => {
  const txs = [B("2026-10-01", "AMD", 10, 200), B("2026-11-10", "AMD", 5, 160)];
  const c = checkSell(txs, { symbol: "AMD", qty: 10, price: 150, date: "2026-11-20" });
  assert.equal(c.verdict, "wash sale");
  assert.equal(c.gain, -500);
  assert.equal(c.disallowed, 250);
  assert.ok(c.ways.some((w) => w.includes("2026-12-11")));
  const whole = checkSell(txs, { symbol: "AMD", qty: 15, price: 150, date: "2026-11-20" });
  assert.equal(whole.verdict, "clean loss");
  assert.equal(whole.avoidBuyingUntil, "2026-12-21");
});

test("check_buy warns before buying back inside the window", () => {
  const txs = [B("2026-09-01", "TSLA", 10, 430), S("2026-11-01", "TSLA", 10, 352)];
  const c = checkBuy(txs, { symbol: "TSLA", qty: 10, date: "2026-11-20" });
  assert.equal(c.verdict, "would wash");
  assert.equal(c.disallowed, 780);
  assert.equal(c.safeFrom, "2026-12-02");
  assert.equal(checkBuy(txs, { symbol: "TSLA", qty: 10, date: "2026-12-02" }).verdict, "clear");
  assert.equal(checkBuy(txs, { symbol: "XLY", qty: 10, date: "2026-11-20" }).verdict, "clear");
});

test("harvest ranks losing positions and the tax report adds it all up", () => {
  const txs = [B("2026-01-05", "AMD", 20, 200), B("2026-02-05", "PLTR", 50, 150), B("2026-03-05", "KO", 10, 60), S("2026-04-01", "PLTR", 10, 120)];
  const h = harvest(txs, { AMD: 150, PLTR: 100, KO: 70 }, { asOf: "2026-11-20" });
  assert.deepEqual(h.ideas.map((i) => i.symbol), ["PLTR", "AMD"]);
  assert.equal(h.ideas[0].harvestableLoss, 2000);
  assert.equal(h.ideas[0].estTaxSaved, 480);
  const rep = taxReport(txs, 2026);
  assert.equal(rep.shortTerm.gainLoss, -300);
  assert.equal(rep.washSales.length, 0);                    // the 40 PLTR left were bought 55 days before the sale: outside the window
});

test("harvest never suggests swapping into another position it is harvesting", () => {
  const txs = [B("2026-06-01", "COIN", 10, 300), B("2026-06-01", "HOOD", 10, 140)];
  const h = harvest(txs, { COIN: 250, HOOD: 100 }, { asOf: "2026-11-20" });
  const coin = h.ideas.find((i) => i.symbol === "COIN");
  assert.ok(coin.swaps.length > 0);
  assert.ok(!coin.swaps.some((s) => s.ticker === "HOOD"));
});

test("Robinhood CSV import keeps buys and sells and skips the rest", () => {
  const csv = `"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"
"11/3/2026","11/3/2026","11/4/2026","HOOD","Robinhood Markets","Buy","60","$141.00","($8,460.00)"
"10/15/2026","10/15/2026","10/16/2026","TSLA","Tesla","Sell","10","$352.00","$3,519.97"
"10/1/2026","10/1/2026","10/1/2026","AAPL","Apple Dividend","CDIV","","","$4.20"
`;
  const r = importCsv(csv);
  assert.equal(r.format, "robinhood");
  assert.equal(r.txs.length, 2);
  assert.deepEqual(r.txs[1], { date: "2026-10-15", symbol: "TSLA", side: "sell", qty: 10, price: 352, fees: 0.03 });
  assert.equal(r.skipped.CDIV, 1);
});
