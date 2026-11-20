#!/usr/bin/env node
// embargo                     → MCP server on stdio (what Claude / Cursor start)
// embargo demo                → load the sample ledger
// embargo import <file.csv>   → import a Robinhood activity export (or date,symbol,side,qty,price)
// embargo harvest             → losses worth harvesting today
// embargo sell TSLA [qty] [price] / buy TSLA <qty>  → pre-trade check
// embargo report [year]       → realized gains/losses after wash sales
const [cmd = "mcp", ...args] = process.argv.slice(2);
const money = (x) => (x < 0 ? "-$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
const HELP = `embargo: catch wash sales before they happen, find losses worth harvesting

  embargo                         MCP server on stdio (add it to Claude / Cursor)
  embargo demo                    load a sample ledger
  embargo import trades.csv       import a Robinhood activity CSV
  embargo harvest                 losses worth harvesting today
  embargo sell TSLA [qty] [price] check a sale before you make it
  embargo buy TSLA 10             check a buy before you make it
  embargo positions               open lots, basis, unrealized
  embargo report [year]           realized gains/losses after wash sales`;

if (["-h", "--help", "help"].includes(cmd)) { console.log(HELP); process.exit(0); }
if (cmd === "mcp") { (await import("./mcp.js")).startMcp(); }
else try {
  const { handle } = await import("./mcp.js");
  if (cmd === "demo") console.log(await handle("load_demo"));
  else if (cmd === "import") {
    const path = await import("node:path");
    console.log(await handle("import_transactions", { csv_path: path.resolve(args[0] || "") }));
  } else if (cmd === "harvest") {
    const r = await handle("harvest_candidates", { min_loss: Number(args[0]) || 100 });
    console.log(`harvest scan · ${r.asOf} · ${r.ideas.length} ideas · ${money(r.totalLoss)} of losses · est. tax saved ${money(r.totalTaxSaved)}`);
    for (const i of r.ideas) console.log(`  ${i.symbol.padEnd(6)} loss ${money(i.harvestableLoss).padStart(8)}  saves ~${money(i.estTaxSaved).padStart(6)}  ${i.verdict}${i.disallowed ? " (" + money(i.disallowed) + " washed)" : ""}  rebuy after ${i.avoidBuyingUntil}  swap: ${i.swaps.map((s) => s.ticker).join(", ")}`);
    if (r.noPrice) console.log("  no price: " + r.noPrice.join(", "));
  } else if (cmd === "sell" || cmd === "buy") {
    const sym = (args[0] || "").toUpperCase();
    const r = cmd === "sell" ? await handle("check_sell", { symbol: sym, qty: Number(args[1]) || undefined, price: Number(args[2]) || undefined })
      : await handle("check_buy", { symbol: sym, qty: Number(args[1]) || 1 });
    console.log(`${r.verdict.toUpperCase()}: ${r.message}`);
    for (const w of r.ways || []) console.log("  - " + w);
    if (r.swaps?.length) console.log("  swaps: " + r.swaps.map((s) => `${s.ticker} (${s.relation})`).join(", "));
  } else if (cmd === "positions") {
    const r = await handle("list_positions");
    for (const p of r.positions) console.log(`${p.symbol.padEnd(6)} ${String(p.qty).padStart(6)} sh  basis ${money(p.basis).padStart(9)}  ${p.unrealized == null ? "no price" : "unrealized " + money(p.unrealized)}`);
  } else if (cmd === "report") {
    const r = await handle("tax_report", { year: Number(args[0]) || undefined });
    console.log(`${r.year}: ${r.sales} lot sales · short-term ${money(r.shortTerm.reportable)} · long-term ${money(r.longTerm.reportable)} · net ${money(r.net)}`);
    for (const w of r.washSales) console.log(`  wash: ${w.soldOn} ${w.symbol} loss ${money(w.loss)}, ${money(w.disallowed)} disallowed → ${w.replacedBy.map((b) => `${b.qty} ${b.symbol} ${b.date}`).join(", ")}`);
  } else { console.log(HELP); process.exit(1); }
  process.exit(0);
} catch (e) { console.error("embargo: " + (e?.message || e)); process.exit(1); }
