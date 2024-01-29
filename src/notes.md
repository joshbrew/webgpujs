
### HOW I AM ADDING FUNCTIONALITY

First: what is it I want to add compatibility for?

Second: Look for relevant transpilation operations in the transpiler.ts,

Third: Paste to GPT and ask it to enhance the regex and replacing functions (you will want to look at the ast generators in the parse function and the generateDataStructures and generateMainFunctionWorkGroup functions)

Fourth: Update anything in shader.ts as well related (again just search relevant WebGPU API calls you know need to be adjusted)

And that's pretty much it but I am still reorganizing this stuff slowly so it's a little more modular and easy to tackle. Of course, as context sizes expand we might just be able to dump this entire library to an AI and have it rework it soon haha.


### Generalizing VBO inputs


Here are random plain bindings we've created good formats for:
```wgsl
         //Bindings (data passed to/from CPU) 
struct InputDataStruct {
    values: array<f32>
};

@group(0) @binding(0)
var<storage, read_write> inputData: InputDataStruct;

struct OutputDataStruct {
    values: array<f32>
};

@group(0) @binding(1)
var<storage, read_write> outputData: OutputDataStruct;

struct Outp6Struct {
    values: array<vec2<i32>>
};

@group(0) @binding(3)
var<storage, read> outp6: Outp6Struct;

struct DefaultUniforms {
    resX: f32,
};

@group(0) @binding(4) var<uniform> defaults: DefaultUniforms;

struct UniformsStruct {
    outp3: mat2x2<f32>,
    outp4: i32,
    outp5: vec3<i32>,
};

@group(0) @binding(2) var<uniform> uniforms: UniformsStruct;

```

These structs are declared by defining whether inputs are arrays or otherwise variables. However, we need to allow for generic structs too somehow. Also, we need to be able to specify @location vbos for vertex and fragment shaders.


And the VBO struct that we treat as a single input object and transpile like pixel.vertex etc.
```wgsl

struct Vertex {
    
    @builtin(position) position: vec4<f32>, //pixel location
    //uploaded vertices from CPU, in interleaved format

    @location(0) vertex: vec4<f32>,
    @location(1) color: vec4<f32>, 
    @location(2) uv: vec2<f32>,
    @location(3) normal: vec3<f32>
};

@vertex
fn vtx_main(
    @builtin(vertex_index) vertexIndex : u32,   //current vertex
    @builtin(instance_index) instanceIndex: u32, //current instance
    @location(0) vertexIn: vec4<f32>, 
    @location(1) colorIn: vec4<f32>,
    @location(2) uvIn: vec2<f32>,
    @location(3) normalIn: vec3<f32>
) -> Vertex {
    var pixel: Vertex;
    pixel.color = cols[vertexIndex];
    pixel.position = vec4f(tri[vertexIndex], 0, 1);
    return pixel; 

}



```

Here is the fragment shader:

```wgsl

struct Vertex {
    
    @builtin(position) position: vec4<f32>, //pixel location
    //uploaded vertices from CPU, in interleaved format

    @location(0) vertex: vec4<f32>,
    @location(1) color: vec4<f32>, 
    @location(2) uv: vec2<f32>,
    @location(3) normal: vec3<f32>
};

@fragment
fn frag_main(
    pixel: Vertex,
    @builtin(front_facing) is_front: bool,   //true when current fragment is on front-facing primitive
    @builtin(sample_index) sampleIndex: u32, //sample index for the current fragment
    @builtin(sample_mask) sampleMask: u32   //contains a bitmask indicating which samples in this fragment are covered by the primitive being rendered
) -> @location(0) vec4<f32> {
    return pixel.color;
}

```


We should allow for arbitrary locations, variable names, and types.

We could do this like 

```js

let vboSpec = {
    0:{ name:'vertex', type:'vec4f'  },
    1:{ name:'color',  type: 'vec4f'  },
    2:{ name:'uv',     type:'vec2f'  },
    3:{ name:'normal', type:'vec3f'  }
};

```

or maybe

```js

let vboSpec = {
    vertex:'vec4f',
    color: 'vec4f',
    uv:    'vec2f',
    normal:'vec3f'
}

//or

let vboSpec = {
    vertex:{ location:0, type:'vec4f'  },
    color: { location:1, type:'vec4f'  },
    uv:    { location:2, type:'vec2f'  },
    normal:{ location:3, type:'vec3f'  }
};

```
We could offer multiple configuration objects and just end up with 1, since manipulating objects is cheap in JS and it's all about just trying to appeal to different sets of eyeballs who can wrassle different levels of logic complexity. Too verbose and it's not beginner friendly, too minimal and it's useless. Ideally we keep all the function pushed as closely to some minimal progressive framework as possible. It just keeps the complexity hidden but otherwise just there in the box for you to find.


And we could use the order of the keys to set the locations for the simple case, and just handle this under the hood, but we should consider customization from plain shader logic as well so the first or third option is more general. We just need to look at this all next to each other with the variable typing.

Based on the vbo spec, the transpiler should be modified to insert e.g. pixel.customvbo, then we should keep a data structure for mapping inputted vbos by their types into the vertex buffers.

We have these mappings for variable formats to vertexformats and vise versa

```js


const wgslTypeSizes32 = {
    'bool': { alignment: 1, size: 1 },
    'u8': { alignment: 1, size: 1 },
    'i8': { alignment: 1, size: 1 },
    'i32': { alignment: 4, size: 4, vertexFormats: { "sint32": true } },
    'u32': { alignment: 4, size: 4, vertexFormats: { "uint32": true } },
    'f32': { alignment: 4, size: 4, vertexFormats: { "float32": true } },
    'i64': { alignment: 8, size: 8 },
    'u64': { alignment: 8, size: 8 },
    'f64': { alignment: 8, size: 8 },
    'atomic': { alignment: 4, size: 4 },
    'vec2<i32>': { alignment: 8, size: 8, vertexFormats: { "sint8x2": true, "sint16x2": true, "sint32x2": true } },
    'vec2<u32>': { alignment: 8, size: 8, vertexFormats: { "uint8x2": true, "uint16x2": true, "uint32x2": true } },
    'vec2<f32>': { alignment: 8, size: 8, vertexFormats: { "unorm8x2": true, "unorm16x2": true, "float32x2": true, "snorm8x2": true, "snorm16x2": true } },
    'vec3<i32>': { alignment: 16, size: 12, vertexFormats: { "sint32x3": true } },
    'vec3<u32>': { alignment: 16, size: 12, vertexFormats: { "uint32x3": true } },
    'vec3<f32>': { alignment: 16, size: 12, vertexFormats: { "float32x3": true } },
    'vec4<i32>': { alignment: 16, size: 16, vertexFormats: { "sint8x4": true, "sint16x4": true, "sint32x4": true } },
    'vec4<u32>': { alignment: 16, size: 16, vertexFormats: { "uint8x4": true, "uint16x4": true, "uint32x4": true } },
    'vec4<f32>': { alignment: 16, size: 16, vertexFormats: { "unorm8x4": true, "unorm16x4": true, "float32x4": true, "snorm8x4": true, "snorm16x4": true, "float16x4": true } },
    'mat2x2<f32>': { alignment: 8, size: 16 },
    'mat2x2<i32>': { alignment: 8, size: 16 },
    'mat2x2<u32>': { alignment: 8, size: 16 },
    'mat3x2<f32>': { alignment: 8, size: 24 },
    'mat3x2<i32>': { alignment: 8, size: 24 },
    'mat3x2<u32>': { alignment: 8, size: 24 },
    'mat4x2<f32>': { alignment: 8, size: 32 },
    'mat4x2<i32>': { alignment: 8, size: 32 },
    'mat4x2<u32>': { alignment: 8, size: 32 },
    'mat2x3<f32>': { alignment: 16, size: 32 },
    'mat2x3<i32>': { alignment: 16, size: 32 },
    'mat2x3<u32>': { alignment: 16, size: 32 },
    'mat3x3<f32>': { alignment: 16, size: 48 },
    'mat3x3<i32>': { alignment: 16, size: 48 },
    'mat3x3<u32>': { alignment: 16, size: 48 },
    'mat4x3<f32>': { alignment: 16, size: 64 },
    'mat4x3<i32>': { alignment: 16, size: 64 },
    'mat4x3<u32>': { alignment: 16, size: 64 },
    'mat2x4<f32>': { alignment: 16, size: 32 },
    'mat2x4<i32>': { alignment: 16, size: 32 },
    'mat2x4<u32>': { alignment: 16, size: 32 },
    'mat3x4<f32>': { alignment: 16, size: 48 },
    'mat3x4<i32>': { alignment: 16, size: 48 },
    'mat3x4<u32>': { alignment: 16, size: 48 },
    'mat4x4<f32>': { alignment: 16, size: 64 },
    'mat4x4<i32>': { alignment: 16, size: 64 },
    'mat4x4<u32>': { alignment: 16, size: 64 },
};

const wgslTypeSizes16 = {
    'i16': { alignment: 2, size: 2 },
    'u16': { alignment: 2, size: 2 },
    'f16': { alignment: 2, size: 2, vertexFormats: { "float16x2": true, "float16x4": true } },
    'vec2<f16>': { alignment: 4, size: 4, vertexFormats: { "float16x2": true } },
    'vec2<i16>': { alignment: 4, size: 4 },
    'vec2<u16>': { alignment: 4, size: 4 },
    'vec3<f16>': { alignment: 8, size: 6 },
    'vec3<i16>': { alignment: 8, size: 6 },
    'vec3<u16>': { alignment: 8, size: 6 },
    'vec4<f16>': { alignment: 8, size: 8, vertexFormats: { "float16x4": true } },
    'vec4<i16>': { alignment: 8, size: 8 },
    'vec4<u16>': { alignment: 8, size: 8 },
    'mat2x2<f16>': { alignment: 4, size: 8 },
    'mat2x2<i16>': { alignment: 4, size: 8 },
    'mat2x2<u16>': { alignment: 4, size: 8 },
    'mat3x2<f16>': { alignment: 4, size: 12 },
    'mat3x2<i16>': { alignment: 4, size: 12 },
    'mat3x2<u16>': { alignment: 4, size: 12 },
    'mat4x2<f16>': { alignment: 4, size: 16 },
    'mat4x2<i16>': { alignment: 4, size: 16 },
    'mat4x2<u16>': { alignment: 4, size: 16 },
    'mat2x3<f16>': { alignment: 8, size: 16 },
    'mat2x3<i16>': { alignment: 8, size: 16 },
    'mat2x3<u16>': { alignment: 8, size: 16 },
    'mat3x3<f16>': { alignment: 8, size: 24 },
    'mat3x3<i16>': { alignment: 8, size: 24 },
    'mat3x3<u16>': { alignment: 8, size: 24 },
    'mat4x3<f16>': { alignment: 8, size: 32 },
    'mat4x3<i16>': { alignment: 8, size: 32 },
    'mat4x3<u16>': { alignment: 8, size: 32 },
    'mat2x4<f16>': { alignment: 8, size: 16 },
    'mat2x4<i16>': { alignment: 8, size: 16 },
    'mat2x4<u16>': { alignment: 8, size: 16 },
    'mat3x4<f16>': { alignment: 8, size: 24 },
    'mat3x4<i16>': { alignment: 8, size: 24 },
    'mat3x4<u16>': { alignment: 8, size: 24 },
    'mat4x4<f16>': { alignment: 8, size: 32 },
    'mat4x4<i16>': { alignment: 8, size: 32 },
    'mat4x4<u16>': { alignment: 8, size: 32 }
};

export const vertexFormats = {
    "uint8x2": { byteSize: 2, wgslTypes: { "vec2<u32>": true, "vec2u": true } },
    "uint8x4": { byteSize: 4, wgslTypes: { "vec4<u32>": true, "vec4u": true } },
    "sint8x2": { byteSize: 2, wgslTypes: { "vec2<i32>": true, "vec2i": true } },
    "sint8x4": { byteSize: 4, wgslTypes: { "vec4<i32>": true, "vec4i": true } },
    "unorm8x2": { byteSize: 2, wgslTypes: { "vec2<f32>": true, "vec2f": true } },
    "unorm8x4": { byteSize: 4, wgslTypes: { "vec4<f32>": true, "vec4f": true } },
    "snorm8x2": { byteSize: 2, wgslTypes: { "vec2<f32>": true, "vec2f": true } },
    "snorm8x4": { byteSize: 4, wgslTypes: { "vec4<f32>": true, "vec4f": true } },
    "uint16x2": { byteSize: 4, wgslTypes: { "vec2<u32>": true, "vec2u": true } },
    "uint16x4": { byteSize: 8, wgslTypes: { "vec4<u32>": true, "vec4u": true } },
    "sint16x2": { byteSize: 4, wgslTypes: { "vec2<i32>": true, "vec2i": true } },
    "sint16x4": { byteSize: 8, wgslTypes: { "vec4<i32>": true, "vec4i": true } },
    "unorm16x2": { byteSize: 4, wgslTypes: { "vec2<f32>": true, "vec2f": true } },
    "unorm16x4": { byteSize: 8, wgslTypes: { "vec4<f32>": true, "vec4f": true } },
    "snorm16x2": { byteSize: 4, wgslTypes: { "vec2<f32>": true, "vec2f": true } },
    "snorm16x4": { byteSize: 8, wgslTypes: { "vec4<f32>": true, "vec4f": true } },
    "float16x2": { byteSize: 4, wgslTypes: { "vec2<f16>": true, "vec2h": true } },
    "float16x4": { byteSize: 8, wgslTypes: { "vec4<f16>": true, "vec4h": true } },
    "float32": { byteSize: 4, wgslTypes: { "f32": true } },
    "float32x2": { byteSize: 8, wgslTypes: { "vec2<f32>": true, "vec2f": true } },
    "float32x3": { byteSize: 12, wgslTypes: { "vec3<f32>": true, "vec3f": true } },
    "float32x4": { byteSize: 16, wgslTypes: { "vec4<f32>": true, "vec4f": true } },
    "uint32": { byteSize: 4, wgslTypes: { "u32": true } },
    "uint32x2": { byteSize: 8, wgslTypes: { "vec2<u32>": true, "vec2u": true } },
    "uint32x3": { byteSize: 12, wgslTypes: { "vec3<u32>": true, "vec3u": true } },
    "uint32x4": { byteSize: 16, wgslTypes: { "vec4<u32>": true, "vec4u": true } },
    "sint32": { byteSize: 4, wgslTypes: { "i32": true } },
    "sint32x2": { byteSize: 8, wgslTypes: { "vec2<i32>": true, "vec2i": true } },
    "sint32x3": { byteSize: 12, wgslTypes: { "vec3<i32>": true, "vec3i": true } },
    "sint32x4": { byteSize: 16, wgslTypes: { "vec4<i32>": true, "vec4i": true } }
};


```

So we need to take our initial specifiers that should just function as variable overrides to tell the transpiler e.g. to add 'pixel.' to the front of chosen vertex buffer variables.

This has to be a specified setting when instantiating the pipeline, and for prewritten shader code we can use this to map arbirary vertexBuffer inputs more readily, where we'll have ShaderHelperInstance.vboTypes to refer to refer to when we call updateVBO 


### Structs?

Arbitary struct inputs are a little more tricky, how do we declare them? Classes seem like the best way, and we can use a function to identify if a function is a class constructor function (this is just how JS typeof responds)

e.g. 

```js

function fragExample() {
    
    class MyStruct {

        x = 'f32'
        y = 'f32'
        z = 'mat2x2<f32>'
        w = 'vec4f'
    }

    let instance = new MyStruct(3,4,mat2x2(vec2f(1,2),vec2f(3,4)),vec4f(0.3,0.4,0.5,1));

}


```

which should transpile to something like

```wgsl

struct MyStruct {
    x: f32,
    y: f2,
    z: mat2x2<f32>,
    w: vec4f
}


@fragment
fn frag(
    ...
)-> @location(0) vec4<f32> {
    let instance = MyStruct(3,4,mat2x2(vec2f(1,2),vec2f(3,4)),vec4f(0.3,0.4,0.5,1));

    //e.g. return an instance value as a color value
    return instance.w;
}

```

We may be able to also define input types as structs and then map object values inputted into a uniform buffer, 
which right now we just generically bundle arrays in their own standalone structs or lump all non-arrays into uniforms.