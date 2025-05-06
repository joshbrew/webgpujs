export declare function isTypedArray(x: any): boolean;
export declare function floatToHalf(float32: number): number;
export declare function flattenArray(arr: any): any[];
export declare function combineVertices(vertices: any, //4d vec array
colors: any, //4d vec array
uvs: any, //2d vec array
normals: any): Float32Array<ArrayBuffer>;
export declare function splitVertices(interleavedVertices: any): {
    vertices: Float32Array<ArrayBuffer>;
    colors: Float32Array<ArrayBuffer>;
    normal: Float32Array<ArrayBuffer>;
    uvs: Float32Array<ArrayBuffer>;
};
