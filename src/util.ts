
export function isTypedArray(x) { //https://stackoverflow.com/a/40319428
    return (ArrayBuffer.isView(x) && Object.prototype.toString.call(x) !== "[object DataView]");
}

// Utility function to convert a float to a half-precision float
export function floatToHalf(float32:number) {
    const float32View = new Float32Array(1);
    const int32View = new Int32Array(float32View.buffer);

    // Set the float32 using the Float32Array view
    float32View[0] = float32;

    // Get the binary representation using the Int32Array view
    const f = int32View[0];

    // Extract the sign, exponent, and mantissa
    const sign = (f >>> 31) * 0x8000;
    const exponent = ((f >>> 23) & 0xFF) - 127;
    const mantissa = f & 0x7FFFFF;

    if (exponent === 128) {
        // Infinity or NaN
        return sign | 0x7C00 | ((mantissa ? 1 : 0) * (mantissa >> 13));
    }

    // Check if the number is too small for a normalized half-float
    if (exponent < -14) {
        // Too small, make it a zero
        return sign;
    }

    // Handle numbers that don't fit in 16 bits
    if (exponent > 15) {
        // Too large, make it infinity
        return sign | 0x7C00;
    }

    // Normalize the exponent
    const normalizedExponent = exponent + 15;

    // Convert the mantissa, dropping excess precision
    const normalizedMantissa = mantissa >> 13;

    // Reconstruct the half-float
    return sign | (normalizedExponent << 10) | normalizedMantissa;
}






export function flattenArray(arr) {
    let result = [] as any[];
    for (let i = 0; i < arr.length; i++) {
        if (Array.isArray(arr[i])) {
            result = result.concat(this.flattenArray(isTypedArray(arr[i]) ? Array.from(arr[i]) : arr[i]));
        } else {
            result.push(arr[i]);
        }
    }
    return result;
}

//we're just assuming that for the default frag/vertex we may want colors, positions, normals, or uvs. If you define your entire own shader pipeline then this can be ignored
export function combineVertices(
    vertices, //4d vec array
    colors,    //4d vec array
    uvs,        //2d vec array
    normals   //3d vec array
) {
    let length = 0;
    if(colors) length = colors.length / 4; 
    if (vertices?.length/4 > length) length = vertices.length / 4;
    if (normals?.length/3 > length) length = normals.length / 3;
    if (uvs?.length/2 > length) length = uvs.length / 2;
    const vertexCount = length;
    const interleavedVertices = new Float32Array(vertexCount * 13); // 13 values per vertex (we are just assuming you might want all 4 per object)

    for (let i = 0; i < vertexCount; i++) {
        const posOffset = i * 4;
        const colOffset = i * 4;
        const norOffset = i * 3;
        const uvOffset = i * 2;
        const interleavedOffset = i * 13;

        interleavedVertices[interleavedOffset] =  vertices ? vertices[posOffset] || 0 : 0;
        interleavedVertices[interleavedOffset + 1] =  vertices ? vertices[posOffset + 1] || 0 : 0;
        interleavedVertices[interleavedOffset + 2] =  vertices ? vertices[posOffset + 2] || 0 : 0;
        interleavedVertices[interleavedOffset + 3] =  vertices ? vertices[posOffset + 3] || 0 : 0;

        interleavedVertices[interleavedOffset + 4] =      colors ? colors[colOffset] || 0 : 0;
        interleavedVertices[interleavedOffset + 5] =  colors ? colors[colOffset + 1] || 0 : 0;
        interleavedVertices[interleavedOffset + 6] =  colors ? colors[colOffset + 2] || 0 : 0;
        interleavedVertices[interleavedOffset + 7] =  colors ? colors[colOffset + 3] || 0 : 0;

        interleavedVertices[interleavedOffset + 8] = uvs ? uvs[uvOffset] || 0 : 0;
        interleavedVertices[interleavedOffset + 9] = uvs ? uvs[uvOffset + 1] || 0 : 0;

        interleavedVertices[interleavedOffset + 10] =  normals ? normals[norOffset] || 0 : 0;
        interleavedVertices[interleavedOffset + 11] =  normals ? normals[norOffset + 1] || 0 : 0;
        interleavedVertices[interleavedOffset + 12] = normals ? normals[norOffset + 2] || 0 : 0;
    }

    return interleavedVertices;
}

export function splitVertices(interleavedVertices) {
    const vertexCount = interleavedVertices.length / 13;  // 13 values per vertex (we are just assuming you might want all 4 per object)

    // Pre-allocating space
    const colors = new Float32Array(vertexCount * 4);
    const vertices = new Float32Array(vertexCount * 4);
    const normal = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);

    for (let i = 0; i < vertexCount; i++) {
        const posOffset = i * 4;
        const colOffset = i * 4;
        const norOffset = i * 3;
        const uvOffset = i * 2;
        const offset = i * 13;

        vertices[posOffset] = interleavedVertices[offset];
        vertices[posOffset + 1] = interleavedVertices[offset + 1];
        vertices[posOffset + 2] = interleavedVertices[offset + 2];
        vertices[posOffset + 3] = interleavedVertices[offset + 3];

        colors[colOffset] = interleavedVertices[offset + 4];
        colors[colOffset + 1] = interleavedVertices[offset + 5];
        colors[colOffset + 2] = interleavedVertices[offset + 7];
        colors[colOffset + 3] = interleavedVertices[offset + 8];

        uvs[uvOffset] = interleavedVertices[offset + 8];
        uvs[uvOffset + 1] = interleavedVertices[offset + 9];

        normal[norOffset] = interleavedVertices[offset + 10];
        normal[norOffset + 1] = interleavedVertices[offset + 11];
        normal[norOffset + 2] = interleavedVertices[offset + 12];
    }

    return {
        vertices,
        colors,
        normal,
        uvs
    };
}


   