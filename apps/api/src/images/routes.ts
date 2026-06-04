import { Router, type RequestHandler } from "express";
import { parseImageContentRequest, parseImageListQuery } from "../validation/request-schemas.js";
import {
  getImageContent as getImageContentFromService,
  type ImageServiceDependencies,
  listGalleryImages,
  uploadImages as uploadImagesWithService,
} from "./image-service.js";

export function createImagesRouter(serviceDependencies: ImageServiceDependencies): Router {
  const router = Router();

  const getImageContent: RequestHandler = async (request, response, next) => {
    try {
      const imageId = parseImageContentRequest(request);
      const result = await getImageContentFromService(serviceDependencies, imageId);

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
      const { cursor, limit } = parseImageListQuery(request.query);
      const body = await listGalleryImages(serviceDependencies, {
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
      const result = await uploadImagesWithService(serviceDependencies, request.headers, request);
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
