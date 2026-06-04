import { randomUUID } from "node:crypto";
import path from "node:path";

export function sanitizeFilename(filename: string): string {
  const basename = [...path.basename(filename)]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join("")
    .trim();

  if (basename === "" || basename === "." || basename === "..") {
    return "image";
  }

  return basename.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
}

export function buildRelativeStorageKey(filename: string): string {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");

  return `uploads/${year}/${month}/${day}/${randomUUID()}-${sanitizeFilename(filename)}`;
}
