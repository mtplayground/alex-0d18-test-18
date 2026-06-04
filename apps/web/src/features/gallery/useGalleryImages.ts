import { useCallback, useEffect, useRef, useState } from "react";
import { listImages } from "../../lib/api/listImages";
import type { UploadedImageResponse } from "../../lib/api/uploadImages";

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

export function useGalleryImages(refreshKey: number) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [manualRefreshKey, setManualRefreshKey] = useState(0);
  const [galleryState, setGalleryState] = useState<GalleryState>(INITIAL_GALLERY_STATE);

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

  const refreshGallery = useCallback(() => {
    setGalleryState((currentState) => ({
      ...currentState,
      isLoading: true,
      isLoadingMore: false,
      error: null,
      nextCursor: null,
      hasMore: false,
    }));
    setManualRefreshKey((value) => value + 1);
  }, []);

  return {
    galleryState,
    refreshGallery,
    sentinelRef,
  };
}
