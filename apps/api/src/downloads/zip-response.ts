import archiver from "archiver";
import type { Response } from "express";
import type { ZipDownload } from "./download-service.js";

export async function streamZipDownloadResponse(
  response: Response,
  zipDownload: ZipDownload,
): Promise<void> {
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
}
