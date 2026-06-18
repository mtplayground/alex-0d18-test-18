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
  const prefix = readRequiredEnv("OBJECT_STORAGE_PREFIX");

  if (!prefix.endsWith("/")) {
    throw new Error("OBJECT_STORAGE_PREFIX must end with a trailing slash");
  }

  return prefix;
}

export function readObjectStorageConfig(): ObjectStorageConfig {
  return {
    accessKeyId: readRequiredEnv("OBJECT_STORAGE_ACCESS_KEY_ID"),
    secretAccessKey: readRequiredEnv("OBJECT_STORAGE_SECRET_ACCESS_KEY"),
    bucket: readRequiredEnv("OBJECT_STORAGE_BUCKET"),
    prefix: readPrefix(),
    endpoint: readRequiredEnv("OBJECT_STORAGE_ENDPOINT"),
    region: readRequiredEnv("OBJECT_STORAGE_REGION"),
    forcePathStyle: readBooleanEnv("OBJECT_STORAGE_FORCE_PATH_STYLE"),
    publicBaseUrl: readRequiredEnv("S3_PUBLIC_BASE_URL"),
  };
}
