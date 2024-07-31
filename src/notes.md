### Last major TODO before moving on to other features

Fix data structure linkage across multiple bindgroups when generating bindgroups automatically, 
 - the test is linking a Storage texture with an input texture so we can communicate across compute/vertex/fragment via textures,
 - right now it works for linking array buffers and VBOs (see Boids example) at least which is similar just not the full scope of possibilities.

Then we need to make sure depth textures etc all work by reproducing the more complex WebGPU examples available but in ways made possible in our transpiler which is fairly constrained e.g. no structs right now.

The balance is making sure that when we reproduce examples that it doesn't look like some stupid alt-logic but something fairly native looking and with only minimal input requirements. We are confident we can get even the raytracing examples working where there are multiple compute and vertex passes, as we consider those to be the real tests, just with some more fairly straightforward tweaks to how bindgroups and such are linked. 

We're pretty close we think other than more utilities for handling specific i/o changes, stuff that you see in other shader compiler helpers, then this will be the real thing. 

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



### HOW I AM ADDING FUNCTIONALITY

First: what is it I want to add compatibility for?

Second: Look for relevant transpilation operations in the transpiler.ts,

#### For regex enhancements:

Third: Paste to GPT and ask it to enhance the regex and replacing functions (you will want to look at the ast generators in the parse function and the generateDataStructures and generateMainFunctionWorkGroup functions)

Fourth: Update anything in shader.ts as well related (again just search relevant WebGPU API calls you know need to be adjusted)

Fifth: Make sure it runs, and just keep pasting to gpt with errors and make new conversations when it gets stuck in a loop of BS.

#### For general API enhancements/updates:

Third: Study the official webgpu docs and examples to figure out what functionality is missing or if we haven't streamlined around it enough to require reworking shader.ts or transpiler.ts (e.g. missing types or hard coded loops etc that work in current examples but don't reflect modular API requirements).

Fourth: Study other people's workflows and consider automation possibilities.

Fifth: Make alterations in the pipeline to attempt to generalize it across more and more complicated examples provided from authortiative, up to date sources, e.g. [webgpu-samples](https://webgpu.github.io/webgpu-samples/)

Then:

Sixth: Make it look not ugly to write the actual code as a user.

And that's pretty much it but I am still reorganizing this stuff slowly so it's a little more modular and easy to tackle. Of course, as context sizes expand we might just be able to dump this entire library to an AI and have it rework it soon haha.

