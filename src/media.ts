/** Intrinsic image/frame dimensions; video CSS width and height do not describe decoded frames. */
export function getMediaDimensions(source: GPUCopyExternalImageSource) {
  const media = source as GPUCopyExternalImageSource & {
    width?: number;
    height?: number;
    videoWidth?: number;
    videoHeight?: number;
    naturalWidth?: number;
    naturalHeight?: number;
    displayWidth?: number;
    displayHeight?: number;
  };
  return {
    width:
      media.videoWidth ??
      media.naturalWidth ??
      media.displayWidth ??
      media.width ??
      0,
    height:
      media.videoHeight ??
      media.naturalHeight ??
      media.displayHeight ??
      media.height ??
      0,
  };
}

/** Detect browser media without requiring those constructors in Node or worker environments. */
export function isMediaSource(value: any): value is GPUCopyExternalImageSource {
  if (!value || typeof value !== "object") return false;
  return [
    "ImageBitmap",
    "ImageData",
    "HTMLImageElement",
    "HTMLVideoElement",
    "HTMLCanvasElement",
    "OffscreenCanvas",
    "VideoFrame",
  ].some(
    (name) =>
      typeof globalThis[name] === "function" &&
      value instanceof globalThis[name],
  );
}
