/** One-shot CDP probe for webOS emulator DevTools. Usage: node scripts/debug-cdp.mjs <wsUrl> */
const url = process.argv[2];
if (!url) {
  console.error('Usage: node scripts/debug-cdp.mjs <webSocketDebuggerUrl>');
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
    }, 12000);
  });
}

ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    console.log(
      '[exception]',
      d?.text,
      d?.exception?.description || '',
      d?.url || '',
      d?.lineNumber,
    );
  } else if (msg.method === 'Network.loadingFailed') {
    console.log('[netfail]', JSON.stringify(msg.params));
  } else if (msg.method === 'Runtime.consoleAPICalled') {
    const args = (msg.params.args || [])
      .map((a) => a.value ?? a.description ?? '')
      .join(' ');
    if (!String(args).includes('[Tellurium]')) {
      console.log(`[console.${msg.params.type}]`, args);
    }
  }
});

ws.addEventListener('open', async () => {
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Page.enable');

  const page = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      href: location.href,
      rootKids: (function(){ var r=document.getElementById('root'); return r ? r.childElementCount : -1; })(),
      scripts: Array.prototype.map.call(document.querySelectorAll('script'), function(s){ return {src: s.getAttribute('src'), type: s.type, crossorigin: s.crossOrigin}; }),
      links: Array.prototype.map.call(document.querySelectorAll('link'), function(l){ return {rel: l.rel, href: l.getAttribute('href'), crossorigin: l.crossOrigin}; }),
      resources: performance.getEntriesByType('resource').map(function(e){ return {name: e.name.split('/').pop(), size: e.transferSize, dur: Math.round(e.duration)}; })
    })`,
    returnByValue: true,
  });
  console.log('[page]', page && page.result && page.result.result && page.result.result.value);

  const parseCheck = await send('Runtime.evaluate', {
    expression: `(async function() {
      var el = document.querySelector('script[type=module]');
      var src = el && el.src;
      if (!src) return 'no-module-script';
      try {
        var res = await fetch(src);
        var text = await res.text();
        try {
          new Function(text);
          return 'classic-parse-ok len=' + text.length + ' status=' + res.status;
        } catch (e) {
          return 'classic-parse-fail: ' + e.message;
        }
      } catch (e) {
        return 'fetch-fail: ' + e;
      }
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  console.log('[parse]', parseCheck && parseCheck.result && parseCheck.result.result && parseCheck.result.result.value);

  const importCheck = await send('Runtime.evaluate', {
    expression: `(async function() {
      try {
        var el = document.querySelector('script[type=module]');
        await import(el.src);
        var r = document.getElementById('root');
        return 'import-ok root=' + (r ? r.childElementCount : -1);
      } catch (e) {
        return 'import-fail: ' + (e && (e.stack || e.message || e));
      }
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  console.log('[import]', importCheck && importCheck.result && importCheck.result.result && importCheck.result.result.value);

  const bootstrapHint = await send('Runtime.evaluate', {
    expression: `(async function() {
      try {
        var el = document.querySelector('script[type=module]');
        var t = await (await fetch(el.src)).text();
        return 'startsWithImport=' + t.startsWith('import') + ' len=' + t.length;
      } catch (e) {
        return String(e);
      }
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  console.log('[bundle]', bootstrapHint && bootstrapHint.result && bootstrapHint.result.result && bootstrapHint.result.result.value);

  process.exit(0);
});

ws.addEventListener('error', (e) => {
  console.error('ws error', e);
  process.exit(1);
});
