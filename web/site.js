// Washguard site: every verdict on this page comes from the real engine (web/engine = copies of src/).
import { run, addDays } from "./engine/engine.js";
import { checkSell, checkBuy, harvest, taxReport, positions } from "./engine/guard.js";
import { GROUP_LIST } from "./engine/identical.js";
import { DEMO } from "./engine/demo.js";

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const money = (x) => (x < 0 ? "-$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
const sgn = (x) => (x < 0 ? "neg" : x > 0 ? "pos" : "");
// open positions valued at Yahoo closing prices from 2026-11-20 (a snapshot, so the demo never changes under you)
const ASOF = "2026-11-20";
const PRICES = { COIN: 107.93, HOOD: 66.01, AMD: 450.55, PLTR: 148.65, VOO: 651.62, AMZN: 255.36, NVDA: 137.9, TSLA: 361.74, AAPL: 348.42, SPY: 709.07 };
let strict = true;

/* ---------- the rule: 61-day calendar ---------- */
const SELL = "2026-11-01";
const cal = $("#cal");
for (let i = 0; i < 63; i++) {
  const d = i - 31, el = document.createElement("div");
  el.className = "day " + (d === 0 ? "sell" : Math.abs(d) <= 30 ? "win" : d === 31 ? "safe" : "out");
  el.dataset.d = d; el.textContent = d === 0 ? "SELL" : (d > 0 ? "+" : "") + d;
  el.addEventListener("click", () => { $("#day").value = d; ruleUpdate(); });
  cal.appendChild(el);
}
function ruleUpdate() {
  const d = Number($("#day").value);
  $("#dayLbl").textContent = (d > 0 ? "+" : "") + d;
  cal.querySelectorAll(".day").forEach((el) => el.classList.toggle("pick", Number(el.dataset.d) === d));
  const r = run([
    { date: "2026-08-03", symbol: "TSLA", side: "buy", qty: 10, price: 430 },
    { date: SELL, symbol: "TSLA", side: "sell", qty: 10, price: 352 },
    { date: addDays(SELL, d), symbol: "TSLA", side: "buy", qty: 10, price: 352 },
  ]);
  const s = r.sales[0], lot = r.lots[0];
  const when = d === 0 ? "the same day" : `${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"} ${d < 0 ? "before" : "after"} the sale`;
  $("#ruleVerdict").innerHTML = s.disallowed > 0
    ? `<span class="badge red">WASH SALE</span><h4>${money(s.disallowed)} of the loss is disallowed.</h4><p>Buying back ${when} is inside the window. The loss moves into the new shares: their cost becomes <b class="mono">$${lot.cost.toFixed(2)}</b> instead of $352.00, and the holding period starts on ${lot.acquired}.</p>`
    : `<span class="badge green">CLEAN LOSS</span><h4>The ${money(-s.gain)} loss counts this year.</h4><p>Buying back ${when} is outside the 30-day window, so nothing is washed.</p>`;
}
$("#day").addEventListener("input", ruleUpdate);
ruleUpdate();

/* ---------- try it ---------- */
const held = positions(DEMO, PRICES, { asOf: ASOF }).positions.map((p) => p.symbol).sort();
const TABS = {
  sell: {
    presets: [
      { t: "Sell 30 HOOD now", s: "half of a position bought 17 days ago", v: { symbol: "HOOD", qty: 30 } },
      { t: "Sell all 60 HOOD", s: "the whole position instead", v: { symbol: "HOOD", qty: 60 } },
      { t: "Sell all COIN", s: "down from $345", v: { symbol: "COIN", qty: 12 } },
      { t: "Sell 10 AMD", s: "a winner", v: { symbol: "AMD", qty: 10 } },
    ],
    fields: (v) => `<label>symbol<select name="symbol">${held.map((s) => `<option${s === v.symbol ? " selected" : ""}>${s}</option>`).join("")}</select></label>
      <label>qty<input name="qty" type="number" min="0" step="any" value="${v.qty ?? ""}"></label>
      <label>price<input name="price" type="number" min="0" step="any" value="${v.price ?? PRICES[v.symbol] ?? ""}"></label>
      <label>date<input name="date" value="${ASOF}" disabled></label>`,
    run: (f) => checkSell(DEMO, { symbol: f.symbol, qty: Number(f.qty) || undefined, price: Number(f.price) || PRICES[f.symbol], date: ASOF }, { strict }),
  },
  buy: {
    presets: [
      { t: "Buy TSLA back 16 days after a loss", s: "sold Jan 20 at -$780", v: { symbol: "TSLA", qty: 10, date: "2026-02-05" } },
      { t: "Swap SPY for VOO 17 days later", s: "same index, different fund", v: { symbol: "VOO", qty: 15, date: "2025-11-20" } },
      { t: "Buy XLY instead of TSLA", s: "a consumer ETF, not identical", v: { symbol: "XLY", qty: 10, date: "2026-02-05" } },
      { t: "Buy PLTR 31 days after the loss", s: "sold May 11", v: { symbol: "PLTR", qty: 40, date: "2026-06-11" } },
    ],
    fields: (v) => `<label>symbol<input name="symbol" value="${v.symbol}"></label><label>qty<input name="qty" type="number" min="0" step="any" value="${v.qty}"></label>
      <label>date<input name="date" type="date" value="${v.date}"></label>`,
    run: (f) => checkBuy(DEMO.filter((t) => t.date < f.date), { symbol: f.symbol, qty: Number(f.qty) || 1, date: f.date }, { strict }),
  },
  harvest: { presets: [], fields: () => `<label>as of<input value="${ASOF}" disabled></label><label>min loss<input name="min" type="number" value="100"></label>`, run: (f) => harvest(DEMO, PRICES, { asOf: ASOF, strict, minLoss: Number(f.min) || 0 }) },
  report: { presets: [], fields: () => `<label>year<select name="year"><option>2026</option><option>2025</option></select></label>`, run: (f) => taxReport(DEMO, Number(f.year), { strict }) },
};
let tab = "sell", preset = 0;

function drawAsk() {
  const T = TABS[tab], v = T.presets[preset]?.v || {};
  $("#ask").innerHTML = `${T.presets.length ? `<div class="presets">${T.presets.map((p, i) => `<button class="preset${i === preset ? " on" : ""}" data-i="${i}">${esc(p.t)}<small>${esc(p.s)}</small></button>`).join("")}</div>` : ""}
    <form class="fields" id="form">${T.fields(v)}</form><button class="run" id="go">Run ${tab === "sell" ? "check_sell" : tab === "buy" ? "check_buy" : tab === "harvest" ? "harvest_candidates" : "tax_report"}</button>`;
  $("#ask").querySelectorAll(".preset").forEach((b) => b.addEventListener("click", () => { preset = Number(b.dataset.i); drawAsk(); go(); }));
  $("#go").addEventListener("click", go);
  $("#form").addEventListener("submit", (e) => { e.preventDefault(); go(); });
  const sym = $("#form [name=symbol]");
  if (sym && tab === "sell") sym.addEventListener("change", () => { $("#form [name=price]").value = PRICES[sym.value]; $("#form [name=qty]").value = ""; });
}

const BADGE = { "wash sale": "red", "would wash": "red", "clean loss": "green", clear: "green", gain: "ink", "not held": "amber" };
function go() {
  const f = Object.fromEntries(new FormData($("#form")));
  let r;
  try { r = TABS[tab].run(f); } catch (e) { $("#answer").innerHTML = `<span class="badge amber">ERROR</span><p class="msg">${esc(e.message)}</p>`; $("#raw").textContent = ""; return; }
  $("#raw").textContent = JSON.stringify(r, null, 2);
  $("#answer").innerHTML = tab === "harvest" ? drawHarvest(r) : tab === "report" ? drawReport(r) : drawCheck(r);
}
function drawCheck(r) {
  const kv = r.gain !== undefined ? `<div class="kv"><div><span>gain / loss</span><b class="${sgn(r.gain)}">${money(r.gain)}</b></div><div><span>disallowed</span><b class="${r.disallowed ? "neg" : ""}">${money(r.disallowed)}</b></div>
    <div><span>counts now</span><b class="${sgn(r.reportable)}">${money(r.reportable)}</b></div>${r.estTaxSaved ? `<div><span>est. tax saved</span><b class="pos">${money(r.estTaxSaved)}</b></div>` : ""}</div>`
    : r.disallowed ? `<div class="kv"><div><span>would disallow</span><b class="neg">${money(r.disallowed)}</b></div><div><span>safe from</span><b>${r.safeFrom}</b></div></div>` : "";
  return `<span class="badge ${BADGE[r.verdict] || "ink"}">${esc(r.verdict.toUpperCase())}</span><p class="msg">${esc(r.message)}</p>${kv}
    ${r.ways?.length ? `<ul>${r.ways.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}
    ${r.tip ? `<ul><li>${esc(r.tip)}</li></ul>` : ""}
    ${r.swaps?.length ? `<div class="chips">${r.swaps.map((s) => `<span class="chip">swap: ${esc(s.ticker)}</span>`).join("")}</div>` : ""}`;
}
function drawHarvest(r) {
  if (!r.ideas.length) return `<span class="badge ink">NOTHING TO HARVEST</span><p class="msg">No position is below its cost by more than the minimum.</p>`;
  return `<span class="badge green">${r.ideas.length} IDEAS</span><h4>${money(r.totalLoss)} of losses, about ${money(r.totalTaxSaved)} in tax saved.</h4>
    <div class="table-wrap"><table><tr><th>symbol</th><th>loss</th><th>saves</th><th>check</th><th>rebuy after</th><th>swap</th></tr>
    ${r.ideas.map((i) => `<tr><td><b>${i.symbol}</b></td><td class="neg">${money(-i.harvestableLoss)}</td><td class="pos">${money(i.estTaxSaved)}</td><td>${i.verdict}</td><td>${i.avoidBuyingUntil}</td><td>${i.swaps.map((s) => s.ticker).join(", ")}</td></tr>`).join("")}</table></div>
    <p class="msg">${esc(r.reminder)}</p>`;
}
function drawReport(r) {
  return `<span class="badge ink">TAX YEAR ${r.year}</span><div class="kv"><div><span>short-term</span><b class="${sgn(r.shortTerm.reportable)}">${money(r.shortTerm.reportable)}</b></div><div><span>long-term</span><b class="${sgn(r.longTerm.reportable)}">${money(r.longTerm.reportable)}</b></div>
    <div><span>net</span><b class="${sgn(r.net)}">${money(r.net)}</b></div><div><span>washed</span><b class="neg">${money(r.shortTerm.washDisallowed + r.longTerm.washDisallowed)}</b></div></div>
    ${r.washSales.length ? `<ul>${r.washSales.map((w) => `<li><b>${w.soldOn}</b> ${w.symbol}: ${money(w.loss)} loss, ${money(w.disallowed)} disallowed, moved into ${w.replacedBy.map((b) => `${b.qty} ${b.symbol} bought ${b.date}`).join(", ")}</li>`).join("")}</ul>` : `<p class="msg">No wash sales this year.</p>`}`;
}
document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => {
  tab = b.dataset.tab; preset = 0;
  document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("on", x === b));
  drawAsk(); go();
}));
$("#strict").addEventListener("change", (e) => { strict = e.target.checked; go(); });
drawAsk(); go();

/* ---------- identical groups ---------- */
$("#groups").innerHTML = GROUP_LIST.map((g) => `<div class="group"><span class="lvl ${g.level}">${g.level === "identical" ? "identical" : "strict mode"}</span><p>${esc(g.why)}</p><div class="tk">${g.tickers.filter((t) => !t.includes("-")).map((t) => `<span>${t}</span>`).join("")}</div></div>`).join("");

/* ---------- copy buttons ---------- */
document.querySelectorAll(".cp").forEach((b) => b.addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = "Copied"; b.classList.add("ok"); } catch { b.textContent = "Select it"; }
  setTimeout(() => { b.textContent = "Copy"; b.classList.remove("ok"); }, 1400);
}));

/* ---------- nav turns solid once the hero scrolls away ---------- */
const nav = $(".nav");
const navSolid = () => nav.classList.toggle("solid", scrollY > innerHeight * 0.6);
addEventListener("scroll", navSolid, { passive: true }); navSolid();

/* ---------- 3D band: load and play the video only while it is on screen ---------- */
const bandVid = $(".band-video");
if (bandVid) new IntersectionObserver(([e]) => {
  if (e.isIntersecting) { if (!bandVid.src) bandVid.src = bandVid.dataset.src; bandVid.play().catch(() => {}); } else bandVid.pause();
}, { rootMargin: "200px" }).observe(bandVid);

/* ---------- how it works: three real check_sell runs, animated step by step ---------- */
const FLOW = [
  { ask: "Sell 30 HOOD, it's down.", symbol: "HOOD", qty: 30 },
  { ask: "Dump all my COIN.", symbol: "COIN", qty: 12 },
  { ask: "Take profit on 10 AMD.", symbol: "AMD", qty: 10 },
].map((f) => ({ ...f, r: checkSell(DEMO, { symbol: f.symbol, qty: f.qty, price: PRICES[f.symbol], date: ASOF }, { strict: true }) }));
const firstDate = (s) => (String(s || "").match(/\d{4}-\d\d-\d\d/) || [""])[0];
const AFTER = (f) => {
  const r = f.r;
  if (r.verdict === "wash sale") return `The agent <b>holds off</b> and tells you: wait until <b class="mono">${firstDate(r.ways?.[0])}</b>, or sell the whole position so nothing is washed.`;
  if (r.verdict === "clean loss") return `The agent <b>places the sale</b> through its broker and notes: don't buy ${f.symbol} back before <b class="mono">${firstDate(r.message)}</b>.`;
  return `The agent <b>places the sale</b>. It's a gain, so the wash-sale rule doesn't apply.`;
};
const fbox = $("#flowBox");
if (fbox) {
  const nodes = [...fbox.querySelectorAll(".fnode")], lines = [...fbox.querySelectorAll(".fline")], checks = [...fbox.querySelectorAll(".fchecks li")];
  const after = $("#fAfter"), dots = $("#fDots");
  dots.innerHTML = FLOW.map((_, i) => `<button aria-label="Example ${i + 1}"></button>`).join("");
  let sc = 0, step = -1, timer = 0, ticks = [], seen = false;
  const verdictHTML = (r) => `<span class="badge ${BADGE[r.verdict] || "ink"}">${esc(r.verdict.toUpperCase())}</span>
    <h5>${r.verdict === "wash sale" ? `${money(r.disallowed)} would be disallowed` : r.verdict === "clean loss" ? `${money(-r.gain)} loss you keep` : `${money(r.gain)} gain`}</h5>
    <p>${r.verdict === "clean loss" && r.estTaxSaved ? `about ${money(r.estTaxSaved)} in tax saved` : r.verdict === "wash sale" ? "shares bought 17 days ago are inside the window" : "wash sales only apply to losses"}</p>`;
  function load(i) {
    const f = FLOW[i];
    $("#fAsk").textContent = `"${f.ask}"`;
    $("#fCall").innerHTML = `<span class="k">check_sell</span>({\n  symbol: <span class="s">"${f.symbol}"</span>,\n  qty: ${f.qty},\n  price: ${PRICES[f.symbol]}\n})`;
    $("#fVerdict").innerHTML = `<span class="fn-k">04 · verdict</span>` + verdictHTML(f.r);
    after.innerHTML = AFTER(f);
    dots.querySelectorAll("button").forEach((b, k) => b.classList.toggle("on", k === i));
  }
  function show(s) {
    nodes.forEach((n, k) => { n.classList.toggle("on", k <= s); n.classList.toggle("now", k === s); });
    lines.forEach((l, k) => { l.classList.toggle("on", k < s); l.classList.toggle("now", k === s - 1); });
    if (s < 2) checks.forEach((c) => c.classList.remove("ok"));
    if (s > 2) checks.forEach((c) => c.classList.add("ok"));
    after.classList.toggle("on", s >= 4);
  }
  const stop = () => { clearTimeout(timer); ticks.forEach(clearTimeout); ticks = []; };
  function tick() {
    step++;
    if (step > 5) { step = 0; sc = (sc + 1) % FLOW.length; load(sc); }
    show(step);
    if (step === 2) ticks = checks.map((c, k) => setTimeout(() => c.classList.add("ok"), 250 + k * 280));
    timer = setTimeout(tick, step === 2 ? 1700 : step >= 4 ? 2400 : 1100);
  }
  dots.querySelectorAll("button").forEach((b, i) => b.addEventListener("click", () => { stop(); sc = i; load(i); step = -1; tick(); }));
  load(0); show(-1);
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) show(4);
  else new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !seen) { seen = true; tick(); }
    else if (!e.isIntersecting && seen) { stop(); seen = false; step = -1; show(-1); }
  }, { threshold: 0.35 }).observe(fbox);
}

/* ---------- scroll reveal ---------- */
const rv = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); rv.unobserve(e.target); } }), { threshold: 0.12 });
document.querySelectorAll(".reveal").forEach((el) => rv.observe(el));
