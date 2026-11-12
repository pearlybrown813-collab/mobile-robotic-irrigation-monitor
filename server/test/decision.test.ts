// Unit tests for the decision rules, validation and security helpers.
// Run with:  npm test --prefix server
import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, recommend, rawToMoisturePercent, DEFAULT_THRESHOLDS } from "../src/lib/decision";
import { parseReading } from "../src/lib/validation";
import { hashPassword, verifyPassword, signToken, verifyToken } from "../src/lib/security";

test("two-point calibration converts raw ADC to percent", () => {
  assert.equal(rawToMoisturePercent(3000), 0);     // dry air
  assert.equal(rawToMoisturePercent(1200), 100);   // water
  assert.equal(rawToMoisturePercent(2100), 50);    // half way
  assert.equal(rawToMoisturePercent(3500), 0);     // clamped
  assert.equal(rawToMoisturePercent(900), 100);    // clamped
});

test("threshold classification (dry < 30 <= normal <= 60 < wet)", () => {
  assert.equal(classify(12), "dry");
  assert.equal(classify(29.9), "dry");
  assert.equal(classify(30), "normal");
  assert.equal(classify(60), "normal");
  assert.equal(classify(60.1), "wet");
});

test("recommendation uses temperature as a complementary variable", () => {
  assert.equal(recommend("dry", 28), "Irrigation needed");
  assert.equal(recommend("normal", 28), "Condition satisfactory");
  assert.equal(recommend("wet", 28), "No irrigation required");
  assert.match(recommend("normal", 36), /re-check soon/);
  assert.match(recommend("dry", 37), /urgent/);
  assert.equal(recommend("wet", 40), "No irrigation required");
  assert.equal(DEFAULT_THRESHOLDS.hotAbove, 35);
});

test("reading validation accepts good data and rejects bad data", () => {
  const ok = parseReading({ point: "2", moisture: "41.5", temperature: "29.8", raw: "2253" });
  assert.equal(ok.ok, true);
  assert.equal(parseReading({ point: 0, moisture: 40, temperature: 30 }).ok, false);
  assert.equal(parseReading({ point: 1, moisture: 140, temperature: 30 }).ok, false);
  assert.equal(parseReading({ point: 1, moisture: 40, temperature: -127 }).ok, false); // DS18B20 fault code
  assert.equal(parseReading({ point: 1, moisture: 40, temperature: 30, raw: 5000 }).ok, false);
});

test("passwords are hashed and verified", () => {
  const h = hashPassword("Farmer@123");
  assert.ok(h.startsWith("scrypt$"));
  assert.equal(verifyPassword("Farmer@123", h), true);
  assert.equal(verifyPassword("wrong", h), false);
});

test("session tokens are signed and tamper-proof", () => {
  const token = signToken({ uid: 1, role: "admin", name: "Admin" }, "secret", 1);
  assert.equal(verifyToken(token, "secret")?.uid, 1);
  assert.equal(verifyToken(token, "other-secret"), null);
  const [data, sig] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ uid: 1, role: "admin", name: "x", exp: 9e9 })).toString("base64url");
  assert.equal(verifyToken(`${forged}.${sig}`, "secret"), null);
  assert.ok(data.length > 0);
});
