import Busboy from "busboy";
import { type Readable } from "node:stream";
import type { IncomingHttpHeaders } from "node:http";
import { MAX_IMAGE_SIZE_BYTES, MAX_UPLOAD_FILES, UPLOAD_FIELD_NAMES } from "./upload-constants.js";
import {
  tooManyUploadFilesFailure,
  validateUploadFileCount,
  validateUploadHeaders,
} from "../validation/request-schemas.js";
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
  validateUploadHeaders(headers);

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
      failed.push(tooManyUploadFilesFailure());
    });

    parser.once("error", reject);

    parser.once("finish", () => {
      Promise.all(fileTasks)
        .then(() => {
          validateUploadFileCount(fileCount);

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
