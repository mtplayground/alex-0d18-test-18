import { Router, type RequestHandler } from "express";
import type { ImageServiceDependencies } from "../images/image-service.js";
import { prepareZipDownload } from "./download-service.js";
import { streamZipDownloadResponse } from "./zip-response.js";

export function createDownloadsRouter(serviceDependencies: ImageServiceDependencies): Router {
  const router = Router();

  const downloadZip: RequestHandler = async (request, response, next) => {
    try {
      const zipDownload = await prepareZipDownload(serviceDependencies, request.body);
      await streamZipDownloadResponse(response, zipDownload);
    } catch (error) {
      if (response.headersSent) {
        response.destroy(error instanceof Error ? error : new Error("Zip download failed"));
        return;
      }

      next(error);
    }
  };

  router.post("/zip", downloadZip);

  return router;
}
