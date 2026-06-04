import express from "express";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type { Pool } from "pg";
import { createApp } from "../../apps/api/src/app.js";
import type { ObjectStorageConfig } from "../../apps/api/src/config/storage.js";
import type { ImageDimensions, ImageRecord } from "../../apps/api/src/images/image-record.js";
import { createObjectStorageClient } from "../../apps/api/src/storage/client.js";

interface ImageRow {
  id: string;
  filename: string;
  storage_key: string;
  content_type: string;
  size: string;
  dimensions: ImageDimensions;
  uploaded_at: Date;
}

const HOST = "0.0.0.0";
const PORT = 8080;
const STORAGE_CONFIG: ObjectStorageConfig = {
  accessKeyId: "e2e-access-key",
  secretAccessKey: "e2e-secret-key",
  bucket: "e2e-bucket",
  prefix: "e2e-prefix/",
  endpoint: "http://127.0.0.1:8080",
  region: "auto",
  forcePathStyle: true,
  publicBaseUrl: "http://127.0.0.1:8080/__objects",
};

function toRow(record: ImageRecord): ImageRow {
  return {
    id: record.id,
    filename: record.filename,
    storage_key: record.storageKey,
    content_type: record.contentType,
    size: String(record.size),
    dimensions: record.dimensions,
    uploaded_at: record.uploadedAt,
  };
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }

  return Buffer.concat(chunks);
}

class E2eDatabase {
  private readonly rows: ImageRow[] = [];

  public async query(sql: string, params: unknown[] = []): Promise<{ rows: ImageRow[] }> {
    if (sql.includes("INSERT INTO images")) {
      const [filename, storageKey, contentType, size, dimensionsJson] = params;

      if (
        typeof filename !== "string" ||
        typeof storageKey !== "string" ||
        typeof contentType !== "string" ||
        typeof size !== "number" ||
        typeof dimensionsJson !== "string"
      ) {
        throw new Error("Unexpected image insert parameters");
      }

      const record: ImageRecord = {
        id: randomUUID(),
        filename,
        storageKey,
        contentType,
        size,
        dimensions: JSON.parse(dimensionsJson) as ImageDimensions,
        uploadedAt: new Date(),
      };
      const row = toRow(record);

      this.rows.unshift(row);

      return { rows: [row] };
    }

    if (sql.includes("WHERE id = ANY")) {
      const imageIds = params[0];

      if (!Array.isArray(imageIds)) {
        throw new Error("Expected image ID array");
      }

      return {
        rows: imageIds
          .map((imageId) => this.rows.find((row) => row.id === imageId))
          .filter((row): row is ImageRow => row !== undefined),
      };
    }

    const limit = params.at(-1);

    if (typeof limit !== "number") {
      throw new Error("Expected image list limit");
    }

    return {
      rows: this.rows.slice(0, limit),
    };
  }
}

class E2eS3Client {
  public constructor(private readonly objects: Map<string, Buffer>) {}

  public async send(command: unknown): Promise<unknown> {
    const name = command?.constructor.name ?? "UnknownCommand";
    const input = (command as { input?: Record<string, unknown> }).input;

    if (input === undefined) {
      throw new Error("Storage command did not include input");
    }

    if (name === "PutObjectCommand") {
      const key = input.Key;
      const body = input.Body;

      if (typeof key !== "string") {
        throw new Error("PutObjectCommand key must be a string");
      }

      if (body instanceof Readable) {
        this.objects.set(key, await streamToBuffer(body));
        return {};
      }

      if (Buffer.isBuffer(body)) {
        this.objects.set(key, body);
        return {};
      }

      if (body instanceof Uint8Array) {
        this.objects.set(key, Buffer.from(body));
        return {};
      }

      throw new Error("PutObjectCommand body must be a buffer or stream");
    }

    if (name === "GetObjectCommand") {
      const key = input.Key;

      if (typeof key !== "string") {
        throw new Error("GetObjectCommand key must be a string");
      }

      const object = this.objects.get(key);

      if (object === undefined) {
        throw new Error(`Missing object ${key}`);
      }

      return {
        Body: Readable.from(object),
      };
    }

    if (name === "DeleteObjectCommand") {
      const key = input.Key;

      if (typeof key === "string") {
        this.objects.delete(key);
      }

      return {};
    }

    throw new Error(`Unsupported storage command ${name}`);
  }
}

const objects = new Map<string, Buffer>();
const storage = createObjectStorageClient(STORAGE_CONFIG, new E2eS3Client(objects));
const app = express();

app.get("/__objects/*", (request, response) => {
  const key = request.params[0];

  if (key === undefined) {
    response.sendStatus(404);
    return;
  }

  const object = objects.get(key);

  if (object === undefined) {
    response.sendStatus(404);
    return;
  }

  response.type("png").send(object);
});

app.use(
  createApp({
    database: new E2eDatabase() as unknown as Pool,
    storage,
  }),
);

const server = app.listen(PORT, HOST, () => {
  console.log(`E2E API listening on http://${HOST}:${PORT}`);
});

function shutdown(): void {
  server.close((error) => {
    if (error !== undefined) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
