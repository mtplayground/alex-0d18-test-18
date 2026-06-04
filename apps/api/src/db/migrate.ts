import { readdir, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import type { Pool, PoolClient } from "pg";
import { createDatabasePool } from "./pool.js";

const migrationsDirectory = new URL("./migrations/", import.meta.url);

async function ensureMigrationsTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function hasMigrationRun(client: PoolClient, migrationName: string): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE name = $1)",
    [migrationName],
  );

  return result.rows[0]?.exists ?? false;
}

async function recordMigration(client: PoolClient, migrationName: string): Promise<void> {
  await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [migrationName]);
}

export async function runMigrations(pool: Pool): Promise<void> {
  const migrationNames = (await readdir(migrationsDirectory))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  const client = await pool.connect();

  try {
    await ensureMigrationsTable(client);

    for (const migrationName of migrationNames) {
      if (await hasMigrationRun(client, migrationName)) {
        continue;
      }

      const migrationSql = await readFile(new URL(migrationName, migrationsDirectory), "utf8");

      try {
        await client.query("BEGIN");
        await client.query(migrationSql);
        await recordMigration(client, migrationName);
        await client.query("COMMIT");
        console.log(`Applied migration ${migrationName}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  const pool = createDatabasePool();

  try {
    await runMigrations(pool);
  } finally {
    await pool.end();
  }
}

const entrypoint = process.argv[1];

if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Migration failed";
    console.error(message);
    process.exitCode = 1;
  });
}
