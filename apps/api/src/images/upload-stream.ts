import { type Readable } from "node:stream";
import { UploadValidationError } from "../errors/http-error.js";
import { MAX_IMAGE_SIZE_BYTES } from "./upload-constants.js";

export interface StreamedFile {
  buffer: Buffer;
  size: number;
}

export async function drainStream(stream: Readable): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    stream.once("error", reject);
    stream.once("end", resolve);
    stream.resume();
  });
}

export async function readUploadStream(stream: Readable): Promise<StreamedFile> {
  const chunks: Buffer[] = [];
  let size = 0;
  let sizeExceeded = false;

  return await new Promise<StreamedFile>((resolve, reject) => {
    stream.on("limit", () => {
      sizeExceeded = true;
      reject(
        new UploadValidationError(
          "file_too_large",
          `Images must be ${MAX_IMAGE_SIZE_BYTES} bytes or smaller`,
        ),
      );
    });

    stream.on("data", (chunk: Buffer) => {
      size += chunk.length;

      if (size > MAX_IMAGE_SIZE_BYTES) {
        sizeExceeded = true;
        reject(
          new UploadValidationError(
            "file_too_large",
            `Images must be ${MAX_IMAGE_SIZE_BYTES} bytes or smaller`,
          ),
        );
        return;
      }

      chunks.push(chunk);
    });

    stream.once("error", reject);

    stream.once("end", () => {
      if (sizeExceeded) {
        reject(
          new UploadValidationError(
            "file_too_large",
            `Images must be ${MAX_IMAGE_SIZE_BYTES} bytes or smaller`,
          ),
        );
        return;
      }

      resolve({
        buffer: Buffer.concat(chunks, size),
        size,
      });
    });
  });
}
