import { readRequiredEnv } from "./env.js";

export interface DatabaseConfig {
  connectionString: string;
}

export function readDatabaseConfig(): DatabaseConfig {
  return {
    connectionString: readRequiredEnv("DATABASE_URL"),
  };
}
