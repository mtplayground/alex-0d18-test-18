import type { UploadedImageResponse } from "./uploadImages";
import { requestJson } from "./client";

export interface ListImagesResponse {
  images: UploadedImageResponse[];
  page: {
    limit: number;
    nextCursor: string | null;
    hasMore: boolean;
  };
}

interface ListImagesOptions {
  cursor?: string;
  limit?: number;
  signal?: AbortSignal;
}

export async function listImages(options: ListImagesOptions = {}): Promise<ListImagesResponse> {
  const searchParams = new URLSearchParams();

  if (options.limit !== undefined) {
    searchParams.set("limit", String(options.limit));
  }

  if (options.cursor !== undefined) {
    searchParams.set("cursor", options.cursor);
  }

  const query = searchParams.size > 0 ? `?${searchParams.toString()}` : "";
  return await requestJson<ListImagesResponse>(
    `/api/images${query}`,
    {
      signal: options.signal,
    },
    "Images could not be loaded",
  );
}
