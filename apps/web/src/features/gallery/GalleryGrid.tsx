import { useMemo } from "react";
import { useGalleryDownload } from "./useGalleryDownload";
import { useGalleryImages } from "./useGalleryImages";
import { useGallerySelection } from "./useGallerySelection";

interface GalleryGridProps {
  refreshKey: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function GalleryGrid({ refreshKey }: GalleryGridProps) {
  const { galleryState, refreshGallery, sentinelRef } = useGalleryImages(refreshKey);
  const { clearDownloadError, downloadError, downloadSelectedImages, isDownloading } =
    useGalleryDownload();

  const loadedImageIds = useMemo(
    () => galleryState.images.map((image) => image.id),
    [galleryState.images],
  );
  const {
    areAllLoadedImagesSelected,
    clearSelection,
    hasLoadedImages,
    selectedCount,
    selectedImageIds,
    selectedLoadedImageIds,
    selectAllLoadedImages,
    toggleImageSelection,
  } = useGallerySelection(loadedImageIds, clearDownloadError);

  return (
    <section className="mx-auto w-full max-w-6xl px-5 pb-12 sm:px-8 lg:px-10">
      <div className="flex flex-col gap-4 border-t border-slate-200 pt-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-normal text-cyan-700">Gallery</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950">
            Uploaded images
          </h2>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <p className="text-sm text-slate-600" aria-live="polite">
            {selectedCount} selected
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
              disabled={!hasLoadedImages || galleryState.isLoading || areAllLoadedImagesSelected}
              onClick={selectAllLoadedImages}
            >
              Select all
            </button>
            <button
              className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
              disabled={selectedCount === 0}
              onClick={clearSelection}
            >
              Clear
            </button>
            <button
              className="rounded border border-cyan-700 bg-cyan-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500"
              type="button"
              disabled={selectedCount === 0 || isDownloading}
              onClick={() => {
                void downloadSelectedImages(selectedLoadedImageIds);
              }}
            >
              {isDownloading ? "Downloading..." : "Download selected as zip"}
            </button>
            <button
              className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
              disabled={galleryState.isLoading}
              onClick={refreshGallery}
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      {galleryState.error !== null ? (
        <p className="mt-5 rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {galleryState.error}
        </p>
      ) : null}

      {downloadError !== null ? (
        <p className="mt-5 rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {downloadError}
        </p>
      ) : null}

      {galleryState.isLoading ? (
        <div className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
          {Array.from({ length: 8 }, (_, index) => (
            <div
              key={index}
              className="aspect-square animate-pulse rounded border border-slate-200 bg-slate-100"
            />
          ))}
        </div>
      ) : null}

      {!galleryState.isLoading &&
      galleryState.error === null &&
      galleryState.images.length === 0 ? (
        <div className="mt-6 rounded border border-slate-200 bg-white px-5 py-10 text-center text-sm text-slate-600">
          No uploaded images yet.
        </div>
      ) : null}

      {!galleryState.isLoading && galleryState.images.length > 0 ? (
        <div className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
          {galleryState.images.map((image) => {
            const isSelected = selectedImageIds.has(image.id);
            const checkboxId = `select-image-${image.id}`;

            return (
              <article
                key={image.id}
                className={`group overflow-hidden rounded border bg-white transition ${
                  isSelected
                    ? "border-cyan-500 ring-2 ring-cyan-200"
                    : "border-slate-200 hover:border-slate-300"
                }`}
                aria-pressed={isSelected}
                role="button"
                tabIndex={0}
                onClick={() => toggleImageSelection(image.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleImageSelection(image.id);
                  }
                }}
              >
                <div className="relative aspect-square bg-slate-100">
                  <img
                    className={`h-full w-full object-cover transition ${
                      isSelected ? "brightness-95" : "group-hover:brightness-95"
                    }`}
                    decoding="async"
                    loading="lazy"
                    src={image.url}
                    alt={image.filename}
                  />
                  <div className="absolute left-3 top-3 rounded bg-white/95 p-1 shadow-sm">
                    <input
                      id={checkboxId}
                      className="h-5 w-5 rounded border-slate-300 text-cyan-700 focus:ring-cyan-600"
                      type="checkbox"
                      checked={isSelected}
                      aria-label={`Select ${image.filename}`}
                      onClick={(event) => event.stopPropagation()}
                      onChange={() => toggleImageSelection(image.id)}
                    />
                  </div>
                </div>
                <div className="space-y-2 p-3">
                  <p
                    className="truncate text-sm font-medium text-slate-950"
                    id={`${checkboxId}-label`}
                    title={image.filename}
                  >
                    {image.filename}
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                    <span>
                      {image.dimensions.width} x {image.dimensions.height}
                    </span>
                    <span>{formatBytes(image.size)}</span>
                  </div>
                  <p className="text-xs text-slate-500">{formatDate(image.uploadedAt)}</p>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      {!galleryState.isLoading && galleryState.images.length > 0 ? (
        <div ref={sentinelRef} className="mt-6 flex min-h-12 items-center justify-center">
          {galleryState.isLoadingMore ? (
            <span className="text-sm text-slate-500">Loading more images</span>
          ) : null}
          {!galleryState.isLoadingMore && !galleryState.hasMore ? (
            <span className="text-sm text-slate-500">End of gallery</span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
