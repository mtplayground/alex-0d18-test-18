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

export async function uploadImages(files: File[]): Promise<UploadImagesResponse> {
  const formData = new FormData();

  for (const file of files) {
    formData.append("files", file, file.name);
  }

  const response = await fetch("/api/images", {
    method: "POST",
    body: formData,
  });

  const body = (await response.json()) as UploadImagesResponse | { error?: { message?: string } };

  if (!response.ok && "error" in body) {
    throw new Error(body.error?.message ?? "Upload failed");
  }

  return body as UploadImagesResponse;
}
