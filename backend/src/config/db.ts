import pg from "pg";
import { env } from "./env.js";
export const source = env.DATABASE_URL
  ? new pg.Pool({
      connectionString: env.DATABASE_URL,
      ssl: env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : false,
      options: "-c default_transaction_read_only=on",
      statement_timeout: 10000,
    })
  : null;
export const auth = env.AUTH_DATABASE_URL
  ? new pg.Pool({
      connectionString: env.AUTH_DATABASE_URL,
      ssl:
        env.AUTH_DATABASE_SSL === "true" ? { rejectUnauthorized: true } : false,
      statement_timeout: 10000,
    })
  : null;
