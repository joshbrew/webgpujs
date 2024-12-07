## WebGPUjs

### [Examples](https://webgpujs.netlify.app/)

Write full featured WGSL pipelines in plain(ish) javascript.

I am redoing this so the transpiler is more optional and there is a better up front variable/binding configuration that's WAY more self explanatory and native-ish.

This should help me polish out the transpilation system so I can properly chain shader bindings for a many-shader webgpu program without all the hairbrained regex and recursion. It is just getting too entangled to make sense of so I'll be re-evaluating the setup sequencing. The transpiler is bomb af but chaining multiple shader programs and using storage textures etc is too implicit for comfort so I'd rather make it simple to provide minimal boilerplate up front for the data structures then try to remap the binding generation that way.

SupportS:
- Write functional compute shaders etc. and output one or multiple resulting buffers. 
- Compile compute, vertex, fragment shaders and chain together any combinations thereof.
- Easily allocate array buffers, uniforms, VBOs, Index Buffers, Textures (incl storage texture specification).
- Render to canvases.
- Specify instance vbos (see boids example)
- boilerplate access to builtins or for doing read/writes to vertex buffer objects across vertex/fragment 
- The transpiler will attempt to combine bindings when using shared naming conventions for easy shared buffer allocation across multiple shader programs.
- Lots more but we are testing things out still and trying to bring it up to something extremely common sense before we fully document the API. 
- Just override any part of the pipeline for finer grained specification needs, e.g. if you just want to use the transpiler or provide your own bindings.
 
**Work in Progress**

To run the example: `npm i -g tinybuild` then `npm run example`


![cap](./example/compute_.PNG)
![cap2](./example/boids.PNG)
![cap3](./example/texture.PNG)



### Looking 4 contributors 

It's fun I guess
