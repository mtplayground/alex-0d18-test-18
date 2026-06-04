import Busboy from "busboy";
import { type Readable } from "node:stream";
import type { IncomingHttpHeaders } from "node:http";
import { RequestValidationError, UnsupportedMediaTypeError } from "../errors/http-error.js";
import { MAX_IMAGE_SIZE_BYTES, MAX_UPLOAD_FILES, UPLOAD_FIELD_NAMES } from "./upload-constants.js";
import { failedUpload, mapUploadError } from "./upload-errors.js";
import { sanitizeFilename } from "./upload-filenames.js";
import { processImageFile, type UploadDependencies } from "./upload-image-processor.js";
import { drainStream } from "./upload-stream.js";
import {
  type FailedImageUploadResponse,
  type UploadImagesResponse,
  type UploadedImageResponse,
} from "./upload-response.js";

export async function handleUploadRequest(
  headers: IncomingHttpHeaders,
  request: Readable,
  dependencies: UploadDependencies,
): Promise<UploadImagesResponse> {
  const contentType = headers["content-type"];

  if (typeof contentType !== "string" || !contentType.includes("multipart/form-data")) {
    throw new UnsupportedMediaTypeError(
      "unsupported_media_type",
      "Upload requests must be multipart/form-data",
    );
  }

  const uploaded: UploadedImageResponse[] = [];
  const failed: FailedImageUploadResponse[] = [];

  await new Promise<void>((resolve, reject) => {
    const parser = Busboy({
      headers,
      limits: {
        files: MAX_UPLOAD_FILES,
        fileSize: MAX_IMAGE_SIZE_BYTES + 1,
      },
    });
    const fileTasks: Promise<void>[] = [];
    let fileCount = 0;

    parser.on("file", (fieldName, stream, info) => {
      fileCount += 1;
      const filename = sanitizeFilename(info.filename);

      if (!UPLOAD_FIELD_NAMES.has(fieldName)) {
        const task = drainStream(stream)
          .then(() => {
            failed.push(failedUpload(filename, "invalid_field", "Files must use the files field"));
          })
          .catch(reject);
        fileTasks.push(task);
        return;
      }

      const task = processImageFile(
        stream,
        {
          filename,
          mimeType: info.mimeType,
        },
        dependencies,
      )
        .then((result) => {
          uploaded.push(result);
        })
        .catch((error: unknown) => {
          failed.push(mapUploadError(filename, error));
        });
      fileTasks.push(task);
    });

    parser.once("filesLimit", () => {
      failed.push(
        failedUpload(
          "",
          "too_many_files",
          `Upload requests can include at most ${MAX_UPLOAD_FILES} files`,
        ),
      );
    });

    parser.once("error", reject);

    parser.once("finish", () => {
      Promise.all(fileTasks)
        .then(() => {
          if (fileCount === 0) {
            reject(
              new RequestValidationError("no_files", "Upload request did not include any files"),
            );
            return;
          }

          resolve();
        })
        .catch(reject);
    });

    request.pipe(parser);
  });

  return {
    uploaded,
    failed,
  };
}
