## WebGPUjs

### [Examples](https://webgpujs.netlify.app/)

Write full featured WGSL pipelines in plain(ish) javascript.

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
