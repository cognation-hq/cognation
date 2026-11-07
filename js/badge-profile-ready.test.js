/* Real social cache + badge modules. No browser identity storage, no RPCs,
   timers or real requests. Unrelated social reads deliberately never settle. */
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = n => fs.readFileSync(path.join(__dirname, n), 'utf8');
const row = (id, uid, kind = 'seed') => ({ id, user_id: uid, kind: 'personal', handle: id, display_name: 'Person', account_kind: kind });
const seed = row('seed-page', 'seed-user');
const real = row('real-page', 'real-user', 'real');
const unknown = row('unknown-page', 'unknown-user', '');
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function harness() {
  let session = null;
  const listeners = {}, requests = [], events = [];
  const fire = (name, detail) => {
    events.push({ name, detail });
    (listeners[name] || []).forEach(fn => fn({ type: name, detail }));
  };
  const on = (name, fn) => { (listeners[name] ||= []).push(fn); };
  const host = {
    children: [], attrs: {},
    querySelectorAll() { return this.children.slice(); },
    querySelector() { return this.children[0] || null; },
    setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; },
    appendChild(b) { b.parentNode = this; this.children.push(b); },
    removeChild(b) { this.children.splice(this.children.indexOf(b), 1); b.parentNode = null; },
  };
  const root = { querySelector: s => s === '[data-tower-profile-name-wrap]' ? host : null, querySelectorAll: () => [], getAttribute: () => '' };
  const document = {
    readyState: 'loading', addEventListener: on,
    dispatchEvent(ev) { fire(ev.type, ev.detail); },
    querySelectorAll: s => s === '[data-tower-app]' ? [root] : [],
    getElementById: () => null,
    createElement() { return { setAttribute() {}, remove() { if (this.parentNode) this.parentNode.removeChild(this); } }; },
  };
  const location = { hash: '' };
  const window = {
    addEventListener: on,
    CognationAuth: { getSession: () => session },
    CognationSupabase: {
      configured: () => true,
      rpc() { throw new Error('no identity RPC'); },
      rest(table, options) { const d = deferred(); requests.push({ table, options, ...d }); return d.promise; },
    },
    // Poisoned local identity must never participate in a live badge.
    CognationAccounts: { getProfileById() { throw new Error('local identity read'); } },
    CognationTowerProfileStore: { get() { throw new Error('local Tower identity read'); } },
  };
  const ctx = vm.createContext({ window, document, location, console, URLSearchParams,
    CustomEvent: function (type, opts) { this.type = type; this.detail = opts && opts.detail; },
    localStorage: { getItem() { throw new Error('storage read'); }, setItem() { throw new Error('storage write'); }, removeItem() { throw new Error('storage delete'); } },
    setTimeout() { throw new Error('no polling'); }, setInterval() { throw new Error('no polling'); },
  });
  // Production script order: badge registers before social.
  for (const n of ['seedops-schema.js', 'seedops-badge.js', 'supabase-social.js']) vm.runInContext(source(n), ctx, { filename: n });
  const social = window.CognationSupabaseSocial;
  return { host, requests, events, social,
    setSession(r) { session = { source: 'supabase', supabaseUserId: r.user_id, activeProfileId: r.id }; },
    login(r) { session = { source: 'supabase', supabaseUserId: r.user_id, activeProfileId: r.id }; fire('cognation:session-started'); },
    logout() { session = null; fire('cognation:session-ended'); },
    view(id) { location.hash = id ? '#tower-profile-' + id : ''; fire('hashchange'); },
    badges() { return host.children.length; },
    fire,
  };
}
async function ready(h, rows) {
  h.requests.at(-1).resolve(rows); await flush();
}
test('seed gets exactly one badge at profile-ready while friends/feed/notifications remain pending', async () => {
  const h = harness(); h.login(seed);
  assert.equal(h.badges(), 0);
  await ready(h, [seed]);
  assert.equal(h.badges(), 1);
  assert.equal(h.host.children[0].textContent, 'Demo · seed');
  assert.ok(h.events.some(e => e.name === 'cognation:server-profiles-ready' && e.detail.userId === seed.user_id));
  const own = h.requests.find(r => r.options.query.includes('user_id=eq.'));
  own.resolve([seed]); await flush();
  assert.equal(h.badges(), 1);
  assert.deepEqual(h.requests.map(r => r.table), ['profiles', 'profiles', 'tower_posts', 'friendships', 'notifications', 'friend_requests']);
  assert.equal(h.requests.filter(r => r.table === 'profiles').length, 2, 'existing two reads only');
  assert.equal(h.events.filter(e => e.name === 'cognation:remote-friends-loaded').length, 0);
});
for (const r of [real, unknown]) test(`${r.account_kind || 'unknown'} server identity gets no badge`, async () => {
  const h = harness(); h.login(r); await ready(h, [r]); assert.equal(h.badges(), 0);
});
test('late old-seed response after switching to real cannot cache or badge', async () => {
  const h = harness(); h.login(seed); await ready(h, []); const old = h.requests.at(-1);
  h.login(real); const fresh = h.requests.at(-1); fresh.resolve([real]); await flush();
  old.resolve([seed]); await flush();
  assert.equal(h.badges(), 0);
  assert.equal(h.social.getProfile(seed.id), null);
  assert.equal(h.requests.filter(r => r.table === 'profiles').length, 4, 'old refresh did not continue');
});
test('seed → real → seed and logout reconcile immediately without storage or polling', async () => {
  const h = harness();
  h.login(seed); await ready(h, [seed]); assert.equal(h.badges(), 1);
  h.login(real); assert.equal(h.badges(), 0); await ready(h, [real]); assert.equal(h.badges(), 0);
  h.login(seed); assert.equal(h.badges(), 0); await ready(h, [seed]); assert.equal(h.badges(), 1);
  h.logout(); assert.equal(h.badges(), 0);
  h.fire('cognation:tower-view-changed'); assert.equal(h.badges(), 0);
});
test('view changes reconcile server identities, missing views fail closed, no extra identity requests', async () => {
  const h = harness(); h.login(seed); await ready(h, [seed, real, unknown]);
  const before = h.requests.filter(r => r.table === 'profiles').length;
  h.view(real.id); assert.equal(h.badges(), 0);
  h.view(seed.id); assert.equal(h.badges(), 1);
  h.view(unknown.id); assert.equal(h.badges(), 0);
  h.view('missing'); assert.equal(h.badges(), 0);
  h.view(''); assert.equal(h.badges(), 1);
  assert.equal(h.requests.filter(r => r.table === 'profiles').length, before);
});
test('failed server identity load stays unbadged and explicit retry can recover', async () => {
  const h = harness(); h.setSession(seed);
  // Use explicit refresh for observing the rejection rather than an unhandled event promise.
  const load = h.social.refresh(); const req = h.requests.at(-1);
  req.reject(new Error('profile read failed')); await assert.rejects(load, /profile read failed/);
  assert.equal(h.badges(), 0);
  const retry = h.social.refresh(); void retry;
  await ready(h, [seed]); assert.equal(h.badges(), 1);
});
test('logout and same-account relogin drop prior session responses', async () => {
  const h = harness(); h.login(seed); const old = h.requests[0];
  h.logout(); h.login(seed); old.resolve([seed]); await flush(); assert.equal(h.badges(), 0);
  await ready(h, [seed]); assert.equal(h.badges(), 1);
});
test('legacy Pro owner classification uses only a current-session server owner', async () => {
  const h = harness(); h.login(seed); await ready(h, [seed]);
  const pro = { ...row('pro-page', seed.user_id, 'real'), kind: 'professional', handle: 'seed-person-pro' };
  h.login(real); await ready(h, [real, pro]);
  h.view(pro.id); assert.equal(h.badges(), 0, 'previous session owner cannot classify this Pro');
  // Existing own-profile request may also include the authoritative owner row.
  h.requests.findLast(r => r.table === 'profiles').resolve([real, seed]); await flush();
  assert.equal(h.badges(), 1, 'current-session server owner retains existing Pro classification');
});
test('late seed profile after logout cannot cache or recreate the badge', async () => {
  const h = harness(); h.login(seed); const old = h.requests[0];
  h.logout(); old.resolve([seed]); await flush();
  assert.equal(h.badges(), 0); assert.equal(h.social.getProfile(seed.id), null);
  assert.equal(h.requests.length, 1, 'old refresh stopped');
});
test('authoritative feed author rows also notify readiness; old-session feed replies cannot', async () => {
  const h = harness(); h.login(real); await ready(h, [real]);
  h.view(seed.id); assert.equal(h.badges(), 0);
  const first = h.social.refreshFeed();
  const feed = h.requests.findLast(r => r.table === 'tower_posts');
  feed.resolve([{ id: 'server-post', author_profile_id: seed.id, author: seed }]); await flush();
  await first; assert.equal(h.badges(), 1);
  const pending = h.social.refreshFeed(); const late = h.requests.at(-1);
  h.logout(); late.resolve([{ id: 'old-post', author_profile_id: 'old-seed', author: row('old-seed', 'old-user') }]);
  await pending; assert.equal(h.badges(), 0); assert.equal(h.social.getProfile('old-seed'), null);
});
