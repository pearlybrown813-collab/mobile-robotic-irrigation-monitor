// server/src/db.ts
// One connection pool, reused by every request (Section 4.3).
import * as mysql from "mysql2/promise";
import { config } from "./config";

export const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true, // return DECIMAL columns as numbers, not strings
  timezone: "Z",        // store and read timestamps as UTC
});
