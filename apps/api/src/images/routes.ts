import { Router, type RequestHandler } from "express";
import type { Pool } from "pg";
import { HttpError } from "../errors/http-error.js";
import type { ObjectStorageClient } from "../storage/client.js";
import { toPublicObjectUrl } from "../storage/keys.js";
import { listImageRecords } from "./image-repository.js";
import { encodeImageListCursor, decodeImageListCursor } from "./pagination.js";
import { handleUploadRequest } from "./upload-service.js";
import { toListImageResponse, type ListImagesResponse } from "./list-response.js";

interface ImagesRouterDependencies {
  database: Pool;
  storage: ObjectStorageClient;
}

const DEFAULT_LIST_LIMIT = 30;
const MAX_LIST_LIMIT = 100;

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
          toListImageResponse(
            record,
            toPublicObjectUrl(dependencies.storage.config, record.storageKey),
          ),
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

  router.get("/", listImages);
  router.post("/", uploadImages);

  return router;
}
