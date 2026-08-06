/** Sample channel groups from IndexedDB on device. */
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
    }, 60000);
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
    expression: `(function(){
      return new Promise(function(resolve){
        var req = indexedDB.open('streambox-tv');
        req.onerror = function(){ resolve(JSON.stringify({err:'open failed'})); };
        req.onsuccess = function(){
          var db = req.result;
          var names = Array.prototype.slice.call(db.objectStoreNames);
          if (names.indexOf('playlist_channels') === -1) {
            resolve(JSON.stringify({err:'no store', names: names}));
            return;
          }
          var tx = db.transaction('playlist_channels', 'readonly');
          var store = tx.objectStore('playlist_channels');
          var getAll = store.getAll();
          getAll.onsuccess = function(){
            var chunks = getAll.result || [];
            var counts = {};
            var liveLike = {};
            var sampleUncat = [];
            var n = 0;
            for (var c = 0; c < chunks.length; c++) {
              var chs = chunks[c].channels || [];
              for (var i = 0; i < chs.length; i++) {
                var ch = chs[i];
                n++;
                var g = ch.group || 'Uncategorized';
                counts[g] = (counts[g] || 0) + 1;
                var url = (ch.url || '').toLowerCase();
                var isLiveUrl = url.indexOf('/live/') !== -1 || url.indexOf('.ts') !== -1;
                if (isLiveUrl || g === 'Uncategorized') {
                  liveLike[g] = (liveLike[g] || 0) + 1;
                }
                if (g === 'Uncategorized' && sampleUncat.length < 25) {
                  sampleUncat.push({ name: ch.name, url: (ch.url||'').slice(0, 80) });
                }
              }
            }
            var top = Object.keys(counts).map(function(k){ return [k, counts[k]]; })
              .sort(function(a,b){ return b[1]-a[1]; }).slice(0, 40);
            var liveTop = Object.keys(liveLike).map(function(k){ return [k, liveLike[k]]; })
              .sort(function(a,b){ return b[1]-a[1]; }).slice(0, 40);
            resolve(JSON.stringify({ total: n, chunks: chunks.length, top: top, liveTop: liveTop, sampleUncat: sampleUncat }));
          };
          getAll.onerror = function(){ resolve(JSON.stringify({err:'getAll'})); };
        };
      });
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  console.log(result?.result?.result?.value || JSON.stringify(result));
  process.exit(0);
});
