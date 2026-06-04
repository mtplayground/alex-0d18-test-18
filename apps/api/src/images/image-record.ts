export interface ImageDimensions {
  width: number;
  height: number;
}

export interface ImageRecord {
  id: string;
  filename: string;
  storageKey: string;
  contentType: string;
  size: number;
  dimensions: ImageDimensions;
  uploadedAt: Date;
}
