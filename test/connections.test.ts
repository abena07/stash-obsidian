import { test } from "node:test";
import assert from "node:assert/strict";
import { fromSaved, label, newFolder, readFolders, sharedFolders, type Connection } from "../src/connections.ts";

const conn = (name: string, folder: string, code = "stash_x"): Connection => ({ name, code, folder });

test("an old single code becomes the first connection and keeps its folder", () => {
  assert.deepEqual(fromSaved({ code: " stash_abc ", folder: "reading" }), [
    { name: "", code: "stash_abc", folder: "reading" },
  ]);
});

test("a fresh install starts with one empty connection in stash/", () => {
  assert.deepEqual(fromSaved({}), [{ name: "", code: "", folder: "stash" }]);
});

test("saved connections are kept, with blank folders filled in", () => {
  const saved = [conn("personal", "stash"), { name: "friends", code: "stash_y", folder: " " }];
  assert.deepEqual(fromSaved({ connections: saved, code: "ignored" }), [
    conn("personal", "stash"),
    { name: "friends", code: "stash_y", folder: "stash" },
  ]);
});

test("a new connection gets its own folder", () => {
  assert.equal(newFolder([conn("personal", "stash")], "Friends & Co"), "stash-friends-co");
  assert.equal(newFolder([conn("a", "stash"), conn("b", "stash-friends")], "friends"), "stash-friends-2");
  assert.equal(newFolder([], "!!!"), "stash-server");
});

test("connections without a name get one in messages", () => {
  assert.equal(label(conn("", "stash"), 0), "your stash");
  assert.equal(label(conn("", "x"), 1), "server 2");
  assert.equal(label(conn("friends", "x"), 1), "friends");
});

test("two connections in one folder are flagged", () => {
  assert.deepEqual(sharedFolders([conn("a", "stash"), conn("b", "stash"), conn("c", "other")]), ["stash"]);
  assert.deepEqual(sharedFolders([conn("a", "stash"), conn("b", "stash-friends")]), []);
});

test("the roundup reads each folder once, skipping folders inside another", () => {
  assert.deepEqual(readFolders([conn("a", "stash"), conn("b", "stash/friends"), conn("c", "stash-x"), conn("d", "stash")]),
    ["stash", "stash-x"]);
});
