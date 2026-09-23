import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { assertOrigin, taskPatch, TOKEN_PATTERN } from "../lib/security";
const owner = "11111111-1111-4111-8111-111111111111",
  outsider = "22222222-2222-4222-8222-222222222222",
  board = "33333333-3333-4333-8333-333333333333",
  task = "44444444-4444-4444-8444-444444444444";
test("Database permissions reject viewers and outsiders and allow only the owner", async () => {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
  );
  await db.exec(
    await readFile(
      new URL("../supabase/migrations/001_shared_memo.sql", import.meta.url),
      "utf8",
    ),
  );
  const token = randomBytes(32).toString("base64url"),
    hash = createHash("sha256").update(token).digest("hex");
  await db.query("insert into auth.users values ($1,$2),($3,$4)", [
    owner,
    "owner@example.test",
    outsider,
    "other@example.test",
  ]);
  await db.query(
    "insert into boards(id,owner_id,viewer_token_hash) values($1,$2,$3)",
    [board, owner, hash],
  );
  await db.exec(
    `set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false);`,
  );
  await db.query("insert into tasks(id,board_id,title) values($1,$2,$3)", [
    task,
    board,
    "Private test task",
  ]);
  await db.exec(`update tasks set status='done';`);
  let result = await db.query<{ completed_at: string }>(
    "select completed_at from tasks",
  );
  assert.ok(result.rows[0].completed_at);
  await db.exec(`update tasks set status='waiting';`);
  result = await db.query("select completed_at from tasks");
  assert.equal(result.rows[0].completed_at, null);
  await assert.rejects(
    db.query("update boards set owner_id=$1", [outsider]),
    /permission denied/,
  );
  await db.exec(`reset role;set role anon;`);
  await assert.rejects(db.query("select * from boards"), /permission denied/);
  await assert.rejects(db.query("select * from tasks"), /permission denied/);
  await assert.rejects(
    db.query("update tasks set title='hacked'"),
    /permission denied/,
  );
  await assert.rejects(
    db.query("insert into tasks(board_id,title) values($1,'hacked')", [board]),
    /permission denied/,
  );
  await assert.rejects(db.query("delete from tasks"), /permission denied/);
  await assert.rejects(
    db.query("select reorder_tasks($1,$2)", [
      board,
      JSON.stringify([{ id: task, status: "done", sort_order: 1 }]),
    ]),
    /permission denied/,
  );
  const noAccess = await db.query<{ memo: null }>(
    "select read_shared_board($1) as memo",
    ["wrong"],
  );
  assert.equal(noAccess.rows[0].memo, null);
  const stolenHash = await db.query<{ memo: null }>(
    "select read_shared_board($1) as memo",
    [hash],
  );
  assert.equal(stolenHash.rows[0].memo, null);
  const allowed = await db.query<{
    memo: {
      title: string;
      tasks: { title: string }[];
      owner_id?: string;
      viewer_token_hash?: string;
    };
  }>("select read_shared_board($1) as memo", [token]);
  assert.equal(allowed.rows[0].memo.tasks[0].title, "Private test task");
  assert.equal(allowed.rows[0].memo.owner_id, undefined);
  assert.equal(allowed.rows[0].memo.viewer_token_hash, undefined);
  await db.exec(
    `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${outsider}',false);`,
  );
  assert.equal((await db.query("select * from tasks")).rows.length, 0);
  assert.equal((await db.query("select * from boards")).rows.length, 0);
  await db.exec("update tasks set title='hacked';delete from tasks;");
  await assert.rejects(
    db.query("insert into tasks(board_id,title) values($1,'hacked')", [board]),
    /row-level security/,
  );
  await assert.rejects(
    db.query("select reorder_tasks($1,$2)", [
      board,
      JSON.stringify([{ id: task, status: "done", sort_order: 1 }]),
    ]),
    /Not authorized/,
  );
  await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false);`);
  assert.equal(
    (await db.query<{ title: string }>("select title from tasks")).rows[0]
      .title,
    "Private test task",
  );
  await db.query("select reorder_tasks($1,$2)", [
    board,
    JSON.stringify([{ id: task, status: "done", sort_order: 1024 }]),
  ]);
  assert.equal(
    (await db.query<{ status: string }>("select status from tasks")).rows[0]
      .status,
    "done",
  );
  await assert.rejects(
    db.query("select reorder_tasks($1,$2)", [
      board,
      JSON.stringify([
        { id: task, status: "waiting", sort_order: 1 },
        { id: outsider, status: "waiting", sort_order: 2 },
      ]),
    ]),
    /Invalid items/,
  );
  assert.equal(
    (await db.query<{ status: string }>("select status from tasks")).rows[0]
      .status,
    "done",
  );
  await db.exec("reset role;");
  // The timestamp trigger preserves done timestamps; set the fixture while it is disabled.
  await db.exec(
    "alter table tasks disable trigger stamp_task;update tasks set completed_at=now()-interval '25 hours';alter table tasks enable trigger stamp_task;set role anon;",
  );
  const archivedView = await db.query<{ memo: { tasks: unknown[] } }>(
    "select read_shared_board($1) as memo",
    [token],
  );
  assert.equal(archivedView.rows[0].memo.tasks.length, 0);
  await db.exec(
    `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false);`,
  );
  assert.equal((await db.query("select id from tasks")).rows.length, 1);
  await db.exec("update tasks set status='pending';");
  const reopenedView = await db.query<{ memo: { tasks: unknown[] } }>(
    "select read_shared_board($1) as memo",
    [token],
  );
  assert.equal(reopenedView.rows[0].memo.tasks.length, 1);
  await db.query("update boards set viewer_token_hash=$1", [
    createHash("sha256").update(randomBytes(32)).digest("hex"),
  ]);
  await db.exec("reset role;set role anon;");
  assert.equal(
    (
      await db.query<{ memo: null }>("select read_shared_board($1) as memo", [
        token,
      ])
    ).rows[0].memo,
    null,
  );
  await db.close();
});
test("Mutation validation blocks CSRF and sensitive field injection", () => {
  const origin = "https://memo.example.test";
  assert.throws(() =>
    assertOrigin(
      new Request(origin, {
        method: "POST",
        headers: {
          Origin: "https://attacker.example",
          "Content-Type": "application/json",
        },
      }),
      origin,
    ),
  );
  assert.throws(() =>
    assertOrigin(
      new Request(origin, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
      origin,
    ),
  );
  assert.doesNotThrow(() =>
    assertOrigin(
      new Request(origin, {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
      }),
      origin,
    ),
  );
  assert.throws(() => taskPatch({ owner_id: owner }));
  assert.throws(() => taskPatch({ board_id: board }));
  assert.throws(() => taskPatch({ status: "admin" }));
  assert.throws(() => taskPatch({ title: "   " }));
  assert.throws(() => taskPatch({ note: "x".repeat(401) }));
  assert.deepEqual(taskPatch({ title: " A memo ", assigned_to: "James" }), {
    title: "A memo",
    assigned_to: "James",
  });
  assert.match(randomBytes(32).toString("base64url"), TOKEN_PATTERN);
});
