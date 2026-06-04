import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import Busboy from "busboy";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { type Readable } from "node:stream";
import type { IncomingHttpHeaders } from "node:http";
import type { Pool } from "pg";
import sharp from "sharp";
import { HttpError } from "../errors/http-error.js";
import type { ObjectStorageClient } from "../storage/client.js";
import { toObjectStorageKey } from "../storage/keys.js";
import { createImageRecord } from "./image-repository.js";
import {
  ALLOWED_IMAGE_CONTENT_TYPES,
  MAX_IMAGE_SIZE_BYTES,
  MAX_UPLOAD_FILES,
  UPLOAD_FIELD_NAMES,
} from "./upload-constants.js";
import {
  toImageContentUrl,
  toUploadedImageResponse,
  type FailedImageUploadResponse,
  type UploadImagesResponse,
  type UploadedImageResponse,
} from "./upload-response.js";

interface UploadDependencies {
  database: Pool;
  storage: ObjectStorageClient;
}

interface FileInfo {
  filename: string;
  mimeType: string;
}

interface StreamedFile {
  buffer: Buffer;
  size: number;
}

class UploadValidationError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

class UploadStorageError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function failedUpload(filename: string, code: string, message: string): FailedImageUploadResponse {
  return {
    filename,
    error: {
      code,
      message,
    },
  };
}

function sanitizeFilename(filename: string): string {
  const basename = [...path.basename(filename)]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join("")
    .trim();

  if (basename === "" || basename === "." || basename === "..") {
    return "image";
  }

  return basename.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
}

function buildRelativeStorageKey(filename: string): string {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");

  return `uploads/${year}/${month}/${day}/${randomUUID()}-${sanitizeFilename(filename)}`;
}

async function drainStream(stream: Readable): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    stream.once("error", reject);
    stream.once("end", resolve);
    stream.resume();
  });
}

async function readUploadStream(stream: Readable): Promise<StreamedFile> {
  const chunks: Buffer[] = [];
  let size = 0;
  let sizeExceeded = false;

  return await new Promise<StreamedFile>((resolve, reject) => {
    stream.on("limit", () => {
      sizeExceeded = true;
      reject(
        new UploadValidationError(
          "file_too_large",
          `Images must be ${MAX_IMAGE_SIZE_BYTES} bytes or smaller`,
        ),
      );
    });

    stream.on("data", (chunk: Buffer) => {
      size += chunk.length;

      if (size > MAX_IMAGE_SIZE_BYTES) {
        sizeExceeded = true;
        reject(
          new UploadValidationError(
            "file_too_large",
            `Images must be ${MAX_IMAGE_SIZE_BYTES} bytes or smaller`,
          ),
        );
        return;
      }

      chunks.push(chunk);
    });

    stream.once("error", reject);

    stream.once("end", () => {
      if (sizeExceeded) {
        reject(
          new UploadValidationError(
            "file_too_large",
            `Images must be ${MAX_IMAGE_SIZE_BYTES} bytes or smaller`,
          ),
        );
        return;
      }

      resolve({
        buffer: Buffer.concat(chunks, size),
        size,
      });
    });
  });
}

async function putFileToObjectStorage(
  file: StreamedFile,
  storage: ObjectStorageClient,
  fullKey: string,
  contentType: string,
): Promise<void> {
  try {
    await storage.s3.send(
      new PutObjectCommand({
        Bucket: storage.config.bucket,
        Key: fullKey,
        Body: file.buffer,
        ContentLength: file.size,
        ContentType: contentType,
      }),
    );
  } catch {
    throw new UploadStorageError(
      "storage_upload_failed",
      "Image could not be saved to object storage. Try again.",
    );
  }
}

async function streamFileToObjectStorage(
  stream: Readable,
  storage: ObjectStorageClient,
  fullKey: string,
  contentType: string,
): Promise<StreamedFile> {
  const streamedFile = await readUploadStream(stream);
  await putFileToObjectStorage(streamedFile, storage, fullKey, contentType);

  return streamedFile;
}

async function readImageDimensions(buffer: Buffer): Promise<{ width: number; height: number }> {
  const metadata = await sharp(buffer, { failOn: "error" }).metadata();

  if (metadata.width === undefined || metadata.height === undefined) {
    throw new UploadValidationError("invalid_image", "Image dimensions could not be read");
  }

  return {
    width: metadata.width,
    height: metadata.height,
  };
}

async function deleteUploadedObject(storage: ObjectStorageClient, fullKey: string): Promise<void> {
  await storage.s3.send(
    new DeleteObjectCommand({
      Bucket: storage.config.bucket,
      Key: fullKey,
    }),
  );
}

async function processImageFile(
  stream: Readable,
  fileInfo: FileInfo,
  dependencies: UploadDependencies,
): Promise<UploadedImageResponse> {
  if (!ALLOWED_IMAGE_CONTENT_TYPES.has(fileInfo.mimeType)) {
    await drainStream(stream);
    throw new UploadValidationError(
      "unsupported_content_type",
      "Only JPEG, PNG, WebP, and GIF images are supported",
    );
  }

  const filename = sanitizeFilename(fileInfo.filename);
  const relativeKey = buildRelativeStorageKey(filename);
  const fullKey = toObjectStorageKey(dependencies.storage.config, relativeKey);
  let uploadedObject = false;

  try {
    const streamedFile = await streamFileToObjectStorage(
      stream,
      dependencies.storage,
      fullKey,
      fileInfo.mimeType,
    );
    uploadedObject = true;

    if (streamedFile.size === 0) {
      throw new UploadValidationError("empty_file", "Images cannot be empty");
    }

    const dimensions = await readImageDimensions(streamedFile.buffer);
    const record = await createImageRecord(dependencies.database, {
      filename,
      storageKey: relativeKey,
      contentType: fileInfo.mimeType,
      size: streamedFile.size,
      dimensions,
    });

    return toUploadedImageResponse(record, toImageContentUrl(record.id));
  } catch (error) {
    if (uploadedObject) {
      try {
        await deleteUploadedObject(dependencies.storage, fullKey);
      } catch {
        throw new UploadStorageError(
          "storage_cleanup_failed",
          "Image upload could not be completed because object storage cleanup failed. Try again.",
        );
      }
    }

    throw error;
  }
}

function mapUploadError(filename: string, error: unknown): FailedImageUploadResponse {
  if (error instanceof UploadValidationError) {
    return failedUpload(filename, error.code, error.message);
  }

  if (error instanceof UploadStorageError) {
    return failedUpload(filename, error.code, error.message);
  }

  return failedUpload(filename, "upload_failed", "Image upload failed");
}

export async function handleUploadRequest(
  headers: IncomingHttpHeaders,
  request: Readable,
  dependencies: UploadDependencies,
): Promise<UploadImagesResponse> {
  const contentType = headers["content-type"];

  if (typeof contentType !== "string" || !contentType.includes("multipart/form-data")) {
    throw new HttpError(
      415,
      "unsupported_media_type",
      "Upload requests must be multipart/form-data",
    );
  }

  const uploaded: UploadedImageResponse[] = [];
  const failed: FailedImageUploadResponse[] = [];

  await new Promise<void>((resolve, reject) => {
    const parser = Busboy({
      headers,
      limits: {
        files: MAX_UPLOAD_FILES,
        fileSize: MAX_IMAGE_SIZE_BYTES + 1,
      },
    });
    const fileTasks: Promise<void>[] = [];
    let fileCount = 0;

    parser.on("file", (fieldName, stream, info) => {
      fileCount += 1;
      const filename = sanitizeFilename(info.filename);

      if (!UPLOAD_FIELD_NAMES.has(fieldName)) {
        const task = drainStream(stream)
          .then(() => {
            failed.push(failedUpload(filename, "invalid_field", "Files must use the files field"));
          })
          .catch(reject);
        fileTasks.push(task);
        return;
      }

      const task = processImageFile(
        stream,
        {
          filename,
          mimeType: info.mimeType,
        },
        dependencies,
      )
        .then((result) => {
          uploaded.push(result);
        })
        .catch((error: unknown) => {
          failed.push(mapUploadError(filename, error));
        });
      fileTasks.push(task);
    });

    parser.once("filesLimit", () => {
      failed.push(
        failedUpload(
          "",
          "too_many_files",
          `Upload requests can include at most ${MAX_UPLOAD_FILES} files`,
        ),
      );
    });

    parser.once("error", reject);

    parser.once("finish", () => {
      Promise.all(fileTasks)
        .then(() => {
          if (fileCount === 0) {
            reject(new HttpError(400, "no_files", "Upload request did not include any files"));
            return;
          }

          resolve();
        })
        .catch(reject);
    });

    request.pipe(parser);
  });

  return {
    uploaded,
    failed,
  };
}
