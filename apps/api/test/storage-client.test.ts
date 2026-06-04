import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import type { ObjectStorageConfig } from "../src/config/storage.js";
import { createObjectStorageClient, type ObjectStorageSdkClient } from "../src/storage/client.js";

interface RecordedStorageCommand {
  name: string;
  input: Record<string, unknown>;
}

const STORAGE_CONFIG: ObjectStorageConfig = {
  accessKeyId: "test-access-key",
  secretAccessKey: "test-secret-key",
  bucket: "test-bucket",
  prefix: "tenant-prefix/",
  endpoint: "https://storage.example.test",
  region: "auto",
  forcePathStyle: true,
  publicBaseUrl: "https://cdn.example.test",
};

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }

  return Buffer.concat(chunks);
}

class RecordingS3Client implements ObjectStorageSdkClient {
  public readonly commands: RecordedStorageCommand[] = [];

  public constructor(private readonly getObjectBody = Buffer.from("stored-object")) {}

  public async send(command: unknown): Promise<unknown> {
    const name = command?.constructor.name ?? "UnknownCommand";
    const input = (command as { input?: Record<string, unknown> }).input;

    if (input === undefined) {
      throw new Error("Storage command did not include input");
    }

    this.commands.push({ name, input });

    if (name === "GetObjectCommand") {
      return {
        Body: Readable.from([this.getObjectBody]),
        ContentLength: this.getObjectBody.byteLength,
      };
    }

    return {};
  }
}

describe("ObjectStorageClient", () => {
  it("sends PutObjectCommand with bucket metadata and an isolated prefixed key", async () => {
    const sdkClient = new RecordingS3Client();
    const storage = createObjectStorageClient(STORAGE_CONFIG, sdkClient);
    const body = Buffer.from("image-bytes");

    await storage.putObject({
      relativeKey: "uploads/photo.png",
      body,
      contentLength: body.byteLength,
      contentType: "image/png",
    });

    expect(sdkClient.commands).toHaveLength(1);
    expect(sdkClient.commands[0]).toEqual({
      name: "PutObjectCommand",
      input: {
        Bucket: "test-bucket",
        Key: "tenant-prefix/uploads/photo.png",
        Body: body,
        ContentLength: body.byteLength,
        ContentType: "image/png",
      },
    });
  });

  it("sends GetObjectCommand with an isolated prefixed key and returns a readable body", async () => {
    const objectBody = Buffer.from("downloadable-image");
    const sdkClient = new RecordingS3Client(objectBody);
    const storage = createObjectStorageClient(STORAGE_CONFIG, sdkClient);

    const result = await storage.getObject("uploads/photo.png");

    expect(sdkClient.commands).toEqual([
      {
        name: "GetObjectCommand",
        input: {
          Bucket: "test-bucket",
          Key: "tenant-prefix/uploads/photo.png",
        },
      },
    ]);
    expect(result.contentLength).toBe(objectBody.byteLength);
    await expect(streamToBuffer(result.body)).resolves.toEqual(objectBody);
  });

  it("sends DeleteObjectCommand with an isolated prefixed key", async () => {
    const sdkClient = new RecordingS3Client();
    const storage = createObjectStorageClient(STORAGE_CONFIG, sdkClient);

    await storage.deleteObject("uploads/photo.png");

    expect(sdkClient.commands).toEqual([
      {
        name: "DeleteObjectCommand",
        input: {
          Bucket: "test-bucket",
          Key: "tenant-prefix/uploads/photo.png",
        },
      },
    ]);
  });

  it("rejects unsafe relative keys before sending storage commands", async () => {
    const sdkClient = new RecordingS3Client();
    const storage = createObjectStorageClient(STORAGE_CONFIG, sdkClient);
    const body = Buffer.from("image-bytes");

    await expect(
      storage.putObject({
        relativeKey: "/uploads/photo.png",
        body,
        contentLength: body.byteLength,
        contentType: "image/png",
      }),
    ).rejects.toThrow("Object storage key must be relative");

    await expect(storage.getObject("uploads/../photo.png")).rejects.toThrow(
      "Object storage key cannot contain parent directory segments",
    );
    await expect(storage.deleteObject(" ")).rejects.toThrow("Object storage key cannot be empty");
    expect(sdkClient.commands).toHaveLength(0);
  });
});
