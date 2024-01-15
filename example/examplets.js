import { WebGPUjs } from "../src/pipeline";
import { WGSLTranspiler } from "../src/transpiler";

import { cubeVertices, cubeIndices } from "./exampleCube";
import { mat4 as m4, vec3 as v3 } from 'wgpu-matrix' //they'll transform the dummy functions on the bundle step if not renamed

//dft is an O(n^2) example, plus a bunch of other nonsense just to test the transpiler out, we'll do this proper soon
function dft(
    inputData = new Float32Array(), 
    outputData = [], 
    //dummy inputs
    outp3 = mat2x2(vec2(1.0,1.0),vec2(1.0,1.0)), //approximate data structure wrappers will infer float or int from decimal usage
    outp4 = "i32",
    outp5 = vec3(1,2,3),
    outp6 = [vec2(1.0,1.0)]
) {

    function add(a=vec2f(0.0,0.0),b=vec2f(0.0,0.0)) { //transpiled out of main body
        return a + b;
    }

    let x = new Float32Array(32); //float32 array<f32, 32> (default)
    let x2 = new Array(32).fill(inputData[0]); //array<i32, 32> array (no decimal)
    const x3 = [1,2,3]; // array<i32, 3>
    let x4 = new Array(100).fill(vec3(0,0,0)) //array<vec3<i32>, 100>
    let x5 = new Array(100).fill(mat2x2(vec2(1,1),vec2(1,1)));
    //let x6 = new Array(inputData.length).fill(0.0) //cannot dynamically size const arrays

    const N = i32(inputData.length);
    const k = threadId.x;
    let sum = vec2f(0.0, 0.0); //will be replaced with var

    var sum2 = add(sum,sum);

    let width = resX;

    const b = 3 + outp4;

    `const bb : array<f32, 5> = array(1,2,3,4,5)`; //write-in

    var M = mat4x4(
        vec4f(1.0,0.0,0.0,0.0),
        vec4f(0.0,1.0,0.0,0.0),
        vec4f(0.0,0.0,1.0,0.0),
        vec4f(0.0,0.0,0.0,1.0)
    ); //identity matrix

    let D = M + M;

    var Z = outp3 * mat2x2(vec2f(4.0,-1.0),vec2f(3.0,2.0));

    var Zz = outp5 + vec3(4,5,6);

    for (let n = 0; n < N; n++) {
        const phase = 2.0 * Math.PI * f32(k) * f32(n) / f32(N);
        sum = sum + vec2f(
            inputData[n] * Math.cos(phase),
            -inputData[n] * Math.sin(phase)
        );
    }

    //you should always add semicolons to be in-spec with compute shaders but we will try to add them for you

    const outputIndex = k * 2 //use strict
    if (outputIndex + 1 < outputData.length) {
        outputData[outputIndex] = sum.x;
        outputData[outputIndex + 1] = sum.y;
    }

    
    return [inputData, outputData]; //returning an array of inputs lets us return several buffer promises
    //return outputData;
    //return outp4; //we can also return the uniform buffer though it is immutable so it's pointless
}

//explicit return statements will define only that variable as an output (i.e. a mutable read_write buffer)

function setupWebGPUConverterUI(fn, target=document.body, shaderType, lastBinding) {
    let webGPUCode = WGSLTranspiler.convertToWebGPU(fn, shaderType,undefined,undefined,undefined,undefined,undefined,lastBinding);
    const uniqueID = Date.now();

    const beforeTextAreaID = `t2_${uniqueID}`;
    const afterTextAreaID = `t1_${uniqueID}`;

    target.style.backgroundColor = 'black';
    target.style.color = 'white';

    target.insertAdjacentHTML('beforeend', `
        <div style="display: flex; width: 100%;">
            <span style="flex: 1; padding: 10px;">
                Before (edit me!):<br>
                <textarea id="${beforeTextAreaID}" style="width:100%; background-color:#303000; color:lightblue; height:400px;">${fn.toString()}</textarea>
            </span>
            <span style="flex: 1; padding: 10px;">
                After:<br>
                <textarea id="${afterTextAreaID}" style="width:100%; background-color:#000020; color:lightblue; height:400px;">${webGPUCode.code}</textarea>
            </span>
        </div>
    `);

    function parseFunction() {
        const fstr = document.getElementById(beforeTextAreaID).value;
        webGPUCode = WGSLTranspiler.convertToWebGPU(fstr, shaderType);
        document.getElementById(afterTextAreaID).value = webGPUCode.code;
    }


    document.getElementById(beforeTextAreaID).oninput = () => {
        parseFunction();
    };
    return {uniqueID, webGPUCode};
}

let ex1Id = setupWebGPUConverterUI(dft, document.getElementById('ex1'), 'compute');

setTimeout(() => {     
console.time('createComputePipeline');
    WebGPUjs.createPipeline(dft).then(pipeline => {
        console.timeEnd('createComputePipeline');
        // Create some sample input data
        const len = 256;
        const inputData = new Float32Array(len).fill(1.0); // Example data
        const outputData = new Float32Array(len*2).fill(0); //only need to upload once if len is the same, dfts return real and imag for single vectors (unless we convert gpu-side)
        //console.log(pipeline);
        // Run the process method to execute the shader       
        console.log('Note: single threaded test');
        console.time('run DFT with initial buffering');
        pipeline.process(inputData, outputData, undefined, 4).then(result => {
            console.timeEnd('run DFT with initial buffering');
            console.log('Results can be multiple buffers:',result); // Log the output

            const inputData2 = new Float32Array(len).fill(2.0); // Example data, same length so outputData can be the same

            console.time('run DFT only updating inputData buffer values');
            pipeline.process(inputData2, undefined, undefined, 4).then((r2) => {
                console.timeEnd('run DFT only updating inputData buffer values');
                console.log('Result2:',r2); // Log the output

                const len2 = 1024;
                const inputData3 = new Float32Array(len2).fill(3.0); // Example data
                const outputData3 = new Float32Array(len2*2).fill(0); //only need to upload once if len is the same, dfts return real and imag for single vectors (unless we convert gpu-side)

                console.time('run DFT dynamically resizing inputData and outputData');
                pipeline.process(inputData3, outputData3, undefined, 4).then((r3) => {
                    console.timeEnd('run DFT dynamically resizing inputData and outputData');
                    console.log('Results can be dynamically resized:', r3); // Log the output
                    console.time('addFunction and recompile shader pipeline');
                    pipeline.addFunction(function mul(a=vec2f(2,0),b=vec2f(2,0)) { return a * b; })
                    console.timeEnd('addFunction and recompile shader pipeline');
                    console.log(pipeline);
                    document.getElementById('t1_'+ex1Id.uniqueID).value = pipeline.compute.code;
                
                });
            });
        });

    });

}, 1000);




function vertexExample() {
    const tri = array(
        vec2f( 0.0,  0.5),  
        vec2f(-0.5, -0.5),  
        vec2f( 0.5, -0.5)   
    );

    const cols = [
        vec4f(1, 0, 0, 1), 
        vec4f(0, 1, 0, 1), 
        vec4f(0, 0, 1, 1) 
    ];
    color = cols[vertexIndex];
    position = vec4f(tri[vertexIndex], 0.0, 1.0);
}

function fragmentExample() {
    return color;
}

let canvas = document.createElement('canvas');
canvas.width = 800; canvas.height = 600;

document.getElementById('ex2').appendChild(canvas);

let ex12Id1 = setupWebGPUConverterUI(vertexExample, document.getElementById('ex2'), 'vertex');
let ex12Id2 = setupWebGPUConverterUI(fragmentExample, document.getElementById('ex2'), 'fragment',ex12Id1.lastBinding);

setTimeout(() => {
    console.time('createRenderPipeline and render triangle');

    WebGPUjs.createPipeline({
        vertex:vertexExample,
        fragment:fragmentExample
    },{
        canvas,
        renderPass:{
            vertexCount:3,
            // vbos:[ //upload vbos, we'll also just fill a dummy vbo for you if none are provided
            //     { // pos vec4, color vec4, uv vec2, normal vec3
            //         //vertex
            //         color:new Array(3*4).fill(0)
            //         //uv
            //         //normal
            //     }
            // ],
        }
    }).then(pipeline => {
        console.timeEnd('createRenderPipeline and render triangle');
        console.log(pipeline);
        //should have rendered
    });
    
},500)




//texture https://webgpu.github.io/webgpu-samples/samples/texturedCube
function cubeExampleVert( 
    modelViewProjectionMatrix='mat4x4<f32>'
) {
    position = modelViewProjectionMatrix * vertexIn; //alternatively we could use a builtInUniform to transform the projection matrix with the timestamp increment
    uv = uvIn;
    vertex = 0.5 * (vertexIn + vec4f(1,1,1,1));
}

function cubeExampleFrag() {
    return textureSample(image, imgSampler, uv);
}

const createImageExample = async () => {
    const response = await fetch('./knucks.jpg');
    let data = await response.blob();
    console.log(data);
    const imageBitmap = await createImageBitmap(data);
    
    
    const numMipLevels = (...sizes) => {
        const maxSize = Math.max(...sizes);
        return 1 + Math.log2(maxSize) | 0;
    };
    
    
    const textureData = {
        source:imageBitmap,
        texture:{}, //overrides to texture settings //mipLevelCount:numMipLevels(imageBitmap.width, imageBitmap.height)
        layout:{flipY:true}
    }

    let canv2 = document.createElement('canvas'); 
    canv2.width = 800; canv2.height = 600;
    document.getElementById('ex3').appendChild(canv2);
    let ex3Id1 = setupWebGPUConverterUI(cubeExampleVert, document.getElementById('ex3'), 'vertex');
    let ex3Id2 = setupWebGPUConverterUI(cubeExampleFrag, document.getElementById('ex3'), 'fragment', ex3Id1.webGPUCode.lastBinding);
    

    const aspect = canv2.width / canv2.height;
    const projectionMatrix = m4.perspective(
        (2 * Math.PI) / 5,
        aspect,
        1,
        100.0
    );
    const modelViewProjectionMatrix = m4.create();

    function getTransformationMatrix() {
        const viewMatrix = m4.identity();
        m4.translate(viewMatrix, v3.fromValues(0, 0, -4), viewMatrix);
        const now = Date.now() / 1000;
        m4.rotate(
            viewMatrix,
            v3.fromValues(Math.sin(now), Math.cos(now), 0),
            1,
            viewMatrix
        );
        m4.multiply(projectionMatrix, viewMatrix, modelViewProjectionMatrix);
        return modelViewProjectionMatrix;
    } 
    let transformationMatrix = getTransformationMatrix();
    console.time('createRenderPipeline and render texture');
    WebGPUjs.createPipeline({
        vertex:cubeExampleVert,
        fragment:cubeExampleFrag
    },{
        canvas:canv2,
        renderPass:{ //tell it to make an initial render pass with these inputs
            vertexCount:cubeVertices.length/13,
            vbos:[ //we can upload vbos
                cubeVertices //the shader system will set the draw call count based on the number of rows (assumed to be position4,color4,uv2,normal3 or vertexCount = len/13) in the vertices of the first supplied vbo
            ],
            textures:{
                image:textureData //corresponds to the variable which is defined implicitly by usage with texture calls
            },
            // indexBuffer:cubeIndices,
            indexFormat:'uint16'
        },
        // bindings:{ //binding overrides (assigned to our custom-generated layout)
        //     image:{
        //         texture:{viewDimension:'2d', sampleType:'float'} 
        //     }
        // },
        //overrides for pipeline descriptor will be assigned so you can add or rewrite what you need over the defaults
        renderPipelineDescriptor:{ primitive: {topology:'triangle-list', cullMode:'back'}},
        //additional render or compute pass inputs (just the UBO update in this case)
        inputs:[transformationMatrix] //placeholder mat4 projection matrix (copy wgsl-matrix library example from webgpu samples)
    }).then(pipeline => {
        console.timeEnd('createRenderPipeline and render texture');
        console.log(pipeline);
        //should have rendered

        let now = performance.now();
        let fps = [];
        let fpsticker = document.getElementById('ex3fps');
        let anim = () => {
            let time = performance.now();
            let f = 1000/(time-now);
            fps.push(f);
            let frameTimeAvg = fps.reduce((a,b) => a+b)/(fps.length);
            //console.log(frameTimeAvg.toFixed(1));
            fpsticker.innerText = frameTimeAvg.toFixed(1);
            if(fps.length > 10) fps.shift();
            now = time;
            
            //update projection matrix then re-render
            transformationMatrix = getTransformationMatrix(); 
            pipeline.render({
                vertexCount:cubeVertices.length/13 // pos vec4, color vec4, uv vec2, normal vec3
            }, transformationMatrix);
            requestAnimationFrame(anim);
        }
        anim();
    });

}
//createImageExample
createImageExample();

//load texture data as unint8array or we can specify with _rgba8unorm etc
//set cubeVertices as the vbo







// const dftReference = `
                
// struct InputData {
//     values : array<f32>
// }

// struct OutputData {
//     values: array<f32>
// }

// @group(0) @binding(0)
// var<storage, read> inputData: InputData;

// @group(0) @binding(1)
// var<storage, read_write> outputData: OutputData;

// @compute @workgroup_size(256)
// fn main(
//     @builtin(global_invocation_id) threadId: vec3<u32>
// ) {
//     let N = arrayLength(&inputData.values);
//     let k = threadId.x;
//     var sum = vec2<f32>(0.0, 0.0);

//     for (var n = 0u; n < N; n = n + 1u) {
//         let phase = 2.0 * 3.14159265359 * f32(k) * f32(n) / f32(N);
//         sum = sum + vec2<f32>(
//             inputData.values[n] * cos(phase),
//             -inputData.values[n] * sin(phase)
//         );
//     }

//     let outputIndex = k * 2;
//     if (outputIndex + 1 < arrayLength(&outputData.values)) {
//         outputData.values[outputIndex] = sum.x;
//         outputData.values[outputIndex + 1] = sum.y;
//     }
// }

// `





// function matrixMultiply(
//     matrixA = [vec4(1,0,0,0), vec4(0,1,0,0), vec4(0,0,1,0), vec4(0,0,0,1)],
//     matrixB = [vec4(1,0,0,0), vec4(0,1,0,0), vec4(0,0,1,0), vec4(0,0,0,1)]
// ) {
//     const row = threadId.x;
//     const col = threadId.y;
    
//     let sum = 0.0;
//     for (let i = 0; i < matrixA.length; i++) {
//         sum += matrixA[row][i] * matrixB[i][col];
//     }
//     matrixA[row *  + col] = sum;

//     return matrixA
// }

