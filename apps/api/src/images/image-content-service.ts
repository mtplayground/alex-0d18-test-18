import type { Readable } from "node:stream";
import { NotFoundError } from "../errors/http-error.js";
import type { ImageObjectRepository } from "./image-object-repository.js";
import type { ImageMetadataRepository } from "./image-repository.js";

export interface ImageContentDependencies {
  metadataRepository: ImageMetadataRepository;
  objectRepository: ImageObjectRepository;
}

export interface ImageContentResult {
  contentType: string;
  contentLength?: number;
  stream: Readable;
}

export async function getImageContent(
  dependencies: ImageContentDependencies,
  imageId: string,
): Promise<ImageContentResult> {
  const [record] = await dependencies.metadataRepository.findByIds([imageId]);

  if (record === undefined) {
    throw new NotFoundError("image_not_found", "Image could not be found");
  }

  const object = await dependencies.objectRepository.get(record.storageKey);

  return {
    contentType: record.contentType,
    contentLength: object.contentLength,
    stream: object.body,
  };
}
