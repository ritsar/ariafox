import assert from "node:assert/strict";
import test from "node:test";
import {
  bytesToMib,
  displayMib,
  flattenFields,
  GLOBAL_OPTION_GROUPS,
  isNonNegativeInteger,
  mibToAria2,
  parseAria2Bytes,
} from "../src/shared/aria2-options.ts";

test("parses aria2 byte values into MiB integers", () => {
  assert.equal(displayMib("0"), "0");
  assert.equal(displayMib("8388608"), "8");
  assert.equal(displayMib("8M"), "8");
  assert.equal(displayMib("16777216"), "16");
  assert.equal(displayMib("20M"), "20");
});

test("sub-MiB limits round up to 1 so they are not saved as unlimited", () => {
  assert.equal(bytesToMib(1024), 1);
  assert.equal(parseAria2Bytes("500K"), 512000);
  assert.equal(displayMib("500K"), "1");
});

test("writes MiB integers back as aria2 M suffixes", () => {
  assert.equal(mibToAria2(0), "0");
  assert.equal(mibToAria2(5), "5M");
  assert.equal(mibToAria2(8), "8M");
});

test("rejects non-integers", () => {
  assert.equal(isNonNegativeInteger("5"), true);
  assert.equal(isNonNegativeInteger("0"), true);
  assert.equal(isNonNegativeInteger("5M"), false);
  assert.equal(isNonNegativeInteger("1.5"), false);
  assert.equal(isNonNegativeInteger("5e2"), false);
  assert.equal(isNonNegativeInteger("abc"), false);
});

test("global option keys are unique", () => {
  const keys = flattenFields(GLOBAL_OPTION_GROUPS).map((field) => field.key);
  assert.equal(keys.length, new Set(keys).size);
});
