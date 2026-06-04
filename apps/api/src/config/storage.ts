import { readRequiredEnv } from "./env.js";

export interface ObjectStorageConfig {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  prefix: string;
  endpoint: string;
  region: string;
  forcePathStyle: boolean;
  publicBaseUrl: string;
}

function readBooleanEnv(name: string): boolean {
  const value = readRequiredEnv(name).toLowerCase();

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new Error(`${name} must be either "true" or "false"`);
}

function readPrefix(): string {
  const prefix = readRequiredEnv("S3_PREFIX");

  if (!prefix.endsWith("/")) {
    throw new Error("S3_PREFIX must end with a trailing slash");
  }

  return prefix;
}

export function readObjectStorageConfig(): ObjectStorageConfig {
  return {
    accessKeyId: readRequiredEnv("S3_ACCESS_KEY_ID"),
    secretAccessKey: readRequiredEnv("S3_SECRET_ACCESS_KEY"),
    bucket: readRequiredEnv("S3_BUCKET"),
    prefix: readPrefix(),
    endpoint: readRequiredEnv("S3_ENDPOINT"),
    region: readRequiredEnv("S3_REGION"),
    forcePathStyle: readBooleanEnv("S3_FORCE_PATH_STYLE"),
    publicBaseUrl: readRequiredEnv("S3_PUBLIC_BASE_URL"),
  };
}
