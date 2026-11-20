// A sample year of trades that shows every case: a plain wash sale, a cross-fund wash (SPY -> VOO),
// a partial sale that washes against its own lot, a clean harvested loss, a long-term gain, and open
// positions to scan. Prices are made up for the history; open positions are valued at live prices.
export const DEMO = [
  { date: "2025-03-10", symbol: "NVDA", side: "buy", qty: 20, price: 112.5, note: "long-term winner" },
  { date: "2025-06-02", symbol: "AMZN", side: "buy", qty: 15, price: 205.1 },
  { date: "2025-10-01", symbol: "SPY", side: "buy", qty: 15, price: 668.4 },
  { date: "2025-11-03", symbol: "SPY", side: "sell", qty: 15, price: 641.2, note: "loss" },
  { date: "2025-11-20", symbol: "VOO", side: "buy", qty: 15, price: 592.0, note: "same index, 17 days later: washes the SPY loss in strict mode" },
  { date: "2025-12-01", symbol: "TSLA", side: "buy", qty: 10, price: 430.0 },
  { date: "2026-01-20", symbol: "TSLA", side: "sell", qty: 10, price: 352.0, note: "loss" },
  { date: "2026-02-05", symbol: "TSLA", side: "buy", qty: 10, price: 368.0, note: "bought back 16 days later: wash sale" },
  { date: "2026-03-16", symbol: "NVDA", side: "sell", qty: 8, price: 181.0, note: "long-term gain" },
  { date: "2026-04-01", symbol: "PLTR", side: "buy", qty: 40, price: 152.0 },
  { date: "2026-05-11", symbol: "PLTR", side: "sell", qty: 40, price: 118.0, note: "clean loss, nothing bought back" },
  { date: "2026-07-01", symbol: "AMD", side: "buy", qty: 25, price: 236.0 },
  { date: "2026-09-01", symbol: "AAPL", side: "buy", qty: 30, price: 262.0 },
  { date: "2026-09-15", symbol: "AAPL", side: "sell", qty: 15, price: 241.0, note: "sold half at a loss: the other half of the same lot is the replacement" },
  { date: "2026-10-27", symbol: "COIN", side: "buy", qty: 12, price: 345.0 },
  { date: "2026-11-03", symbol: "HOOD", side: "buy", qty: 60, price: 141.0 },
];
