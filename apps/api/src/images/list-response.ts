import type { ImageRecord } from "./image-record.js";
import type { UploadedImageResponse } from "./upload-response.js";
import { toUploadedImageResponse } from "./upload-response.js";

export interface ListImagesResponse {
  images: UploadedImageResponse[];
  page: {
    limit: number;
    nextCursor: string | null;
    hasMore: boolean;
  };
}

export function toListImageResponse(record: ImageRecord, url: string): UploadedImageResponse {
  return toUploadedImageResponse(record, url);
}
