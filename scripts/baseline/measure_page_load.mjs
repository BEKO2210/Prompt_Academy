/**
 * ENG-002 browser baseline via CDP. No deps: uses Node 22's global WebSocket
 * and the installed Chrome. Measures navigation timings, paint, resource
 * transfer sizes, JS heap, and time-to-first-rendered-result (<article>).
 */
const PORT = process.env.CDP_PORT || 9222;
const URL_ = process.argv[2];
const LABEL = process.argv[3] || "page";

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(list.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));

let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const i = ++id;
    pending.set(i, (m) => (m.error ? rej(new Error(method + ": " + m.error.message)) : res(m.result)));
    ws.send(JSON.stringify({ id: i, method, params }));
  });

const ev = async (expr, awaitPromise = false) => {
  const r = await send("Runtime.evaluate", {
    expression: expr, returnByValue: true, awaitPromise,
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
};

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Network.clearBrowserCache");
await send("Network.setCacheDisabled", { cacheDisabled: true });

const t0 = Date.now();
await send("Page.navigate", { url: URL_ });

// Poll for first rendered result card, with a hard timeout.
let ttfr = null;
const deadline = Date.now() + 30000;
while (Date.now() < deadline) {
  try {
    const n = await ev("document.querySelectorAll('article').length");
    if (n > 0) { ttfr = Date.now() - t0; break; }
  } catch {}
  await new Promise((r) => setTimeout(r, 25));
}
// let the network settle
await new Promise((r) => setTimeout(r, 1500));

const nav = await ev(`JSON.stringify(performance.getEntriesByType('navigation')[0]||{})`);
const paint = await ev(`JSON.stringify(performance.getEntriesByType('paint'))`);
const res = await ev(`JSON.stringify(performance.getEntriesByType('resource').map(r=>({
  name:r.name.split('/').slice(-2).join('/'),
  transferSize:r.transferSize, encodedBodySize:r.encodedBodySize,
  decodedBodySize:r.decodedBodySize, duration:Math.round(r.duration)
})))`);
const heap = await ev(`(performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize}:null)&&JSON.stringify({used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize})`);
const cards = await ev("document.querySelectorAll('article').length");
const lcp = await ev(`new Promise(r=>{let v=null;try{new PerformanceObserver(l=>{const e=l.getEntries();v=e[e.length-1].startTime;}).observe({type:'largest-contentful-paint',buffered:true});}catch(e){}setTimeout(()=>r(v),300)})`, true);

const n = JSON.parse(nav);
const out = {
  label: LABEL, url: URL_,
  navigation_ms: {
    domContentLoaded: Math.round(n.domContentLoadedEventEnd || 0),
    load: Math.round(n.loadEventEnd || 0),
    responseEnd: Math.round(n.responseEnd || 0),
    transferSize_html: n.transferSize,
  },
  paint_ms: JSON.parse(paint).map((p) => ({ name: p.name, t: Math.round(p.startTime) })),
  lcp_ms: lcp === null ? null : Math.round(lcp),
  time_to_first_rendered_result_ms: ttfr,
  rendered_cards: cards,
  js_heap: heap ? JSON.parse(heap) : null,
  resources: JSON.parse(res).sort((a, b) => b.decodedBodySize - a.decodedBodySize).slice(0, 12),
};
console.log(JSON.stringify(out, null, 2));
ws.close();
