import { Param, TranspiledShader } from "./types";

//todo: handle custom structs from classes

//transpile js(ish) functions to webgpu and generate/combine bindings
export class WGSLTranspiler {

    static builtInUniforms = {
        resX:{type:'f32',callback:(shaderContext)=>{return shaderContext.canvas ? shaderContext.canvas.width : window.innerWidth;}}, 
        resY:{type:'f32',callback:(shaderContext)=>{return shaderContext.canvas ? shaderContext.canvas.height : window.innerHeight;}}, //canvas resolution
        mouseX:{type:'f32',callback:(shaderContext)=>{
            if(!shaderContext.MOUSEMOVELISTENER) {
                let elm = shaderContext.canvas ? shaderContext.canvas : window;
                shaderContext.MOUSEMOVELISTENER = elm.onmousemove = (evt) => {
                    shaderContext.mouseX = evt.offsetX;
                    shaderContext.mouseY = evt.offsetY;
                }
                shaderContext.mouseX = 0;
            }
            return shaderContext.mouseX;
        }}, mouseY:{type:'f32',callback:(shaderContext)=>{
            if(!shaderContext.MOUSEMOVELISTENER) {
                let elm = shaderContext.canvas ? shaderContext.canvas : window;
                shaderContext.MOUSEMOVELISTENER = elm.onmousemove = (evt) => { //should set in the same place as mouseX
                    shaderContext.mouseX = evt.offsetX;
                    shaderContext.mouseY = evt.offsetY;
                }
                shaderContext.mouseY = 0;
            }
            return shaderContext.mouseY;
        }}, //mouse position
        clicked:{ type:'i32', //onmousedown
            callback:(shaderContext) => {
                if(!shaderContext.MOUSEDOWNLISTENER) {
                    let elm = shaderContext.canvas ? shaderContext.canvas : window;
                    shaderContext.MOUSEDOWNLISTENER = elm.onmousedown = (evt) => { //should set in the same place as mouseX
                        shaderContext.clicked = true;
                    }
                    shaderContext.MOUSEUPLISTENER = elm.onmouseup = (evt) => {
                        shaderContext.clicked = false;
                    }
                    //should do mobile device
                    shaderContext.clicked = false;
                }
                return shaderContext.clicked;
            }
        },
        //keyinputs
        frame:{type:'f32',callback:function(shaderContext){
            if(!shaderContext.frame) shaderContext.frame = 0;
            let result = shaderContext.frame;
            shaderContext.frame++;
            return result;
        }}, //frame counter
        utcTime:{type:'f32',callback:(shaderContext)=>{return Date.now();}} //utc time                 
    } //etc.. more we can add from shaderToy

    static getFunctionHead = (methodString) => {
        let startindex = methodString.indexOf('=>')+1;
        if(startindex <= 0) {
            startindex = methodString.indexOf('){');
        }
        if(startindex <= 0) {
            startindex = methodString.indexOf(') {');
        }
        return methodString.slice(0, methodString.indexOf('{',startindex) + 1);
    }

    static splitIgnoringBrackets = (str) => {
        const result = [] as any[];
        let depth = 0; // depth of nested structures
        let currentToken = '';
        for (let i = 0; i < str.length; i++) {
            const char = str[i];

            if (char === ',' && depth === 0) {
                result.push(currentToken);
                currentToken = '';
            } else {
                currentToken += char;
                if (char === '(' || char === '[' || char === '{') {
                    depth++;
                } else if (char === ')' || char === ']' || char === '}') {
                    depth--;
                }
            }
        }

        // This is the change: Ensure any remaining content in currentToken is added to result
        if (currentToken) {
            result.push(currentToken);
        }

        return result;
    }

    static tokenize(funcStr) {
        // Capture function parameters
        let head = this.getFunctionHead(funcStr);
        let paramString = head.substring(head.indexOf('(') + 1, head.lastIndexOf(')'));
        let params = this.splitIgnoringBrackets(paramString).map(param => ({
            token: param,
            isInput: true
        }));

        // Capture variables, arrays, and their assignments
        const assignmentTokens = (funcStr.match(/(const|let|var)\s+(\w+)\s*=\s*([^;]+)/g) || []).map(token => ({
            token,
            isInput: false
        }));

        // Capture built-in uniforms
        const builtInUniformsKeys = Object.keys(this.builtInUniforms).join("|");
        const builtInUniformsPattern = new RegExp(`(?<![a-zA-Z0-9_])(${builtInUniformsKeys})(?![a-zA-Z0-9_])`, 'g');

        const builtInUniformsTokens = (funcStr.match(builtInUniformsPattern) || []).map(token => ({
            token,
            isInput: false // or true, based on your requirements
        }));

        // Exclude the function head (declaration) from the function call matching
        let functionBody = funcStr.substring(funcStr.indexOf('{') + 1, funcStr.lastIndexOf('}'));
        
        // Capture variable names referenced inside of function calls, excluding numbers and vec/mat constructs
        const textureCallTokens = (functionBody.match(/texture.*\w+\(([^)]+)\)/g) || []).flatMap(call => {
            // Extract arguments from each function call
            let args = call.substring(call.indexOf('(') + 1, call.lastIndexOf(')'));
            return this.splitIgnoringBrackets(args).map(arg => {
                arg = arg.trim();
                // Exclude if argument is a number, vec, or mat, unless it contains nested variable names
                if (!isNaN(arg) || /^.*(vec|mat).*\(/.test(arg)) {
                    return null;
                }
                return { token: arg, isInput: false };
            }).filter(arg => arg !== null);
        });
        params =  params.concat(assignmentTokens);
        params = params.concat(builtInUniformsTokens);
        params = params.concat(textureCallTokens);
        // Combine both sets of tokens
        return params;
    }

    static excludedNames = {
        'position':true,
        'pixel':true
    }

    static parse = (fstr, tokens, shaderType='compute', vertexBufferOptions) => {
        const ast = [] as any[];
        // Extract all returned variables from the tokens
        const returnMatches = fstr.match(/^(?![ \t]*\/\/).*\breturn .*;/gm);
        let returnedVars = returnMatches ? returnMatches.map(match => match.replace(/^[ \t]*return /, '').replace(';', '')) : undefined;

        returnedVars = this.flattenStrings(returnedVars);

        if(typeof vertexBufferOptions?.[0] === 'object') vertexBufferOptions.forEach((opt) => {
            const keys = Object.keys(opt).filter((n) => {
                if(n !== 'stepMode' && n !== '__COUNT') return true;
            });

            keys.forEach((k) => {
                if(!(k in this.excludedNames)) {
                    this.excludedNames[k] = true;
                }
            })
        });

        const functionBody = fstr.substring(fstr.indexOf('{')); 
        //basic function splitting, we dont support object inputs right now, anyway. e.g. we could add {x,y,z} objects to define vectors
        let checked = {};

        const exnKeys = Object.keys(this.excludedNames);
        const biuKeys = Object.keys(this.builtInUniforms);

        tokens.forEach(({ token, isInput },i) => {
            if(checked[token]) return; //skip redundancies
            checked[token] = true;
            let isReturned = returnedVars?.find((v) => {
                if(token.includes(v)) {
                    if(
                        (shaderType !== 'compute' &&
                        exnKeys.find((t) => token.includes(t))) ||
                        biuKeys.find((t) => token.includes(t))
                    ) {
                        tokens[i].isInput = false;
                    }
                    else return true;
                }
            });

            let variableName = token.split('=')[0].trim();
            if(variableName.includes(' ')) {
                let spl = variableName.split(' ');
                variableName = spl[1] ? spl[1] : spl[0];
            } //get rid of the prefix
               
            let isModified = new RegExp(`(?<!\\blet\\s+|\\bvar\\s+|\\bconst\\s+)\\b${variableName}\\b(?:\\[[^\\]]*\\])?\\s*=`).test(functionBody);

            if (token.includes('=')) {
                const variableMatch = token.match(/(const|let|var)?\s*(\w+)\s*=\s*(.+)/);
           
  
                if (variableMatch && (variableMatch[3].startsWith('new') || variableMatch[3].startsWith('['))) {
                    let length;
                    if (variableMatch[3].startsWith('new Array(')) {
                        // Match array size from new Array(512) pattern
                        const arrayLengthMatch = variableMatch[3].match(/new Array\((\d+)\)/);
                        length = arrayLengthMatch ? parseInt(arrayLengthMatch[1]) : undefined;
                    } else if (variableMatch[3].startsWith('new')) {
                        // Match from typed array pattern like new Float32Array([1,2,3])
                        const typedArrayLengthMatch = variableMatch[3].match(/new \w+Array\(\[([^\]]+)\]\)/);
                        length = typedArrayLengthMatch ? typedArrayLengthMatch[1].split(',').length : undefined;
                    } else {
                        // Match from direct array declaration like [1,2,3]
                        const directArrayLengthMatch = variableMatch[3].match(/\[([^\]]+)\]/);
                        length = directArrayLengthMatch ? directArrayLengthMatch[1].split(',').length : undefined;
                    }

                    ast.push({
                        type: 'array',
                        name: variableMatch[2],
                        value: variableMatch[3],
                        isInput,
                        length: length, // Added this line to set the extracted length
                        isReturned: returnedVars ? returnedVars?.includes(variableMatch[2]) : isInput ? true : false,
                        isModified
                    });
                } else if (token.startsWith('vec') || token.startsWith('mat')) {
                    const typeMatch = token.match(/(atomic\d+|vec\d+|mat\d+x\d+)(f|h|i|u|<[^>]+>)?\(([^)]+)\)/);
                    if (typeMatch) {
                        let type = typeMatch[1]; // Extracts 'vecN' or 'matNxM' or 'atomic<i32>'
                        let format = typeMatch[2]; // Extracts 'f', 'h', 'i', 'u', or '<...>'
                
                        // Convert shorthand format to full format
                        switch (format) {
                            case 'f': format = '<f32>'; break;
                            case 'h': format = '<f16>'; break;
                            case 'i': format = '<i32>'; break;
                            case 'u': format = '<u32>'; break;
                            default: format = format || '<f32>'; // Use the provided format or default to f32 if none
                        }
                
                        ast.push({
                            type: type, // Combines type with format (e.g., 'vec3<f32>')
                            name: token.split('=')[0].trim(),
                            value: format, // Captures the arguments inside the parentheses
                            isInput,
                            isReturned: returnedVars ? returnedVars.includes(token.split('=')[0].trim()) : isInput ? true : false,
                            isModified
                        });
                    }
                } else {

                    if(variableMatch[3].includes('array')) {
                        ast.push({
                            type: 'array',
                            name: variableMatch[2],
                            value: variableMatch[3],
                            isInput,
                            isReturned: returnedVars ? returnedVars?.includes(variableMatch[2]) : isInput ? true : false,
                            isModified
                        });
                    } else {
                        ast.push({
                            type: 'variable',
                            name: variableMatch[2],
                            value: variableMatch[3],
                            isUniform:true,
                            isInput,
                            isReturned: returnedVars ? returnedVars?.includes(variableMatch[2]) : isInput ? true : false,
                            isModified
                        });
                    }
                }
            } else {
                // This is a function parameter without a default value
                ast.push({
                    type: 'variable',
                    name: token,
                    value: 'unknown',
                    isInput,
                    isReturned,
                    isModified
                });
            }
        });

        return ast;
    }

    static inferTypeFromValue(value, funcStr, ast, defaultValue:any='f32') {
        if(!value) return defaultValue;
        value=value.trim()
        if(value === 'true' || value === 'false') return 'bool';
        else if(value.startsWith('"') || value.startsWith("'") || value.startsWith('`')) return value.substring(1,value.length-1); //should extract string types
        else if (value.startsWith('vec')) {
            // Matches both 'vec3f' and 'vec3<f32>' formats
            const VecMatch = value.match(/vec(\d+)(f|h|i|u|<[^>]+>)?/);
            if (VecMatch) {
                const vecSize = VecMatch[1];
                let type = VecMatch[2];
        
                if (!type) {
                    // Infer type if not explicitly provided
                    type = value.includes('.') ? '<f32>' : '<i32>';
                } else if (type.length === 1) {
                    // Convert single-letter type to full format
                    switch (type) {
                        case 'f': type = '<f32>'; break;
                        case 'h': type = '<f16>'; break;
                        case 'i': type = '<i32>'; break;
                        case 'u': type = '<u32>'; break;
                    }
                }
        
                return `vec${vecSize}${type}`;
            }
        } else if (value.startsWith('mat')) {
            // Matches both 'mat3x4f' and 'mat3x4<f32>' formats
            const MatMatch = value.match(/mat(\d+)x(\d+)(f|h|i|u|<[^>]+>)?/);
            if (MatMatch) {
                const matSize = `${MatMatch[1]}x${MatMatch[2]}`;
                let type = MatMatch[3];
        
                if (!type) {
                    // Default type for matrices
                    type = '<f32>';
                } else if (type.length === 1) {
                    // Convert single-letter type to full format
                    switch (type) {
                        case 'f': type = '<f32>'; break;
                        case 'h': type = '<f16>'; break;
                        // Matrices typically use floating point types
                        default: type = '<f32>';
                    }
                }
        
                return `mat${matSize}${type}`;
            }
        } else if (value.startsWith('atomic')) {
            // Matches both 'vec3f' and 'vec3<f32>' formats
            const VecMatch = value.match(/atomic(\d+)(f|h|i|u|<[^>]+>)?/);
            if (VecMatch) {
                const vecSize = VecMatch[1];
                let type = VecMatch[2];
        
                if (!type) {
                    // Infer type if not explicitly provided
                    type = '<i32>';
                } else if (type.length === 1) {
                    // Convert single-letter type to full format
                    switch (type) {
                        //case 'f': type = '<f32>'; break;
                        //case 'h': type = '<f16>'; break;
                        case 'i': type = '<i32>'; break;
                        case 'u': type = '<u32>'; break;
                    }
                }
        
                return `atomic${vecSize}${type}`;
            }

        //!! Various javascript syntax we can transform into acceptable WGSL syntax !!
        } else if (value.startsWith('[')) {
            // Infer the type from the first element if the array is initialized with values
            const firstElement = value.split(',')[0].substring(1);
            if(firstElement === ']') return 'array<f32>';
            if (firstElement.startsWith('[') && !firstElement.endsWith(']')) {
                // Only recurse if the first element is another array and not a complete array by itself
                return this.inferTypeFromValue(firstElement, funcStr, ast);
            } else {
                // Check if the first element starts with vec or mat
                if (firstElement.startsWith('vec') || firstElement.startsWith('mat')) {
                    return `array<${this.inferTypeFromValue(firstElement, funcStr, ast)}>`;
                } else if (firstElement.includes('.')) {
                    return 'array<f32>';
                } else if (!isNaN(firstElement)) {
                    return 'array<i32>';
                }
            }
        } else if (value.startsWith('new Array')) {
            // If the array is initialized using the `new Array()` syntax, look for assignments in the function body
            const arrayNameMatch = value.match(/let\s+(\w+)\s*=/);
            if (arrayNameMatch) {
                const arrayName = arrayNameMatch[1];
                const assignmentMatch = funcStr.match(new RegExp(`${arrayName}\\[\\d+\\]\\s*=\\s*(.+?);`));
                if (assignmentMatch) {
                    return this.inferTypeFromValue(assignmentMatch[1], funcStr, ast);
                }
            } else return 'f32'
        } else if (value.startsWith('new Float32Array')) {
            return 'array<f32>';
        } else if (value.startsWith('new Float64Array')) {
            return 'array<f64>'
        } else if (value.startsWith('new Int8Array')) {
            return 'array<i8>';
        } else if (value.startsWith('new Int16Array')) {
            return 'array<i16>';
        } else if (value.startsWith('new Int32Array')) {
            return 'array<i32>';
        } else if (value.startsWith('new BigInt64Array')) { 
            return 'array<i64>';
        } else if (value.startsWith('new BigUInt64Array')) { 
            return 'array<u64>';
        } else if (value.startsWith('new Uint8Array') || value.startsWith('new Uint8ClampedArray')) {
            return 'array<u8>';
        } else if (value.startsWith('new Uint16Array')) {
            return 'array<u16>';
        } else if (value.startsWith('new Uint32Array')) {
            return 'array<u32>';
        } else if (value.includes('.') || value.includes('e-')) {
            return 'f32';  // Float type for values with decimals
        } else if (!isNaN(value)) {
            return 'i32';  // Int type for whole numbers
        } else {
             // Check if the value is a variable name and infer its type from AST
            const astNode = ast.find(node => node.name === value);
            if (astNode) {
                if (astNode.type === 'array') {
                    return 'f32';  // Assuming all arrays are of type f32 for simplicity
                } else if (astNode.type === 'variable') {
                    return this.inferTypeFromValue(astNode.value, funcStr, ast);
                }
            }
        }
        
        return defaultValue;  // For other types
    }

    static flattenStrings(arr) {
        if(!arr) return [] as any[];
        const callback = (item, index, array) => {
            if ((item.startsWith('[') && item.endsWith(']')) || (item.startsWith('{') && item.endsWith('}'))) {
                return item.slice(1, -1).split(',').map(s => s.trim());
            }
            return item;
        }
        return arr.reduce((acc, value, index, array) => {
            return acc.concat(callback(value, index, array));
        }, [] as any[]);
    }

    static generateDataStructures(
        funcStr, 
        ast, 
        bindGroup=0, 
        shaderType?:'compute'|'fragment'|'vertex',
        variableTypes?:{[key:string]:string|{prefix?:string, type:string}},
        textureOptions?:{[key:string]:{ //texture variable name
            binding?:string|number, // variable name or binding number to set this texture to share buffer binding with
            group?:string|number,
            type?:string, //e.g. texture_2d or texture_storage_2d can be set explicitly
            isDepth?:boolean, //is it a depth texture? implicit function or naming will set this otherwise
            isStorage?:boolean, //is it a storage texture? must be set if not using implicit functions or names
            isSampler?:boolean,
            isComparisonSampler?:boolean,
            [key:string]:any
        }},
        minBinding=0,
        prevParams?:Param[]
    ) {
        let code = '//Bindings (data passed to/from CPU) \n';
        // Extract all returned variables from the function string
        // const returnMatches = funcStr.match(/^(?![ \t]*\/\/).*\breturn .*;/gm);
        // let returnedVars = returnMatches ? returnMatches.map(match => match.replace(/^[ \t]*return /, '').replace(';', '')) : undefined;

        // returnedVars = this.flattenStrings(returnedVars);

        // Capture all nested functions
        const functionRegex = /function (\w+)\(([^()]*|\((?:[^()]*|\([^()]*\))*\))*\) \{([\s\S]*?)\}/g;
        let modifiedStr = funcStr;

        let match;
        while ((match = functionRegex.exec(funcStr)) !== null) {
            // Replace the content of the nested function with a placeholder
            modifiedStr = modifiedStr.replace(match[3], 'PLACEHOLDER');
        }

        // Now, search for return statements in the modified string
        const returnMatches = modifiedStr.match(/^(?![ \t]*\/\/).*\breturn .*;/gm);
        let returnedVars = returnMatches ? returnMatches.map(match => match.replace(/^[ \t]*return /, '').replace(';', '')) : undefined;
        returnedVars = this.flattenStrings(returnedVars);

        let uniformsStruct = ''; // Start the UniformsStruct
        let defaultsStruct = '';
        let uniformBinding; // Flag to check if there are any uniforms
        let defaultUniforms;

        const params = prevParams || [];

        let bindingIncr = minBinding;

        let names = {};

        ast.forEach((node, i) => {
            if(names[node.name]) return;
            let paramFound = false;
            params.find((p) => {if(node.name === p.name) {
                node = p; //replace with previous parameter definition
                ast[i] = p; //also replace this
                paramFound = true;
                return true;
            }})
            names[node.name] = true;
            if(returnedVars.includes(node.name) && !this.excludedNames[node.name]) node.isInput = true; //catch extra returned variables not in the explicit input buffers (data structures generated by webgpu)
            function escapeRegExp(string) {
                return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');  // $& means the whole matched string
            }

            //todo: texture types - texture_1d, texture_2d, texture_2d_array, texture_3d
            //methods for parsing texture types, we didn't really have a choice but to use variable names for implicit texture typing, but it should work in general
            if (textureOptions?.[node.name]?.isDepth || new RegExp(`textureSampleCompare\\(${escapeRegExp(node.name)},`).test(funcStr)) { 
                
                if(!textureOptions) textureOptions = {};
                if(!textureOptions[node.name]) {
                    textureOptions[node.name] = {};
                }

                let nm = textureOptions?.[node.name]?.type || node.name.toLowerCase();
                if(nm.includes('depth_arr')) node.isDepthTextureArray = true;
                else if(nm.includes('depth')) node.isDepthTexture2d = true;
                else if(nm.includes('cube_arr')) node.isDepthCubeArrayTexture = true;
                else if(nm.includes('cube')) node.isDepthCubeTexture = true;
                else if(nm.includes('depth_mul')) node.isDepthMSAATexture = true;

                node.isTexture = true;
                node.isDepthTexture = true;
                textureOptions[node.name].isDepth = true; //set if not set
               
            } else if(textureOptions?.[node.name]?.isComparisonSampler || new RegExp(`textureSampleCompare\\(\\w+\\s*,\\s*${escapeRegExp(node.name)}`).test(funcStr)) {
                
                if(!textureOptions) textureOptions = {};
                if(!textureOptions[node.name]) {
                    textureOptions[node.name] = {};
                }
                    
                node.isComparisonSampler = true;
                node.isSampler = true;
                textureOptions[node.name].isComparisonSampler = true; //set if not set
            
            } else if (textureOptions?.[node.name]?.isSampler || new RegExp(`textureSample\\(\\w+\\s*,\\s*${escapeRegExp(node.name)}`).test(funcStr)) { 
                
                if(!textureOptions) textureOptions = {};
                if(!textureOptions[node.name]) {
                    textureOptions[node.name] = {};
                }
                    
                node.isSampler = true;
                textureOptions[node.name].isSampler = true; //set if not set
            
            } else if(textureOptions?.[node.name]?.isStorage ||  new RegExp(`textureStore\\(${escapeRegExp(node.name)},`).test(funcStr)) {
                
                if(!textureOptions) textureOptions = {};
                if(!textureOptions[node.name]) {
                    textureOptions[node.name] = {};
                }
                    
                let nm = textureOptions?.[node.name]?.type || node.name.toLowerCase();
                if(nm.includes('3d')) node.is3dStorageTexture = true;
                else if(nm.includes('1d')) node.is1dStorageTexture = true;
                else if(nm.includes('2d_arr')) node.is2dStorageTextureArray = true;
                
                node.isStorageTexture = true;
                textureOptions[node.name].isStorage = true; //set if not set
               
            } else if (textureOptions?.[node.name] || new RegExp(`texture.*\\(${escapeRegExp(node.name)},`).test(funcStr)) { //todo: we could infer texture dimensions from the second input type
                
                if(!textureOptions) textureOptions = {};
                if(!textureOptions[node.name]) {
                    textureOptions[node.name] = {};
                }
                    
                let nm = textureOptions?.[node.name]?.type || node.name.toLowerCase();

                //rudimentary way to dynamically type textures since we can't predict based on texture function calls
                if(nm.includes('depth_arr')) node.isDepthTextureArray = true;
                else if(nm.includes('depth_cube_arr')) node.isDepthCubeArrayTexture = true;
                else if(nm.includes('depth_cube')) node.isDepthCubeTexture = true;
                else if(nm.includes('depth_mul')) node.isDepthMSAATexture = true;
                else if(nm.includes('depth')) node.isDepthTexture2d = true;
                else if(nm.includes('cube_arr')) node.isCubeArrayTexture = true;
                else if(nm.includes('cube')) node.isCubeTexture = true;
                else if(nm.includes('3d')) node.is3dTexture = true;
                else if(nm.includes('2d_arr')) node.is2dTextureArray = true;
                else if(nm.includes('1d')) node.is1dTexture = true;
                else if(nm.includes('multisampled_2d')) node.is2dMSAATexture = true;
                 
                if(nm.includes('depth')) 
                    node.isDepthTexture = true;

                node.isTexture = true;

            } 

            let binding = typeof node.binding !== 'undefined' ? node.binding : bindingIncr; //use preexisting binding or new one according to an incremental scheme for consistency
            let group = typeof node.group !== 'undefined' ? node.group : bindGroup;

            let incrBinding = true;
            let bindingWasSet = false;

            if(group !== bindGroup || binding !== bindingIncr) 
                incrBinding = false; //don't incr if not using 


            //however for storage textures we often want to share bindings so we should be able to set them on the texture settings
            if(textureOptions?.[node.name] && typeof textureOptions[node.name].binding !== 'undefined') {
                if(typeof textureOptions[node.name].binding === 'string') { //if string it's a variable being referenced

                    const check = (name) => {
                        const boundTo = textureOptions[name].binding;
                        if(typeof boundTo === 'string') {
                            if(boundTo === node.name) {
                                textureOptions[name].binding = binding;
                                textureOptions[name].group = group;

                                node.sharedBinding = true;

                                if(node.isStorageTexture) 
                                    node.isSharedStorageTexture = true;
                                incrBinding = false;
                            } else {
                                //find it recursively if we have chained multiple texture bindings for some reason, else use bindingIncr
                                check(boundTo);
                            }
                        } else if (typeof boundTo === 'number') {
                            binding = boundTo;
                            node.sharedBinding = true;
                            if(typeof textureOptions[name].group !== 'undefined') 
                                group = textureOptions[name].group as number;
                            if(node.isStorageTexture) 
                                node.isSharedStorageTexture = true;
                            incrBinding = false;
                        }
                    }
                    check(node.name);
                
                } else if (typeof textureOptions[node.name].binding === 'number') {
                    binding = textureOptions[node.name].binding as number;
                    if(typeof textureOptions[node.name].group !== 'undefined') 
                        group = textureOptions[node.name].group as number;
                    incrBinding = false;
                    node.sharedBinding = true; //assuming since we specified
                }
            }

            if(variableTypes && (variableTypes[node.name])) {
                if(typeof variableTypes[node.name] === 'string') {
                    code += `@group(${group}) @binding(${binding}) var ${node.name}: ${variableTypes[node.name]};\n\n`;
                    node.type = variableTypes[node.name]; //overwrite
                    if(!paramFound) params.push(node);
                } else if (typeof variableTypes[node.name] === 'object') {
                    code += `@group(${group}) @binding(${binding}) ${(variableTypes[node.name] as any).prefix || 'var'} ${node.name}: ${(variableTypes[node.name] as any).type};\n\n`;
                    node.type = (variableTypes[node.name] as any).type; //overwrite
                    if(!paramFound) params.push(node);
                } else incrBinding = false;
                bindingWasSet = true;

            } else if (node.isTexture) {

                if(!paramFound) params.push(node);
                let format = node.name.includes('i32') ? 'i32' : node.name.includes('u32') ? 'u32' : 'f32';
                let typ;
                if(node.isDepthTextureArray) typ = 'texture_depth_2d_array';
                else if(node.isDepthCubeArrayTexture) typ = 'texture_depth_cube_array';
                else if(node.isDepthMSAATexture) typ = 'texture_depth_multisampled_2d';
                else if(node.isDepthCubeTexture) typ = 'texture_depth_cube';
                else if(node.isDepthTexture2d) typ = 'texture_depth_2d';
                else if(node.isCubeArrayTexture) typ = 'texture_cube_array<'+format+'>';
                else if(node.isCubeTexture) typ = 'texture_cube<'+format+'>';
                else if(node.is3dTexture) typ = 'texture_3d<'+format+'>';
                else if(node.is2dTextureArray) typ = 'texture_2d_array<'+format+'>';
                else if(node.is1dTexture) typ = 'texture_1d<'+format+'>';
                else if(node.is2dMSAATexture) typ = 'texture_multisampled_2d<'+format+'>';
                else typ = `texture_2d<f32>`;

                code += `@group(${group}) @binding(${binding}) var ${node.name}: ${typ};\n`;
                //else  code += `@group(${bindGroup}) @binding(${bindingIncr}) var ${node.name}: texture_storage_2d<${storageTextureType}, write>;\n\n`; //todo: rgba8unorm type should be customizable
                
                textureOptions[node.name].binding = binding; //set binding for reference
                textureOptions[node.name].group = group; 

                bindingWasSet = true;
            } else if (node.isStorageTexture) { 

                if(!paramFound) params.push(node);
                let format = textureFormats.find((f) => {if(node.name.includes(f)) return true;});
                if(!format) format = 'rgba8unorm';

                let typ; 
                if(node.is3dStorageTexture) typ = 'texture_storage_3d<'+format+',write>'; //todo: read and read_write currently experimental: https://developer.chrome.com/blog/new-in-webgpu-118/ But we should default to read_write when we can
                else if(node.is1dStorageTexture) typ = 'texture_storage_3d<'+format+',write>';
                else if (node.is2dStorageTextureArray) typ = 'texture_storage_2d_array<'+format+',write>';
                else typ = 'texture_storage_2d<'+format+',write>';

                code += `@group(${group}) @binding(${binding}) var ${node.name}: ${typ};\n`; //todo rgba8unorm is not only type
                
                textureOptions[node.name].binding = binding; //set binding for reference
                textureOptions[node.name].group = group; 

                bindingWasSet = true;
            } else if (node.isSampler) {
                let typ;
                
                if(node.isComparisonSampler) typ = 'sampler_comparison';
                else typ = 'sampler';

                if(!paramFound) params.push(node);
                code += `@group(${group}) @binding(${binding}) var ${node.name}: ${typ};\n\n`;
            
                textureOptions[node.name].binding = binding; //set binding for reference
                textureOptions[node.name].group = group; 
                
                bindingWasSet = true;
            } else if(node.isInput && !this.builtInUniforms[node.name]) {

                if (node.type === 'array') {
                    const elementType = this.inferTypeFromValue(node.value.split(',')[0], funcStr, ast);
                    
                    node.type = elementType; // Use the inferred type directly
                    if(!paramFound) params.push(node);
                    code += `struct ${capitalizeFirstLetter(node.name)}Struct {\n    values: ${elementType}\n};\n\n`;
                    code += `@group(${group}) @binding(${binding})\n`;
                    
                    if (!returnedVars || returnedVars?.includes(node.name) || (node.isModified && !node.isUniform)) { //assume arrays are read_write?
                        code += `var<storage, read_write> ${node.name}: ${capitalizeFirstLetter(node.name)}Struct;\n\n`;
                    } else {
                        code += `var<storage, read> ${node.name}: ${capitalizeFirstLetter(node.name)}Struct;\n\n`;
                    }

                    bindingWasSet = true;
                }
                else if (node.isUniform) {
                    //if(shaderType === 'vertex') console.log(node);
                    
                    if(!paramFound) params.push(node);

                    if(typeof uniformBinding === 'undefined') {
                        uniformsStruct = `struct UniformsStruct {\n`;
                        uniformBinding = binding; // Set the flag to the index
                    } else {
                        incrBinding = false;
                        binding = uniformBinding
                    }
                    const uniformType = this.inferTypeFromValue(node.value, funcStr, ast);
                    node.type = uniformType;
                    uniformsStruct += `    ${node.name}: ${uniformType},\n`; // Add the uniform to the UniformsStruct
                    
                    bindingWasSet = true;
                } else incrBinding = false;
            } else if(this.builtInUniforms[node.name]) {
                
                if(!defaultUniforms) {
                    defaultUniforms = [] as any[];
                    defaultsStruct = `struct DefaultUniforms {\n`;
                }

                const uniformType = this.builtInUniforms[node.name].type;
                defaultsStruct += `    ${node.name}: ${uniformType},\n`; // Add the uniform to the UniformsStruct
                defaultUniforms.push(node.name);
            
                bindingWasSet = true;
                incrBinding = false;
            } else incrBinding = false;

            if(bindingWasSet) {
                node.binding = binding; // this will be referred to when chaining shaders
                node.group = bindGroup;
                if(incrBinding) {
                    bindingIncr++;
                }
            }

        });

        //todo make these consistent for shared shaders
        if(defaultUniforms) {
        
            defaultsStruct += '};\n\n';
            code += defaultsStruct;
            code += `@group(${bindGroup}) @binding(${bindingIncr}) var<uniform> defaults: DefaultUniforms;\n\n`; //the last binding will always be default uniforms in this case
            bindingIncr++;
        
        }

        if (typeof uniformBinding !== 'undefined') { // If there are any uniforms, add the UniformsStruct and its binding to the code
        
            uniformsStruct += '};\n\n'; // Close the UniformsStruct
            code += uniformsStruct;
            code += `@group(${bindGroup}) @binding(${uniformBinding}) var<uniform> uniforms: UniformsStruct;\n\n`;
        
        }

        return {code, params, defaultUniforms, lastBinding:bindingIncr};
    }

    static extractAndTransposeInnerFunctions(body, extract = true, ast, params, shaderType, vertexBufferOptions) {
        const functionRegex = /function (\w+)\(([^()]*|\((?:[^()]*|\([^()]*\))*\))*\) \{([\s\S]*?)\}/g;

        let match;
        let extractedFunctions = '';

        while ((match = functionRegex.exec(body)) !== null) {
            const funcName = match[1];
            const funcBody = match[3];
            let paramString = match[2];

            let outputParam;

            const regex = new RegExp(`return\\s+(${this.variablePattern('[\\s\\S]*?')});`);
            const retmatch = funcBody.match(regex);
            if (retmatch) {
                let inferredType = this.inferTypeFromValue(retmatch[1], body, ast, false);
                if (inferredType) {
                    outputParam = inferredType;
                }
            }

            let params = this.splitIgnoringBrackets(paramString).map((p) => {
                let split = p.split('=');
                let vname = split[0];
                let inferredType = this.inferTypeFromValue(split[1], body, ast);
                if (!outputParam) outputParam = inferredType;
                return vname + ': ' + inferredType;
            });

            // Transpose the function body
            const transposedBody = this.transposeBody(funcBody, funcBody, params, shaderType, true, undefined, false, vertexBufferOptions).code;

            // Infer output types better
            extractedFunctions += `fn ${funcName}(${params.join(', ')}) -> ${outputParam} {${transposedBody}}\n\n`;
        }

        // Remove the inner functions from the main body
        if (extract) body = body.replace(functionRegex, '');

        return { body, extractedFunctions };
    }

    static variablePattern(content) {
        return content.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    }

    static generateMainFunctionWorkGroup(
        funcStr:string, 
        ast:any, 
        params:any, 
        shaderType ='compute', 
        vertexBufferOptions:{
            stepMode?:'instance'|'vertex',
            [key:string]:string
        }[]=[{
            color:'vec4<f32>'
        }], 
        workGroupSize=64, 
        gpuFuncs:(Function|string)[]
    ) {
        let code = '';
        
        if(gpuFuncs) {
            gpuFuncs.forEach((f:Function|string) => {
                let result = this.extractAndTransposeInnerFunctions(typeof f === 'function' ? f.toString() : f, false, ast, params, shaderType, vertexBufferOptions);
                if(result.extractedFunctions) code += result.extractedFunctions;
            });
        }

        // Extract inner functions and transpose them
        const { body: mainBody, extractedFunctions } = this.extractAndTransposeInnerFunctions(funcStr.match(/{([\s\S]+)}/)[1], true, ast, params, shaderType, vertexBufferOptions);
        
        // Prepend the transposed inner functions to the main function
        code += extractedFunctions;

        let vtxInps;
        let vboInputStrings = [] as any[];
        if(shaderType === 'vertex' || shaderType === 'fragment') {
            let vboStrings = [];
            if(vertexBufferOptions) {
                const types = [];
                const keys = []; vertexBufferOptions.forEach((obj) => { 
                    keys.push(...Object.keys(obj)); 
                    types.push(...Object.values(obj));
                });
                
                let loc = 0;
                let idx = 0;
                for(const key of keys) {
                    const type = types[idx];
                    idx++;
                    if(key === 'stepMode' || key === '__COUNT') continue; //except special parameters we might end up with
                
                    vboStrings.push(
                        `@location(${loc}) ${key}: ${type}${idx === keys.length ? '' : ','}`
                    );
                    
                    if(shaderType === 'vertex') {   
                        vboInputStrings.push(
                            `@location(${loc}) ${key}In: ${type}${idx === keys.length ? '' : ','}`
                        );
                    }
                    
                    loc++;
                }
            }
            
            vtxInps = `
    @builtin(position) position: vec4<f32>, //pixel location
    //uploaded vertices from CPU, in interleaved format
${vboStrings.join('\n')}`;

            code += `
struct Vertex {
    ${vtxInps}
};
`;
        }

        // Generate function signature
        if(shaderType === 'compute') {

            code += `
//Main function call\n//threadId tells us what x,y,z thread we are on\n
@compute @workgroup_size(${workGroupSize})
fn compute_main(  
    @builtin(global_invocation_id) threadId: vec3<u32>, //shader grid position
    @builtin(local_invocation_id) localId: vec3<u32>,   //workgroup grid position
    @builtin(local_invocation_index) localIndex: u32,   //linear index within workgroup grid
    @builtin(num_workgroups) workgroups: vec3<u32>,     //dispatch size (x,y,z) group count
    @builtin(workgroup_id) workgroupId: vec3<u32>       //position of workgroup in compute shader grid`;     
            code += '\n) {\n';

        } else if (shaderType === 'vertex') {
            code += `
@vertex
fn vtx_main(
    @builtin(vertex_index) vertexIndex : u32,   //current vertex
    @builtin(instance_index) instanceIndex: u32, //current instance
    ${vboInputStrings.join('\n')}`
            code += '\n) -> Vertex {\n    var pixel: Vertex;\n'; //pixel is predeclared, can we can reference color, position, etc in our js-side shaders

        } else if (shaderType === 'fragment') {
            code += `
@fragment
fn frag_main(
    pixel: Vertex,
    @builtin(front_facing) is_front: bool,   //true when current fragment is on front-facing primitive
    @builtin(sample_index) sampleIndex: u32, //sample index for the current fragment
    @builtin(sample_mask) sampleMask: u32   //contains a bitmask indicating which samples in this fragment are covered by the primitive being rendered
) -> @location(0) vec4<f32> {\n`;
        }
        let shaderHead = code;
        // Transpose the main body
        let transposed = this.transposeBody(mainBody, funcStr, params, shaderType, shaderType === 'fragment', shaderHead, true, vertexBufferOptions);
        code += transposed.code;
        if(transposed.consts?.length > 0) 
            code = transposed.consts.join('\n') + '\n\n' + code;

        if (shaderType === 'vertex') code += `\n    return pixel; \n`; //
        code += '\n}\n';
        return code;
    }

    static transposeBody = (
        body, 
        funcStr, 
        params, 
        shaderType, 
        returns = false, 
        shaderHead='', 
        extractConsts=false,
        vertexBufferOptions
    ) => {
        let code = '';

        // Capture commented lines and replace with a placeholder
        const commentPlaceholders = {};
        let placeholderIndex = 0;
        body = body.replace(/\/\/.*$/gm, (match) => {
            const placeholder = `__COMMENT_PLACEHOLDER_${placeholderIndex}__`;
            commentPlaceholders[placeholder] = match;
            placeholderIndex++;
            return placeholder;
        });

        // Replace common patterns
        
        code = body.replace(/for \((let|var) (\w+) = ([^;]+); ([^;]+); ([^\)]+)\)/gm, 'for (var $2 = $3; $4; $5)');

        const stringPlaceholders = {};
        let stringPlaceholderIndex = 0;
        code = code.replace(/('|"|`)([\s\S]*?)\1/gm, (match) => {
            const placeholder = `__CODE_PLACEHOLDER_${stringPlaceholderIndex}__`;

            stringPlaceholders[placeholder] = match.substring(1,match.length-1);
            stringPlaceholderIndex++;
            return placeholder;
        });


        //code = code.replace(/const/g, 'let');
        code = code.replace(/const (\w+) = (?!(atomic\d+|vec\d+|mat\d+|\[.*|array))/gm, 'let $1 = ')

        const vecMatDeclarationRegex = /(let|var) (\w+) = (atomic\d+|vec\d+|mat\d+)/gm;
        code = code.replace(vecMatDeclarationRegex, 'var $2 = $3');
        const vecMatDeclarationRegex2 = /const (\w+) = (atomic\d+|vec\d+|mat\d+)/gm;
        code = code.replace(vecMatDeclarationRegex2, 'const $2 = $3');

        // ------ Array conversion ------ ------ ------ ------ ------ ------ ------

        // Extract array variable names
        const arrayVars = [] as any[];
        code.replace(/(let|var|const) (\w+) = (array|\[)/gm, (match, p1, varName) => {
            arrayVars.push(varName);
            return match; // Just to keep the replace function working
        });

        if (shaderType !== 'vertex' && shaderType !== 'fragment') {
            code = code.replace(/(\w+)\[([\w\s+\-*%&\/]+)\]/gm, (match, p1, p2) => {
                if (arrayVars.includes(p1)) return match;  // if the variable is an array declaration, return it as is
                return `${p1}.values[${p2.replace(/(\w+)\[([\w\s+\-*\/]+)\]/g, '$1.values[$2]')}]`;
            });
        } else {
            // When shaderType is vertex or fragment, exclude specific variable names from the replacement
            // Gather up custom vbos to add to the filter 
        
            let names = ['position'];
            vertexBufferOptions.forEach((opt) => {
                names.push(...Object.keys(opt).filter((n) => { if(n !== 'stepMode' && n !== '__COUNT') return true;}));
            });
        
            // Create a regular expression pattern from the names array
            let namesPattern = names.join('|');
        
            // Use the dynamically generated pattern in the replace function
            code = code.replace(new RegExp(`(${namesPattern})|(\\w+)\\[([\\w\\s+\\-*\\/]+)\\]`, 'gm'), (match, p1, p2, p3) => {
                if (p1 || arrayVars.includes(p2)) return match;  // if match is one of the keywords or is an array variable, return it as is
                return `${p2}.values[${p3.replace(/(\w+)\[([\w\s+\-*\/]+)\]/g, '$1.values[$2]')}]`;  // otherwise, apply the transformation
            });
        }

        
        code = code.replace(/(\w+)\.length/gm, 'arrayLength(&$1.values)');


        code = code.replace(/(\/\/[^\n]*);/gm, '$1'); //trim off semicolons after comments

        // Convert arrays with explicit values (like let a = [1,2,3];)
        code = code.replace(/(let|var|const) (\w+) = \[([\s\S]*?)\];/gm, (match, varType, varName, values) => {
            const valuesLines = values.trim().split('\n');
            const vals = [] as any[];
            const cleanedValues = valuesLines.map(line => {
                let cleaned = line.substring(0,line.indexOf('//') > 0 ? line.indexOf('//') : undefined); // remove inline comments
                cleaned = cleaned.substring(0,line.indexOf('__CO') > 0 ? line.indexOf('__COMM') : undefined); // remove COMMENT_PLACEHOLDER
                vals.push(line);
                return cleaned?.indexOf(',') < 0 ? cleaned + ',' : cleaned; // append comma for the next value
            }).join('\n');

            const valuesWithoutComments = cleanedValues.replace(/\/\*.*?\*\//gm, '').trim(); // remove multi-line comments
            const valuesArray = this.splitIgnoringBrackets(valuesWithoutComments);
            const size = valuesArray.length;

            const hasDecimal = valuesWithoutComments.includes('.');
            const isVecWithF = /^vec\d+f/.test(valuesWithoutComments);
            const inferredType = (valuesWithoutComments.startsWith('mat') || hasDecimal || isVecWithF) ? 'f32' : 'i32';

            // Extract the type from the first value (assumes all values in the array are of the same type)
            let arrayValueType = inferredType;
            const arrayValueTypeMatch = valuesWithoutComments.match(/^(vec\d+(f|h|u|i)?|mat\d+x\d+|atomic+(f|h|u|i)?\d)/gm);
            if (arrayValueTypeMatch) {
                arrayValueType = arrayValueTypeMatch[0];
            }

            return `${varType} ${varName} : array<${arrayValueType}, ${size}> = array<${arrayValueType}, ${size}>(\n${vals.join('\n')}\n);`;
        });

        function transformArrays(input) {
            let lines = input.split('\n');
            let output = [] as any[];

            function countCharacter(str, char) {
                return str.split(char).length - 1;
            }

            function extractFillValue(line) {
                let startIndex = line.indexOf('.fill(') + 6;
                let parenthesesCount = 1;
                let endIndex = startIndex;

                while (parenthesesCount !== 0 && endIndex < line.length) {
                    endIndex++;
                    if (line[endIndex] === '(') {
                        parenthesesCount++;
                    } else if (line[endIndex] === ')') {
                        parenthesesCount--;
                    }
                }

                return line.substring(startIndex, endIndex);
            }

            for (let line of lines) {
                line = line.trim();
                let transformedLine = line;

                if (/^(let|const|var)\s/.test(line) && line.includes('.fill(')) {
                    let variableName = line.split('=')[0].trim().split(' ')[1];
                    let size = line.split('new Array(')[1].split(')')[0].trim();
                    let fillValue = extractFillValue(line);

                    let sizeCount = countCharacter(size, '(') - countCharacter(size, ')');
                    for (let i = 0; i < sizeCount; i++) size += ')';

                    if (fillValue.startsWith('vec')) {
                        let isVecWithF = /vec\d+f/.test(fillValue);
                        let vecType = isVecWithF || fillValue.match(/\.\d+/) ? 'f32' : 'i32'; // Check for decimals
                        transformedLine = `var ${variableName} : array<${fillValue.split('(')[0]}<${vecType}>, ${size}>;\n` +
                                        `for (var i: i32 = 0; i < ${size}; i = i + 1) {\n` +
                                        `\t${variableName}[i] = ${fillValue.replace(fillValue.split('(')[0], fillValue.split('(')[0] + `<${vecType}>`)};\n}`;
                    } else if (fillValue.startsWith('mat')) {
                        transformedLine = `var ${variableName} : array<${fillValue.split('(')[0]}<f32>, ${size}>;\n` +
                                        `for (var i: i32 = 0; i < ${size}; i = i + 1) {\n` +
                                        `\t${variableName}[i] = ${fillValue.replace(/vec(\d)/g, 'vec$1<f32>')};\n}`;
                    } else {
                        transformedLine = `var ${variableName} : array<f32, ${size}>;\n` +
                                        `for (var i: i32 = 0; i < ${size}; i = i + 1) {\n` +
                                        `\t${variableName}[i] = ${fillValue};\n}`;
                    }
                }

                output.push(transformedLine);
            }
            
            return output.join('\n');
        }


        code = transformArrays(code);

        code = code.replace(/(let|var|const) (\w+) = new (Float|Int|UInt)(\d+)Array\((\d+)\);/gm, (match, keyword, varName, typePrefix, bitSize, arraySize) => {
            let typeChar;
            switch(typePrefix) {
                case 'Float': 
                    typeChar = 'f';
                    break;
                case 'Int': 
                    typeChar = 'i';
                    break;
                case 'UInt': 
                    typeChar = 'u';
                    break;
                default: 
                    typeChar = 'f'; // defaulting to float
            }
            return `var ${varName} : array<${typeChar}${bitSize}, ${arraySize}>;`;
        });

        // Convert new Arrays with explicit sizes last
        code = code.replace(/(let|var|const) (\w+) = new Array\((\d+)\);/gm, 'var $2 : array<f32, $2>;');

        // ------ ------ ------ ------ ------ ------ ------ ------ ------ ------

        // Handle mathematical operations
        code = replaceJSFunctions(code, replacements);

        // Handle vector and matrix creation 
        const vecMatCreationRegex = /(vec(\d+)|mat(\d+))\(([^)]+)\)/gm;
        code = code.replace(vecMatCreationRegex, (match, type, vecSize, matSize, args) => {
           
            // Split the arguments and check if any of them contain a decimal point

            const argArray = args.split(',').map(arg => arg.trim());
            const hasDecimal = argArray.some(arg => arg.includes('.'));
            

            // Check if the type includes 'f', 'u', 'i', or 'h'
            const isVecOrMatWithSpecificType = /^(vec|mat|atomic)\d+[fuhi]/.test(type);

            // Determine the inferred type
            let inferredType;

            if (isVecOrMatWithSpecificType) {
                // Extract the type suffix (f, u, i, or h)
                const typeSuffix = type.match(/[fuhi]$/)[0];
                switch (typeSuffix) {
                    case 'f': inferredType = 'f32'; break;
                    case 'u': inferredType = 'u32'; break;
                    case 'i': inferredType = 'i32'; break;
                    case 'h': inferredType = 'f16'; break;
                    default: inferredType = 'f32'; // Default to f32 if no match
                }
            } else {
                // If no specific type is indicated, default to f32 or i32 based on decimal presence
                inferredType = hasDecimal ? 'f32' : 'i32';
            }

            if (type.startsWith('mat')) {
                // For matrices, default internal vectors to f32 unless a specific type is given
                const matInternalType = isVecOrMatWithSpecificType ? `<${inferredType}>` : '<f32>';
                return `${type}${matInternalType}(${argArray.join(', ').replace(/vec(\d+)/gm, `vec$1${matInternalType}`)})`;
            } else {
                // For vectors, use the inferred type directly
                return `${type}<${inferredType}>(${argArray.join(', ')})`;
            }
        });


        params.forEach((param) => {
            if(param.isUniform) {
                const regex = new RegExp(`(?<![a-zA-Z0-9])${param.name}(?![a-zA-Z0-9])`, 'gm');
                code = code.replace(regex, `uniforms.${param.name}`);
            }
        });

        Object.keys(this.builtInUniforms).forEach((param) => {
            const regex = new RegExp(`(?<![a-zA-Z0-9])${param}(?![a-zA-Z0-9])`, 'gm');
            code = code.replace(regex, `defaults.${param}`);
        });

        // Replace placeholders with their corresponding comments
        for (const [placeholder, comment] of Object.entries(commentPlaceholders)) {
            code = code.replace(placeholder, comment as any);
        }
        for (const [placeholder, str] of Object.entries(stringPlaceholders)) {
            code = code.replace(placeholder, str as any);
        }
        
        //Vertex and Fragment shader transpiler (with some assumptions we made)
        // Extract variable names from the Vertex struct definition
        if(shaderType === 'fragment' || shaderType === 'vertex') {
            const vertexVarMatches = shaderHead.match(/@location\(\d+\) (\w+):/gm);
            const vertexVars = vertexVarMatches ? vertexVarMatches.map(match => {
                const parts = match.split(' ');
                return parts[1].replace(':', ''); // remove the colon
            }) : [];
            vertexVars.push('position');

            // Replace variables without pixel prefix with pixel prefixed version
            vertexVars.forEach(varName => {
                if(!varName.includes('In')) {
                    const regex = new RegExp(`(?<![a-zA-Z0-9_.])${varName}(?![a-zA-Z0-9_.])`, 'gm');
                    code = code.replace(regex, `pixel.${varName}`);
                }
            });
        }


        // ------ ------ ------ ------ ------ ------ ------ ------ ------ ------

        // Ensure lines not ending with a semicolon or open bracket have a semicolon appended. Not sure if this is stable
        code = code.replace(/^(.*[^;\s\{\[\(\,\>\}])(\s*\/\/.*)$/gm, '$1;$2');
        code = code.replace(/^(.*[^;\s\{\[\(\,\>\}])(?!\s*\/\/)(?=\s*$)/gm, '$1;');
        //trim off some cases for inserting semicolons wrong
        code = code.replace(/(\/\/[^\n]*);/gm, '$1'); //trim off semicolons after comments
        code = code.replace(/;([^\n]*)\s*(\n\s*)\)/gm, '$1$2)');

        let consts;
        if(extractConsts) {
            function extrConsts(text) {
                const pattern = /const\s+[a-zA-Z_][a-zA-Z0-9_]*\s*:\s*[a-zA-Z_][a-zA-Z0-9_<>,\s]*\s*=\s*[a-zA-Z_][a-zA-Z0-9_<>,\s]*(\([\s\S]*?\)|\d+\.?\d*);/gm;

                let match;
                const extractedConsts = [] as any[];

                while ((match = pattern.exec(text)) !== null) {
                    extractedConsts.push(match[0]);
                }

                const pattern2 = /const\s+[a-zA-Z_][a-zA-Z0-9_]*\s*=\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\([\s\S]*?\)\s*;/gm;

                while ((match = pattern2.exec(text)) !== null) {
                    extractedConsts.push(match[0]);
                }

                const modifiedText = text.replace(pattern, '').replace(pattern2,'').trim();

                return {
                    consts:extractedConsts,
                    code:modifiedText
                };
            }
            
            
            //we will move these to outside the function loop to speed things up
            let extracted = extrConsts(code);
            code = extracted.code;
            consts = extracted.consts;
        }

        if(!returns) code = code.replace(/(return [^;]+;)/gm, '//$1');

        return {code, consts};
    }

    static indentCode(code) {
        let depth = 0;
        const tab = '    ';  // 4 spaces for indentation, can be adjusted
        let result = '';
        let needsIndent = false;
        let leadingSpaceDetected = false;
    
        for (let i = 0; i < code.length; i++) {
            const char = code[i];
    
            // If a newline is detected, set the flag to true to apply indentation
            if (char === '\n') {
                result += char;
                needsIndent = true;
                leadingSpaceDetected = false;
                continue;
            }
    
            // Check if there's leading space
            if (char === ' ' && needsIndent) {
                leadingSpaceDetected = true;
            }
    
            // Apply the necessary indentation if no leading space is detected
            if (needsIndent && !leadingSpaceDetected) {
                result += tab.repeat(depth);
                needsIndent = false;
            }
    
            // Increase the depth when an opening brace or parenthesis is detected
            if (char === '{' || char === '(') {
                depth++;
            }
    
            // Decrease the depth when a closing brace or parenthesis is detected
            if (char === '}' || char === ')') {
                if (depth > 0) depth--;
                if (result.slice(-tab.length) === tab) {
                    result = result.slice(0, -tab.length);
                }
            }
    
            result += char;
        }
    
        return result;
    }


    //combine input bindings and create mappings so input arrays can be shared based on variable names, assuming same types in a continuous pipeline (the normal thing)
    static combineBindings(
        bindings1str:string, 
        bindings2str:string,
        noOverlap=true,
        bindings2params?:Param[]
    ) {
        
        const bindingRegex = /@group\((\d+)\) @binding\((\d+)\)\s+(var(?:<[^>]+>)?)\s+(\w+)\s*:/g;
        const structRegex = /struct (\w+) \{([\s\S]*?)\}/;

        const combinedStructs = new Map();
        const replacementsOriginal = new Map();
        const replacementsReplacement = new Map();

        let changesShader1 = {};
        let changesShader2 = {};
        
        // Extract used group-binding pairs from the first shader
        let usedBindings = new Set();
        let bmatch;
        while ((bmatch = bindingRegex.exec(bindings1str)) !== null) {
            usedBindings.add(`${bmatch[1]}-${bmatch[2]}`);
        }

        // Adjust bindings in the second shader
        bindings2str = bindings2str.replace(bindingRegex, (match, group, binding, varDecl, varName) => {
            let newBinding = binding;
            if(!(bindings2params && bindings2params.find((v) => { if(v.name === varName && v.sharedBinding) return true; })) && noOverlap) {
                while (usedBindings.has(`${group}-${newBinding}`)) {
                    newBinding = (parseInt(newBinding) + 1).toString();
                    changesShader2[varName] = { group: group, binding: newBinding };
                }
            }
            usedBindings.add(`${group}-${newBinding}`);
            return `@group(${group}) @binding(${newBinding}) ${varDecl} ${varName}:`;
        });

        const extractBindings = (str, replacements, changes) => {
            let match;
            const regex = new RegExp(bindingRegex);
            while ((match = regex.exec(str)) !== null) {
                replacements.set(match[4], match[0].slice(0, match[0].indexOf(' var')));
                changes[match[4]] = {
                    group: match[1],
                    binding: match[2]
                };
                usedBindings.add(`${match[1]}-${match[2]}`);
            }
        };

        extractBindings(bindings1str, replacementsOriginal, changesShader1);
        extractBindings(bindings2str, replacementsReplacement, changesShader2);


        // Combine structs and ensure no duplicate fields
        let match = structRegex.exec(bindings1str);
        if (match) {
            const fields = match[2].trim().split(',\n').map(field => field.trim());
            combinedStructs.set(match[1], fields);
        }
        match = structRegex.exec(bindings2str);
        if (match) {
            const fields = match[2].trim().split(',\n').map(field => field.trim());
            const existing = combinedStructs.get(match[1]) || [];
            fields.forEach(field => {
                const fieldName = field.split(':')[0].trim();
                if (!existing.some(e => e.startsWith(fieldName))) {
                    existing.push(field);
                }
            });
            combinedStructs.set(match[1], existing);
        }

        const constructCombinedStruct = (structName) => {
            if (combinedStructs.has(structName)) {
                return `struct ${structName} {\n    ${combinedStructs.get(structName).join(',\n    ')}\n};\n`;
            }
            return '';
        };

        const result1 = bindings1str.replace(/struct UniformStruct \{[\s\S]*?\};/g, () => constructCombinedStruct('UniformStruct'))
        .replace(bindingRegex, match => {
            const varName = match.split(' ').pop().split(':')[0];
            if (replacementsReplacement.has(varName)) {
                const updated = replacementsOriginal.get(varName) + ' ' + match.split(' ').slice(-2).join(' ');
                const newGroup = (updated as any).match(/@group\((\d+)\)/)[1];
                const newBinding = (updated as any).match(/@binding\((\d+)\)/)[1];
                changesShader1[varName] = { group: newGroup, binding: newBinding };
                return updated;
            }
            return match;
        });

        const result2 = bindings2str.replace(/struct UniformStruct \{[\s\S]*?\};/g, () => constructCombinedStruct('UniformStruct'))
        .replace(bindingRegex, match => {
            const varName = match.split(' ').pop().split(':')[0];
            if (replacementsOriginal.has(varName)) {
                const updated = replacementsOriginal.get(varName) + ' ' + match.split(' ').slice(-2).join(' ');
                const newGroup = (updated as any).match(/@group\((\d+)\)/)[1];
                const newBinding = (updated as any).match(/@binding\((\d+)\)/)[1];
                changesShader2[varName] = { group: newGroup, binding: newBinding };
                return updated;
            }
            return match;
        });

        return {
            code1: result1.trim(),
            changes1: changesShader1 as any,
            code2: result2.trim(),
            changes2: changesShader2 as any
        };

        /*
                const originalBindings = `
                struct UniformStruct {
                    a: f32,
                    b: f32,
                    c: f32
                };
                @group(0) @binding(0) var texture1: texture_2d<f32>;
                @group(0) @binding(1) var texture2: sampler;
                `;

                const replacementBindings = `
                struct UniformStruct {
                    c: f32,
                    d: f32
                };
                @group(0) @binding(0) var arr0: array<f32> //this should be set to @binding(2) since it is the second one
                @group(1) @binding(0) var arr1: array<f32>;
                @group(1) @binding(1) var texture1: texture_2d<f32>;
                @group(1) @binding(2) var textureB: sampler;
                `;

                const combined = combineBindings(originalBindings, replacementBindings);
                console.log(combined.result1);
                console.log(combined.changes1);
                console.log(combined.result2);
                console.log(combined.changes2);
         * 
         * 
         * 
         */
    }

    static combineShaderParams (
        shader1Obj:TranspiledShader, 
        shader2Obj:TranspiledShader
    ) {
        let combinedAst = shader2Obj.ast ? [...shader1Obj.ast] : [] as any[]; // using spread syntax to clone
        let combinedParams = shader2Obj.params ? [...shader1Obj.params] : [] as any[];
        let combinedReturnedVars = [] as any[];

        const returnMatches = shader2Obj.funcStr.match(/^(?![ \t]*\/\/).*\breturn .*;/gm);
        if (returnMatches) {
            const returnedVars = returnMatches.map(match => match.replace(/^[ \t]*return /, '').replace(';', ''));
            combinedReturnedVars.push(...WGSLTranspiler.flattenStrings(returnedVars));
        }

        const returnMatches2 = shader1Obj.funcStr.match(/^(?![ \t]*\/\/).*\breturn .*;/gm);
        if (returnMatches2) {
            const returnedVars2 = returnMatches2.map(match => match.replace(/^[ \t]*return /, '').replace(';', ''));
            combinedReturnedVars.push(...WGSLTranspiler.flattenStrings(returnedVars2));
        }

        //we are combining vertex and frag shader inputs into one long array, and updating bindings to match sequential instantiation between the vertex and frag so the binding layouts match
        if (shader2Obj.ast) {
            shader2Obj.ast.forEach((n) => {
                if(!combinedAst.find((v) => { if(v.name === n.name) return true;})) {
                    combinedAst.push(n); 
                    if(shader2Obj.params.find((v)=>{if(v.name === n.name) return true;}) && !combinedParams.find((v)=>{if(v.name === n.name) return true;})) 
                        combinedParams.push(n);
                }  
            });
        }
        
        // Filter out duplicate bindings and re-index the remaining ones
        const uniqueBindings = new Set();
        const updatedParams = [] as any[];
        const bindingMap2 = new Map();  // Only for fragment shader

        let maxSharedBindings = {} as any; //per group

        // Shared bindings: Make fragment shader match vertex shader
        shader1Obj.params.forEach((entry,i) => {
            if (
                shader2Obj.params.some(param => param.name === entry.name) && 
                !uniqueBindings.has(entry.name) && !entry.sharedBinding
            ) {
                if(!maxSharedBindings[entry.group]) maxSharedBindings[entry.group] = 0;
                uniqueBindings.add(entry.name);
                const newBinding = maxSharedBindings[entry.group]; // Keep vertex shader binding
                bindingMap2.set(`${entry.group},${entry.binding}`, newBinding);  // Map fragment shader's old binding to new
                entry.binding = newBinding;
                maxSharedBindings[entry.group]++;
            }
        });

        // Exclusive fragment shader bindings
        shader2Obj.params.forEach((entry,i) => {
            if (
                !shader1Obj.params.some(param => param.name === entry.name) && 
                !uniqueBindings.has(entry.name) && maxSharedBindings[entry.group] //if any bindings for this group were changed
                && !entry.sharedBinding
            ) {
                if(!maxSharedBindings[entry.group]) maxSharedBindings[entry.group] = 0;
                uniqueBindings.add(entry.name);
                bindingMap2.set(`${entry.group},${entry.binding}`, maxSharedBindings[entry.group]);
                entry.binding = maxSharedBindings[entry.group];
                maxSharedBindings[entry.group]++;
            }
        });

        // Only update binding numbers in the shader code for fragment shader using bindingMap2
        let shaderCode2 = shader2Obj.code;
        for (let [oldBinding, newBinding] of bindingMap2.entries()) {
            const [group,binding] = oldBinding.split(',');
            const regex = new RegExp(`@group\\(${group}\\) @binding\\(${binding}\\)`, 'g');
            shaderCode2 = shaderCode2.replace(regex, `@group(${group}) @binding(${newBinding})`);
        }

        shader2Obj.code = shaderCode2;
        shader1Obj.ast = combinedAst;
        (shader1Obj as any).returnedVars = combinedReturnedVars;
        shader1Obj.params = combinedParams;

        shader2Obj.ast = combinedAst;
        (shader2Obj as any).returnedVars = combinedReturnedVars;
        shader2Obj.params = combinedParams;
    }

    //this pipeline is set to only use javascript functions so it can generate asts and infer all of the necessary buffering orders and types
    static convertToWebGPU(
        func:Function|string,  
        shaderType:'compute'|'vertex'|'fragment'='compute', 
        bindGroupNumber=0, 
        workGroupSize=64, 
        vertexBufferOptions:{
            stepMode?:'instance'|'vertex',
            [key:string]:string
        }[]=[{
            color:'vec4<f32>'
        }],
        gpuFuncs?:(Function|string)[],
        variableTypes?:{[key:string]:string|{ prefix?: string; type: string; }},
        textureOptions?:{[key:string]:{
            binding?:string|number, //map to another texture variable binding e.g. a storage texture in a compute shader outputting as a texture in a vertex/fragment
            group?:string|number,
            isDepth?:boolean,
            isStorage?:boolean,
            isSampler?:boolean,
            isComparisonSampler?:boolean,
            //else defaults to implicit usage (which works great in most cases)
            [key:string]:any
        }},
        lastBinding=0,
        params?:Param[]
    ) { //use compute shaders for geometry shaders
        let funcStr = typeof func === 'string' ? func : func.toString();
        funcStr = funcStr.replace(/(?<!\w)this\./g, '');
        const tokens = this.tokenize(funcStr);
        const ast = this.parse(funcStr, tokens, shaderType, vertexBufferOptions);
        //console.log(ast);
        let webGPUCode = this.generateDataStructures(
            funcStr, 
            ast, 
            bindGroupNumber, 
            shaderType, 
            variableTypes,
            textureOptions,
            lastBinding,
            params
        ); //simply share bindGroups 0 and 1 between compute and render

        const header = webGPUCode.code;
        webGPUCode.code += '\n' + this.generateMainFunctionWorkGroup(
            funcStr, 
            ast, 
            webGPUCode.params, 
            shaderType, 
            vertexBufferOptions, 
            workGroupSize, 
            gpuFuncs
        ); // Pass funcStr as the first argument

        return {
            code:this.indentCode(webGPUCode.code), 
            header, 
            ast, 
            params:webGPUCode.params, 
            funcStr, 
            defaultUniforms:webGPUCode.defaultUniforms, 
            type:shaderType,
            workGroupSize:shaderType === 'compute' ? workGroupSize : undefined,
            bindGroupNumber,
            lastBinding:webGPUCode.lastBinding
        } as TranspiledShader;
    }


}


function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

function replaceJSFunctions(code, replacements) {
    for (let [jsFunc, shaderFunc] of Object.entries(replacements)) {
        const regex = new RegExp(jsFunc.replace('.', '\\.'), 'g'); // Escape dots for regex
        code = code.replace(regex, shaderFunc);
    }
    return code;
}


// Usage: replace javascript functions or constants with their WGSL equivalent. Note you can also just call any WGSL function without the javascript equivalent existing as nothing executs in JS
export const replacements = {
    'Math.PI': `${Math.PI}`,
    'Math.E': `${Math.E}`,
    'Math.LN10': `${Math.LN10}`,
    'Math.LN2': `${Math.LN2}`,
    'Math.LOG10E': `${Math.LOG10E}`,
    'Math.LOG2E': `${Math.LOG2E}`,
    'Math.SQRT1_2': `${Math.SQRT1_2}`,
    'Math.SQRT2': `${Math.SQRT2}`,
    'Math.abs': 'abs',
    'Math.acos': 'acos',
    'Math.acosh': 'acosh',
    'Math.asin': 'asin',
    'Math.asinh': 'asinh',
    'Math.atan': 'atan',
    'Math.atan2': 'atan2',
    'Math.atanh': 'atanh',
    // 'Math.cbrt': '', // No direct WGSL equivalent
    'Math.ceil': 'ceil',
    'Math.cos': 'cos',
    'Math.cosh': 'cosh',
    'Math.clz32': 'countLeadingZeros',
    // 'Math.imul': '', // No direct WGSL equivalent
    'Math.exp': 'exp',
    // 'Math.expm1': '', // No direct WGSL equivalent
    'Math.floor': 'floor',
    'Math.log': 'log',
    'Math.log2': 'log2',
    'Math.max': 'max',
    'Math.min': 'min',
    'Math.pow': 'pow',
    // 'Math.random': '', // No direct WGSL equivalent
    'Math.round': 'round',
    'Math.sin': 'sin',
    'Math.sinh': 'sinh',
    'Math.sqrt': 'sqrt',
    'Math.tan': 'tan',
    'Math.tanh': 'tanh',
    'Math.trunc': 'trunc',
    // ... add more replacements as needed
};


const wgslTypeSizes32 = {
    'bool': { alignment: 1, size: 1, ct:1 },
    'u8': { alignment: 1, size: 1, ct:1 },
    'i8': { alignment: 1, size: 1, ct:1 },
    'i32': { alignment: 4, size: 4, vertexFormats: { "sint32": true }, ct:1 },
    'u32': { alignment: 4, size: 4, vertexFormats: { "uint32": true }, ct:1 },
    'f32': { alignment: 4, size: 4, vertexFormats: { "float32": true }, ct:1 },
    'i64': { alignment: 8, size: 8, ct:1 },
    'u64': { alignment: 8, size: 8, ct:1 },
    'f64': { alignment: 8, size: 8, ct:1 },

    'atomic<u32>': { alignment: 4, size: 4, ct:1 },
    'atomic<i32>': { alignment: 4, size: 4 , ct:1},

    'vec2<i32>': { alignment: 8, size: 8, vertexFormats: { "sint8x2": true, "sint16x2": true, "sint32x2": true }, ct:2 },
    'vec2<u32>': { alignment: 8, size: 8, vertexFormats: { "uint8x2": true, "uint16x2": true, "uint32x2": true }, ct:2 },
    'vec2<f32>': { alignment: 8, size: 8, vertexFormats: { "unorm8x2": true, "unorm16x2": true, "float32x2": true, "snorm8x2": true, "snorm16x2": true }, ct:2 },
    'vec3<i32>': { alignment: 16, size: 12, vertexFormats: { "sint32x3": true }, ct:3 },
    'vec3<u32>': { alignment: 16, size: 12, vertexFormats: { "uint32x3": true }, ct:3 },
    'vec3<f32>': { alignment: 16, size: 12, vertexFormats: { "float32x3": true }, ct:3 },
    'vec4<i32>': { alignment: 16, size: 16, vertexFormats: { "sint8x4": true, "sint16x4": true, "sint32x4": true }, ct:4 },
    'vec4<u32>': { alignment: 16, size: 16, vertexFormats: { "uint8x4": true, "uint16x4": true, "uint32x4": true }, ct:4 },
    'vec4<f32>': { alignment: 16, size: 16, vertexFormats: { "unorm8x4": true, "unorm16x4": true, "float32x4": true, "snorm8x4": true, "snorm16x4": true, "float16x4": true }, ct:4 },
    
    'vec2i': { alignment: 8, size: 8, vertexFormats: { "sint8x2": true, "sint16x2": true, "sint32x2": true }, ct:2 }, // shorthand for vec2<i32>
    'vec2u': { alignment: 8, size: 8, vertexFormats: { "uint8x2": true, "uint16x2": true, "uint32x2": true }, ct:2 }, // shorthand for vec2<u32>
    'vec2f': { alignment: 8, size: 8, vertexFormats: { "unorm8x2": true, "unorm16x2": true, "float32x2": true, "snorm8x2": true, "snorm16x2": true }, ct:2 }, // shorthand for vec2<f32>
    'vec3i': { alignment: 16, size: 12, vertexFormats: { "sint32x3": true }, ct:3 }, // shorthand for vec3<i32>
    'vec3u': { alignment: 16, size: 12, vertexFormats: { "uint32x3": true }, ct:3 }, // shorthand for vec3<u32>
    'vec3f': { alignment: 16, size: 12, vertexFormats: { "float32x3": true }, ct:3 }, // shorthand for vec3<f32>
    'vec4i': { alignment: 16, size: 16, vertexFormats: { "sint8x4": true, "sint16x4": true, "sint32x4": true }, ct:4 }, // shorthand for vec4<i32>
    'vec4u': { alignment: 16, size: 16, vertexFormats: { "uint8x4": true, "uint16x4": true, "uint32x4": true }, ct:4 }, // shorthand for vec4<u32>
    'vec4f': { alignment: 16, size: 16, vertexFormats: { "unorm8x4": true, "unorm16x4": true, "float32x4": true, "snorm8x4": true, "snorm16x4": true, "float16x4": true }, ct:4 }, // shorthand for vec4<f32>

    //FYI matrix u and i formats are not supported in wgsl (yet) afaik
    'mat2x2<f32>': { alignment: 8, size: 16, ct:4 },
    'mat2x2<i32>': { alignment: 8, size: 16, ct:4 },
    'mat2x2<u32>': { alignment: 8, size: 16, ct:4 },
    'mat3x2<f32>': { alignment: 8, size: 24, ct:6 },
    'mat3x2<i32>': { alignment: 8, size: 24, ct:6 },
    'mat3x2<u32>': { alignment: 8, size: 24, ct:6 },
    'mat4x2<f32>': { alignment: 8, size: 32, ct:8 },
    'mat4x2<i32>': { alignment: 8, size: 32, ct:8 },
    'mat4x2<u32>': { alignment: 8, size: 32, ct:8 },
    'mat2x3<f32>': { alignment: 16, size: 24, ct:6 },
    'mat2x3<i32>': { alignment: 16, size: 24, ct:6 },
    'mat2x3<u32>': { alignment: 16, size: 24, ct:6 },
    'mat3x3<f32>': { alignment: 16, size: 36, ct:9 },
    'mat3x3<i32>': { alignment: 16, size: 36, ct:9 },
    'mat3x3<u32>': { alignment: 16, size: 36, ct:9 },
    'mat4x3<f32>': { alignment: 16, size: 48, ct:12 },
    'mat4x3<i32>': { alignment: 16, size: 48, ct:12 },
    'mat4x3<u32>': { alignment: 16, size: 48, ct:12 },
    'mat2x4<f32>': { alignment: 16, size: 32, ct:8 },
    'mat2x4<i32>': { alignment: 16, size: 32, ct:8 },
    'mat2x4<u32>': { alignment: 16, size: 32, ct:8 },
    'mat3x4<f32>': { alignment: 16, size: 48, ct:12 },
    'mat3x4<i32>': { alignment: 16, size: 48, ct:12 },
    'mat3x4<u32>': { alignment: 16, size: 48, ct:12 },
    'mat4x4<f32>': { alignment: 16, size: 64, ct:16 },
    'mat4x4<i32>': { alignment: 16, size: 64, ct:16 },
    'mat4x4<u32>': { alignment: 16, size: 64, ct:16 },

    'mat2x2f': { alignment: 8, size: 16, ct:4 }, // shorthand for mat2x2<f32>
    'mat2x2i': { alignment: 8, size: 16, ct:4 }, // shorthand for mat2x2<i32>
    'mat2x2u': { alignment: 8, size: 16, ct:4 }, // shorthand for mat2x2<u32>
    'mat3x2f': { alignment: 8, size: 24, ct:6 }, // shorthand for mat3x2<f32>
    'mat3x2i': { alignment: 8, size: 24, ct:6 }, // shorthand for mat3x2<i32>
    'mat3x2u': { alignment: 8, size: 24, ct:6 }, // shorthand for mat3x2<u32>
    'mat4x2f': { alignment: 8, size: 32, ct:8 }, // shorthand for mat4x2<f32>
    'mat4x2i': { alignment: 8, size: 32, ct:8 }, // shorthand for mat4x2<i32>
    'mat4x2u': { alignment: 8, size: 32, ct:8 }, // shorthand for mat4x2<u32>
    'mat2x3f': { alignment: 16, size: 24, ct:6 }, // shorthand for mat2x3<f32>
    'mat2x3i': { alignment: 16, size: 24, ct:6 }, // shorthand for mat2x3<i32>
    'mat2x3u': { alignment: 16, size: 24, ct:6 }, // shorthand for mat2x3<u32>
    'mat3x3f': { alignment: 16, size: 36, ct:9 }, // shorthand for mat3x3<f32>
    'mat3x3i': { alignment: 16, size: 36, ct:9 }, // shorthand for mat3x3<i32>
    'mat3x3u': { alignment: 16, size: 36, ct:9 }, // shorthand for mat3x3<u32>
    'mat4x3f': { alignment: 16, size: 48, ct:12 }, // shorthand for mat4x3<f32>
    'mat4x3i': { alignment: 16, size: 48, ct:12 }, // shorthand for mat4x3<i32>
    'mat4x3u': { alignment: 16, size: 48, ct:12 }, // shorthand for mat4x3<u32>
    'mat2x4f': { alignment: 16, size: 32, ct:8 }, // shorthand for mat2x4<f32>
    'mat2x4i': { alignment: 16, size: 32, ct:8 }, // shorthand for mat2x4<i32>
    'mat2x4u': { alignment: 16, size: 32, ct:8 }, // shorthand for mat2x4<u32>
    'mat3x4f': { alignment: 16, size: 48, ct:12 }, // shorthand for mat3x4<f32>
    'mat3x4i': { alignment: 16, size: 48, ct:12 }, // shorthand for mat3x4<i32>
    'mat3x4u': { alignment: 16, size: 48, ct:12 }, // shorthand for mat3x4<u32>
    'mat4x4f': { alignment: 16, size: 64, ct:16 }, // shorthand for mat4x4<f32>
    'mat4x4i': { alignment: 16, size: 64, ct:16 }, // shorthand for mat4x4<i32>
    'mat4x4u': { alignment: 16, size: 64, ct:16 }, // shorthand for mat4x4<u32>


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

    //FYI matrix u and i formats are not supported in wgsl (yet) afaik
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
    'mat4x4<u16>': { alignment: 8, size: 32 },

    'mat2x2h': { alignment: 4, size: 8 }, // shorthand for mat2x2<f16>
    'mat3x2h': { alignment: 4, size: 12 }, // shorthand for mat3x2<f16>
    'mat4x2h': { alignment: 4, size: 16 }, // shorthand for mat4x2<f16>
    'mat2x3h': { alignment: 8, size: 16 }, // shorthand for mat2x3<f16>
    'mat3x3h': { alignment: 8, size: 24 }, // shorthand for mat3x3<f16>
    'mat4x3h': { alignment: 8, size: 32 }, // shorthand for mat4x3<f16>
    'mat2x4h': { alignment: 8, size: 16 }, // shorthand for mat2x4<f16>
    'mat3x4h': { alignment: 8, size: 24 }, // shorthand for mat3x4<f16>
    'mat4x4h': { alignment: 8, size: 32 }, // shorthand for mat4x4<f16>

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


export const textureFormats = [ //https://www.w3.org/TR/webgpu/#texture-formats
    // 8-bit formats
    "r8unorm",
    "r8snorm",
    "r8uint",
    "r8sint",

    // 16-bit formats
    "r16uint",
    "r16sint",
    "r16float",
    "rg8unorm",
    "rg8snorm",
    "rg8uint",
    "rg8sint",

    // 32-bit formats
    "r32uint",
    "r32sint",
    "r32float",
    "rg16uint",
    "rg16sint",
    "rg16float",
    "rgba8unorm",
    "rgba8unorm-srgb",
    "rgba8snorm",
    "rgba8uint",
    "rgba8sint",
    "bgra8unorm",
    "bgra8unorm-srgb",

    // Packed 32-bit formats
    "rgb9e5ufloat",
    "rgb10a2uint",
    "rgb10a2unorm",
    "rg11b10ufloat",

    // 64-bit formats
    "rg32uint",
    "rg32sint",
    "rg32float",
    "rgba16uint",
    "rgba16sint",
    "rgba16float",

    // 128-bit formats
    "rgba32uint",
    "rgba32sint",
    "rgba32float",

    // Depth/stencil formats
    "stencil8",
    "depth16unorm",
    "depth24plus",
    "depth24plus-stencil8",
    "depth32float",

    // "depth32float-stencil8" feature
    "depth32float-stencil8",

    // BC compressed formats usable if "texture-compression-bc" is both
    // supported by the device/user agent and enabled in requestDevice.
    "bc1-rgba-unorm",
    "bc1-rgba-unorm-srgb",
    "bc2-rgba-unorm",
    "bc2-rgba-unorm-srgb",
    "bc3-rgba-unorm",
    "bc3-rgba-unorm-srgb",
    "bc4-r-unorm",
    "bc4-r-snorm",
    "bc5-rg-unorm",
    "bc5-rg-snorm",
    "bc6h-rgb-ufloat",
    "bc6h-rgb-float",
    "bc7-rgba-unorm",
    "bc7-rgba-unorm-srgb",

    // ETC2 compressed formats usable if "texture-compression-etc2" is both
    // supported by the device/user agent and enabled in requestDevice.
    "etc2-rgb8unorm",
    "etc2-rgb8unorm-srgb",
    "etc2-rgb8a1unorm",
    "etc2-rgb8a1unorm-srgb",
    "etc2-rgba8unorm",
    "etc2-rgba8unorm-srgb",
    "eac-r11unorm",
    "eac-r11snorm",
    "eac-rg11unorm",
    "eac-rg11snorm",

    // ASTC compressed formats usable if "texture-compression-astc" is both
    // supported by the device/user agent and enabled in requestDevice.
    "astc-4x4-unorm",
    "astc-4x4-unorm-srgb",
    "astc-5x4-unorm",
    "astc-5x4-unorm-srgb",
    "astc-5x5-unorm",
    "astc-5x5-unorm-srgb",
    "astc-6x5-unorm",
    "astc-6x5-unorm-srgb",
    "astc-6x6-unorm",
    "astc-6x6-unorm-srgb",
    "astc-8x5-unorm",
    "astc-8x5-unorm-srgb",
    "astc-8x6-unorm",
    "astc-8x6-unorm-srgb",
    "astc-8x8-unorm",
    "astc-8x8-unorm-srgb",
    "astc-10x5-unorm",
    "astc-10x5-unorm-srgb",
    "astc-10x6-unorm",
    "astc-10x6-unorm-srgb",
    "astc-10x8-unorm",
    "astc-10x8-unorm-srgb",
    "astc-10x10-unorm",
    "astc-10x10-unorm-srgb",
    "astc-12x10-unorm",
    "astc-12x10-unorm-srgb",
    "astc-12x12-unorm",
    "astc-12x12-unorm-srgb",
];

//IDK if this is correct but it mostly depends
export const imageToTextureFormats = {
    ".png": [
        "r8unorm", 
        "rg8unorm", 
        "rgba8unorm", 
        "rgba8unorm-srgb", 
        "rgb10a2unorm", 
        "bgra8unorm", 
        "bgra8unorm-srgb"
    ],
    ".jpg": [
        "r8unorm", 
        "rg8unorm", 
        "rgba8unorm", 
        "rgba8unorm-srgb", 
        "rgb10a2unorm", 
        "bgra8unorm", 
        "bgra8unorm-srgb"
    ],
    ".hdr": [
        "r16float", 
        "rg16float", 
        "rgba16float"
    ],
    ".exr": [
        "r32float", 
        "rg32float", 
        "rgba32float"
    ]
};


//reference
const wgslBuiltInFunctions = {
    "Constructor Built-in Functions": {
        "Zero Value Built-in Functions": { //default values if instantiating empty numbers e.g. f32() or bool()
            "bool": "false",
            "i32": "0i",
            "u32": "0u",
            "f32": "0.0f",
            "f16": "0.0h"
        },
        "Value Constructor Built-in Functions": [
            "array", "bool", "f16", "f32", "i32", 
            "mat2x2", "mat2x3", "mat2x4", "mat3x2", 
            "mat3x3", "mat3x4", "mat4x2", "mat4x3", 
            "mat4x4", "Structures", "u32", "vec2", 
            "vec3", "vec4"
        ]
    },
    "Bit Reinterpretation Built-in Functions": ["bitcast"],
    "Logical Built-in Functions": ["all", "any", "select"],
    "Array Built-in Functions": ["arrayLength"],
    "Numeric Built-in Functions": [
        "abs", "acos", "acosh", "asin", "asinh", "atan", 
        "atanh", "atan2", "ceil", "clamp", "cos", "cosh", 
        "countLeadingZeros", "countOneBits", "countTrailingZeros", 
        "cross", "degrees", "determinant", "distance", "dot", 
        "dot4U8Packed", "dot4I8Packed", "exp", "exp2", 
        "extractBits", "faceForward", 
        "firstLeadingBit", 
        "firstTrailingBit", "floor", "fma", "fract", "frexp", 
        "insertBits", "inverseSqrt", "ldexp", "length", "log", 
        "log2", "max", "min", "mix", "modf", "normalize", 
        "pow", "quantizeToF16", "radians", "reflect", "refract", 
        "reverseBits", "round", "saturate", "sign", "sin", 
        "sinh", "smoothstep", "sqrt", "step", "tan", "tanh", 
        "transpose", "trunc"
    ],
    "Derivative Built-in Functions": [
        "dpdx", "dpdxCoarse", "dpdxFine", "dpdy", 
        "dpdyCoarse", "dpdyFine", "fwidth", "fwidthCoarse", 
        "fwidthFine"
    ],
    "Texture Built-in Functions": [
        "textureDimensions", "textureGather", "textureGatherCompare", 
        "textureLoad", "textureNumLayers", "textureNumLevels", 
        "textureNumSamples", "textureSample", "textureSampleBias", 
        "textureSampleCompare", "textureSampleCompareLevel", 
        "textureSampleGrad", "textureSampleLevel", 
        "textureSampleBaseClampToEdge", "textureStore"
    ],
    "Atomic Built-in Functions": [
        "Atomic Load", "Atomic Store", "Atomic Read-modify-write"
    ],
    "Data Packing Built-in Functions": [
        "pack4x8snorm", "pack4x8unorm", "pack4xI8", "pack4xU8", 
        "pack4xI8Clamp", "pack4xU8Clamp", "pack2x16snorm", 
        "pack2x16unorm", "pack2x16float"
    ],
    "Data Unpacking Built-in Functions": [
        "unpack4x8snorm", "unpack4x8unorm", "unpack4xI8", "unpack4xU8", 
        "unpack2x16snorm", "unpack2x16unorm", "unpack2x16float"
    ],
    "Synchronization Built-in Functions": [
        "storageBarrier", "textureBarrier", "workgroupBarrier", 
        "workgroupUniformLoad"
    ]
};


export const WGSLTypeSizes = Object.assign({}, wgslTypeSizes16, wgslTypeSizes32);


for (const [key, value] of Object.entries(WGSLTypeSizes)) {
    WGSLTypeSizes[key] = { ...value, type: key };
}
