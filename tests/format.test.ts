import assert from "node:assert/strict";
import test from "node:test";
import { displayStatus, isSeeding } from "../src/shared/format.ts";
import type { Aria2Task } from "../src/shared/types.ts";

test("detects seeding from aria2 seeder flag", () => {
  const task = {
    gid: "1",
    status: "active",
    seeder: "true",
    totalLength: "100",
    completedLength: "100",
  } as Aria2Task;
  assert.equal(isSeeding(task), true);
  assert.equal(displayStatus(task), "seeding");
});

test("detects seeding from a finished torrent still in active", () => {
  const task = {
    gid: "2",
    status: "active",
    bittorrent: { info: { name: "film.mkv" } },
    totalLength: "1000",
    completedLength: "1000",
  } as Aria2Task;
  assert.equal(isSeeding(task), true);
});

test("does not treat an unfinished torrent as seeding", () => {
  const task = {
    gid: "3",
    status: "active",
    bittorrent: { info: { name: "film.mkv" } },
    totalLength: "1000",
    completedLength: "200",
  } as Aria2Task;
  assert.equal(isSeeding(task), false);
  assert.equal(displayStatus(task), "active");
});
