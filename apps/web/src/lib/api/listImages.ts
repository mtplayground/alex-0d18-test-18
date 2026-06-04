import type { UploadedImageResponse } from "./uploadImages";

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
  const response = await fetch(`/api/images${query}`, {
    signal: options.signal,
  });
  const body = (await response.json()) as ListImagesResponse | { error?: { message?: string } };

  if (!response.ok) {
    throw new Error(
      "error" in body
        ? (body.error?.message ?? "Images could not be loaded")
        : "Images could not be loaded",
    );
  }

  return body as ListImagesResponse;
}
