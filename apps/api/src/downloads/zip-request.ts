import { RequestValidationError } from "../errors/http-error.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_ZIP_IMAGES = 100;

export function parseImageIds(body: unknown): string[] {
  if (body === null || typeof body !== "object" || !("imageIds" in body)) {
    throw new RequestValidationError("invalid_request", "Request body must include imageIds");
  }

  const imageIds = body.imageIds;

  if (!Array.isArray(imageIds) || imageIds.length === 0) {
    throw new RequestValidationError("invalid_image_ids", "imageIds must be a non-empty array");
  }

  if (imageIds.length > MAX_ZIP_IMAGES) {
    throw new RequestValidationError(
      "too_many_images",
      `Zip downloads can include at most ${MAX_ZIP_IMAGES} images`,
    );
  }

  const uniqueImageIds: string[] = [];
  const seenImageIds = new Set<string>();

  for (const imageId of imageIds) {
    if (typeof imageId !== "string" || !UUID_PATTERN.test(imageId)) {
      throw new RequestValidationError("invalid_image_id", "Each image ID must be a UUID");
    }

    if (!seenImageIds.has(imageId)) {
      seenImageIds.add(imageId);
      uniqueImageIds.push(imageId);
    }
  }

  return uniqueImageIds;
}
