// wash-guard MCP server (stdio). Read-only: no tool can place, change or cancel an order.
// The agent calls check_sell / check_buy BEFORE it trades, and harvest_candidates to find losses worth taking.
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { load, addTxs, setSettings } from "./store.js";
import { importCsv } from "./csv.js";
import { checkSell, checkBuy, positions, harvest, taxReport } from "./guard.js";
import { latestPrices } from "./prices.js";
import { GROUP_LIST } from "./identical.js";
import { DEMO } from "./demo.js";

const date = { type: "string", description: "YYYY-MM-DD, default today" };
const TOOLS = [
  { name: "check_sell", description: "Call BEFORE selling. Replays the ledger plus the planned sale (FIFO lots) and says whether it is a gain, a clean loss, or a wash sale (a loss the IRS disallows because substantially identical shares were bought within 30 days before). For a loss it gives the date before which nothing identical may be bought back, swap ideas, and an estimated tax saving.",
    inputSchema: { type: "object", properties: { symbol: { type: "string" }, qty: { type: "number", description: "shares to sell, default the whole position" }, price: { type: "number", description: "expected sale price, default the latest market price" }, date }, required: ["symbol"] } },
  { name: "check_buy", description: "Call BEFORE buying. Says whether the purchase would wash a loss already taken on the same or a substantially identical security in the last 30 days, how much loss it would disallow, the first safe date, and swaps that are not identical.",
    inputSchema: { type: "object", properties: { symbol: { type: "string" }, qty: { type: "number" }, date }, required: ["symbol", "qty"] } },
  { name: "harvest_candidates", description: "Tax-loss harvesting scan: open positions below their cost basis, valued at the latest price, ranked by estimated tax saved if sold today, with the wash-sale check already applied, the date to wait before buying back, and swap ideas to keep similar exposure meanwhile.",
    inputSchema: { type: "object", properties: { min_loss: { type: "number", description: "ignore losses smaller than this many dollars (default 100)" } } } },
  { name: "list_positions", description: "Open tax lots per symbol at the latest price: cost basis (wash-sale adjusted), unrealized gain/loss, short or long term, and the date each short-term lot turns long-term.",
    inputSchema: { type: "object", properties: {} } },
  { name: "tax_report", description: "Realized gains and losses for one tax year after wash-sale adjustments: short-term and long-term totals, every wash sale with what replaced it, how much is deductible against income ($3,000 cap) and what carries forward.",
    inputSchema: { type: "object", properties: { year: { type: "number" } } } },
  { name: "import_transactions", description: "Load trade history. Give csv_text or csv_path (a Robinhood account-activity CSV export, or columns date,symbol,side,qty,price[,fees]) or a transactions array. Exact duplicates are skipped, so re-importing is safe. replace=true clears the ledger first.",
    inputSchema: { type: "object", properties: { csv_text: { type: "string" }, csv_path: { type: "string" }, transactions: { type: "array", items: { type: "object" } }, replace: { type: "boolean" } } } },
  { name: "record_trade", description: "Add one executed trade to the ledger right after it fills, so later checks see it.",
    inputSchema: { type: "object", properties: { date, symbol: { type: "string" }, side: { type: "string", enum: ["buy", "sell"] }, qty: { type: "number" }, price: { type: "number" }, fees: { type: "number" } }, required: ["symbol", "side", "qty", "price"] } },
  { name: "load_demo", description: "Replace the ledger with a sample year of trades that shows every case (plain wash sale, SPY to VOO, partial lot, clean loss, long-term gain). For trying the tools.",
    inputSchema: { type: "object", properties: {} } },
  { name: "settings", description: "Read or change settings: strict (true = funds tracking the same index, like SPY and VOO, count as identical; the cautious default), short_rate and long_rate (tax rates used for estimates, defaults 0.24 and 0.15).",
    inputSchema: { type: "object", properties: { strict: { type: "boolean" }, short_rate: { type: "number" }, long_rate: { type: "number" } } } },
  { name: "explain_wash_sale", description: "The wash-sale rule in plain words, which tickers count as substantially identical here, and what this tool does not see.",
    inputSchema: { type: "object", properties: {} } },
];

const today = () => new Date().toISOString().slice(0, 10);
const priceOf = async (sym) => { const { prices } = await latestPrices([sym]); if (!prices[sym]) throw new Error(`no market price for ${sym}; pass price`); return prices[sym]; };

export async function handle(name, a = {}) {
  const l = load(), opt = l.settings;
  if (name === "check_sell") return checkSell(l.txs, { symbol: a.symbol, qty: a.qty, price: a.price ?? await priceOf(String(a.symbol).toUpperCase()), date: a.date || today() }, opt);
  if (name === "check_buy") return checkBuy(l.txs, { symbol: a.symbol, qty: a.qty, date: a.date || today() }, opt);
  if (name === "list_positions" || name === "harvest_candidates") {
    const syms = [...new Set(l.txs.map((t) => t.symbol))];
    const { prices, missing } = await latestPrices(syms);
    const r = name === "list_positions" ? positions(l.txs, prices, opt) : harvest(l.txs, prices, { ...opt, minLoss: a.min_loss ?? 100 });
    return { ...r, ...(missing.length ? { noPrice: missing } : {}), ...(l.txs.length ? {} : { hint: "ledger is empty: import_transactions or load_demo first" }) };
  }
  if (name === "tax_report") return taxReport(l.txs, a.year, opt);
  if (name === "import_transactions") {
    let txs = a.transactions, skipped, format = "json";
    if (!txs) {
      let text = a.csv_text;
      if (!text && a.csv_path) {
        if (extname(a.csv_path).toLowerCase() !== ".csv") throw new Error("csv_path must point to a .csv file");
        text = readFileSync(a.csv_path, "utf8");
      }
      if (!text) throw new Error("give csv_text, csv_path or transactions");
      ({ txs, skipped, format } = importCsv(text));
    }
    return { format, ...addTxs(txs, { replace: !!a.replace }), ...(skipped && Object.keys(skipped).length ? { skippedRows: skipped } : {}) };
  }
  if (name === "record_trade") return addTxs([{ date: a.date || today(), symbol: a.symbol, side: a.side, qty: a.qty, price: a.price, fees: a.fees }]);
  if (name === "load_demo") return { ...addTxs(DEMO, { replace: true }), note: "sample ledger loaded; try harvest_candidates, tax_report 2026, check_buy TSLA" };
  if (name === "settings") return setSettings({ strict: a.strict, shortRate: a.short_rate, longRate: a.long_rate });
  if (name === "explain_wash_sale") return {
    rule: "If you sell a stock or fund at a loss and buy the same or a substantially identical one within 30 days before or after the sale (a 61-day window), the loss is disallowed for now. It is added to the cost basis of the shares you bought, and the old holding period carries over, so the loss comes back when those shares are sold. Gains are never affected.",
    matching: "Replacement shares are matched oldest purchase first, one per sold share. If fewer replacement shares were bought, only that fraction of the loss is disallowed.",
    identical: GROUP_LIST,
    strictMode: opt.strict ? "on: funds that track the same index (SPY/VOO/IVV, QQQ/QQQM) count as identical" : "off: only the same security and share classes count",
    notSeen: ["trades in other accounts (IRAs, a spouse's account) also trigger the rule but are not in this ledger", "options on the same stock", "dividend reinvestment buys unless they are imported"],
    disclaimer: "Estimates for planning, not tax advice. Your broker's 1099-B is the official record.",
  };
  throw new Error("unknown tool " + name);
}

export async function startMcp() {
  const server = new Server({ name: "wash-guard", version: "0.1.0" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    try { return { content: [{ type: "text", text: JSON.stringify(await handle(req.params.name, req.params.arguments || {}), null, 2) }] }; }
    catch (e) { return { isError: true, content: [{ type: "text", text: String(e?.message || e) }] }; }
  });
  await server.connect(new StdioServerTransport());
}
