import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import { config } from "./config.js";
import { retryWithBackoff } from "./startup.js";

const { Pool } = pg;

function secureConnectionString(connectionString: string) {
  const url = new URL(connectionString);
  // Neon transaction pooling rejects a search_path startup option. Isolated
  // test schemas use the direct endpoint; production keeps the pooled endpoint.
  if (
    config.DATABASE_SCHEMA !== "public" &&
    url.hostname.endsWith(".neon.tech")
  ) {
    url.hostname = url.hostname.replace("-pooler.", ".");
  }
  const sslMode = url.searchParams.get("sslmode");
  if (sslMode && ["prefer", "require", "verify-ca"].includes(sslMode)) {
    url.searchParams.set("sslmode", "verify-full");
  }
  return url.toString();
}

export const pool = new Pool({
  connectionString: secureConnectionString(config.DATABASE_URL),
  options: `-c timezone=${config.APP_TIMEZONE}${config.DATABASE_SCHEMA === "public" ? "" : " -c search_path=" + config.DATABASE_SCHEMA}`,
  max: 12,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on("error", (error) =>
  console.error("Unexpected PostgreSQL pool error", error),
);

export async function initializeDatabase() {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const schemaPath = path.resolve(currentDir, "../sql/schema.sql");
  const schema =
    (await readFile(schemaPath, "utf8")) +
    "\n" +
    (await readFile(path.resolve(currentDir, "../sql/operations.sql"), "utf8"));
  await retryWithBackoff(
    async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(7711024)");
        await client.query(schema);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    {
      attempts: 6,
      initialDelayMs: 1_000,
      maxDelayMs: 15_000,
      onRetry: (error, attempt, delayMs) => {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          `Database initialization attempt ${attempt} failed (${message}); retrying in ${delayMs}ms`,
        );
      },
    },
  );
}
