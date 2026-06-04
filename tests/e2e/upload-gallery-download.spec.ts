import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";

const PNG_BUFFER = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

test("uploads, displays, selects, and downloads an image zip", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Upload images" })).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({
    buffer: PNG_BUFFER,
    mimeType: "image/png",
    name: "e2e-photo.png",
  });
  await expect(page.getByText("e2e-photo.png").first()).toBeVisible();

  await page.getByRole("button", { name: "Upload selected" }).click();
  await expect(page.getByText("1 image uploaded.")).toBeVisible();

  const gallery = page.locator("section").filter({ hasText: "Uploaded images" });

  await expect(gallery.getByText("e2e-photo.png")).toBeVisible();
  await gallery.getByRole("checkbox", { name: "Select e2e-photo.png" }).check();
  await expect(gallery.getByText("1 selected")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");

  await gallery.getByRole("button", { name: "Download selected as zip" }).click();

  const download = await downloadPromise;
  const downloadPath = await download.path();

  expect(download.suggestedFilename()).toMatch(/^images-\d{4}-\d{2}-\d{2}\.zip$/);
  expect(downloadPath).not.toBeNull();

  const zipBuffer = await readFile(downloadPath ?? "");
  const archive = await JSZip.loadAsync(zipBuffer);
  const entry = archive.file("e2e-photo.png");

  expect(entry).not.toBeNull();

  const entryBuffer = await entry?.async("nodebuffer");

  expect(Buffer.compare(entryBuffer ?? Buffer.alloc(0), PNG_BUFFER)).toBe(0);
});
