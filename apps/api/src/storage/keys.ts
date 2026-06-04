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
  const baseUrl = config.publicBaseUrl.replace(/\/+$/, "");
  const key = publicBaseUrlIncludesPrefix(baseUrl, config.prefix) ? relativeKey : fullKey;
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");

  return `${baseUrl}/${encodedKey}`;
}

function publicBaseUrlIncludesPrefix(baseUrl: string, prefix: string): boolean {
  try {
    const { pathname } = new URL(baseUrl);
    const normalizedPath = pathname.replace(/^\/+|\/+$/g, "");
    const normalizedPrefix = prefix.replace(/^\/+|\/+$/g, "");

    return (
      normalizedPath.split("/").slice(-normalizedPrefix.split("/").length).join("/") ===
      normalizedPrefix
    );
  } catch {
    return false;
  }
}
