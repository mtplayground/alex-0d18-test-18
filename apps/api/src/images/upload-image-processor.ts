import { type Readable } from "node:stream";
import type { Pool } from "pg";
import sharp from "sharp";
import { UploadStorageError, UploadValidationError } from "../errors/http-error.js";
import type { ObjectStorageClient } from "../storage/client.js";
import { createImageRecord } from "./image-repository.js";
import { ALLOWED_IMAGE_CONTENT_TYPES } from "./upload-constants.js";
import { buildRelativeStorageKey, sanitizeFilename } from "./upload-filenames.js";
import { drainStream, readUploadStream, type StreamedFile } from "./upload-stream.js";
import {
  toImageContentUrl,
  toUploadedImageResponse,
  type UploadedImageResponse,
} from "./upload-response.js";

export interface UploadDependencies {
  database: Pool;
  storage: ObjectStorageClient;
}

export interface FileInfo {
  filename: string;
  mimeType: string;
}

async function putFileToObjectStorage(
  file: StreamedFile,
  storage: ObjectStorageClient,
  relativeKey: string,
  contentType: string,
): Promise<void> {
  try {
    await storage.putObject({
      relativeKey,
      body: file.buffer,
      contentLength: file.size,
      contentType,
    });
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
  relativeKey: string,
  contentType: string,
): Promise<StreamedFile> {
  const streamedFile = await readUploadStream(stream);
  await putFileToObjectStorage(streamedFile, storage, relativeKey, contentType);

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

async function deleteUploadedObject(
  storage: ObjectStorageClient,
  relativeKey: string,
): Promise<void> {
  await storage.deleteObject(relativeKey);
}

export async function processImageFile(
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
  let uploadedObject = false;

  try {
    const streamedFile = await streamFileToObjectStorage(
      stream,
      dependencies.storage,
      relativeKey,
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
        await deleteUploadedObject(dependencies.storage, relativeKey);
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
