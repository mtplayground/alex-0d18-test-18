import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { downloadImagesAsZip } from "../../lib/api/downloadImages";
import { listImages } from "../../lib/api/listImages";
import type { UploadedImageResponse } from "../../lib/api/uploadImages";

interface GalleryGridProps {
  refreshKey: number;
}

interface GalleryState {
  images: UploadedImageResponse[];
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  nextCursor: string | null;
  hasMore: boolean;
}

const INITIAL_GALLERY_STATE: GalleryState = {
  images: [],
  isLoading: true,
  isLoadingMore: false,
  error: null,
  nextCursor: null,
  hasMore: false,
};

const PAGE_SIZE = 30;

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
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [manualRefreshKey, setManualRefreshKey] = useState(0);
  const [galleryState, setGalleryState] = useState<GalleryState>(INITIAL_GALLERY_STATE);
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(() => new Set());
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const loadedImageIds = useMemo(
    () => galleryState.images.map((image) => image.id),
    [galleryState.images],
  );
  const selectedLoadedImageIds = useMemo(
    () => loadedImageIds.filter((imageId) => selectedImageIds.has(imageId)),
    [loadedImageIds, selectedImageIds],
  );
  const selectedCount = selectedLoadedImageIds.length;
  const hasLoadedImages = loadedImageIds.length > 0;
  const areAllLoadedImagesSelected =
    hasLoadedImages && selectedLoadedImageIds.length === loadedImageIds.length;

  useEffect(() => {
    const abortController = new AbortController();

    listImages({ limit: PAGE_SIZE, signal: abortController.signal })
      .then((result) => {
        setGalleryState({
          images: result.images,
          isLoading: false,
          isLoadingMore: false,
          error: null,
          nextCursor: result.page.nextCursor,
          hasMore: result.page.hasMore,
        });
      })
      .catch((error: unknown) => {
        if (abortController.signal.aborted) {
          return;
        }

        setGalleryState({
          images: [],
          isLoading: false,
          isLoadingMore: false,
          error: error instanceof Error ? error.message : "Images could not be loaded",
          nextCursor: null,
          hasMore: false,
        });
      });

    return () => {
      abortController.abort();
    };
  }, [refreshKey, manualRefreshKey]);

  const loadNextPage = useCallback(async () => {
    if (
      galleryState.nextCursor === null ||
      !galleryState.hasMore ||
      galleryState.isLoading ||
      galleryState.isLoadingMore
    ) {
      return;
    }

    const cursor = galleryState.nextCursor;

    setGalleryState((currentState) => ({
      ...currentState,
      isLoadingMore: true,
      error: null,
    }));

    try {
      const result = await listImages({ limit: PAGE_SIZE, cursor });

      setGalleryState((currentState) => {
        const existingIds = new Set(currentState.images.map((image) => image.id));
        const nextImages = result.images.filter((image) => !existingIds.has(image.id));

        return {
          ...currentState,
          images: [...currentState.images, ...nextImages],
          isLoadingMore: false,
          error: null,
          nextCursor: result.page.nextCursor,
          hasMore: result.page.hasMore,
        };
      });
    } catch (error) {
      setGalleryState((currentState) => ({
        ...currentState,
        isLoadingMore: false,
        error: error instanceof Error ? error.message : "Images could not be loaded",
      }));
    }
  }, [
    galleryState.hasMore,
    galleryState.isLoading,
    galleryState.isLoadingMore,
    galleryState.nextCursor,
  ]);

  useEffect(() => {
    const sentinel = sentinelRef.current;

    if (
      sentinel === null ||
      !galleryState.hasMore ||
      galleryState.nextCursor === null ||
      galleryState.isLoading ||
      galleryState.isLoadingMore
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadNextPage();
        }
      },
      {
        rootMargin: "600px 0px",
      },
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [
    galleryState.hasMore,
    galleryState.isLoading,
    galleryState.isLoadingMore,
    galleryState.nextCursor,
    loadNextPage,
  ]);

  const toggleImageSelection = useCallback((imageId: string) => {
    setSelectedImageIds((currentImageIds) => {
      const nextImageIds = new Set(currentImageIds);

      if (nextImageIds.has(imageId)) {
        nextImageIds.delete(imageId);
      } else {
        nextImageIds.add(imageId);
      }

      return nextImageIds;
    });
  }, []);

  const selectAllLoadedImages = useCallback(() => {
    setSelectedImageIds((currentImageIds) => {
      const nextImageIds = new Set(currentImageIds);

      for (const imageId of loadedImageIds) {
        nextImageIds.add(imageId);
      }

      return nextImageIds;
    });
  }, [loadedImageIds]);

  const clearSelection = useCallback(() => {
    setSelectedImageIds(new Set());
  }, []);

  const handleDownloadSelected = useCallback(async () => {
    if (selectedLoadedImageIds.length === 0 || isDownloading) {
      return;
    }

    setIsDownloading(true);
    setDownloadError(null);

    try {
      const { blob, filename } = await downloadImagesAsZip({
        imageIds: selectedLoadedImageIds,
      });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = objectUrl;
      link.download = filename;
      link.rel = "noopener";
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setDownloadError(
        error instanceof Error ? error.message : "Selected images could not be downloaded",
      );
    } finally {
      setIsDownloading(false);
    }
  }, [isDownloading, selectedLoadedImageIds]);

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
                void handleDownloadSelected();
              }}
            >
              {isDownloading ? "Downloading..." : "Download selected as zip"}
            </button>
            <button
              className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
              disabled={galleryState.isLoading}
              onClick={() => {
                setGalleryState((currentState) => ({
                  ...currentState,
                  isLoading: true,
                  isLoadingMore: false,
                  error: null,
                  nextCursor: null,
                  hasMore: false,
                }));
                setManualRefreshKey((value) => value + 1);
              }}
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
