import { test } from "node:test";
import assert from "node:assert/strict";
import { hash, joinPath, nextState, plan, summary, type RemoteFile, type State } from "../src/sync.ts";

const file = (id: number, name: string, content: string): RemoteFile => ({ id, name, content });
const vault = (files: Record<string, string>) => async (path: string) => files[path] ?? null;

test("new links are created in the folder", async () => {
  const actions = await plan([file(1, "inside .git.md", "v1")], {}, "stash", vault({}));
  assert.deepEqual(actions, [{ kind: "create", id: 1, path: "stash/inside .git.md", content: "v1" }]);
});

test("a file the plugin wrote is updated when stash has something new", async () => {
  const state: State = { "1": { path: "stash/a.md", hash: hash("v1") } };
  const actions = await plan([file(1, "a.md", "v2")], state, "stash", vault({ "stash/a.md": "v1" }));
  assert.equal(actions[0].kind, "update");
  assert.deepEqual(nextState(state, actions), { "1": { path: "stash/a.md", hash: hash("v2") } });
});

test("nothing happens when nothing changed", async () => {
  const state: State = { "1": { path: "stash/a.md", hash: hash("v1") } };
  const actions = await plan([file(1, "a.md", "v1")], state, "stash", vault({ "stash/a.md": "v1" }));
  assert.equal(actions[0].kind, "unchanged");
  assert.equal(summary(actions), "stash: everything is up to date.");
});

test("a file you edited is never overwritten", async () => {
  const state: State = { "1": { path: "stash/a.md", hash: hash("v1") } };
  const actions = await plan([file(1, "a.md", "v2")], state, "stash", vault({ "stash/a.md": "v1 + my thoughts" }));
  assert.deepEqual(actions, [{ kind: "skip-edited", id: 1, path: "stash/a.md" }]);
  assert.deepEqual(nextState(state, actions), state); // keeps treating it as yours
});

test("a file you deleted stays deleted", async () => {
  const state: State = { "1": { path: "stash/a.md", hash: hash("v1") } };
  const actions = await plan([file(1, "a.md", "v2")], state, "stash", vault({}));
  assert.equal(actions[0].kind, "skip-deleted");
});

test("a new title renames the file, unless the new name is taken", async () => {
  const state: State = { "1": { path: "stash/old.md", hash: hash("v1") } };
  const renamed = await plan([file(1, "new.md", "v2")], state, "stash", vault({ "stash/old.md": "v1" }));
  assert.deepEqual(renamed, [{ kind: "rename", id: 1, from: "stash/old.md", to: "stash/new.md", content: "v2" }]);
  assert.equal(nextState(state, renamed)["1"].path, "stash/new.md");

  const taken = await plan([file(1, "new.md", "v2")], state, "stash",
    vault({ "stash/old.md": "v1", "stash/new.md": "someone else's" }));
  assert.equal(taken[0].kind, "update"); // updated in place instead
});

test("files from /export are taken over only if identical", async () => {
  const same = await plan([file(1, "a.md", "v1")], {}, "stash", vault({ "stash/a.md": "v1" }));
  assert.equal(same[0].kind, "adopt");
  const different = await plan([file(1, "a.md", "v1")], {}, "stash", vault({ "stash/a.md": "my own note" }));
  assert.equal(different[0].kind, "skip-taken");
});

test("summary reads naturally", async () => {
  const state: State = { "2": { path: "stash/b.md", hash: hash("old") } };
  const actions = await plan(
    [file(1, "a.md", "x"), file(2, "b.md", "new"), file(3, "c.md", "y")], state, "stash",
    vault({ "stash/b.md": "edited", "stash/c.md": "mine" }),
  );
  assert.equal(summary(actions),
    "stash: 1 new, 1 left alone because you edited it, 1 skipped because a different file already has that name.");
});

test("folder paths are joined cleanly", () => {
  assert.equal(joinPath("stash/", "a.md"), "stash/a.md");
  assert.equal(joinPath("/reading/stash/", "a.md"), "reading/stash/a.md");
  assert.equal(joinPath("", "a.md"), "a.md");
});
