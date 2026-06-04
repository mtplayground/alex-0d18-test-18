import type { FailedImageUploadResponse } from "./upload-response.js";

export class UploadValidationError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export class UploadStorageError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

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
  if (error instanceof UploadValidationError) {
    return failedUpload(filename, error.code, error.message);
  }

  if (error instanceof UploadStorageError) {
    return failedUpload(filename, error.code, error.message);
  }

  return failedUpload(filename, "upload_failed", "Image upload failed");
}
