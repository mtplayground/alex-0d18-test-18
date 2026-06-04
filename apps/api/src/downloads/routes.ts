import archiver from "archiver";
import { Router, type RequestHandler } from "express";
import type { Pool } from "pg";
import type { ObjectStorageClient } from "../storage/client.js";
import { prepareZipDownload } from "./download-service.js";

interface DownloadsRouterDependencies {
  database: Pool;
  storage: ObjectStorageClient;
}

export function createDownloadsRouter(dependencies: DownloadsRouterDependencies): Router {
  const router = Router();

  const downloadZip: RequestHandler = async (request, response, next) => {
    try {
      const zipDownload = await prepareZipDownload(dependencies, request.body);
      const archive = archiver("zip", {
        zlib: {
          level: 6,
        },
      });

      archive.on("error", (error) => {
        response.destroy(error);
      });

      response.status(200);
      response.setHeader("Content-Type", "application/zip");
      response.setHeader("Content-Disposition", `attachment; filename="${zipDownload.filename}"`);

      archive.pipe(response);

      for (const entry of zipDownload.entries) {
        archive.append(entry.stream, {
          name: entry.name,
        });
      }

      await archive.finalize();
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
