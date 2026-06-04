import { Pool, type PoolConfig } from "pg";
import { readDatabaseConfig } from "../config/database.js";

const DEFAULT_POOL_SIZE = 10;

export function createDatabasePool(config = readDatabaseConfig()): Pool {
  const poolConfig: PoolConfig = {
    connectionString: config.connectionString,
    max: DEFAULT_POOL_SIZE,
    ssl: {
      rejectUnauthorized: false,
    },
  };

  return new Pool(poolConfig);
}

export async function verifyDatabaseConnection(pool: Pool): Promise<void> {
  await pool.query("SELECT 1");
}
