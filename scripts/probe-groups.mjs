/** Probe live category groups on webOS via CDP. Usage: node scripts/probe-groups.mjs <wsUrl> */
const url = process.argv[2];
if (!url) {
  console.error('need ws url');
  process.exit(1);
}

const ws = new WebSocket(url);
let id = 1;
const pending = new Map();

function send(method, params = {}) {
  const msgId = id++;
  return new Promise((resolve) => {
    pending.set(msgId, resolve);
    ws.send(JSON.stringify({ id: msgId, method, params }));
    setTimeout(() => {
      if (pending.has(msgId)) {
        pending.delete(msgId);
        resolve(null);
      }
    }, 20000);
  });
}

ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});

ws.addEventListener('open', async () => {
  await send('Runtime.enable');

  // Try IndexedDB / localStorage keys
  const keys = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      ls: Object.keys(localStorage).slice(0, 50),
      idb: await (async () => {
        try {
          const dbs = await indexedDB.databases();
          return dbs.map(d => d.name);
        } catch (e) { return String(e); }
      })()
    })`,
    awaitPromise: true,
    returnByValue: true,
  });
  console.log('[storage]', keys?.result?.result?.value);

  // Scan DOM category labels currently visible
  const dom = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      cats: Array.prototype.map.call(document.querySelectorAll('h3, [class*=\"truncate\"]'), function(el){ return (el.textContent||'').trim(); }).filter(Boolean).slice(0, 80)
    })`,
    returnByValue: true,
  });
  console.log('[dom]', dom?.result?.result?.value);

  process.exit(0);
});
