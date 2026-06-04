import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type GetObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { readObjectStorageConfig, type ObjectStorageConfig } from "../config/storage.js";
import { toObjectStorageKey } from "./keys.js";

export interface PutObjectInput {
  relativeKey: string;
  body: Buffer;
  contentLength: number;
  contentType: string;
}

export interface GetObjectResult {
  body: Readable;
  contentLength?: number;
}

export interface ObjectStorageSdkClient {
  send(command: unknown): Promise<unknown>;
}

export interface ObjectStorageClient {
  config: ObjectStorageConfig;
  putObject(input: PutObjectInput): Promise<void>;
  getObject(relativeKey: string): Promise<GetObjectResult>;
  deleteObject(relativeKey: string): Promise<void>;
}

function createS3Client(config: ObjectStorageConfig): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    requestChecksumCalculation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

function toNodeReadable(body: GetObjectCommandOutput["Body"]): Readable {
  if (body instanceof Readable) {
    return body;
  }

  throw new Error("Object Storage response body was not a Node.js readable stream");
}

export function createObjectStorageClient(
  config = readObjectStorageConfig(),
  sdkClient: ObjectStorageSdkClient = createS3Client(config),
): ObjectStorageClient {
  return {
    config,
    async putObject(input) {
      await sdkClient.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: toObjectStorageKey(config, input.relativeKey),
          Body: input.body,
          ContentLength: input.contentLength,
          ContentType: input.contentType,
        }),
      );
    },
    async getObject(relativeKey) {
      const result = (await sdkClient.send(
        new GetObjectCommand({
          Bucket: config.bucket,
          Key: toObjectStorageKey(config, relativeKey),
        }),
      )) as GetObjectCommandOutput;

      return {
        body: toNodeReadable(result.Body),
        contentLength: result.ContentLength,
      };
    },
    async deleteObject(relativeKey) {
      await sdkClient.send(
        new DeleteObjectCommand({
          Bucket: config.bucket,
          Key: toObjectStorageKey(config, relativeKey),
        }),
      );
    },
  };
}
