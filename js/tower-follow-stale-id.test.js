/* '+ friend' stale data-profile-id: syncButton must not keep (or re-use) the
   previous profile's id once the Tower profile store has no id, e.g. after
   sign-out with no profile hash. Loads the real js/tower-follow.js in a vm
   with a stub document, button and profile store. No storage writes. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SRC = fs.readFileSync(path.join(__dirname, "tower-follow.js"), "utf8");

function makeButton(attrs) {
  const a = Object.assign({}, attrs);
  return {
    hidden: false,
    disabled: false,
    textContent: "+ friend",
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    getAttribute(n) { return Object.prototype.hasOwnProperty.call(a, n) ? a[n] : null; },
    hasAttribute(n) { return Object.prototype.hasOwnProperty.call(a, n); },
    setAttribute(n, v) { a[n] = String(v); },
    removeAttribute(n) { delete a[n]; },
    closest() { return null; },
    _attrs: a,
  };
}

function load(opts) {
  const handlers = {};
  const btn = makeButton(opts.attrs);
  const store = { get: () => opts.profile };
  const ls = {};
  const document = {
    readyState: "complete",
    body: { classList: { contains: () => false } },
    addEventListener(t, fn) { (handlers[t] = handlers[t] || []).push(fn); },
    querySelectorAll(sel) { return sel === "[data-tower-follow]" ? [btn] : []; },
    querySelector() { return null; },
  };
  const window = {
    CognationTowerProfileStore: store,
    CognationAccounts: { getProfileById: (id) => (opts.localIds || []).includes(id) ? { id } : null },
    setTimeout: () => 0,
  };
  const ctx = {
    window, document, console,
    localStorage: { getItem: (k) => (k in ls ? ls[k] : null), setItem: () => { throw new Error("no writes"); }, removeItem: () => { throw new Error("no writes"); } },
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return {
    btn,
    setProfile(p) { opts.profile = p; },
    fire(t) { (handlers[t] || []).forEach((fn) => fn({})); },
  };
}

test("signed out, store id empty: the stale data-profile-id is removed", () => {
  const h = load({ profile: { _profileId: "" }, attrs: { "data-tower-follow": "", "data-profile-id": "416b26cf-0000-4000-8000-000000000091" } });
  h.fire("cognation:session-ended");
  assert.strictEqual(h.btn.hasAttribute("data-profile-id"), false);
});

test("no profile in the store at all: the stale id is removed", () => {
  const h = load({ profile: null, attrs: { "data-tower-follow": "", "data-profile-id": "prof-seed-0091" } });
  h.fire("cognation:session-ended");
  assert.strictEqual(h.btn.hasAttribute("data-profile-id"), false);
});

test("store id empty: a stale id that is a local record no longer shows '+ friend' for it", () => {
  const stale = "prof-seed-0091";
  const h = load({ profile: { _profileId: "" }, localIds: [stale], attrs: { "data-tower-follow": "", "data-profile-id": stale } });
  h.fire("cognation:session-ended");
  assert.strictEqual(h.btn.hasAttribute("data-profile-id"), false);
  assert.strictEqual(h.btn.hidden, true);
});

test("the store id still wins and is written to the attribute", () => {
  const h = load({ profile: { _profileId: "" }, attrs: { "data-tower-follow": "", "data-profile-id": "old-id" } });
  h.setProfile({ _profileId: "c386ce9e-0000-4000-8000-000000000093" });
  h.fire("cognation:tower-view-changed");
  assert.strictEqual(h.btn.getAttribute("data-profile-id"), "c386ce9e-0000-4000-8000-000000000093");
});

test("markup's empty data-profile-id stays as it is (signed-out demo DOM unchanged)", () => {
  const h = load({ profile: { _profileId: "" }, attrs: { "data-tower-follow": "", "data-profile-id": "" } });
  h.fire("cognation:session-ended");
  assert.strictEqual(h.btn.getAttribute("data-profile-id"), "");
});
