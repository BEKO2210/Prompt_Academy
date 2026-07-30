/**
 * ENG-002: in-browser search latency. Measures the FULL keystroke cost --
 * filter + React re-render + paint -- which the Node harness cannot see.
 * Uses React's own input path via native setter + input event, then waits for
 * two animation frames to capture commit+paint.
 */
const PORT = process.env.CDP_PORT || 9222;
const URL_ = process.argv[2] || "http://127.0.0.1:4320/Prompt_Academy/library";

const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res, rej) => {
  const i = ++id; pending.set(i, (m) => m.error ? rej(new Error(method+": "+m.error.message)) : res(m.result));
  ws.send(JSON.stringify({ id: i, method, params }));
});
const ev = async (expression, awaitPromise = true) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.text || r.exceptionDetails));
  return r.result.value;
};

await send("Page.enable"); await send("Runtime.enable");
await send("Page.navigate", { url: URL_ });
// wait for cards
for (let i = 0; i < 400; i++) {
  try { if (await ev("document.querySelectorAll('article').length", false) > 0) break; } catch {}
  await new Promise((r) => setTimeout(r, 25));
}

const RESULT = await ev(`(async () => {
  const input = document.querySelector('input[type="text"], input[type="search"], input:not([type])');
  if (!input) return { error: 'search input not found' };
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  const frames = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const type = async (v) => {
    const t0 = performance.now();
    setter.call(input, v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await frames();
    return performance.now() - t0;
  };
  const clear = async () => { await type(''); };

  const queries = [];
  const word = 'dashboard';
  for (let i = 1; i <= word.length; i++) queries.push(word.slice(0, i));
  queries.push('react', 'pricing', 'accessible dashboard', 'barrierefrei', 'zzzznomatch');

  const out = [];
  const REPEAT = 5;
  for (const q of queries) {
    const ts = [];
    let cards = 0, label = '';
    for (let r = 0; r < REPEAT; r++) {
      await clear(); await frames();
      ts.push(await type(q));
      cards = document.querySelectorAll('article').length;
    }
    const s = ts.slice().sort((a,b)=>a-b);
    out.push({ q, cards,
      p50: +s[Math.floor(s.length*0.5)].toFixed(2),
      p95: +s[Math.min(s.length-1, Math.floor(s.length*0.95))].toFixed(2),
      max: +Math.max(...ts).toFixed(2) });
  }
  const all = out.flatMap(o => [o.p50]);
  const sa = all.slice().sort((a,b)=>a-b);
  return { per_query: out,
    overall_p50: +sa[Math.floor(sa.length*0.5)].toFixed(2),
    overall_p95: +sa[Math.min(sa.length-1,Math.floor(sa.length*0.95))].toFixed(2),
    heap_used_mb: +(performance.memory.usedJSHeapSize/1048576).toFixed(1) };
})()`);
console.log(JSON.stringify(RESULT, null, 2));
ws.close();
