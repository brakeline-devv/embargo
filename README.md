# Washguard

Sell a stock at a loss and buy it back within 30 days, and the IRS disallows the loss (the wash-sale rule). Washguard is an MCP server that checks every buy and sell against that 61-day window **before** your AI agent places it, and finds losses worth harvesting. Read-only: no tool can place, change or cancel an order.

| tool | what it answers |
| --- | --- |
| `check_sell` | Before a sale: gain, clean loss or wash sale. For a wash, the ways out. For a loss, the date to wait before buying back. |
| `check_buy` | Before a buy: would it wash a loss you already took? How much, and the first safe date. |
| `harvest_candidates` | Positions below cost, ranked by estimated tax saved, with swaps that are not substantially identical. |
| `tax_report` | Short and long term after wash adjustments, the $3,000 cap, carry-forward. |
| `list_positions` | Lots, adjusted basis, unrealized, when each turns long-term. |
| `import_transactions` | Robinhood account-activity CSV, or `date,symbol,side,qty,price[,fees]`. Re-importing is safe. |
| `record_trade` | Log a fill right after it happens. |
| `settings` | Strict mode and the tax rates used for estimates. |
| `explain_wash_sale` | The rule in plain words and what the tool can't see. |
| `load_demo` | A sample year of trades that shows every case. |

## Install

```
claude mcp add wash-guard -- npx -y wash-guard
```

Cursor / Claude Desktop / any MCP client:

```json
{ "mcpServers": { "wash-guard": { "command": "npx", "args": ["-y", "wash-guard"] } } }
```

Then:

1. Export your Robinhood account activity as CSV.
2. Ask your agent: *"import my trades from ~/Downloads/activity.csv"*.
3. Then: *"before you sell anything, run check_sell"*.

## CLI

```
npx wash-guard demo                 load the sample ledger
npx wash-guard import trades.csv    import a Robinhood activity CSV
npx wash-guard sell TSLA 10 352     check a sale before you make it
npx wash-guard buy TSLA 10          check a buy before you make it
npx wash-guard harvest              losses worth harvesting today
npx wash-guard positions            open lots, basis, unrealized
npx wash-guard report 2026          realized gains and losses after wash sales
```

Trades are stored in a local JSON file in `~/.wash-guard` (set `WASHGUARD_HOME` to move it). Prices for open positions come from Yahoo Finance's public chart endpoint, with no API key.

## How it decides

- Lots are matched first-in, first-out, like a broker's default.
- A loss sale is a wash sale when substantially identical shares were bought 30 days before or after it. The disallowed loss is added to the replacement shares' cost and their holding period carries over (IRS Publication 550). A partial replacement disallows only that fraction.
- **Substantially identical:** the same stock and its share classes (GOOG/GOOGL, BRK.A/BRK.B) always count. Funds from different issuers on the same index (SPY, VOO, IVV) are a grey area the IRS never settled, so **strict mode** (the default) treats them as identical. Turn it off to treat them as different.

## What it can't see

- Trades in other accounts: an IRA or a spouse's account can trigger the rule too.
- Options on the same stock.
- Dividend reinvestments you didn't import.

Estimates for planning, not tax advice. Your broker's 1099-B is the official record.

## Develop

```
npm install
npm test           # engine tests
node serve.js      # website on http://127.0.0.1:6500 (runs the real engine in the browser)
```

`blender/glass.py` renders the 3D calendar on the site (Blender 4.x, Cycles).

MIT licensed. Not affiliated with Robinhood or the IRS.
