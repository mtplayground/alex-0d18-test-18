import { useState } from "react";
import { GalleryGrid } from "../features/gallery/GalleryGrid";
import { ImageUploadPanel } from "../features/upload/ImageUploadPanel";

export function App() {
  const [galleryRefreshKey, setGalleryRefreshKey] = useState(0);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <ImageUploadPanel onUploadComplete={() => setGalleryRefreshKey((value) => value + 1)} />
      <GalleryGrid refreshKey={galleryRefreshKey} />
    </main>
  );
}
