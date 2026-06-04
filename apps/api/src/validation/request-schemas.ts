import type { RequestHandler } from "express";
import type { IncomingHttpHeaders } from "node:http";
import { RequestValidationError, UnsupportedMediaTypeError } from "../errors/http-error.js";
import { decodeImageListCursor, type ImageListCursor } from "../images/pagination.js";
import { MAX_UPLOAD_FILES } from "../images/upload-constants.js";

const DEFAULT_LIST_LIMIT = 30;
const MAX_LIST_LIMIT = 100;
const MAX_ZIP_IMAGES = 100;
const ROUTE_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERSIONED_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface ImageContentRequestSource {
  params: Parameters<RequestHandler>[0]["params"];
  path: string;
}

interface ImageListQueryInput {
  cursor?: unknown;
  limit?: unknown;
}

export interface ImageListQuery {
  cursor?: ImageListCursor;
  limit: number;
}

function readImageIdFromRequest(request: ImageContentRequestSource): string | undefined {
  const imageId = request.params.imageId;

  if (typeof imageId === "string") {
    return imageId.split("/")[0];
  }

  return /^\/([^/]+)(?:\/content)?$/.exec(request.path)?.[1];
}

function readQueryString(value: unknown, name: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && value.length === 1 && typeof value[0] === "string") {
    return value[0];
  }

  throw new RequestValidationError("invalid_query", `${name} must be a single string value`);
}

function parseLimit(value: unknown): number {
  const rawLimit = readQueryString(value, "limit");

  if (rawLimit === undefined) {
    return DEFAULT_LIST_LIMIT;
  }

  const limit = Number.parseInt(rawLimit, 10);

  if (
    !Number.isInteger(limit) ||
    String(limit) !== rawLimit ||
    limit < 1 ||
    limit > MAX_LIST_LIMIT
  ) {
    throw new RequestValidationError(
      "invalid_limit",
      `limit must be an integer from 1 to ${MAX_LIST_LIMIT}`,
    );
  }

  return limit;
}

export function parseImageContentRequest(request: ImageContentRequestSource): string {
  const imageId = readImageIdFromRequest(request);

  if (typeof imageId !== "string" || !ROUTE_UUID_PATTERN.test(imageId)) {
    throw new RequestValidationError("invalid_image_id", "Image ID must be a UUID");
  }

  return imageId;
}

export function parseImageListQuery(query: ImageListQueryInput): ImageListQuery {
  const cursorValue = readQueryString(query.cursor, "cursor");

  return {
    limit: parseLimit(query.limit),
    cursor: cursorValue === undefined ? undefined : decodeImageListCursor(cursorValue),
  };
}

export function validateUploadHeaders(headers: IncomingHttpHeaders): void {
  const contentType = headers["content-type"];

  if (typeof contentType !== "string" || !contentType.includes("multipart/form-data")) {
    throw new UnsupportedMediaTypeError(
      "unsupported_media_type",
      "Upload requests must be multipart/form-data",
    );
  }
}

export function validateUploadFileCount(fileCount: number): void {
  if (fileCount === 0) {
    throw new RequestValidationError("no_files", "Upload request did not include any files");
  }
}

export function tooManyUploadFilesFailure() {
  return {
    filename: "",
    error: {
      code: "too_many_files",
      message: `Upload requests can include at most ${MAX_UPLOAD_FILES} files`,
    },
  };
}

export function parseZipImageIds(body: unknown): string[] {
  if (body === null || typeof body !== "object" || !("imageIds" in body)) {
    throw new RequestValidationError("invalid_request", "Request body must include imageIds");
  }

  const imageIds = body.imageIds;

  if (!Array.isArray(imageIds) || imageIds.length === 0) {
    throw new RequestValidationError("invalid_image_ids", "imageIds must be a non-empty array");
  }

  if (imageIds.length > MAX_ZIP_IMAGES) {
    throw new RequestValidationError(
      "too_many_images",
      `Zip downloads can include at most ${MAX_ZIP_IMAGES} images`,
    );
  }

  const uniqueImageIds: string[] = [];
  const seenImageIds = new Set<string>();

  for (const imageId of imageIds) {
    if (typeof imageId !== "string" || !VERSIONED_UUID_PATTERN.test(imageId)) {
      throw new RequestValidationError("invalid_image_id", "Each image ID must be a UUID");
    }

    if (!seenImageIds.has(imageId)) {
      seenImageIds.add(imageId);
      uniqueImageIds.push(imageId);
    }
  }

  return uniqueImageIds;
}
