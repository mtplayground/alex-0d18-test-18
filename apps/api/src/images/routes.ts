import { Router, type RequestHandler } from "express";
import type { Pool } from "pg";
import type { ObjectStorageClient } from "../storage/client.js";
import { handleUploadRequest } from "./upload-service.js";

interface ImagesRouterDependencies {
  database: Pool;
  storage: ObjectStorageClient;
}

export function createImagesRouter(dependencies: ImagesRouterDependencies): Router {
  const router = Router();

  const uploadImages: RequestHandler = async (request, response, next) => {
    try {
      const result = await handleUploadRequest(request.headers, request, dependencies);
      const statusCode = result.uploaded.length > 0 ? 201 : 400;

      response.status(statusCode).json(result);
    } catch (error) {
      next(error);
    }
  };

  router.post("/", uploadImages);

  return router;
}
