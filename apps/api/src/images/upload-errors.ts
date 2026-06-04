import type { FailedImageUploadResponse } from "./upload-response.js";
import { UploadFileError } from "../errors/http-error.js";

export function failedUpload(
  filename: string,
  code: string,
  message: string,
): FailedImageUploadResponse {
  return {
    filename,
    error: {
      code,
      message,
    },
  };
}

export function mapUploadError(filename: string, error: unknown): FailedImageUploadResponse {
  if (error instanceof UploadFileError) {
    return failedUpload(filename, error.code, error.message);
  }

  return failedUpload(filename, "upload_failed", "Image upload failed");
}
