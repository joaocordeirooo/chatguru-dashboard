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
// Importações escrevem no banco de origem; nunca no pool de autenticação.
const writeUrl = env.SOURCE_WRITE_DATABASE_URL || env.DATABASE_URL;
export const warehouse =
  writeUrl && !env.DEMO_MODE
    ? new pg.Pool({
        connectionString: writeUrl,
        ssl: env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : false,
        statement_timeout: 60000,
        max: 3,
      })
    : null;
