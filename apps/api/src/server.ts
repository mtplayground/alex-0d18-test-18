import { createApp } from "./app.js";

const DEFAULT_PORT = 8080;
const HOST = process.env.HOST ?? "0.0.0.0";
const portValue = process.env.PORT ?? String(DEFAULT_PORT);
const PORT = Number.parseInt(portValue, 10);

if (!Number.isInteger(PORT) || PORT <= 0 || PORT > 65535) {
  throw new Error(`Invalid PORT value: ${portValue}`);
}

const app = createApp();

app.listen(PORT, HOST, () => {
  console.log(`API listening on http://${HOST}:${PORT}`);
});
