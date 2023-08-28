import { WebGPUjs } from "./webgpujs.js";


function dft(
    inputData = new Float32Array(), 
    outputData = [], 
    //dummy inputs
    outp3 = mat2x2(vec2(1.0,1.0),vec2(1.0,1.0)), //approximate data structure wrappers will infer float or int from decimal usage
    outp4 = 4,
    outp5 = vec3(1,2,3),
    outp6 = [vec2(1.0,1.0)],
    tex1 = [255,255,255,1] //rgba uint8 texture
) {

    function add(a=vec2f(0.0,0.0),b=vec2f(0.0,0.0)) { //transpiled out of main body
        return a + b;
    }

    let x = new Float32Array(32); //float32 array<f32, 32> (default)
    let x2 = new Array(32).fill(1); //array<i32, 32> array (no decimal)
    let x3 = [1,2,3]; // array<i32, 3>
    let x4 = new Array(100).fill(vec3(0,0,0)) //array<vec3<i32>, 100>
    let x5 = new Array(100).fill(mat2x2(vec2(1,1),vec2(1,1)));
    //let x6 = new Array(inputData.length).fill(0.0) //cannot dynamically size const arrays

    const N = i32(inputData.length);
    const k = threadId.x;
    let sum = vec2f(0.0, 0.0); //will be replaced with var

    var sum2 = add(sum,sum);

    let y = resX;

    const b = 3 + outp4;

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
    let v = 2
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

function setupWebGPUConverterUI(fn, target=document.body, shaderType) {
    const parser = new WebGPUjs();
    let webGPUCode = parser.convertToWebGPU(dft, shaderType);
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
        webGPUCode = parser.convertToWebGPU(fstr, shaderType);
        document.getElementById(afterTextAreaID).value = webGPUCode.code;
    }

    // Initial population of the 'after' textarea
    parseFunction();

    document.getElementById(beforeTextAreaID).oninput = () => {
        parseFunction();
    };

    return uniqueID;
}

let ex1Id = setupWebGPUConverterUI(dft, document.getElementById('ex1'));

console.time('createComputePipeline');
WebGPUjs.createPipeline(dft).then(pipeline => {
    console.timeEnd('createComputePipeline');
    // Create some sample input data
    const len = 256;
    const inputData = new Float32Array(len).fill(1.0); // Example data
    const outputData = new Float32Array(len*2).fill(0); //only need to upload once
    //console.log(pipeline);
    // Run the process method to execute the shader
    
    console.time('runDFT');
    pipeline.process(inputData,outputData).then(result => {
        console.timeEnd('runDFT');
        console.log(result); // Log the output
        if(result[2]?.buffer) { //we returned the uniform buffer for some reason, double check alignments
            console.log(
                new DataView(result[2].buffer).getInt32(16,true) // the int32 is still correctly encoded
            )
        }

        console.time('addFunction');
        pipeline.addFunction(function mul(a=vec2f(2,0),b=vec2f(2,0)) { return a * b; }).then((p) => {
            console.timeEnd('addFunction');
            console.log(p);
            document.getElementById('t1_'+ex1Id).value = p.compute.code;
        });

    });
});


const dftReference = `
                
struct InputData {
    values : array<f32>
}

struct OutputData {
    values: array<f32>
}

@group(0) @binding(0)
var<storage, read> inputData: InputData;

@group(0) @binding(1)
var<storage, read_write> outputData: OutputData;

@compute @workgroup_size(256)
fn main(
    @builtin(global_invocation_id) threadId: vec3<u32>
) {
    let N = arrayLength(&inputData.values);
    let k = threadId.x;
    var sum = vec2<f32>(0.0, 0.0);

    for (var n = 0u; n < N; n = n + 1u) {
        let phase = 2.0 * 3.14159265359 * f32(k) * f32(n) / f32(N);
        sum = sum + vec2<f32>(
            inputData.values[n] * cos(phase),
            -inputData.values[n] * sin(phase)
        );
    }

    let outputIndex = k * 2;
    if (outputIndex + 1 < arrayLength(&outputData.values)) {
        outputData.values[outputIndex] = sum.x;
        outputData.values[outputIndex + 1] = sum.y;
    }
}

`





function matrixMultiply(
    matrixA = [vec4(1,0,0,0), vec4(0,1,0,0), vec4(0,0,1,0), vec4(0,0,0,1)],
    matrixB = [vec4(1,0,0,0), vec4(0,1,0,0), vec4(0,0,1,0), vec4(0,0,0,1)]
) {
    const row = threadId.x;
    const col = threadId.y;
    
    let sum = 0.0;
    for (let i = 0; i < matrixA.length; i++) {
        sum += matrixA[row][i] * matrixB[i][col];
    }
    matrixA[row *  + col] = sum;

    return matrixA
}




function vertexExample() {
    let tri = array(
        vec2f( 0.0,  0.5),  
        vec2f(-0.5, -0.5),  
        vec2f( 0.5, -0.5)   
    );

    var cols = [
        vec4f(1, 0, 0, 1), 
        vec4f(0, 1, 0, 1), 
        vec4f(0, 0, 1, 1) 
    ];

    position = vec4f(tri[vertexIndex], 0.0, 1.0);
}

function fragmentExample() {
    return color;
}

let canvas = document.createElement('canvas');
canvas.width = 800; canvas.height = 600;

document.getElementById('ex2').appendChild(canvas);

let ex12Id1 = setupWebGPUConverterUI(vertexExample, document.getElementById('ex2'), 'vertex');
let ex12Id2 = setupWebGPUConverterUI(fragmentExample, document.getElementById('ex2'), 'fragment');
console.time('createRenderPipeline and render triangle');
WebGPUjs.createPipeline({
    vertex:vertexExample,
    fragment:fragmentExample
},{
    canvas,
    renderOptions:{
        vertexCount:3,
        vbos:[
            {
                colors:new Array(3*4).fill(0)
            }
        ]
    }
}).then(pipeline => {
    console.timeEnd('createRenderPipeline and render triangle');
    //should have rendered
});
