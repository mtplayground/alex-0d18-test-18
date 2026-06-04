import { Readable } from "node:stream";
import JSZip from "jszip";
import type { Pool } from "pg";
import sharp from "sharp";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { ObjectStorageConfig } from "../src/config/storage.js";
import type { ImageDimensions, ImageRecord } from "../src/images/image-record.js";
import { createObjectStorageClient } from "../src/storage/client.js";

interface TestImageRow {
  id: string;
  filename: string;
  storage_key: string;
  content_type: string;
  size: string;
  dimensions: ImageDimensions;
  uploaded_at: Date;
}

interface InsertedImageMetadata {
  filename: string;
  storageKey: string;
  contentType: string;
  size: number;
  dimensions: ImageDimensions;
}

interface RecordedStorageCommand {
  name: string;
  input: Record<string, unknown>;
}

interface FakeS3Options {
  failPutObject?: boolean;
  failGetObject?: boolean;
}

const STORAGE_CONFIG: ObjectStorageConfig = {
  accessKeyId: "test-access-key",
  secretAccessKey: "test-secret-key",
  bucket: "test-bucket",
  prefix: "test-prefix/",
  endpoint: "https://storage.example.test",
  region: "auto",
  forcePathStyle: true,
  publicBaseUrl: "https://cdn.example.test",
};

const FIRST_IMAGE_ID = "00000000-0000-4000-8000-000000000001";
const SECOND_IMAGE_ID = "00000000-0000-4000-8000-000000000002";
const THIRD_IMAGE_ID = "00000000-0000-4000-8000-000000000003";

function toRow(record: ImageRecord): TestImageRow {
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

function makeRecord(input: Partial<ImageRecord> & Pick<ImageRecord, "id">): ImageRecord {
  return {
    id: input.id,
    filename: input.filename ?? "photo.png",
    storageKey: input.storageKey ?? `uploads/${input.id}.png`,
    contentType: input.contentType ?? "image/png",
    size: input.size ?? 12,
    dimensions: input.dimensions ?? { width: 2, height: 3 },
    uploadedAt: input.uploadedAt ?? new Date("2026-06-04T00:00:00.000Z"),
  };
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }

  return Buffer.concat(chunks);
}

class FakeDatabase {
  public readonly insertedMetadata: InsertedImageMetadata[] = [];

  private readonly rows: TestImageRow[];

  public constructor(records: ImageRecord[] = []) {
    this.rows = records.map(toRow);
  }

  public async query(_sql: string, params: unknown[] = []): Promise<{ rows: TestImageRow[] }> {
    if (_sql.includes("INSERT INTO images")) {
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

      const dimensions = JSON.parse(dimensionsJson) as ImageDimensions;

      this.insertedMetadata.push({
        filename,
        storageKey,
        contentType,
        size,
        dimensions,
      });

      const row: TestImageRow = {
        id: FIRST_IMAGE_ID,
        filename,
        storage_key: storageKey,
        content_type: contentType,
        size: String(size),
        dimensions,
        uploaded_at: new Date("2026-06-04T01:00:00.000Z"),
      };

      this.rows.unshift(row);

      return { rows: [row] };
    }

    if (_sql.includes("WHERE id = ANY")) {
      const imageIds = params[0];

      if (!Array.isArray(imageIds)) {
        throw new Error("Expected image ID array");
      }

      return {
        rows: imageIds
          .map((imageId) => this.rows.find((row) => row.id === imageId))
          .filter((row): row is TestImageRow => row !== undefined),
      };
    }

    const limit = params[0];

    if (typeof limit !== "number") {
      throw new Error("Expected image list limit");
    }

    return {
      rows: this.rows.slice(0, limit),
    };
  }
}

class FakeS3Client {
  public readonly commands: RecordedStorageCommand[] = [];

  public constructor(
    private readonly objects = new Map<string, Buffer>(),
    private readonly options: FakeS3Options = {},
  ) {}

  public async send(command: unknown): Promise<unknown> {
    const name = command?.constructor.name ?? "UnknownCommand";
    const input = (command as { input?: Record<string, unknown> }).input;

    if (input === undefined) {
      throw new Error("Storage command did not include input");
    }

    this.commands.push({
      name,
      input,
    });

    if (name === "PutObjectCommand") {
      if (this.options.failPutObject === true) {
        throw new Error("object storage put failed");
      }

      if (input.Body instanceof Readable) {
        await streamToBuffer(input.Body);
      }

      return {};
    }

    if (name === "DeleteObjectCommand") {
      return {};
    }

    if (name === "GetObjectCommand") {
      if (this.options.failGetObject === true) {
        throw new Error("object storage get failed");
      }

      const key = input.Key;

      if (typeof key !== "string") {
        throw new Error("GetObjectCommand key must be a string");
      }

      const object = this.objects.get(key);

      if (object === undefined) {
        throw new Error(`Missing fake object for ${key}`);
      }

      return {
        Body: Readable.from(object),
      };
    }

    throw new Error(`Unsupported storage command ${name}`);
  }
}

function createTestDependencies(
  records: ImageRecord[] = [],
  objects = new Map<string, Buffer>(),
  s3Options: FakeS3Options = {},
) {
  const database = new FakeDatabase(records);
  const s3 = new FakeS3Client(objects, s3Options);
  const storage = createObjectStorageClient(STORAGE_CONFIG, s3);

  return {
    app: createApp({
      database: database as unknown as Pool,
      storage,
    }),
    database,
    s3,
  };
}

async function createPngBuffer(): Promise<Buffer> {
  return await sharp({
    create: {
      width: 2,
      height: 3,
      channels: 3,
      background: "#0ea5e9",
    },
  })
    .png()
    .toBuffer();
}

function parseBinaryResponse(
  response: NodeJS.ReadableStream,
  callback: (error: Error | null, body: Buffer) => void,
): void {
  const chunks: Buffer[] = [];

  response.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
  });
  response.once("error", callback);
  response.once("end", () => {
    callback(null, Buffer.concat(chunks));
  });
}

describe("image API routes", () => {
  it("rejects unsupported upload content types without writing metadata or storage", async () => {
    const { app, database, s3 } = createTestDependencies();

    const response = await request(app)
      .post("/api/images")
      .attach("files", Buffer.from("plain text"), {
        filename: "notes.txt",
        contentType: "text/plain",
      })
      .expect(400);

    expect(response.body).toMatchObject({
      uploaded: [],
      failed: [
        {
          filename: "notes.txt",
          error: {
            code: "unsupported_content_type",
          },
        },
      ],
    });
    expect(database.insertedMetadata).toHaveLength(0);
    expect(s3.commands).toHaveLength(0);
  });

  it("uploads valid images, persists metadata, and uses prefixed object keys", async () => {
    const { app, database, s3 } = createTestDependencies();
    const imageBuffer = await createPngBuffer();

    const response = await request(app)
      .post("/api/images")
      .attach("files", imageBuffer, {
        filename: "my photo.png",
        contentType: "image/png",
      })
      .expect(201);

    expect(database.insertedMetadata).toHaveLength(1);

    const [metadata] = database.insertedMetadata;

    expect(metadata).toMatchObject({
      filename: "my_photo.png",
      contentType: "image/png",
      size: imageBuffer.length,
      dimensions: {
        width: 2,
        height: 3,
      },
    });
    expect(metadata.storageKey).toMatch(/^uploads\/\d{4}\/\d{2}\/\d{2}\/.+-my_photo\.png$/);

    const putCommand = s3.commands.find((command) => command.name === "PutObjectCommand");

    expect(putCommand?.input).toMatchObject({
      Bucket: STORAGE_CONFIG.bucket,
      Key: `${STORAGE_CONFIG.prefix}${metadata.storageKey}`,
      ContentType: "image/png",
    });
    expect(response.body.uploaded[0]).toMatchObject({
      id: FIRST_IMAGE_ID,
      filename: "my_photo.png",
      storageKey: metadata.storageKey,
      dimensions: {
        width: 2,
        height: 3,
      },
      url: `/api/images/${FIRST_IMAGE_ID}/content`,
    });
    expect(response.body.failed).toEqual([]);
  });

  it("returns clear failed-file feedback when object storage upload fails", async () => {
    const { app, database, s3 } = createTestDependencies([], new Map(), {
      failPutObject: true,
    });
    const imageBuffer = await createPngBuffer();

    const response = await request(app)
      .post("/api/images")
      .attach("files", imageBuffer, {
        filename: "storage-failure.png",
        contentType: "image/png",
      })
      .expect(400);

    expect(response.body).toMatchObject({
      uploaded: [],
      failed: [
        {
          filename: "storage-failure.png",
          error: {
            code: "storage_upload_failed",
            message: "Image could not be saved to object storage. Try again.",
          },
        },
      ],
    });
    expect(database.insertedMetadata).toHaveLength(0);
    expect(s3.commands[0]?.input.Key).toMatch(/^test-prefix\/uploads\//);
  });

  it("lists image metadata with public URLs and pagination", async () => {
    const records = [
      makeRecord({
        id: FIRST_IMAGE_ID,
        filename: "first.png",
        storageKey: "uploads/first.png",
        uploadedAt: new Date("2026-06-04T03:00:00.000Z"),
      }),
      makeRecord({
        id: SECOND_IMAGE_ID,
        filename: "second.png",
        storageKey: "uploads/second.png",
        uploadedAt: new Date("2026-06-04T02:00:00.000Z"),
      }),
      makeRecord({
        id: THIRD_IMAGE_ID,
        filename: "third.png",
        storageKey: "uploads/third.png",
        uploadedAt: new Date("2026-06-04T01:00:00.000Z"),
      }),
    ];
    const { app } = createTestDependencies(records);

    const response = await request(app).get("/api/images?limit=2").expect(200);

    expect(response.body.images).toHaveLength(2);
    expect(response.body.images[0]).toMatchObject({
      id: FIRST_IMAGE_ID,
      filename: "first.png",
      url: `/api/images/${FIRST_IMAGE_ID}/content`,
    });
    expect(response.body.images[1]).toMatchObject({
      id: SECOND_IMAGE_ID,
      filename: "second.png",
      url: `/api/images/${SECOND_IMAGE_ID}/content`,
    });
    expect(response.body.page).toMatchObject({
      limit: 2,
      hasMore: true,
    });
    expect(response.body.page.nextCursor).toEqual(expect.any(String));
  });

  it("rejects zip download requests without image IDs", async () => {
    const { app } = createTestDependencies();

    const response = await request(app)
      .post("/api/downloads/zip")
      .send({ imageIds: [] })
      .expect(400);

    expect(response.body).toMatchObject({
      error: {
        code: "invalid_image_ids",
      },
    });
  });

  it("returns a clear JSON error when selected zip objects cannot be read", async () => {
    const records = [
      makeRecord({
        id: FIRST_IMAGE_ID,
        filename: "missing.png",
        storageKey: "uploads/missing.png",
      }),
    ];
    const { app, s3 } = createTestDependencies(records, new Map(), {
      failGetObject: true,
    });

    const response = await request(app)
      .post("/api/downloads/zip")
      .send({ imageIds: [FIRST_IMAGE_ID] })
      .expect(502);

    expect(response.body).toMatchObject({
      error: {
        code: "storage_unavailable",
        message: "One or more selected images could not be read from object storage",
      },
    });
    expect(response.headers["content-type"]).toContain("application/json");
    expect(s3.commands[0]?.input).toMatchObject({
      Bucket: STORAGE_CONFIG.bucket,
      Key: `${STORAGE_CONFIG.prefix}uploads/missing.png`,
    });
  });

  it("bundles selected object storage files into a zip response", async () => {
    const records = [
      makeRecord({
        id: FIRST_IMAGE_ID,
        filename: "photo.png",
        storageKey: "uploads/photo-a.png",
      }),
      makeRecord({
        id: SECOND_IMAGE_ID,
        filename: "photo.png",
        storageKey: "uploads/photo-b.png",
      }),
    ];
    const objects = new Map<string, Buffer>([
      [`${STORAGE_CONFIG.prefix}uploads/photo-a.png`, Buffer.from("first image")],
      [`${STORAGE_CONFIG.prefix}uploads/photo-b.png`, Buffer.from("second image")],
    ]);
    const { app, s3 } = createTestDependencies(records, objects);

    const response = await request(app)
      .post("/api/downloads/zip")
      .send({ imageIds: [SECOND_IMAGE_ID, FIRST_IMAGE_ID] })
      .buffer(true)
      .parse(parseBinaryResponse)
      .expect(200)
      .expect("content-type", "application/zip")
      .expect("content-disposition", /attachment; filename="images-\d{4}-\d{2}-\d{2}\.zip"/);
    const archive = await JSZip.loadAsync(response.body as Buffer);

    await expect(archive.file("photo.png")?.async("string")).resolves.toBe("second image");
    await expect(archive.file("photo-2.png")?.async("string")).resolves.toBe("first image");
    expect(
      s3.commands
        .filter((command) => command.name === "GetObjectCommand")
        .map((command) => command.input.Key),
    ).toEqual([
      `${STORAGE_CONFIG.prefix}uploads/photo-b.png`,
      `${STORAGE_CONFIG.prefix}uploads/photo-a.png`,
    ]);
  });
});
