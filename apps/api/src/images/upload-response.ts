import type { ImageRecord } from "./image-record.js";

export interface UploadedImageResponse {
  id: string;
  filename: string;
  storageKey: string;
  contentType: string;
  size: number;
  dimensions: {
    width: number;
    height: number;
  };
  uploadedAt: string;
  url: string;
}

export interface FailedImageUploadResponse {
  filename: string;
  error: {
    code: string;
    message: string;
  };
}

export interface UploadImagesResponse {
  uploaded: UploadedImageResponse[];
  failed: FailedImageUploadResponse[];
}

export function toImageContentUrl(imageId: string): string {
  return `/api/images/${encodeURIComponent(imageId)}/content`;
}

export function toUploadedImageResponse(record: ImageRecord, url: string): UploadedImageResponse {
  return {
    id: record.id,
    filename: record.filename,
    storageKey: record.storageKey,
    contentType: record.contentType,
    size: record.size,
    dimensions: record.dimensions,
    uploadedAt: record.uploadedAt.toISOString(),
    url,
  };
}
