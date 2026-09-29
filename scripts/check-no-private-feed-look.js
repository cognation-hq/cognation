/**
 * Pages-shipped files must not bring back the private "My feed look" panel.
 * Run: node scripts/check-no-private-feed-look.js
 */
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const roots = ["index.html", "about.html", "contact.html", "css", "js", "functions"];

const forbidden = [
  "My feed look",
  "newsfeed backside",
  "See-through names on posts",
  "See-through messages panel",
  "data-tower-private-theme",
  "data-tower-private-bg",
  "data-tower-private-font",
  "data-tower-private-text",
  "data-tower-private-btn",
  "data-tower-private-author-see-through",
  "data-tower-private-messages-see-through",
  "data-tower-private-theme-save",
  "data-author-see-through",
  "data-messages-see-through",
  "DEFAULT_PRIVATE_FEED_THEME",
  "normalizePrivateFeedTheme",
  "applyPrivateFeedTheme",
  "initPrivateFeedThemeControls",
  "readPrivateFeedThemeFromForm",
  "Feed look saved",
  "Could not save feed look",
  "tower-private-check",
];

function walk(rel, out) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return;
  const stat = fs.statSync(abs);
  if (stat.isDirectory()) {
    fs.readdirSync(abs).forEach(function (name) {
      walk(path.join(rel, name), out);
    });
    return;
  }
  if (/\.(html|css|js|mjs)$/.test(rel)) out.push(rel);
}

const files = [];
roots.forEach(function (rel) {
  walk(rel, files);
});

const hits = [];
files.forEach(function (rel) {
  const text = fs.readFileSync(path.join(root, rel), "utf8");
  forbidden.forEach(function (needle) {
    if (text.indexOf(needle) !== -1) hits.push(rel + ": " + needle);
  });
  if (rel.endsWith(".js") && /privateFeedTheme\s*[:=]/.test(text)) {
    hits.push(rel + ": assigns privateFeedTheme");
  }
});

if (hits.length) {
  console.error("private feed-look controls still ship:");
  hits.forEach(function (hit) {
    console.error("  " + hit);
  });
  process.exit(1);
}

const vm = require("vm");

function makeStorage(initial) {
  const data = Object.assign({}, initial || {});
  return {
    getItem: function (k) {
      return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null;
    },
    setItem: function (k, v) {
      data[k] = String(v);
    },
    removeItem: function (k) {
      delete data[k];
    },
    _data: data,
  };
}

const localStorage = makeStorage({
  "cognation.profiles.v1": JSON.stringify({
    profiles: {
      "prof-1": {
        id: "prof-1",
        kind: "personal",
        displayName: "A",
        privateFeedTheme: { backgroundColor: "#111111", fontFamily: "sans" },
      },
    },
  }),
  "cognation.tower.profile.v1": JSON.stringify({
    displayName: "Legacy",
    privateFeedTheme: { fontFamily: "scrapbook" },
  }),
});

function CustomEvent(type, init) {
  this.type = type;
  this.detail = init && init.detail;
}

const context = vm.createContext({
  console: console,
  localStorage: localStorage,
  CustomEvent: CustomEvent,
  document: {
    addEventListener: function () {},
    dispatchEvent: function () {},
  },
});
context.window = context;
vm.runInContext(fs.readFileSync(path.join(root, "js/accounts.js"), "utf8"), context);

const profiles = JSON.parse(localStorage.getItem("cognation.profiles.v1"));
const legacy = JSON.parse(localStorage.getItem("cognation.tower.profile.v1"));
if (!profiles.profiles["prof-1"] || profiles.profiles["prof-1"].privateFeedTheme) {
  console.error("stored profile still has privateFeedTheme");
  process.exit(1);
}
if (legacy.privateFeedTheme) {
  console.error("legacy tower profile still has privateFeedTheme");
  process.exit(1);
}
if (profiles.profiles["prof-1"].displayName !== "A") {
  console.error("scrub dropped unrelated profile fields");
  process.exit(1);
}

context.CognationAccounts.updateProfileTower("prof-1", {
  displayName: "B",
  privateFeedTheme: { fontSize: 20, authorSeeThrough: true },
});
const again = JSON.parse(localStorage.getItem("cognation.profiles.v1"));
if (again.profiles["prof-1"].privateFeedTheme) {
  console.error("updateProfileTower reintroduced privateFeedTheme");
  process.exit(1);
}
if (again.profiles["prof-1"].displayName !== "B") {
  console.error("updateProfileTower did not keep the display name");
  process.exit(1);
}

console.log("ok: no private feed-look controls in " + files.length + " Pages files");
console.log("ok: stored privateFeedTheme is dropped and cannot be saved back");
process.exit(0);
