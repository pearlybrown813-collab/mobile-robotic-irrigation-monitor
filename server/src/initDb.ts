// server/src/initDb.ts
// Creates the tables, loads the starter data and creates the first accounts.
// Safe to run many times: existing rows are left alone.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as mysql from "mysql2/promise";
import { config } from "./config";
import { hashPassword, sha256 } from "./lib/security";

const here = path.dirname(fileURLToPath(import.meta.url));
const dbDir = path.resolve(here, "../../database");

/** Removes CREATE DATABASE / USE lines: we already connect to the right database. */
function loadSql(file: string): string {
  return fs
    .readFileSync(path.join(dbDir, file), "utf8")
    .split("\n")
    .filter((line) => !/^\s*(CREATE DATABASE|USE)\b/i.test(line))
    .join("\n");
}

async function connectWithRetry(attempts = 30): Promise<mysql.Connection> {
  for (let i = 1; i <= attempts; i++) {
    try {
      return await mysql.createConnection({ ...config.db, multipleStatements: true });
    } catch (err) {
      console.log(`Waiting for MySQL (${i}/${attempts}) ... ${(err as Error).message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error("Could not connect to MySQL. Is the database container running?");
}

async function main() {
  const conn = await connectWithRetry();
  await conn.query(loadSql("schema.sql"));
  await conn.query(loadSql("seed.sql"));

  const users: Array<[string, string, string, "admin" | "farmer"]> = [
    ["System Administrator", "admin", config.defaultAdminPassword, "admin"],
    ["Demo Farmer", "farmer", config.defaultFarmerPassword, "farmer"],
  ];
  for (const [name, username, password, role] of users) {
    await conn.query(
      "INSERT IGNORE INTO users (full_name, username, password_hash, role) VALUES (?, ?, ?, ?)",
      [name, username, hashPassword(password), role]
    );
  }
  await conn.query("INSERT IGNORE INTO devices (device_name, api_key_hash) VALUES (?, ?)", [
    "robot-01",
    sha256(config.defaultDeviceKey),
  ]);
  await conn.end();

  console.log("Database ready.");
  console.log("  Dashboard logins:  admin / " + config.defaultAdminPassword + "   farmer / " + config.defaultFarmerPassword);
  console.log("  Robot device key: " + config.defaultDeviceKey);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
