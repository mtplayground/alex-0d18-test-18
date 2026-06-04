import type { IncomingHttpHeaders } from "node:http";
import type { Readable } from "node:stream";
import type { Pool } from "pg";
import type { ObjectStorageClient } from "../storage/client.js";
export { getImageContent } from "./image-content-service.js";
export { listGalleryImages } from "./list-gallery-images.js";
import { handleUploadRequest } from "./upload-service.js";
import type { UploadImagesResponse } from "./upload-response.js";

export interface ImageServiceDependencies {
  database: Pool;
  storage: ObjectStorageClient;
}

export async function uploadImages(
  dependencies: ImageServiceDependencies,
  headers: IncomingHttpHeaders,
  request: Readable,
): Promise<UploadImagesResponse> {
  return await handleUploadRequest(headers, request, dependencies);
}
