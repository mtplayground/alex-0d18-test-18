import { GetObjectCommand, type GetObjectCommandOutput } from "@aws-sdk/client-s3";
import { Router, type RequestHandler } from "express";
import { Readable } from "node:stream";
import type { Pool } from "pg";
import { HttpError } from "../errors/http-error.js";
import type { ObjectStorageClient } from "../storage/client.js";
import { toObjectStorageKey } from "../storage/keys.js";
import { findImageRecordsByIds, listImageRecords } from "./image-repository.js";
import { encodeImageListCursor, decodeImageListCursor } from "./pagination.js";
import { handleUploadRequest } from "./upload-service.js";
import { toListImageResponse, type ListImagesResponse } from "./list-response.js";
import { toImageContentUrl } from "./upload-response.js";

interface ImagesRouterDependencies {
  database: Pool;
  storage: ObjectStorageClient;
}

const DEFAULT_LIST_LIMIT = 30;
const MAX_LIST_LIMIT = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toNodeReadable(body: GetObjectCommandOutput["Body"]): Readable {
  if (body instanceof Readable) {
    return body;
  }

  throw new Error("Object Storage response body was not a Node.js readable stream");
}

function readImageIdFromRequest(request: Parameters<RequestHandler>[0]): string | undefined {
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

  throw new HttpError(400, "invalid_query", `${name} must be a single string value`);
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
    throw new HttpError(
      400,
      "invalid_limit",
      `limit must be an integer from 1 to ${MAX_LIST_LIMIT}`,
    );
  }

  return limit;
}

export function createImagesRouter(dependencies: ImagesRouterDependencies): Router {
  const router = Router();

  const getImageContent: RequestHandler = async (request, response, next) => {
    try {
      const imageId = readImageIdFromRequest(request);

      if (typeof imageId !== "string" || !UUID_PATTERN.test(imageId)) {
        throw new HttpError(400, "invalid_image_id", "Image ID must be a UUID");
      }

      const [record] = await findImageRecordsByIds(dependencies.database, [imageId]);

      if (record === undefined) {
        throw new HttpError(404, "image_not_found", "Image could not be found");
      }

      const result = await dependencies.storage.s3.send(
        new GetObjectCommand({
          Bucket: dependencies.storage.config.bucket,
          Key: toObjectStorageKey(dependencies.storage.config, record.storageKey),
        }),
      );

      response.status(200);
      response.setHeader("Content-Type", record.contentType);
      response.setHeader("Cache-Control", "private, max-age=300");

      if (result.ContentLength !== undefined) {
        response.setHeader("Content-Length", String(result.ContentLength));
      }

      toNodeReadable(result.Body).on("error", next).pipe(response);
    } catch (error) {
      next(error);
    }
  };

  const listImages: RequestHandler = async (request, response, next) => {
    try {
      const limit = parseLimit(request.query.limit);
      const cursorValue = readQueryString(request.query.cursor, "cursor");
      const cursor = cursorValue === undefined ? undefined : decodeImageListCursor(cursorValue);
      const records = await listImageRecords(dependencies.database, {
        limit: limit + 1,
        cursor,
      });
      const visibleRecords = records.slice(0, limit);
      const hasMore = records.length > limit;
      const lastVisibleRecord = visibleRecords.at(-1);
      const nextCursor =
        hasMore && lastVisibleRecord !== undefined
          ? encodeImageListCursor(lastVisibleRecord)
          : null;
      const body: ListImagesResponse = {
        images: visibleRecords.map((record) =>
          toListImageResponse(record, toImageContentUrl(record.id)),
        ),
        page: {
          limit,
          nextCursor,
          hasMore,
        },
      };

      response.json(body);
    } catch (error) {
      next(error);
    }
  };

  const uploadImages: RequestHandler = async (request, response, next) => {
    try {
      const result = await handleUploadRequest(request.headers, request, dependencies);
      const statusCode = result.uploaded.length > 0 ? 201 : 400;

      response.status(statusCode).json(result);
    } catch (error) {
      next(error);
    }
  };

  router.get("/:imageId/content", getImageContent);
  router.get("/", listImages);
  router.post("/", uploadImages);

  return router;
}
