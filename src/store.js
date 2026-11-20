// The ledger: every buy and sell wash-guard knows about, plus settings. One JSON file in the data folder.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dataFile } from "./paths.js";
import { normalize } from "./engine.js";

const FILE = dataFile("ledger.json");
const EMPTY = { txs: [], settings: { strict: true, shortRate: 0.24, longRate: 0.15 } };

export function load() {
  try { if (existsSync(FILE)) { const j = JSON.parse(readFileSync(FILE, "utf8")); return { txs: j.txs || [], settings: { ...EMPTY.settings, ...(j.settings || {}) } }; } } catch { /* fall through */ }
  return structuredClone(EMPTY);
}
export function save(l) { writeFileSync(FILE, JSON.stringify(l, null, 2)); return l; }

/** Adds transactions (validated), skipping exact duplicates so the same CSV can be imported twice safely. */
export function addTxs(newTxs, { replace = false } = {}) {
  const l = load();
  if (replace) l.txs = [];
  normalize(newTxs);                                            // throws on a bad row before anything is written
  const key = (t) => [t.date, String(t.symbol).toUpperCase(), String(t.side).toLowerCase(), Number(t.qty), Number(t.price)].join("|");
  const seen = new Set(l.txs.map(key));
  let added = 0, n = l.txs.length;
  for (const t of newTxs) {
    if (seen.has(key(t))) continue;
    seen.add(key(t));
    l.txs.push({ id: `t${++n}`, date: t.date, symbol: String(t.symbol).toUpperCase(), side: String(t.side).toLowerCase(), qty: Number(t.qty), price: Number(t.price), fees: Number(t.fees || 0), ...(t.note ? { note: t.note } : {}) });
    added++;
  }
  save(l);
  return { added, duplicates: newTxs.length - added, total: l.txs.length };
}

export function setSettings(s) {
  const l = load();
  if (s.strict !== undefined) l.settings.strict = !!s.strict;
  for (const k of ["shortRate", "longRate"]) if (s[k] !== undefined) {
    const v = Number(s[k]); if (!(v >= 0 && v <= 0.6)) throw new Error(`${k} must be between 0 and 0.6`); l.settings[k] = v;
  }
  return save(l).settings;
}
