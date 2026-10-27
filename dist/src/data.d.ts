export declare const roundUp: (value: number, alignment: number) => number;
export declare function typeLayout(input: string): {
    type: string;
    size: number;
    alignment: number;
    columns?: number;
    rows?: number;
    scalar?: string;
};
export declare function uniformLayout(fields: {
    name: string;
    type: string;
    align?: number;
    size?: number;
}[]): {
    entries: {
        type: string;
        columns?: number;
        rows?: number;
        scalar?: string;
        name: string;
        align?: number;
        alignment: number;
        size: number;
        offset: number;
    }[];
    size: number;
};
export declare function writeValue(view: DataView, offset: number, type: string, input: any, half: (n: number) => number): void;
export declare function storageElementLayout(type: string): {
    type: string;
    size: number;
    alignment: number;
    columns?: number;
    rows?: number;
    scalar?: string;
    bytes: number;
    components: number;
    stride: number;
};
export declare function unpackStorageBytes(bytes: Uint8Array<ArrayBuffer>, type: string): Uint8Array<ArrayBuffer>;
export declare function storageData(data: any, type: string): ArrayBufferView;
export declare function texelBytes(format: string): number;
export declare function isGPUBuffer(value: any): value is GPUBuffer;
