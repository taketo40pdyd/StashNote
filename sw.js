/* StashNote Service Worker
   - オフライン表示用のキャッシュ(アプリ本体のみ。外部APIや認証通信はキャッシュしない)
   - 更新通知: ページから {type:'SKIP_WAITING'} を受けたら新バージョンに切り替え
   - 通知(リマインド): 通知クリックで画面に ntf-go を送る / 閉じている間の定期実行(periodicsync) */
const VERSION = 'stashnote-v1';
const NCACHE = 'stashnote-ntf'; /* index.html 側と同じ名前 */
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-512-maskable.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).catch(() => {}));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION && k !== NCACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; /* 外部(Firebase・フォント・microlink等)は素通し */
  if (url.pathname.endsWith('/ntf-state.json')) return;
  if (req.mode === 'navigate') {
    /* ネットワーク優先、失敗時はキャッシュ(共有・ショートカットの ?query も index.html で受ける) */
    e.respondWith((async () => {
      try {
        const r = await fetch(req);
        const c = await caches.open(VERSION);
        c.put('index.html', r.clone()).catch(() => {});
        return r;
      } catch (_) {
        return (await caches.match('index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }
  e.respondWith((async () => {
    const hit = await caches.match(req);
    const net = fetch(req).then(r => {
      if (r && r.ok) caches.open(VERSION).then(c => c.put(req, r.clone()));
      return r;
    }).catch(() => hit);
    return hit || net;
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const go = e.notification.data && e.notification.data.go;
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) {
      if ('focus' in c) { await c.focus(); c.postMessage({ type: 'ntf-go', go }); return; }
    }
    await self.clients.openWindow('./' + (go ? '?go=' + encodeURIComponent(go) : ''));
  })());
});

/* 閉じている間のリマインド(対応ブラウザのみ)。index.html が ntf-state.json 名でキャッシュに複製した情報を読む */
function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
async function remind() {
  const c = await caches.open(NCACHE);
  const r = await c.match(new URL('ntf-state.json', self.registration.scope).href);
  if (!r) return;
  const m = await r.json();
  if (!m || !m.on) return;
  const now = new Date(), today = ymd(now);
  if (m.last === today) return;
  const hm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  if (hm < (m.t || '09:00')) return;
  let od = 0, dt = 0, sn = 0;
  (m.dues || []).forEach(d => {
    if (d < today) od++;
    else if (d === today) dt++;
    else if ((new Date(d + 'T00:00:00') - new Date(today + 'T00:00:00')) / 864e5 <= 3) sn++;
  });
  const p = [];
  if (m.due) { if (od) p.push('期限切れ ' + od + '件'); if (dt) p.push('今日が期限 ' + dt + '件'); if (sn) p.push('3日以内が期限 ' + sn + '件'); }
  if (m.later && m.lt) p.push('あとで読む ' + m.lt + '件');
  if (!p.length) return;
  const go = (m.due && (od || dt || sn)) ? 'due' : 'later';
  m.last = today;
  await c.put(new URL('ntf-state.json', self.registration.scope).href, new Response(JSON.stringify(m), { headers: { 'Content-Type': 'application/json' } }));
  await self.registration.showNotification('StashNote', { body: p.join('・'), icon: m.icon, tag: 'stashnote-remind', data: { go }, lang: 'ja' });
}
self.addEventListener('periodicsync', e => {
  if (e.tag === 'stashnote-remind') e.waitUntil(remind().catch(() => {}));
});
