/* User blocks: quiet, undoes friendship, hides feeds, Block below Report, no emails. */
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..");
var sql = fs.readFileSync(path.join(root, "supabase/migrations/20261016_user_blocks.sql"), "utf8");
var code = sql.split("\n").filter(function (l) { return !/^\s*--/.test(l); }).join("\n");
var comments = fs.readFileSync(path.join(root, "js/news-comments.js"), "utf8");
var blockJs = fs.readFileSync(path.join(root, "js/block.js"), "utf8");
var page = fs.readFileSync(path.join(root, "blocked.html"), "utf8");

assert.ok(/create table if not exists public\.user_blocks/.test(code));
assert.ok(/delete from public\.friendships/.test(code), "undo friendship");
assert.ok(/status = 'cancelled'/.test(code), "cancel pending requests");
assert.ok(/raise exception 'blocked'/.test(code));
assert.ok(/not public\.block_users_related/.test(code), "feed hides across block");
assert.ok(!/notify|notification.*block|blocked you/i.test(code), "quiet — no block notice");
assert.ok(/list_my_blocks/.test(code) && !/email/i.test(code));

assert.ok(/data-news-comment-block/.test(comments));
assert.ok(/Report<\/button>' \+ blockBtn/.test(comments) || /option \+ blockBtn/.test(comments), "Block below Report");
assert.ok(/CognationBlock\.blockUser/.test(comments));
assert.ok(/Unblock/.test(page) && /not notified/.test(page));
assert.ok(/href=\"\/blocked\.html\"/.test(fs.readFileSync(path.join(root, "index.html"), "utf8")), "Blocked settings link");
assert.ok(!/@[a-z0-9.-]+\.[a-z]{2,}/i.test(blockJs + page.replace(/@sam|@jordan/g, "")));
assert.ok(typeof require("./block.js").blockUser === "function");
var styles = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");
assert.ok(/\.news-comment-item \.news-report-option/.test(styles), "dark shell Report/Block pills");
assert.ok(/padding: 0\.18rem 0\.45rem/.test(styles) && /font-size: 0\.68rem/.test(styles), "smaller pills");
assert.ok(/inv-btn-danger/.test(styles), "keep Confirm-illegal danger styles");
console.log("user-block.test.js: ok");
