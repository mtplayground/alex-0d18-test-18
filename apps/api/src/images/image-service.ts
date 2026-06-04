import type { IncomingHttpHeaders } from "node:http";
import type { Readable } from "node:stream";
import type { Pool } from "pg";
import { HttpError } from "../errors/http-error.js";
import type { ObjectStorageClient } from "../storage/client.js";
import { findImageRecordsByIds, listImageRecords } from "./image-repository.js";
import type { ImageListCursor } from "./pagination.js";
import { encodeImageListCursor } from "./pagination.js";
import { toListImageResponse, type ListImagesResponse } from "./list-response.js";
import { handleUploadRequest } from "./upload-service.js";
import { toImageContentUrl, type UploadImagesResponse } from "./upload-response.js";

export interface ImageServiceDependencies {
  database: Pool;
  storage: ObjectStorageClient;
}

export interface ListGalleryImagesInput {
  limit: number;
  cursor?: ImageListCursor;
}

export interface ImageContentResult {
  contentType: string;
  contentLength?: number;
  stream: Readable;
}

export async function getImageContent(
  dependencies: ImageServiceDependencies,
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

export async function listGalleryImages(
  dependencies: ImageServiceDependencies,
  input: ListGalleryImagesInput,
): Promise<ListImagesResponse> {
  const records = await listImageRecords(dependencies.database, {
    limit: input.limit + 1,
    cursor: input.cursor,
  });
  const visibleRecords = records.slice(0, input.limit);
  const hasMore = records.length > input.limit;
  const lastVisibleRecord = visibleRecords.at(-1);
  const nextCursor =
    hasMore && lastVisibleRecord !== undefined ? encodeImageListCursor(lastVisibleRecord) : null;

  return {
    images: visibleRecords.map((record) =>
      toListImageResponse(record, toImageContentUrl(record.id)),
    ),
    page: {
      limit: input.limit,
      nextCursor,
      hasMore,
    },
  };
}

export async function uploadImages(
  dependencies: ImageServiceDependencies,
  headers: IncomingHttpHeaders,
  request: Readable,
): Promise<UploadImagesResponse> {
  return await handleUploadRequest(headers, request, dependencies);
}
