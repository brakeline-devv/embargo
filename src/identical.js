// "Substantially identical" for the wash-sale rule, plus swap ideas that are not.
//
// The IRS never published a full list. What is settled: the same stock, and share classes that track the same
// company (GOOG/GOOGL). What is a grey area: two funds from different issuers that track the SAME index
// (SPY / VOO / IVV all hold the S&P 500). Most tax pros treat those as risky, so "strict" mode (the default)
// counts them as identical. Funds that track DIFFERENT indexes (S&P 500 vs total market) are the usual safe swap.

const GROUPS = [
  { level: "identical", why: "two share classes of Alphabet", members: ["GOOG", "GOOGL"] },
  { level: "identical", why: "two share classes of Berkshire Hathaway", members: ["BRK.A", "BRK.B", "BRK-A", "BRK-B"] },
  { level: "identical", why: "two share classes of Fox", members: ["FOX", "FOXA"] },
  { level: "identical", why: "two share classes of News Corp", members: ["NWS", "NWSA"] },
  { level: "likely", why: "both track the S&P 500 index", members: ["SPY", "VOO", "IVV", "SPLG"] },
  { level: "likely", why: "both track the Nasdaq-100 index", members: ["QQQ", "QQQM"] },
  { level: "likely", why: "both track the Russell 2000 index", members: ["IWM", "VTWO"] },
  { level: "likely", why: "both track the CRSP US Total Market index", members: ["VTI", "VTSAX"] },
  { level: "likely", why: "both hold physical gold", members: ["GLD", "IAU", "GLDM", "SGOL"] },
  { level: "likely", why: "both are spot bitcoin ETFs", members: ["IBIT", "FBTC", "BITB", "ARKB", "GBTC", "BTC"] },
  { level: "likely", why: "both are spot ether ETFs", members: ["ETHA", "FETH", "ETHE", "ETHW"] },
];

const norm = (s) => String(s || "").trim().toUpperCase();

/** How two tickers relate under the wash-sale rule. */
export function relation(a, b) {
  a = norm(a); b = norm(b);
  if (a === b) return { level: "same", why: "the same security" };
  for (const g of GROUPS) if (g.members.includes(a) && g.members.includes(b)) return { level: g.level, why: g.why };
  return { level: "different", why: "different companies or different indexes" };
}

/** True when buying b could wash a loss on a. strict=true also counts funds that track the same index. */
export function sameSecurity(a, b, strict = true) {
  const { level } = relation(a, b);
  return level === "same" || level === "identical" || (strict && level === "likely");
}

// Swap ideas: keep similar market exposure while the 31-day clock runs, without buying something identical.
// Stocks map to a sector ETF; index funds map to a fund that tracks a different index.
const SWAPS = {
  SPY: ["VTI", "SCHX", "RSP"], VOO: ["VTI", "SCHX", "RSP"], IVV: ["VTI", "SCHX", "RSP"], SPLG: ["VTI", "SCHX", "RSP"],
  QQQ: ["VGT", "XLK", "SCHG"], QQQM: ["VGT", "XLK", "SCHG"],
  VTI: ["SPY", "SCHB", "ITOT"], IWM: ["IJR", "VB"], DIA: ["VTV", "SCHD"],
  NVDA: ["SMH", "SOXX", "AMD"], AMD: ["SMH", "SOXX", "NVDA"], AVGO: ["SMH", "SOXX"], TSM: ["SMH", "SOXX"], INTC: ["SMH", "SOXX"], MU: ["SMH", "SOXX"],
  AAPL: ["XLK", "VGT", "MSFT"], MSFT: ["XLK", "VGT", "AAPL"], ORCL: ["XLK", "IGV"], CRM: ["IGV", "XLK"], ADBE: ["IGV", "XLK"], PLTR: ["IGV", "XLK"],
  GOOGL: ["XLC", "META"], GOOG: ["XLC", "META"], META: ["XLC", "GOOGL"], NFLX: ["XLC"], DIS: ["XLC"],
  AMZN: ["XLY", "VCR"], TSLA: ["XLY", "CARZ", "VCR"], HD: ["XLY"], NKE: ["XLY"],
  JPM: ["XLF", "BAC"], BAC: ["XLF", "JPM"], GS: ["XLF", "MS"], V: ["XLF", "MA"], MA: ["XLF", "V"],
  HOOD: ["XLF", "SCHW"], COIN: ["BITQ", "HOOD"], MSTR: ["IBIT", "BITQ"],
  XOM: ["XLE", "CVX"], CVX: ["XLE", "XOM"], UNH: ["XLV"], LLY: ["XLV", "NVO"], JNJ: ["XLV"], PFE: ["XLV"],
  KO: ["XLP", "PEP"], PEP: ["XLP", "KO"], WMT: ["XLP", "COST"], COST: ["XLP", "WMT"],
  GLD: ["GDX", "SLV"], IAU: ["GDX", "SLV"], IBIT: ["MSTR", "BITQ"], FBTC: ["MSTR", "BITQ"],
};

/** Up to three swap ideas for a ticker that are not substantially identical to it. */
export function swapsFor(sym, strict = true) {
  sym = norm(sym);
  const list = SWAPS[sym] || ["VTI", "SCHB"];
  return list.filter((s) => !sameSecurity(sym, s, strict)).slice(0, 3).map((s) => ({ ticker: s, relation: relation(sym, s).why }));
}

export const GROUP_LIST = GROUPS.map((g) => ({ level: g.level, why: g.why, tickers: g.members }));
