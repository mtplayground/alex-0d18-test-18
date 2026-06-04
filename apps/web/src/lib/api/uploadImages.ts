import { apiErrorFromBody, parseApiResponseText } from "./client";

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

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

interface UploadImagesOptions {
  onProgress?: (progress: UploadProgress) => void;
}

function isUploadImagesResponse(body: unknown): body is UploadImagesResponse {
  if (body === null || typeof body !== "object") {
    return false;
  }

  return "uploaded" in body && "failed" in body;
}

export async function uploadImages(
  files: File[],
  options: UploadImagesOptions = {},
): Promise<UploadImagesResponse> {
  const formData = new FormData();

  for (const file of files) {
    formData.append("files", file, file.name);
  }

  return await new Promise<UploadImagesResponse>((resolve, reject) => {
    const request = new XMLHttpRequest();

    request.open("POST", "/api/images");

    request.upload.onprogress = (event) => {
      const total = event.lengthComputable
        ? event.total
        : files.reduce((sum, file) => sum + file.size, 0);
      const percent = total > 0 ? Math.min(100, Math.round((event.loaded / total) * 100)) : 0;

      options.onProgress?.({
        loaded: event.loaded,
        total,
        percent,
      });
    };

    request.onload = () => {
      try {
        const body = parseApiResponseText(request.responseText);

        if (isUploadImagesResponse(body)) {
          resolve(body);
          return;
        }

        if (request.status >= 200 && request.status < 300) {
          reject(new Error("Upload response was not recognized"));
          return;
        }

        reject(apiErrorFromBody(body, "Upload failed"));
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Upload failed"));
      }
    };

    request.onerror = () => {
      reject(new Error("Upload failed"));
    };

    request.onabort = () => {
      reject(new Error("Upload was cancelled"));
    };

    request.send(formData);
  });
}
