/** Sample raw M3U EXTINF/EXTGRP patterns from playlist URL in IDB. */
const url = process.argv[2];
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
    }, 120000);
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
  const result = await send('Runtime.evaluate', {
    expression: `(async function(){
      function openDB(){
        return new Promise(function(resolve, reject){
          var req = indexedDB.open('streambox-tv');
          req.onsuccess = function(){ resolve(req.result); };
          req.onerror = function(){ reject(req.error); };
        });
      }
      var db = await openDB();
      var meta = await new Promise(function(resolve, reject){
        var tx = db.transaction('playlist_meta', 'readonly');
        var store = tx.objectStore('playlist_meta');
        var r = store.getAll();
        r.onsuccess = function(){ resolve(r.result || []); };
        r.onerror = function(){ reject(r.error); };
      });
      var first = meta[0];
      if (!first || !first.source || first.source.type !== 'url') {
        return JSON.stringify({ err: 'no url playlist', meta: meta.map(function(m){ return { name: m.name, source: m.source }; }) });
      }
      var playlistUrl = first.source.location;
      var res = await fetch(playlistUrl);
      var text = await res.text();
      var lines = text.split(/\\r?\\n/);
      var samples = [];
      var extgrp = 0;
      var withGroupTitle = 0;
      var withoutGroupTitle = 0;
      var liveExtinf = 0;
      for (var i = 0; i < lines.length && samples.length < 30; i++) {
        var line = lines[i].trim();
        if (/^#EXTGRP:/i.test(line)) extgrp++;
        if (!/^#EXTINF:/i.test(line)) continue;
        var next = (lines[i+1] || '').trim();
        var next2 = (lines[i+2] || '').trim();
        var urlLine = next.indexOf('http') === 0 ? next : (next2.indexOf('http') === 0 ? next2 : '');
        var isLive = /\\/live\\//i.test(urlLine);
        if (isLive) liveExtinf++;
        var hasGT = /group-title\\s*=/i.test(line);
        if (hasGT) withGroupTitle++; else withoutGroupTitle++;
        if (isLive && samples.length < 20) {
          samples.push({
            extinf: line.slice(0, 220),
            next: next.slice(0, 80),
            next2: next2.slice(0, 80),
            hasGT: hasGT
          });
        }
      }
      // also count total EXTGRP and group-title across full file (cheap scan)
      var allExtgrp = (text.match(/^#EXTGRP:/gim) || []).length;
      var allGT = (text.match(/group-title\\s*=/gi) || []).length;
      var allExtinf = (text.match(/^#EXTINF:/gim) || []).length;
      return JSON.stringify({
        allExtinf: allExtinf,
        allExtgrp: allExtgrp,
        allGroupTitle: allGT,
        scannedLiveSamples: samples,
        extgrpSeenEarly: extgrp,
        withGroupTitleEarly: withGroupTitle,
        withoutGroupTitleEarly: withoutGroupTitle
      });
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  const val = result?.result?.result?.value;
  console.log(val || JSON.stringify(result?.result || result));
  process.exit(0);
});
