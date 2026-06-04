import type { IncomingHttpHeaders } from "node:http";
import type { Readable } from "node:stream";
import type { Pool } from "pg";
import type { ObjectStorageClient } from "../storage/client.js";
import { createImageMetadataRepository, type ImageMetadataRepository } from "./image-repository.js";
import {
  createImageObjectRepository,
  type ImageObjectRepository,
} from "./image-object-repository.js";
export { getImageContent } from "./image-content-service.js";
export { listGalleryImages } from "./list-gallery-images.js";
import { handleUploadRequest } from "./upload-service.js";
import type { UploadImagesResponse } from "./upload-response.js";

export interface ImageServiceRuntimeDependencies {
  database: Pool;
  storage: ObjectStorageClient;
}

export interface ImageServiceDependencies {
  metadataRepository: ImageMetadataRepository;
  objectRepository: ImageObjectRepository;
}

export function createImageServiceDependencies(
  dependencies: ImageServiceRuntimeDependencies,
): ImageServiceDependencies {
  return {
    metadataRepository: createImageMetadataRepository(dependencies.database),
    objectRepository: createImageObjectRepository(dependencies.storage),
  };
}

export async function uploadImages(
  dependencies: ImageServiceDependencies,
  headers: IncomingHttpHeaders,
  request: Readable,
): Promise<UploadImagesResponse> {
  return await handleUploadRequest(headers, request, dependencies);
}
