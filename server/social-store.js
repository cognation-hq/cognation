"use strict";

const crypto = require("crypto");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const DB_PATH =
  process.env.COGNATION_DB_PATH || path.join(__dirname, "cognation.db");
const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('personal', 'professional')),
    handle TEXT NOT NULL COLLATE NOCASE UNIQUE,
    display_name TEXT NOT NULL,
    bio TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    UNIQUE(user_id, kind)
  );

  CREATE TABLE IF NOT EXISTS follows (
    follower_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (follower_user_id, profile_id)
  );

  CREATE TABLE IF NOT EXISTS friend_requests (
    id TEXT PRIMARY KEY,
    sender_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
    created_at TEXT NOT NULL,
    responded_at TEXT,
    CHECK (sender_user_id <> recipient_user_id)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS one_pending_friend_request
    ON friend_requests(sender_user_id, recipient_user_id)
    WHERE status = 'pending';

  CREATE TABLE IF NOT EXISTS friendships (
    user_low_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_high_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_low_id, user_high_id),
    CHECK (user_low_id < user_high_id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    body TEXT NOT NULL,
    resource_id TEXT,
    read_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    author_profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'friends' CHECK (visibility IN ('friends', 'public')),
    created_at TEXT NOT NULL
  );
`)

/* SeedOps: account_kind on profiles (real | seed | ops). */
try {
  db.exec("ALTER TABLE profiles ADD COLUMN account_kind TEXT NOT NULL DEFAULT 'real'");
} catch (e) {
  /* column may already exist */
}
try {
  db.exec("ALTER TABLE profiles ADD COLUMN seed_fleet_id TEXT");
} catch (e2) {}
try {
  db.exec("ALTER TABLE users ADD COLUMN account_kind TEXT NOT NULL DEFAULT 'real'");
} catch (e3) {}
;

function now() {
  return new Date().toISOString();
}

function id() {
  return crypto.randomUUID();
}

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeHandle(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 40);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const derived = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

function verifyPassword(password, encoded) {
  const [salt, saved] = String(encoded || "").split(":");
  if (!salt || !saved) return false;
  const actual = hashPassword(password, salt).split(":")[1];
  return crypto.timingSafeEqual(Buffer.from(saved, "hex"), Buffer.from(actual, "hex"));
}

function publicProfile(row) {
  if (!row) return null;
  return {
    id: row.id,
    kind: row.kind,
    handle: row.handle,
    displayName: row.display_name,
    accountKind: row.account_kind || "real",
    seedFleetId: row.seed_fleet_id || "",
    bio: row.bio,
    followerCount: Number(row.follower_count || 0),
  };
}

function getUserByUsername(username) {
  return db
    .prepare("SELECT * FROM users WHERE username = ?")
    .get(normalizeUsername(username)) || null;
}

function getUserById(userId) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(userId) || null;
}

function getProfileById(profileId) {
  return db
    .prepare(`
      SELECT profiles.*,
        (SELECT COUNT(*) FROM follows WHERE follows.profile_id = profiles.id) AS follower_count
      FROM profiles
      WHERE profiles.id = ?
    `)
    .get(profileId) || null;
}

function getProfileByHandle(handle) {
  return db
    .prepare(`
      SELECT profiles.*,
        (SELECT COUNT(*) FROM follows WHERE follows.profile_id = profiles.id) AS follower_count
      FROM profiles
      WHERE profiles.handle = ?
    `)
    .get(normalizeHandle(handle)) || null;
}

function getPublicProfileByHandle(handle) {
  return publicProfile(getProfileByHandle(handle));
}

function createUser({ username, password, displayName, handle }) {
  username = normalizeUsername(username);
  displayName = String(displayName || "").trim().slice(0, 80);
  handle = normalizeHandle(handle || username);
  if (!/^[a-z0-9_.-]{3,40}$/.test(username)) {
    return { ok: false, error: "invalid_username" };
  }
  if (String(password || "").length < 10) {
    return { ok: false, error: "weak_password" };
  }
  if (!displayName || !handle) {
    return { ok: false, error: "profile_required" };
  }
  if (getUserByUsername(username) || getProfileByHandle(handle)) {
    return { ok: false, error: "already_exists" };
  }

  const user = { id: id(), username, displayName, passwordHash: hashPassword(password) };
  const profile = {
    id: id(),
    userId: user.id,
    kind: "personal",
    handle,
    displayName,
  };
  const createdAt = now();
  db.exec("BEGIN");
  try {
    db.prepare(
      "INSERT INTO users (id, username, password_hash, display_name, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(user.id, user.username, user.passwordHash, user.displayName, createdAt);
    db.prepare(
      "INSERT INTO profiles (id, user_id, kind, handle, display_name, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(profile.id, profile.userId, profile.kind, profile.handle, profile.displayName, createdAt);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { ok: true, user: { id: user.id, username, displayName }, profile: publicProfile(getProfileById(profile.id)) };
}

function createProfessionalProfile({ userId, displayName, handle, bio }) {
  displayName = String(displayName || "").trim().slice(0, 80);
  handle = normalizeHandle(handle);
  bio = String(bio || "").trim().slice(0, 280);
  if (!displayName || !handle) return { ok: false, error: "profile_required" };
  if (getProfileByHandle(handle)) return { ok: false, error: "handle_taken" };
  const existing = db
    .prepare("SELECT 1 FROM profiles WHERE user_id = ? AND kind = 'professional'")
    .get(userId);
  if (existing) return { ok: false, error: "professional_profile_exists" };
  const profile = {
    id: id(),
    userId,
    kind: "professional",
    displayName,
    handle,
    bio,
  };
  db.prepare(
    "INSERT INTO profiles (id, user_id, kind, handle, display_name, bio, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(
    profile.id,
    profile.userId,
    profile.kind,
    profile.handle,
    profile.displayName,
    profile.bio,
    now()
  );
  return { ok: true, profile: publicProfile(getProfileById(profile.id)) };
}

function authenticate(username, password) {
  const user = getUserByUsername(username);
  if (!user || !verifyPassword(password, user.password_hash)) return null;
  return { id: user.id, username: user.username, displayName: user.display_name };
}

function listProfilesForUser(userId) {
  return db
    .prepare(`
      SELECT profiles.*,
        (SELECT COUNT(*) FROM follows WHERE follows.profile_id = profiles.id) AS follower_count
      FROM profiles
      WHERE user_id = ?
      ORDER BY kind ASC
    `)
    .all(userId)
    .map(publicProfile);
}

function createNotification({ recipientUserId, actorUserId, type, body, resourceId }) {
  const notification = {
    id: id(),
    recipientUserId,
    actorUserId: actorUserId || null,
    type,
    body,
    resourceId: resourceId || null,
    createdAt: now(),
  };
  db.prepare(
    "INSERT INTO notifications (id, recipient_user_id, actor_user_id, type, body, resource_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(
    notification.id,
    notification.recipientUserId,
    notification.actorUserId,
    notification.type,
    notification.body,
    notification.resourceId,
    notification.createdAt
  );
  return notification;
}

function toggleFollow({ followerUserId, profileId }) {
  const profile = getProfileById(profileId);
  if (!profile) return { ok: false, error: "profile_not_found" };
  if (profile.user_id === followerUserId) return { ok: false, error: "cannot_follow_self" };
  const existing = db
    .prepare("SELECT 1 FROM follows WHERE follower_user_id = ? AND profile_id = ?")
    .get(followerUserId, profileId);
  if (existing) {
    db.prepare("DELETE FROM follows WHERE follower_user_id = ? AND profile_id = ?").run(
      followerUserId,
      profileId
    );
    return { ok: true, following: false, followerCount: Number(getProfileById(profileId).follower_count) };
  }
  db.prepare("INSERT INTO follows (follower_user_id, profile_id, created_at) VALUES (?, ?, ?)").run(
    followerUserId,
    profileId,
    now()
  );
  const follower = getUserById(followerUserId);
  createNotification({
    recipientUserId: profile.user_id,
    actorUserId: followerUserId,
    type: "professional_follow",
    body: `${follower.display_name} followed your ${profile.kind} page.`,
    resourceId: profileId,
  });
  return { ok: true, following: true, followerCount: Number(getProfileById(profileId).follower_count) };
}

function accountKindForUser(userId) {
  const row =
    db.prepare("SELECT account_kind FROM profiles WHERE user_id = ? AND kind = 'personal' LIMIT 1").get(userId) ||
    db.prepare("SELECT account_kind FROM users WHERE id = ?").get(userId);
  const kind = row && row.account_kind ? String(row.account_kind) : "real";
  return kind === "seed" || kind === "ops" ? kind : "real";
}

function isRealKind(kind) {
  return String(kind || "real") === "real";
}

function sendFriendRequest({ senderUserId, recipientProfileId }) {
  const recipient = getProfileById(recipientProfileId);
  if (!recipient || recipient.kind !== "personal") return { ok: false, error: "personal_profile_not_found" };
  if (recipient.user_id === senderUserId) return { ok: false, error: "cannot_friend_self" };
  /* SeedOps: real ↛ seed/ops */
  const senderKind = accountKindForUser(senderUserId);
  const recipientKind = recipient.account_kind || accountKindForUser(recipient.user_id) || "real";
  if (isRealKind(senderKind) !== isRealKind(recipientKind)) {
    return { ok: false, error: "real_seed_friend_blocked" };
  }
  const existing = db
    .prepare(
      "SELECT * FROM friend_requests WHERE sender_user_id = ? AND recipient_user_id = ? AND status = 'pending'"
    )
    .get(senderUserId, recipient.user_id);
  if (existing) return { ok: true, request: existing, pending: true };

  const request = {
    id: id(),
    senderUserId,
    recipientUserId: recipient.user_id,
    createdAt: now(),
  };
  db.prepare(
    "INSERT INTO friend_requests (id, sender_user_id, recipient_user_id, status, created_at) VALUES (?, ?, ?, 'pending', ?)"
  ).run(request.id, request.senderUserId, request.recipientUserId, request.createdAt);
  const sender = getUserById(senderUserId);
  createNotification({
    recipientUserId: recipient.user_id,
    actorUserId: senderUserId,
    type: "friend_request",
    body: `${sender.display_name} sent you a friend request.`,
    resourceId: request.id,
  });
  return { ok: true, request, pending: true };
}

function acceptFriendRequest({ requestId, recipientUserId }) {
  const request = db
    .prepare("SELECT * FROM friend_requests WHERE id = ? AND recipient_user_id = ?")
    .get(requestId, recipientUserId);
  if (!request || request.status !== "pending") return { ok: false, error: "request_not_found" };
  const [low, high] = [request.sender_user_id, request.recipient_user_id].sort();
  const respondedAt = now();
  db.exec("BEGIN");
  try {
    db.prepare("UPDATE friend_requests SET status = 'accepted', responded_at = ? WHERE id = ?").run(
      respondedAt,
      request.id
    );
    db.prepare(
      "INSERT OR IGNORE INTO friendships (user_low_id, user_high_id, created_at) VALUES (?, ?, ?)"
    ).run(low, high, respondedAt);
    const recipient = getUserById(recipientUserId);
    createNotification({
      recipientUserId: request.sender_user_id,
      actorUserId: recipientUserId,
      type: "friend_request_accepted",
      body: `${recipient.display_name} accepted your friend request.`,
      resourceId: request.id,
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { ok: true };
}

function listFriendRequests(userId) {
  return db
    .prepare(`
      SELECT friend_requests.*, users.display_name AS sender_display_name, users.username AS sender_username
      FROM friend_requests
      JOIN users ON users.id = friend_requests.sender_user_id
      WHERE friend_requests.recipient_user_id = ? AND friend_requests.status = 'pending'
      ORDER BY friend_requests.created_at DESC
    `)
    .all(userId)
    .map((request) => ({
      id: request.id,
      sender: { id: request.sender_user_id, username: request.sender_username, displayName: request.sender_display_name },
      createdAt: request.created_at,
    }));
}

function listFriends(userId) {
  return db
    .prepare(`
      SELECT users.id, users.username, users.display_name
      FROM friendships
      JOIN users ON users.id = CASE
        WHEN friendships.user_low_id = ? THEN friendships.user_high_id
        ELSE friendships.user_low_id
      END
      WHERE friendships.user_low_id = ? OR friendships.user_high_id = ?
      ORDER BY users.display_name COLLATE NOCASE
    `)
    .all(userId, userId, userId)
    .map((user) => ({ id: user.id, username: user.username, displayName: user.display_name }));
}

function listNotifications(userId) {
  return db
    .prepare(`
      SELECT notifications.*, users.display_name AS actor_display_name
      FROM notifications
      LEFT JOIN users ON users.id = notifications.actor_user_id
      WHERE notifications.recipient_user_id = ?
      ORDER BY notifications.created_at DESC
      LIMIT 50
    `)
    .all(userId)
    .map((item) => ({
      id: item.id,
      type: item.type,
      body: item.body,
      resourceId: item.resource_id,
      createdAt: item.created_at,
      readAt: item.read_at,
      actorDisplayName: item.actor_display_name,
    }));
}

function createPost({ authorUserId, authorProfileId, body, visibility }) {
  body = String(body || "").trim().slice(0, 2000);
  visibility = visibility === "public" ? "public" : "friends";
  if (!body) return { ok: false, error: "post_body_required" };
  const profile = getProfileById(authorProfileId);
  if (!profile || profile.user_id !== authorUserId) {
    return { ok: false, error: "profile_not_owned" };
  }
  const post = {
    id: id(),
    authorProfileId,
    body,
    visibility,
    createdAt: now(),
  };
  db.prepare(
    "INSERT INTO posts (id, author_profile_id, body, visibility, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(post.id, post.authorProfileId, post.body, post.visibility, post.createdAt);
  return { ok: true, post };
}

function listTowerFeed(viewerUserId) {
  return db
    .prepare(`
      SELECT posts.id, posts.body, posts.visibility, posts.created_at,
        profiles.id AS author_profile_id, profiles.handle AS author_handle,
        profiles.display_name AS author_display_name, profiles.kind AS author_kind
      FROM posts
      JOIN profiles ON profiles.id = posts.author_profile_id
      WHERE profiles.user_id = ?
        OR posts.visibility = 'public'
        OR EXISTS (
          SELECT 1
          FROM friendships
          WHERE (friendships.user_low_id = profiles.user_id AND friendships.user_high_id = ?)
             OR (friendships.user_high_id = profiles.user_id AND friendships.user_low_id = ?)
        )
      ORDER BY posts.created_at DESC
      LIMIT 100
    `)
    .all(viewerUserId, viewerUserId, viewerUserId)
    .map((post) => ({
      id: post.id,
      body: post.body,
      visibility: post.visibility,
      createdAt: post.created_at,
      author: {
        profileId: post.author_profile_id,
        handle: post.author_handle,
        displayName: post.author_display_name,
        kind: post.author_kind,
      },
    }));
}

module.exports = {
  authenticate,
  createUser,
  createProfessionalProfile,
  getProfileByHandle,
  getProfileById,
  getPublicProfileByHandle,
  listFriendRequests,
  listFriends,
  listNotifications,
  listProfilesForUser,
  listTowerFeed,
  sendFriendRequest,
  acceptFriendRequest,
  toggleFollow,
  createPost,
};
