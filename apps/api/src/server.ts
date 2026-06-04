import { createApp } from "./app.js";
import { createDatabasePool, verifyDatabaseConnection } from "./db/pool.js";
import { createObjectStorageClient } from "./storage/client.js";
import { fileURLToPath } from "node:url";

const DEFAULT_PORT = 8080;
const HOST = process.env.HOST ?? "0.0.0.0";
const portValue = process.env.PORT ?? String(DEFAULT_PORT);
const PORT = Number.parseInt(portValue, 10);
const staticAssetsPath =
  process.env.WEB_DIST_DIR?.trim() === "" || process.env.WEB_DIST_DIR === undefined
    ? fileURLToPath(new URL("../../web/dist", import.meta.url))
    : process.env.WEB_DIST_DIR;

if (!Number.isInteger(PORT) || PORT <= 0 || PORT > 65535) {
  throw new Error(`Invalid PORT value: ${portValue}`);
}

const database = createDatabasePool();
await verifyDatabaseConnection(database);
const storage = createObjectStorageClient();

const app = createApp({ database, staticAssetsPath, storage });
const server = app.listen(PORT, HOST, () => {
  console.log(`API and web app listening on http://${HOST}:${PORT}`);
  console.log(`Serving web assets from ${staticAssetsPath}`);
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
