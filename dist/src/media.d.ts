/** Intrinsic image/frame dimensions; video CSS width and height do not describe decoded frames. */
export declare function getMediaDimensions(source: GPUCopyExternalImageSource): {
    width: number;
    height: number;
};
/** Detect browser media without requiring those constructors in Node or worker environments. */
export declare function isMediaSource(value: any): value is GPUCopyExternalImageSource;
