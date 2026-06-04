import type { ObjectStorageConfig } from "../config/storage.js";

export function toObjectStorageKey(config: ObjectStorageConfig, relativeKey: string): string {
  if (relativeKey.trim() === "") {
    throw new Error("Object storage key cannot be empty");
  }

  if (relativeKey.startsWith("/")) {
    throw new Error("Object storage key must be relative");
  }

  if (relativeKey.split("/").includes("..")) {
    throw new Error("Object storage key cannot contain parent directory segments");
  }

  return `${config.prefix}${relativeKey}`;
}

export function toPublicObjectUrl(config: ObjectStorageConfig, relativeKey: string): string {
  const fullKey = toObjectStorageKey(config, relativeKey);
  const encodedKey = fullKey.split("/").map(encodeURIComponent).join("/");
  const baseUrl = config.publicBaseUrl.replace(/\/+$/, "");

  return `${baseUrl}/${encodedKey}`;
}
