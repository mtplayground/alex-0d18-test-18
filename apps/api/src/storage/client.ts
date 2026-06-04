import { S3Client } from "@aws-sdk/client-s3";
import { readObjectStorageConfig, type ObjectStorageConfig } from "../config/storage.js";

export interface ObjectStorageClient {
  s3: S3Client;
  config: ObjectStorageConfig;
}

export function createObjectStorageClient(config = readObjectStorageConfig()): ObjectStorageClient {
  return {
    s3: new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    }),
    config,
  };
}
