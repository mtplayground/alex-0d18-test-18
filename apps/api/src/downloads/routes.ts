import { Router, type RequestHandler } from "express";
import type { Pool } from "pg";
import type { ObjectStorageClient } from "../storage/client.js";
import { prepareZipDownload } from "./download-service.js";
import { streamZipDownloadResponse } from "./zip-response.js";

interface DownloadsRouterDependencies {
  database: Pool;
  storage: ObjectStorageClient;
}

export function createDownloadsRouter(dependencies: DownloadsRouterDependencies): Router {
  const router = Router();

  const downloadZip: RequestHandler = async (request, response, next) => {
    try {
      const zipDownload = await prepareZipDownload(dependencies, request.body);
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
