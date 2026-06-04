import type { ImageMetadataRepository } from "./image-repository.js";
import type { ImageListCursor } from "./pagination.js";
import { encodeImageListCursor } from "./pagination.js";
import { toListImageResponse, type ListImagesResponse } from "./list-response.js";
import { toImageContentUrl } from "./upload-response.js";

export interface ListGalleryImagesDependencies {
  metadataRepository: ImageMetadataRepository;
}

export interface ListGalleryImagesInput {
  limit: number;
  cursor?: ImageListCursor;
}

export async function listGalleryImages(
  dependencies: ListGalleryImagesDependencies,
  input: ListGalleryImagesInput,
): Promise<ListImagesResponse> {
  const records = await dependencies.metadataRepository.list({
    limit: input.limit + 1,
    cursor: input.cursor,
  });
  const visibleRecords = records.slice(0, input.limit);
  const hasMore = records.length > input.limit;
  const lastVisibleRecord = visibleRecords.at(-1);
  const nextCursor =
    hasMore && lastVisibleRecord !== undefined ? encodeImageListCursor(lastVisibleRecord) : null;

  return {
    images: visibleRecords.map((record) =>
      toListImageResponse(record, toImageContentUrl(record.id)),
    ),
    page: {
      limit: input.limit,
      nextCursor,
      hasMore,
    },
  };
}
