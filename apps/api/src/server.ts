import { createApp } from "./app.js";
import { createDatabasePool, verifyDatabaseConnection } from "./db/pool.js";

const DEFAULT_PORT = 8080;
const HOST = process.env.HOST ?? "0.0.0.0";
const portValue = process.env.PORT ?? String(DEFAULT_PORT);
const PORT = Number.parseInt(portValue, 10);

if (!Number.isInteger(PORT) || PORT <= 0 || PORT > 65535) {
  throw new Error(`Invalid PORT value: ${portValue}`);
}

const database = createDatabasePool();
await verifyDatabaseConnection(database);

const app = createApp({ database });
const server = app.listen(PORT, HOST, () => {
  console.log(`API listening on http://${HOST}:${PORT}`);
});

async function shutdown(): Promise<void> {
  server.close((error) => {
    if (error !== undefined) {
      console.error(error);
      process.exitCode = 1;
    }
  });

  await database.end();
}

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});
