
const computeShader = `
//Bindings (data passed to/from CPU) 
struct ParticlesStruct {
    values: array<vec2f>
};

@group(0) @binding(0)
var<storage, read_write> particles: ParticlesStruct;

struct UniformsStruct {
    deltaT: f32,
    rule1Distance: f32,
    rule2Distance: f32,
    rule3Distance: f32,
    rule1Scale: f32,
    rule2Scale: f32,
    rule3Scale: f32,
};

@group(0) @binding(1) var<uniform> uniforms: UniformsStruct;



//Main function call
//threadId tells us what x,y,z thread we are on

@compute @workgroup_size(64)
fn compute_main(  
    @builtin(global_invocation_id) threadId: vec3<u32>, //shader grid position
    @builtin(local_invocation_id) localId: vec3<u32>,   //workgroup grid position
    @builtin(local_invocation_index) localIndex: u32,   //linear index within workgroup grid
    @builtin(num_workgroups) workgroups: vec3<u32>,     //dispatch size (x,y,z) group count
    @builtin(workgroup_id) workgroupId: vec3<u32>       //position of workgroup in compute shader grid
) {
    let index = i32(threadId.x);
    var nParticles = i32(arrayLength(&particles.values) / 2);
    if (index >= nParticles) {
        return;
    }
    var pPos = particles.values[2 * index];
    var pVel = particles.values[2 * index + 1];
    var cMass = vec2f(0, 0);
    var cVel = vec2f(0, 0);
    var colVel = vec2f(0, 0);
    var cMassCount = 0;
    var cVelCount = 0;
    for (var i = 0; i < nParticles; i++) {
        if (i == index) {
            continue;
        }
        let j = i * 2;
        var pos = particles.values[j];
        var vel = particles.values[j + 1];
        if (distance(pos, pPos) < uniforms.rule1Distance) {
            cMass += pos;
            cMassCount++;
        }
        if (distance(pos, pPos) < uniforms.rule2Distance) {
            colVel -= pos - pPos;
        }
        if (distance(pos, pPos) < uniforms.rule3Distance) {
            cVel += vel;
            cVelCount++;
        }
    }
    if (cMassCount > 0) {
        cMass = cMass / vec2f(f32(cMassCount)) - pPos;
    }
    if (cVelCount > 0) {
        cVel /= f32(cVelCount);
    }
    pVel += cMass * uniforms.rule1Scale + colVel * uniforms.rule2Scale + cVel * uniforms.rule3Scale;
    pVel = normalize(pVel) * clamp(length(pVel), 0, 0.1);
    pPos = pPos + pVel * uniforms.deltaT;
    if (pPos.x < -1) {
        pPos.x = 1;
    }
    if (pPos.x > 1) {
        pPos.x = -1;
    }
    if (pPos.y < -1) {
        pPos.y = 1;
    }
    if (pPos.y > 1) {
        pPos.y = -1;
    }
    particles.values[2 * index] = pPos;
    particles.values[2 * index + 1] = pVel;
}
`;

const vertexShader = `
//Bindings (data passed to/from CPU) 


struct Vertex {
    
    @builtin(position) position: vec4<f32>, //pixel location
    //uploaded vertices from CPU, in interleaved format
    @location(0) vPos: vec2f,
    @location(1) vVel: vec2f,
    @location(2) sprite_pos: vec2f,
    @location(3) color: vec4f
};

@vertex
fn vtx_main(
    @builtin(vertex_index) vertexIndex : u32,   //current vertex
    @builtin(instance_index) instanceIndex: u32, //current instance
    @location(0) vPosIn: vec2f,
    @location(1) vVelIn: vec2f,
    @location(2) sprite_posIn: vec2f,
    @location(3) colorIn: vec4f
) -> Vertex {
    var pixel: Vertex;
    let angle = -atan2(vVelIn.x, vVelIn.y);
    var pos = vec2<f32>(sprite_posIn.x * cos(angle) - sprite_posIn.y * sin(angle),
        sprite_posIn.x * sin(angle) + sprite_posIn.y * cos(angle)
    );
    pixel.position = vec4f(pos + vPosIn, 0, 1);
    pixel.color = vec4f(
        1 - sin(angle + 1) - vVelIn.y,
        pos.x * 100 - vVelIn.y + 0.1,
        vVelIn.x + cos(angle + 0.5),
        1
    );
    return pixel; 

}
`;

const fragmentShader = `
//Bindings (data passed to/from CPU) 


struct Vertex {
    
    @builtin(position) position: vec4<f32>, //pixel location
    //uploaded vertices from CPU, in interleaved format
    @location(0) vPos: vec2f,
    @location(1) vVel: vec2f,
    @location(2) sprite_pos: vec2f,
    @location(3) color: vec4f
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
`;

const computeInputs = {
    //array buffers
    particles : 'array<vec2f>', //float32array with x,y,vx,vy per position
    //uniforms
    deltaT : 'f32',
    rule1Distance : 'f32',
    rule2Distance : 'f32',
    rule3Distance : 'f32',
    rule1Scale : 'f32',
    rule2Scale : 'f32',
    rule3Scale : 'f32'
};


const boidVBOS = [ //we can upload vbos
    {
        vPos:'vec2f',
        vVel:'vec2f',
    
        stepMode:'instance' //speeds up rendering, can execute vertex and instance counts with different values
    },
    {
        sprite_pos:'vec2f'
    },
    { 
        color:'vec4f'
    } 
];

const renderParams = {
    //canvas:canvas3,

    workGroupSize:64,
    computePass:{
        inputs: computeInputs,
        workgroupsX:Math.ceil(numParticles/64)
    },
    renderPass:{ //tell it to make an initial render pass with these inputs
        vbos:[ //we can upload vbos
            { //vbo 0
                vPos:'vec2f',
                vVel:'vec2f',

                stepMode:'instance' //speeds up rendering, can execute vertex and instance counts with different values
            },
            { //vbo 1
                sprite_pos:'vec2f'
            },
            { //vbo 2
                color:'vec4f'
            } 
        ]
    },

    // bindings:{ //binding overrides (assigned to our custom-generated layout)
    //     image:{
    //         texture:{viewDimension:'2d', sampleType:'float'} 
    //     }
    // },

    //overrides for pipeline descriptor will be assigned so you can add or rewrite what you need over the defaults
    renderPipelineDescriptor:{ primitive: {topology:'triangle-list'}},
    //additional render or compute pass inputs (just the UBO update in this case)
}

let boidsRules = [
    0.04,  //deltaT
    0.1,   //rule1Distance
    0.025, //rule2Distance
    0.025, //rule3Distance
    0.02,  //rule1Scale
    0.05,  //rule2Scale
    0.005  //rule3Scale
];

//buffer positions with initial values
pipeline.compute.buffer(
    undefined,
    particleBuffer,
    //also include uniforms
    ...boidsRules
);

//set the position buffer as the instance VBO
pipeline.fragment.updateVBO(
    pipeline.compute.bufferGroup.inputBuffers.particles,
    0
);

//upload sprite arrow to second vbo
pipeline.fragment.updateVBO(
    new Float32Array([
        -0.01, -0.02, 
        0.01, -0.02, 
        0.0, 0.02
    ]),
    1
);

pipeline.fragment.updateVBO(
    new Float32Array([
        0,0,0,0,
        0,0,0,0,
        0,0,0,0
    ]),
    2
);

let onchange = (ev) => {
    const input = ev.target;
    const index = parseInt(input.getAttribute('data-index'));
    boidsRules[index] = parseFloat(input.value);

    const data = {[input.id]:boidsRules[index]}; //can update UBOs by variable name
    
    // Assuming pipeline.fragment.updateUBO is a function to update the UBO, and update the resource
    pipeline.compute.updateUBO(data, true); 
}

let now = performance.now();
let fps = [];
let fpsticker = document.getElementById('ex4fps');
const loop = () => {
    let time = performance.now();
    let f = 1000/(time-now);
    fps.push(f);
    let frameTimeAvg = fps.reduce((a,b) => a+b)/(fps.length);
    //console.log(frameTimeAvg.toFixed(1));
    fpsticker.innerText = frameTimeAvg.toFixed(1);
    if(fps.length > 10) fps.shift();
    now = time;

    pipeline.process();
    pipeline.render({
        vertexCount:3,
        instanceCount:numParticles
    });
    requestAnimationFrame(loop)
}

requestAnimationFrame(loop)