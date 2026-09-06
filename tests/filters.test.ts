import assert from "node:assert/strict";
import test from "node:test";
import { skipReason, matchesGlob, isTorrent } from "../src/background/filters.ts";

const base = {
  id: 1,
  url: "https://example.com/file.zip",
  filename: "file.zip",
  mime: "application/zip",
  fileSize: 5000,
  incognito: false,
};

const capture = {
  enabled: true,
  minSizeBytes: 1024,
  excludeUrlGlobs: [],
  excludePageGlobs: [],
  excludeExtensions: ["html", "htm"],
  excludeMimes: ["text/html"],
  capturePdf: false,
  capturePrivate: false,
};

test("captures a normal zip", () => {
  assert.equal(skipReason(base, capture, "ariafox@local"), null);
});

test("skips when capture is off", () => {
  assert.equal(
    skipReason(base, { ...capture, enabled: false }, "id"),
    "capture-disabled",
  );
});

test("skips html and pdf", () => {
  assert.equal(
    skipReason({ ...base, filename: "page.html", mime: "text/html" }, capture, "id"),
    "extension",
  );
  assert.equal(
    skipReason({ ...base, filename: "doc.pdf", mime: "application/pdf" }, capture, "id"),
    "pdf",
  );
});

test("skips blob urls and private windows", () => {
  assert.equal(
    skipReason({ ...base, url: "blob:https://example.com/1" }, capture, "id"),
    "scheme",
  );
  assert.equal(
    skipReason({ ...base, incognito: true }, capture, "id"),
    "private",
  );
});

test("skips tiny files when size is known", () => {
  assert.equal(skipReason({ ...base, fileSize: 12 }, capture, "id"), "too-small");
});

test("glob matching", () => {
  assert.equal(matchesGlob("https://cdn.example.com/a", "https://*.example.com/*"), true);
  assert.equal(isTorrent({ ...base, filename: "x.torrent" }), true);
});
