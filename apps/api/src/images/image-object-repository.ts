import type { Readable } from "node:stream";
import type { ObjectStorageClient, PutObjectInput } from "../storage/client.js";

export interface ImageObjectReadResult {
  contentLength?: number;
  body: Readable;
}

export interface ImageObjectRepository {
  delete(relativeKey: string): Promise<void>;
  get(relativeKey: string): Promise<ImageObjectReadResult>;
  put(input: PutObjectInput): Promise<void>;
}

export function createImageObjectRepository(storage: ObjectStorageClient): ImageObjectRepository {
  return {
    async delete(relativeKey) {
      await storage.deleteObject(relativeKey);
    },
    async get(relativeKey) {
      return await storage.getObject(relativeKey);
    },
    async put(input) {
      await storage.putObject(input);
    },
  };
}
