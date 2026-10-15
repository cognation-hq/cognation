/* Tower auto-rate (RATING-RULES-DRAFT.md sections 1-6). */
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..");
var AR = require("./auto-rate.js");
var sql = fs.readFileSync(path.join(root, "supabase/migrations/20261015_tower_auto_rate.sql"), "utf8");

/* JS term lists == SQL term lists (the DB trigger is the authority). */
Object.keys(AR.LISTS).forEach(function (k) {
  var m = new RegExp("l_" + k + " text\\[\\] := array\\[(.*?)\\]::text\\[\\];").exec(sql);
  assert.ok(m, "SQL list " + k);
  var terms = m[1].match(/'((?:[^']|'')*)'/g).map(function (t) { return t.slice(1, -1).replace(/''/g, "'"); });
  assert.deepStrictEqual(terms, AR.LISTS[k], "list " + k + " matches SQL");
});

function r(t, a) { return AR.rate(t, a || []); }
assert.strictEqual(r("hello friends").rating, "G", "plain text is G");
assert.strictEqual(r("my dad bought a gun today").rating, "PG-13", "weapons: PG-13 minimum");
assert.strictEqual(r("war propaganda clip").rating, "R", "war/psy-ops: R minimum");
assert.ok(r("war propaganda clip").review, "war: Investigator review");
assert.strictEqual(r("this is fucking great").rating, "PG-13", "brief strong language");
assert.strictEqual(r("fuck shit fuck").rating, "R", "frequent strong language");
var masked = r("f*ck this");
assert.ok(masked.rating === "PG-13" && masked.confidence === "low" && masked.review, "unsure: stricter + low confidence + review");
var att = r("hi", [{ kind: "image" }]);
assert.ok(att.rating === "PG-13" && att.confidence === "low" && att.review, "unread attachment: stricter + review");
var harm = r("I will kill you");
assert.ok(harm.rating === "NR" && harm.harmful && harm.review, "not rateable: NR + Harmful queue");
assert.ok(r("want to die lately").review, "self-harm topic: review");
assert.strictEqual(r("Sussex is lovely").rating, "G", "whole words only");
assert.ok(r("new porn link").rating === "MA" && r("new porn link").review, "MA + review");
assert.strictEqual(AR.stricter("PG", "R"), "R");

/* Visibility. */
function see(rt, v) { return AR.canSee(rt, v); }
assert.ok(see("PG-13", { age: 13 }) && !see("R", { age: 17 }) && see("R", { age: 18 }));
assert.ok(!see("MA", { age: 20, matureOptIn: true }), "18-20 never see MA");
assert.ok(!see("MA", { age: 25 }) && see("MA", { age: 25, matureOptIn: true }), "MA: 21+ opt-in only");
assert.ok(!see("R", {}), "unknown age counts as 13");
assert.ok(see("PG", { age: 11 }) && !see("PG-13", { age: 11 }), "under-13 backstop: G/PG only");
assert.ok(!see("NR", { age: 40 }) && !see("bogus", { age: 40 }));

/* Server: rated on insert, client value ignored, never lowered by the poster. */
assert.ok(/before insert or update on public\.tower_posts/.test(sql));
assert.ok(/if tg_op = 'INSERT' then\s*new\.rating := r\.rating;/.test(sql), "insert ignores client rating");
assert.ok(/new\.rating := old\.rating;/.test(sql), "poster cannot change rating");
assert.ok(/current_user not in \('anon', 'authenticated'\)/.test(sql), "only definer functions can override");
assert.ok(/when 'R' then v\.age >= 18/.test(sql) && /when 'MA' then v\.age >= 21 and v\.opt_in/.test(sql));
assert.ok(/coalesce\(public\.cognation_user_age\(auth\.uid\(\)\), 13\)/.test(sql), "unknown age = 13");
assert.ok(/revoke all on public\.rating_review_queue from anon, authenticated;/.test(sql));
assert.ok(/values \(new\.id, 'harmful', r\.reasons\)/.test(sql), "harmful queue");
assert.ok(!/dwell|engagement|reaction/i.test(sql.replace(/--.*$/gm, "")), "no dwell/engagement signals");
assert.ok(!/dwell|engagement|likes|reaction/i.test(fs.readFileSync(path.join(root, "js/auto-rate.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")), "rater ignores engagement");

/* Client carries the rating into SIGNAL/ECHO and never takes it from the poster. */
var tower = fs.readFileSync(path.join(root, "js/tower.js"), "utf8");
assert.ok(/post\.rating = postRating\(post\); \/\* rating carries unchanged into SIGNAL and ECHO \*\//.test(tower));
assert.ok(/rating: window\.CognationAutoRate\s*\? window\.CognationAutoRate\.rate\(body,/.test(tower), "local posts rated at post time");
var social = fs.readFileSync(path.join(root, "js/supabase-social.js"), "utf8");
assert.ok(/created_at,rating,author:/.test(social) && /rating: row\.rating \|\| "PG-13"/.test(social));
assert.ok(!/rating:/.test(social.slice(social.indexOf("function createTowerPost"), social.indexOf("function feedPost"))), "poster never sends a rating");
var html = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert.ok(html.indexOf("js/auto-rate.js") > 0 && html.indexOf("js/auto-rate.js") < html.indexOf("js/tower.js"), "rater loads before tower");
console.log("tower-auto-rate.test.js: ok");
