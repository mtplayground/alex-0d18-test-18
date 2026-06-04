import { Router, type RequestHandler } from "express";
import type { Pool } from "pg";
import { HttpError } from "../errors/http-error.js";
import type { ObjectStorageClient } from "../storage/client.js";
import {
  getImageContent as getImageContentFromService,
  listGalleryImages,
  uploadImages as uploadImagesWithService,
} from "./image-service.js";
import { decodeImageListCursor } from "./pagination.js";

interface ImagesRouterDependencies {
  database: Pool;
  storage: ObjectStorageClient;
}

const DEFAULT_LIST_LIMIT = 30;
const MAX_LIST_LIMIT = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

      const result = await getImageContentFromService(dependencies, imageId);

      response.status(200);
      response.setHeader("Content-Type", result.contentType);
      response.setHeader("Cache-Control", "private, max-age=300");

      if (result.contentLength !== undefined) {
        response.setHeader("Content-Length", String(result.contentLength));
      }

      result.stream.on("error", next).pipe(response);
    } catch (error) {
      next(error);
    }
  };

  const listImages: RequestHandler = async (request, response, next) => {
    try {
      const limit = parseLimit(request.query.limit);
      const cursorValue = readQueryString(request.query.cursor, "cursor");
      const cursor = cursorValue === undefined ? undefined : decodeImageListCursor(cursorValue);
      const body = await listGalleryImages(dependencies, {
        limit,
        cursor,
      });

      response.json(body);
    } catch (error) {
      next(error);
    }
  };

  const uploadImages: RequestHandler = async (request, response, next) => {
    try {
      const result = await uploadImagesWithService(dependencies, request.headers, request);
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
