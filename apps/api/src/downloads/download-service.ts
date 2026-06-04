import { type Readable } from "node:stream";
import type { Pool } from "pg";
import { NotFoundError, UpstreamStorageError } from "../errors/http-error.js";
import { findImageRecordsByIds } from "../images/image-repository.js";
import type { ImageRecord } from "../images/image-record.js";
import type { ObjectStorageClient } from "../storage/client.js";
import { parseZipImageIds } from "../validation/request-schemas.js";
import { uniqueZipEntryName } from "./zip-entry-names.js";

interface DownloadServiceDependencies {
  database: Pool;
  storage: ObjectStorageClient;
}

export interface ZipEntry {
  name: string;
  stream: Readable;
}

export interface ZipDownload {
  filename: string;
  entries: ZipEntry[];
}

async function getImageObjectStream(
  storage: ObjectStorageClient,
  record: ImageRecord,
): Promise<Readable> {
  try {
    const result = await storage.getObject(record.storageKey);

    return result.body;
  } catch {
    throw new UpstreamStorageError(
      "storage_unavailable",
      "One or more selected images could not be read from object storage",
    );
  }
}

export async function prepareZipDownload(
  dependencies: DownloadServiceDependencies,
  body: unknown,
): Promise<ZipDownload> {
  const imageIds = parseZipImageIds(body);
  const records = await findImageRecordsByIds(dependencies.database, imageIds);

  if (records.length !== imageIds.length) {
    throw new NotFoundError("images_not_found", "One or more images could not be found");
  }

  const usedNames = new Set<string>();
  const entries: ZipEntry[] = [];

  for (const record of records) {
    entries.push({
      name: uniqueZipEntryName(record, usedNames),
      stream: await getImageObjectStream(dependencies.storage, record),
    });
  }

  return {
    filename: `images-${new Date().toISOString().slice(0, 10)}.zip`,
    entries,
  };
}
