/* Rating appeals (RATING-RULES-DRAFT.md section 5): one per post, Investigator decides. */
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..");
var sql = fs.readFileSync(path.join(root, "supabase/migrations/20261015_rating_appeals.sql"), "utf8");
assert.ok(/if p\.appealed_at is not null then return false; end if; -- one appeal per post/.test(sql));
assert.ok(/on public\.rating_review_queue \(post_id\) where kind = 'appeal'/.test(sql), "unique appeal per post");
assert.ok(/pr\.user_id = auth\.uid\(\);\s*if not found then raise exception 'Only the poster can appeal'/.test(sql));
assert.ok(/new\.appealed_at := old\.appealed_at;/.test(sql), "posters cannot reset appealed_at");
assert.ok(/decision not in \('keep','lower','raise'\)/.test(sql) && /A one-line reason is required/.test(sql));
assert.ok(/revoke all on function public\.investigator_decide_rating\(uuid, text, text, text\) from public, anon, authenticated;/.test(sql));
assert.ok(/grant execute on function public\.appeal_my_post_rating\(uuid, text\) to authenticated;/.test(sql));
assert.ok(!/penalt|strike|suspend/i.test(sql.replace(/--.*$/gm, "")), "no account penalties");
var social = fs.readFileSync(path.join(root, "js/supabase-social.js"), "utf8");
assert.ok(/\.rpc\("appeal_my_post_rating", \{ post_id: postId/.test(social) && /appealPostRating: appealPostRating,/.test(social));
console.log("rating-appeals.test.js: ok");
