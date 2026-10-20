import { test } from "node:test";
import assert from "node:assert/strict";
import { assertDeadline, roleInput } from "../src/lib/owed/domain";
import { usd, toCents } from "../src/lib/money";
import { appOrigin, localPath } from "../src/lib/owed/auth";

test("money uses integer cents at both boundaries", () => {
  assert.deepEqual(usd(12345), { currencyCode: "USD", value: "123.45" });
  assert.equal(toCents("123.45"), 12345);
  for (const value of [0, -1, 1.1, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => usd(value));
  for (const value of ["-1", "1.123", "1e6", "NaN"]) assert.throws(() => toCents(value));
});

test("deadline must be future, bounded and inside the role authorization", () => {
  const now = new Date("2026-10-19T00:00:00Z");
  assert.doesNotThrow(() => assertDeadline(new Date("2026-10-20T00:00:00Z"), now));
  for (const date of [now, new Date("invalid"), new Date("2026-11-10T00:00:00Z")]) assert.throws(() => assertDeadline(date, now));
  assert.throws(() => assertDeadline(new Date("2026-10-21T12:00:00Z"), now, new Date("2026-10-22T00:00:00Z")));
});

test("role input rejects fractional amounts, excessive capacity and empty fields", () => {
  const input = { title: "Engineer", employerName: "Example", guaranteeCents: 1000, capacity: 2, deadline: "2026-10-25T00:00:00Z" };
  assert.equal(roleInput.parse(input).guaranteeCents, 1000);
  for (const fields of [{ guaranteeCents: 1.1 }, { capacity: 101 }, { title: " " }]) assert.equal(roleInput.safeParse({ ...input, ...fields }).success, false);
});

test("login return targets cannot leave Owed", () => {
  for (const path of ["//evil.test", "/\\evil.test", "https://evil.test", "/invite\\evil.test", "/candidate\r\nlocation: evil"]) assert.equal(localPath(path), "/candidate");
  assert.equal(localPath("/invite/abc_123"), "/invite/abc_123");
  const before = process.env.APP_URL;
  try {
    process.env.APP_URL = "http://evil.test";
    assert.throws(() => appOrigin());
    process.env.APP_URL = "https://owed.example";
    assert.equal(appOrigin(), "https://owed.example");
  } finally { if (before === undefined) delete process.env.APP_URL; else process.env.APP_URL = before; }
});
