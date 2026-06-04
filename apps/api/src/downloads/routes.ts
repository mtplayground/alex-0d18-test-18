import archiver from "archiver";
import { Router, type RequestHandler } from "express";
import path from "node:path";
import { Readable } from "node:stream";
import type { Pool } from "pg";
import { HttpError } from "../errors/http-error.js";
import { findImageRecordsByIds } from "../images/image-repository.js";
import type { ImageRecord } from "../images/image-record.js";
import type { ObjectStorageClient } from "../storage/client.js";

interface DownloadsRouterDependencies {
  database: Pool;
  storage: ObjectStorageClient;
}

interface ZipEntry {
  name: string;
  stream: Readable;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_ZIP_IMAGES = 100;

function parseImageIds(body: unknown): string[] {
  if (body === null || typeof body !== "object" || !("imageIds" in body)) {
    throw new HttpError(400, "invalid_request", "Request body must include imageIds");
  }

  const imageIds = body.imageIds;

  if (!Array.isArray(imageIds) || imageIds.length === 0) {
    throw new HttpError(400, "invalid_image_ids", "imageIds must be a non-empty array");
  }

  if (imageIds.length > MAX_ZIP_IMAGES) {
    throw new HttpError(
      400,
      "too_many_images",
      `Zip downloads can include at most ${MAX_ZIP_IMAGES} images`,
    );
  }

  const uniqueImageIds: string[] = [];
  const seenImageIds = new Set<string>();

  for (const imageId of imageIds) {
    if (typeof imageId !== "string" || !UUID_PATTERN.test(imageId)) {
      throw new HttpError(400, "invalid_image_id", "Each image ID must be a UUID");
    }

    if (!seenImageIds.has(imageId)) {
      seenImageIds.add(imageId);
      uniqueImageIds.push(imageId);
    }
  }

  return uniqueImageIds;
}

function sanitizeZipEntryName(filename: string): string {
  const basename = path.basename(filename).replaceAll(/[/\\]/g, "").trim();

  if (basename === "" || basename === "." || basename === "..") {
    return "image";
  }

  return basename.replaceAll(/[\r\n\t]/g, "_");
}

function uniqueZipEntryName(record: ImageRecord, usedNames: Set<string>): string {
  const sanitizedName = sanitizeZipEntryName(record.filename);
  const extension = path.extname(sanitizedName);
  const nameWithoutExtension =
    extension === "" ? sanitizedName : sanitizedName.slice(0, -extension.length);
  let candidate = sanitizedName;
  let suffix = 2;

  while (usedNames.has(candidate)) {
    candidate = `${nameWithoutExtension}-${suffix}${extension}`;
    suffix += 1;
  }

  usedNames.add(candidate);
  return candidate;
}

async function getImageObjectStream(
  storage: ObjectStorageClient,
  record: ImageRecord,
): Promise<Readable> {
  try {
    const result = await storage.getObject(record.storageKey);

    return result.body;
  } catch {
    throw new HttpError(
      502,
      "storage_unavailable",
      "One or more selected images could not be read from object storage",
    );
  }
}

export function createDownloadsRouter(dependencies: DownloadsRouterDependencies): Router {
  const router = Router();

  const downloadZip: RequestHandler = async (request, response, next) => {
    try {
      const imageIds = parseImageIds(request.body);
      const records = await findImageRecordsByIds(dependencies.database, imageIds);

      if (records.length !== imageIds.length) {
        throw new HttpError(404, "images_not_found", "One or more images could not be found");
      }

      const filename = `images-${new Date().toISOString().slice(0, 10)}.zip`;
      const archive = archiver("zip", {
        zlib: {
          level: 6,
        },
      });
      const usedNames = new Set<string>();
      const zipEntries: ZipEntry[] = [];

      for (const record of records) {
        zipEntries.push({
          name: uniqueZipEntryName(record, usedNames),
          stream: await getImageObjectStream(dependencies.storage, record),
        });
      }

      archive.on("error", (error) => {
        response.destroy(error);
      });

      response.status(200);
      response.setHeader("Content-Type", "application/zip");
      response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

      archive.pipe(response);

      for (const entry of zipEntries) {
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
