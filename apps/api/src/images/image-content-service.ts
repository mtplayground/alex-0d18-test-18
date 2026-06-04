import type { Readable } from "node:stream";
import type { Pool } from "pg";
import { HttpError } from "../errors/http-error.js";
import type { ObjectStorageClient } from "../storage/client.js";
import { findImageRecordsByIds } from "./image-repository.js";

export interface ImageContentDependencies {
  database: Pool;
  storage: ObjectStorageClient;
}

export interface ImageContentResult {
  contentType: string;
  contentLength?: number;
  stream: Readable;
}

export async function getImageContent(
  dependencies: ImageContentDependencies,
  imageId: string,
): Promise<ImageContentResult> {
  const [record] = await findImageRecordsByIds(dependencies.database, [imageId]);

  if (record === undefined) {
    throw new HttpError(404, "image_not_found", "Image could not be found");
  }

  const object = await dependencies.storage.getObject(record.storageKey);

  return {
    contentType: record.contentType,
    contentLength: object.contentLength,
    stream: object.body,
  };
}
