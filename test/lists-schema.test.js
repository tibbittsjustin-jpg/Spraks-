/* P1 lists and friends schema. Reads the migration text. No database. */
"use strict";

const fs = require("fs");
const path = require("path");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { console.log("  \x1b[32mPASS\x1b[0m " + name); pass++; }
  else { console.log("  \x1b[31mFAIL\x1b[0m " + name + (extra ? "  (" + extra + ")" : "")); fail++; }
}

const FILE = "010_lists_friends.sql";
const TABLES = [
  "lists",
  "list_members",
  "list_items",
  "list_item_favorites",
  "username_holds",
  "friendships",
  "blocks",
  "reports",
  "activity_items",
  "shared_plans"
];
const LIST_TABLES = [
  "lists",
  "list_members",
  "list_items",
  "list_item_favorites",
  "shared_plans"
];
const FUNCTIONS = [
  "shared_plan_items_ok",
  "list_occupying_member_count",
  "user_group_list_count",
  "user_list_favorite_count",
  "lists_before_update",
  "lists_after_insert",
  "lists_before_delete",
  "list_members_before_write",
  "list_members_before_delete",
  "list_members_after_status",
  "list_items_before_write",
  "list_items_after_remove",
  "list_item_favorites_before_write"
];

function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "");
}

function tableBody(sql, name) {
  const marker = "create table if not exists public." + name + " (";
  const start = sql.indexOf(marker);
  if (start < 0) return "";
  const rest = sql.slice(start + marker.length);
  const end = rest.indexOf("\n);");
  if (end < 0) return "";
  return rest.slice(0, end);
}

function main() {
  const migrationsDir = path.join(__dirname, "..", "db", "migrations");
  const files = fs.readdirSync(migrationsDir).filter(name => name.endsWith(".sql")).sort();
  check("010 is the only new migration and 005 stays unused",
    files.indexOf(FILE) !== -1 &&
    files.indexOf("005_subscriptions.sql") === -1 &&
    files.filter(name => name.indexOf("010_") === 0).length === 1,
    files.join(","));

  const raw = fs.readFileSync(path.join(migrationsDir, FILE), "utf8");
  const sql = stripComments(raw);
  const lower = sql.toLowerCase();

  check("migration does not create or alter profiles",
    /create\s+table(\s+if\s+not\s+exists)?\s+(public\.)?profiles\b/i.test(sql) === false &&
    /alter\s+table\s+(public\.)?profiles\b/i.test(sql) === false);
  check("migration does not create a usernames table",
    /create\s+table(\s+if\s+not\s+exists)?\s+(public\.)?usernames\b/i.test(sql) === false);
  check("push tables are not in this migration",
    /push_subscriptions|notification_prefs|push_outbox/i.test(raw) === false);

  TABLES.forEach(name => {
    check(name + " table is created", tableBody(raw, name).length > 0);
    check(name + " is in the revoke list",
      raw.indexOf("'" + name + "'") !== -1 &&
      lower.indexOf("enable row level security") !== -1 &&
      lower.indexOf("revoke all on table") !== -1);
  });

  check("no policy is created", /create\s+policy\b/i.test(sql) === false);
  check("no grant statement", /^\s*grant\s+/im.test(sql) === false);
  check("anon and authenticated are revoked when those roles exist",
    /rolname\s*=\s*'anon'/.test(sql) &&
    /rolname\s*=\s*'authenticated'/.test(sql) &&
    /revoke all on table public\.%I from anon/.test(sql) &&
    /revoke all on table public\.%I from authenticated/.test(sql));

  LIST_TABLES.forEach(name => {
    const body = tableBody(raw, name);
    const columnHit = body.split("\n").filter(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.indexOf("constraint ") === 0 || trimmed.indexOf("check ") === 0) return false;
      return /(^|[^a-z_])(address|lat|lng|latitude|longitude|geography|coordinates|coords)([^a-z_]|$)/i.test(trimmed.split(/\s+/)[0] || "");
    });
    check(name + " has no address or coordinate column", columnHit.length === 0, columnHit.join(" | "));
  });

  check("activity_ref check is the agreed pattern",
    raw.indexOf("activity_ref ~ '^(b|a|p):[A-Za-z0-9_.:-]{1,80}$'") !== -1 &&
    raw.indexOf("(elem->>'activity_ref') !~ '^(b|a|p):[A-Za-z0-9_.:-]{1,80}$'") !== -1);
  check("visibility defaults to private and has no members value",
    /visibility text not null default 'private' check \(visibility in \('private', 'friends'\)\)/.test(raw));
  check("group lists cannot be friends-visible",
    /constraint lists_group_is_private check/.test(raw) &&
    /is_group = false or \(visibility = 'private' and kind = 'plan'\)/.test(raw));
  check("one favorites list and one done list per owner",
    /lists_one_favorites_uidx/.test(raw) &&
    /where kind = 'favorites' and deleted_at is null/.test(raw) &&
    /lists_one_done_uidx/.test(raw) &&
    /where kind = 'done' and deleted_at is null/.test(raw));
  check("active color is unique per list",
    /list_members_color_active_uidx/.test(raw) &&
    /on public\.list_members \(list_id, color_idx\)/.test(raw) &&
    /where status in \('invited', 'active'\)/.test(raw));
  check("member cap is 12 and locks the list row then the user",
    /constraint = 'list_members_max_12'/.test(raw) &&
    /v_members \+ 1 > 12/.test(raw) &&
    /from public\.lists/.test(raw) &&
    /for update;/.test(raw) &&
    /pg_advisory_xact_lock\(10050, hashtext\(new\.user_id::text\)\)/.test(raw));
  check("group-list cap is 50 for invited and active memberships",
    /constraint = 'user_group_lists_max_50'/.test(raw) &&
    /v_groups \+ 1 > 50/.test(raw) &&
    /l\.is_group = true/.test(raw) &&
    /l\.deleted_at is null/.test(raw) &&
    /status in \('invited', 'active'\)/.test(raw));
  check("favorites are ranks 1 through 3, unique per list and user",
    /rank smallint not null check \(rank between 1 and 3\)/.test(raw) &&
    /constraint list_item_favorites_rank_uidx unique \(list_id, user_id, rank\)/.test(raw) &&
    /user_list_favorite_count/.test(raw));
  check("items per list are not capped",
    /Items per list are not capped\./.test(raw) &&
    /list_items_max/.test(raw) === false &&
    /100 items/.test(lower) === false);
  check("owner is inserted as an active member",
    /insert into public\.list_members/.test(raw) &&
    /'owner', 'active', 0, null, now\(\)/.test(raw));
  check("added_by is nullable and set null on account deletion",
    /added_by uuid references auth\.users\(id\) on delete set null/.test(raw));
  check("username_holds uses extensions.citext and survives account deletion",
    /username extensions\.citext primary key/.test(raw) &&
    /user_id uuid references auth\.users\(id\) on delete set null/.test(raw));
  check("reports accept the list target types",
    /target_type in \('user', 'list', 'list_name', 'list_invite'\)/.test(raw));
  check("pre-check count functions are defined for route code",
    /function public\.list_occupying_member_count\(p_list_id uuid\)/.test(raw) &&
    /function public\.user_group_list_count\(p_user_id uuid\)/.test(raw) &&
    /function public\.user_list_favorite_count\(p_list_id uuid, p_user_id uuid\)/.test(raw));

  const bodies = [];
  const fnRe = /create or replace function public\.(\w+)\([\s\S]*?\n\$body\$;/g;
  let match;
  while ((match = fnRe.exec(raw))) bodies.push(match[0]);
  check("every function is pinned to search_path",
    bodies.length === FUNCTIONS.length &&
    FUNCTIONS.every(name => bodies.some(body => body.indexOf("function public." + name + "(") !== -1)) &&
    bodies.every(body => body.indexOf("set search_path = public, extensions, pg_catalog") !== -1),
    "found " + bodies.map(body => (body.match(/function public\.(\w+)/) || [])[1]).join(","));
  check("function execute is revoked from public, anon, and authenticated",
    /revoke all on function %s from public/.test(sql) &&
    /revoke all on function %s from anon/.test(sql) &&
    /revoke all on function %s from authenticated/.test(sql));

  return { pass: pass, fail: fail };
}

module.exports = main();
