// ../src/transpiler.ts
var WGSLTranspiler = class _WGSLTranspiler {
  static builtInUniforms = {
    resX: { type: "f32", callback: (shaderContext) => {
      return shaderContext.canvas ? shaderContext.canvas.width : window.innerWidth;
    } },
    resY: { type: "f32", callback: (shaderContext) => {
      return shaderContext.canvas ? shaderContext.canvas.height : window.innerHeight;
    } },
    //canvas resolution
    mouseX: { type: "f32", callback: (shaderContext) => {
      if (!shaderContext.MOUSEMOVELISTENER) {
        let elm = shaderContext.canvas ? shaderContext.canvas : window;
        shaderContext.MOUSEMOVELISTENER = elm.onmousemove = (evt) => {
          shaderContext.mouseX = evt.offsetX;
          shaderContext.mouseY = evt.offsetY;
        };
        shaderContext.mouseX = 0;
      }
      return shaderContext.mouseX;
    } },
    mouseY: { type: "f32", callback: (shaderContext) => {
      if (!shaderContext.MOUSEMOVELISTENER) {
        let elm = shaderContext.canvas ? shaderContext.canvas : window;
        shaderContext.MOUSEMOVELISTENER = elm.onmousemove = (evt) => {
          shaderContext.mouseX = evt.offsetX;
          shaderContext.mouseY = evt.offsetY;
        };
        shaderContext.mouseY = 0;
      }
      return shaderContext.mouseY;
    } },
    //mouse position
    clicked: {
      type: "i32",
      //onmousedown
      callback: (shaderContext) => {
        if (!shaderContext.MOUSEDOWNLISTENER) {
          let elm = shaderContext.canvas ? shaderContext.canvas : window;
          shaderContext.MOUSEDOWNLISTENER = elm.onmousedown = (evt) => {
            shaderContext.clicked = true;
          };
          shaderContext.MOUSEUPLISTENER = elm.onmouseup = (evt) => {
            shaderContext.clicked = false;
          };
          shaderContext.clicked = false;
        }
        return shaderContext.clicked;
      }
    },
    //keyinputs
    frame: { type: "f32", callback: function(shaderContext) {
      if (!shaderContext.frame)
        shaderContext.frame = 0;
      let result = shaderContext.frame;
      shaderContext.frame++;
      return result;
    } },
    //frame counter
    utcTime: { type: "f32", callback: (shaderContext) => {
      return Date.now();
    } }
    //utc time                 
  };
  //etc.. more we can add from shaderToy
  static getFunctionHead = (methodString) => {
    let startindex = methodString.indexOf("=>") + 1;
    if (startindex <= 0) {
      startindex = methodString.indexOf("){");
    }
    if (startindex <= 0) {
      startindex = methodString.indexOf(") {");
    }
    return methodString.slice(0, methodString.indexOf("{", startindex) + 1);
  };
  static splitIgnoringBrackets = (str) => {
    const result = [];
    let depth = 0;
    let currentToken = "";
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      if (char === "," && depth === 0) {
        result.push(currentToken);
        currentToken = "";
      } else {
        currentToken += char;
        if (char === "(" || char === "[" || char === "{") {
          depth++;
        } else if (char === ")" || char === "]" || char === "}") {
          depth--;
        }
      }
    }
    if (currentToken) {
      result.push(currentToken);
    }
    return result;
  };
  static tokenize(funcStr) {
    let head = this.getFunctionHead(funcStr);
    let paramString = head.substring(head.indexOf("(") + 1, head.lastIndexOf(")"));
    let params = this.splitIgnoringBrackets(paramString).map((param) => ({
      token: param,
      isInput: true
    }));
    const assignmentTokens = (funcStr.match(/(const|let|var)\s+(\w+)\s*=\s*([^;]+)/g) || []).map((token) => ({
      token,
      isInput: false
    }));
    const builtInUniformsKeys = Object.keys(this.builtInUniforms).join("|");
    const builtInUniformsPattern = new RegExp(`(?<![a-zA-Z0-9_])(${builtInUniformsKeys})(?![a-zA-Z0-9_])`, "g");
    const builtInUniformsTokens = (funcStr.match(builtInUniformsPattern) || []).map((token) => ({
      token,
      isInput: false
      // or true, based on your requirements
    }));
    params = params.concat(builtInUniformsTokens);
    return params.concat(assignmentTokens);
  }
  static excludedNames = {
    "color": true,
    "position": true,
    "uv": true,
    "normal": true,
    "pixel": true
  };
  static parse = (fstr, tokens, shaderType = "compute") => {
    const ast = [];
    const returnMatches = fstr.match(/^(?![ \t]*\/\/).*\breturn .*;/gm);
    let returnedVars = returnMatches ? returnMatches.map((match) => match.replace(/^[ \t]*return /, "").replace(";", "")) : void 0;
    returnedVars = this.flattenStrings(returnedVars);
    const functionBody = fstr.substring(fstr.indexOf("{"));
    tokens.forEach(({ token, isInput }, i) => {
      let isReturned = returnedVars?.find((v) => {
        if (token.includes(v)) {
          if (shaderType !== "compute" && Object.keys(this.excludedNames).find((t) => token.includes(t)) || Object.keys(this.builtInUniforms).find((t) => token.includes(t))) {
            tokens[i].isInput = false;
          } else
            return true;
        }
      });
      let isModified = new RegExp(`\\b${token.split("=")[0]}\\b(\\[\\w+\\])?\\s*=`).test(functionBody);
      if (token.includes("=")) {
        const variableMatch = token.match(/(const|let|var)?\s*(\w+)\s*=\s*(.+)/);
        if (variableMatch && (variableMatch[3].startsWith("new") || variableMatch[3].startsWith("["))) {
          let length;
          if (variableMatch[3].startsWith("new Array(")) {
            const arrayLengthMatch = variableMatch[3].match(/new Array\((\d+)\)/);
            length = arrayLengthMatch ? parseInt(arrayLengthMatch[1]) : void 0;
          } else if (variableMatch[3].startsWith("new")) {
            const typedArrayLengthMatch = variableMatch[3].match(/new \w+Array\(\[([^\]]+)\]\)/);
            length = typedArrayLengthMatch ? typedArrayLengthMatch[1].split(",").length : void 0;
          } else {
            const directArrayLengthMatch = variableMatch[3].match(/\[([^\]]+)\]/);
            length = directArrayLengthMatch ? directArrayLengthMatch[1].split(",").length : void 0;
          }
          ast.push({
            type: "array",
            name: variableMatch[2],
            value: variableMatch[3],
            isInput,
            length,
            // Added this line to set the extracted length
            isReturned: returnedVars ? returnedVars?.includes(variableMatch[2]) : isInput ? true : false,
            isModified
          });
        } else if (token.startsWith("vec") || token.startsWith("mat")) {
          const typeMatch = token.match(/(vec\d|mat\d+x\d+)\(([^)]+)\)/);
          if (typeMatch) {
            ast.push({
              type: typeMatch[1],
              name: token.split("=")[0],
              value: typeMatch[2],
              isInput,
              isReturned: returnedVars ? returnedVars?.includes(token.split("=")[0]) : isInput ? true : false,
              isModified
            });
          }
        } else {
          ast.push({
            type: "variable",
            name: variableMatch[2],
            value: variableMatch[3],
            isUniform: true,
            isInput,
            isReturned: returnedVars ? returnedVars?.includes(variableMatch[2]) : isInput ? true : false,
            isModified
          });
        }
      } else {
        ast.push({
          type: "variable",
          name: token,
          value: "unknown",
          isUniform: true,
          isInput,
          isReturned,
          isModified
        });
      }
    });
    return ast;
  };
  static inferTypeFromValue(value, funcStr, ast, defaultValue = "f32") {
    value = value.trim();
    if (value === "true" || value === "false")
      return "bool";
    else if (value.startsWith('"') || value.startsWith("'") || value.startsWith("`"))
      return value.substring(1, value.length - 1);
    else if (value.startsWith("vec")) {
      const floatVecMatch = value.match(/vec(\d)f/);
      if (floatVecMatch) {
        return floatVecMatch[0];
      }
      const vecTypeMatch = value.match(/vec(\d)\(/);
      if (vecTypeMatch) {
        const vecSize = vecTypeMatch[1];
        const type = value.includes(".") ? `<f32>` : `<i32>`;
        return `vec${vecSize}${type}`;
      }
    } else if (value.startsWith("mat")) {
      const type = "<f32>";
      return value.match(/mat(\d)x(\d)/)[0] + type;
    } else if (value.startsWith("[")) {
      const firstElement = value.split(",")[0].substring(1);
      if (firstElement === "]")
        return "array<f32>";
      if (firstElement.startsWith("[") && !firstElement.endsWith("]")) {
        return this.inferTypeFromValue(firstElement, funcStr, ast);
      } else {
        if (firstElement.startsWith("vec") || firstElement.startsWith("mat")) {
          return `array<${this.inferTypeFromValue(firstElement, funcStr, ast)}>`;
        } else if (firstElement.includes(".")) {
          return "array<f32>";
        } else if (!isNaN(firstElement)) {
          return "array<i32>";
        }
      }
    } else if (value.startsWith("new Array")) {
      const arrayNameMatch = value.match(/let\s+(\w+)\s*=/);
      if (arrayNameMatch) {
        const arrayName = arrayNameMatch[1];
        const assignmentMatch = funcStr.match(new RegExp(`${arrayName}\\[\\d+\\]\\s*=\\s*(.+?);`));
        if (assignmentMatch) {
          return this.inferTypeFromValue(assignmentMatch[1], funcStr, ast);
        }
      } else
        return "f32";
    } else if (value.startsWith("new Float32Array")) {
      return "array<f32>";
    } else if (value.startsWith("new Float64Array")) {
      return "array<f64>";
    } else if (value.startsWith("new Int8Array")) {
      return "array<i8>";
    } else if (value.startsWith("new Int16Array")) {
      return "array<i16>";
    } else if (value.startsWith("new Int32Array")) {
      return "array<i32>";
    } else if (value.startsWith("new BigInt64Array")) {
      return "array<i64>";
    } else if (value.startsWith("new BigUInt64Array")) {
      return "array<u64>";
    } else if (value.startsWith("new Uint8Array") || value.startsWith("new Uint8ClampedArray")) {
      return "array<u8>";
    } else if (value.startsWith("new Uint16Array")) {
      return "array<u16>";
    } else if (value.startsWith("new Uint32Array")) {
      return "array<u32>";
    } else if (value.includes(".")) {
      return "f32";
    } else if (!isNaN(value)) {
      return "i32";
    } else {
      const astNode = ast.find((node) => node.name === value);
      if (astNode) {
        if (astNode.type === "array") {
          return "f32";
        } else if (astNode.type === "variable") {
          return this.inferTypeFromValue(astNode.value, funcStr, ast);
        }
      }
    }
    return defaultValue;
  }
  static flattenStrings(arr) {
    if (!arr)
      return [];
    const callback = (item, index, array2) => {
      if (item.startsWith("[") && item.endsWith("]")) {
        return item.slice(1, -1).split(",").map((s) => s.trim());
      }
      return item;
    };
    return arr.reduce((acc, value, index, array2) => {
      return acc.concat(callback(value, index, array2));
    }, []);
  }
  static generateDataStructures(funcStr, ast, bindGroup = 0) {
    let code = "//Bindings (data passed to/from CPU) \n";
    const functionRegex = /function (\w+)\(([^()]*|\((?:[^()]*|\([^()]*\))*\))*\) \{([\s\S]*?)\}/g;
    let modifiedStr = funcStr;
    let match;
    while ((match = functionRegex.exec(funcStr)) !== null) {
      modifiedStr = modifiedStr.replace(match[3], "PLACEHOLDER");
    }
    const returnMatches = modifiedStr.match(/^(?![ \t]*\/\/).*\breturn .*;/gm);
    let returnedVars = returnMatches ? returnMatches.map((match2) => match2.replace(/^[ \t]*return /, "").replace(";", "")) : void 0;
    returnedVars = this.flattenStrings(returnedVars);
    let uniformsStruct = "";
    let defaultsStruct = "";
    let hasUniforms = 0;
    let defaultUniforms;
    const params = [];
    let bindingIncr = 0;
    let names = {};
    ast.forEach((node, i) => {
      if (names[node.name])
        return;
      names[node.name] = true;
      if (returnedVars.includes(node.name) && !this.excludedNames[node.name])
        node.isInput = true;
      function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      }
      if (new RegExp(`texture.*\\(${escapeRegExp(node.name)},`).test(funcStr)) {
        node.isTexture = true;
      } else if (new RegExp(`textureSampl.*\\(.*,${escapeRegExp(node.name)},`).test(funcStr)) {
        node.isSampler = true;
      }
      if (node.isTexture) {
        params.push(node);
        code += `@group(${bindGroup}) @binding(${bindingIncr}) var ${node.name}: texture_2d<f32>;

`;
        bindingIncr++;
      } else if (node.isSampler) {
        params.push(node);
        code += `@group(${bindGroup}) @binding(${bindingIncr}) var ${node.name}: sampler;

`;
        bindingIncr++;
      } else if (node.isInput && !this.builtInUniforms[node.name]) {
        if (node.type === "array") {
          const elementType = this.inferTypeFromValue(node.value.split(",")[0], funcStr, ast);
          node.type = elementType;
          params.push(node);
          code += `struct ${capitalizeFirstLetter(node.name)}Struct {
    values: ${elementType}
};

`;
          code += `@group(${bindGroup}) @binding(${bindingIncr})
`;
          if (!returnedVars || returnedVars?.includes(node.name)) {
            code += `var<storage, read_write> ${node.name}: ${capitalizeFirstLetter(node.name)}Struct;

`;
          } else {
            code += `var<storage, read> ${node.name}: ${capitalizeFirstLetter(node.name)}Struct;

`;
          }
          bindingIncr++;
        } else if (node.isUniform) {
          if (!hasUniforms) {
            uniformsStruct = `struct UniformsStruct {
`;
            hasUniforms = bindingIncr;
            bindingIncr++;
          }
          const uniformType = this.inferTypeFromValue(node.value, funcStr, ast);
          node.type = uniformType;
          params.push(node);
          uniformsStruct += `    ${node.name}: ${uniformType},
`;
        }
      } else if (this.builtInUniforms[node.name]) {
        if (!defaultUniforms) {
          defaultUniforms = [];
          defaultsStruct = `struct DefaultUniforms {
`;
        }
        const uniformType = this.builtInUniforms[node.name].type;
        defaultsStruct += `    ${node.name}: ${uniformType},
`;
        defaultUniforms.push(node.name);
      }
    });
    if (defaultUniforms) {
      defaultsStruct += "};\n\n";
      code += defaultsStruct;
      code += `@group(${bindGroup}) @binding(${bindingIncr}) var<uniform> defaults: DefaultUniforms;

`;
      bindingIncr++;
    }
    if (hasUniforms) {
      uniformsStruct += "};\n\n";
      code += uniformsStruct;
      code += `@group(${bindGroup}) @binding(${hasUniforms}) var<uniform> uniforms: UniformsStruct;

`;
    }
    return { code, params, defaultUniforms };
  }
  static extractAndTransposeInnerFunctions = (body, extract = true, ast, params, shaderType) => {
    const functionRegex = /function (\w+)\(([^()]*|\((?:[^()]*|\([^()]*\))*\))*\) \{([\s\S]*?)\}/g;
    let match;
    let extractedFunctions = "";
    while ((match = functionRegex.exec(body)) !== null) {
      const functionHead = match[0];
      const funcName = match[1];
      const funcBody = match[3];
      let paramString = functionHead.substring(functionHead.indexOf("(") + 1, functionHead.lastIndexOf(")"));
      let outputParam;
      const regex = /return\s+([\s\S]*?);/;
      const retmatch = body.match(regex);
      if (retmatch) {
        let inferredType = this.inferTypeFromValue(retmatch[1], body, ast, false);
        if (inferredType) {
          outputParam = inferredType;
        }
      }
      let params2 = this.splitIgnoringBrackets(paramString).map((p) => {
        let split = p.split("=");
        let vname = split[0];
        let inferredType = this.inferTypeFromValue(split[1], body, ast);
        if (!outputParam)
          outputParam = inferredType;
        return vname + ": " + inferredType;
      });
      const transposedBody = this.transposeBody(funcBody, funcBody, params2, shaderType, true, void 0, false).code;
      extractedFunctions += `fn ${funcName}(${params2}) -> ${outputParam} {${transposedBody}}

`;
    }
    if (extract)
      body = body.replace(functionRegex, "");
    return { body, extractedFunctions };
  };
  static generateMainFunctionWorkGroup(funcStr, ast, params, shaderType = "compute", nVertexBuffers = 1, workGroupSize = 256, gpuFuncs) {
    let code = "";
    if (gpuFuncs) {
      gpuFuncs.forEach((f) => {
        let result = this.extractAndTransposeInnerFunctions(typeof f === "function" ? f.toString() : f, false, ast, params, shaderType);
        if (result.extractedFunctions)
          code += result.extractedFunctions;
      });
    }
    const { body: mainBody, extractedFunctions } = this.extractAndTransposeInnerFunctions(funcStr.match(/{([\s\S]+)}/)[1], true, ast, params, shaderType);
    code += extractedFunctions;
    let vtxInps;
    let vboInputStrings = [];
    if (shaderType === "vertex" || shaderType === "fragment") {
      let vboStrings = Array.from({ length: nVertexBuffers }, (_, i) => {
        if (shaderType === "vertex")
          vboInputStrings.push(
            `@location(${4 * i}) color${i > 0 ? i + 1 : ""}In: vec4<f32>,
    @location(${4 * i + 1}) vertex${i > 0 ? i + 1 : ""}In: vec3<f32>, 
    @location(${4 * i + 2}) normal${i > 0 ? i + 1 : ""}In: vec3<f32>,
    @location(${4 * i + 3}) uv${i > 0 ? i + 1 : ""}In: vec2<f32>${i === nVertexBuffers - 1 ? "" : ","}`
          );
        return `
    @location(${4 * i}) color${i > 0 ? i + 1 : ""}: vec4<f32>,
    @location(${4 * i + 1}) vertex${i > 0 ? i + 1 : ""}: vec3<f32>, 
    @location(${4 * i + 2}) normal${i > 0 ? i + 1 : ""}: vec3<f32>,
    @location(${4 * i + 3}) uv${i > 0 ? i + 1 : ""}: vec2<f32>${i === nVertexBuffers - 1 ? "" : ","}`;
      });
      vtxInps = `
    @builtin(position) position: vec4<f32>, //pixel location
    //uploaded vertices from CPU, in interleaved format
${vboStrings.join("\n")}`;
      code += `
struct Vertex {
    ${vtxInps}
};
`;
    }
    if (shaderType === "compute") {
      code += `
//Main function call
//threadId tells us what x,y,z thread we are on

@compute @workgroup_size(${workGroupSize})
fn compute_main(  
    @builtin(global_invocation_id) threadId: vec3<u32>, //shader grid position
    @builtin(local_invocation_id) localId: vec3<u32>,   //workgroup grid position
    @builtin(local_invocation_index) localIndex: u32,   //linear index within workgroup grid
    @builtin(num_workgroups) workgroups: vec3<u32>,     //dispatch size (x,y,z) group count
    @builtin(workgroup_id) workgroupId: vec3<u32>       //position of workgroup in compute shader grid`;
      code += "\n) {\n";
    } else if (shaderType === "vertex") {
      code += `
@vertex
fn vtx_main(
    @builtin(vertex_index) vertexIndex : u32,   //current vertex
    @builtin(instance_index) instanceIndex: u32, //current instance
    ${vboInputStrings.join("\n")}`;
      code += "\n) -> Vertex {\n var pixel: Vertex;\n";
    } else if (shaderType === "fragment") {
      code += `
@fragment
fn frag_main(
    pixel: Vertex,
    @builtin(front_facing) is_front: bool,   //true when current fragment is on front-facing primitive
    @builtin(sample_index) sampleIndex: u32, //sample index for the current fragment
    @builtin(sample_mask) sampleMask: u32   //contains a bitmask indicating which samples in this fragment are covered by the primitive being rendered
) -> @location(0) vec4<f32> {`;
    }
    let shaderHead = code;
    let transposed = this.transposeBody(mainBody, funcStr, params, shaderType, shaderType === "fragment", shaderHead, true);
    code += transposed.code;
    if (transposed.consts?.length > 0)
      code = transposed.consts.join("\n") + "\n\n" + code;
    if (shaderType === "vertex")
      code += `
  return pixel; 
`;
    code += "\n}\n";
    return code;
  }
  static transposeBody = (body, funcStr, params, shaderType, returns = false, shaderHead = "", extractConsts = false) => {
    let code = "";
    const commentPlaceholders = {};
    let placeholderIndex = 0;
    body = body.replace(/\/\/.*$/gm, (match) => {
      const placeholder = `__COMMENT_PLACEHOLDER_${placeholderIndex}__`;
      commentPlaceholders[placeholder] = match;
      placeholderIndex++;
      return placeholder;
    });
    code = body.replace(/for \((let|var) (\w+) = ([^;]+); ([^;]+); ([^\)]+)\)/gm, "for (var $2 = $3; $4; $5)");
    const stringPlaceholders = {};
    let stringPlaceholderIndex = 0;
    code = code.replace(/('|"|`)([\s\S]*?)\1/gm, (match) => {
      const placeholder = `__CODE_PLACEHOLDER_${stringPlaceholderIndex}__`;
      stringPlaceholders[placeholder] = match.substring(1, match.length - 1);
      stringPlaceholderIndex++;
      return placeholder;
    });
    code = code.replace(/const (\w+) = (?!(vec\d+|mat\d+|\[.*|array))/gm, "let $1 = ");
    const vecMatDeclarationRegex = /(let|var) (\w+) = (vec\d+|mat\d+)/gm;
    code = code.replace(vecMatDeclarationRegex, "var $2 = $3");
    const vecMatDeclarationRegex2 = /const (\w+) = (vec\d+|mat\d+)/gm;
    code = code.replace(vecMatDeclarationRegex2, "const $2 = $3");
    const arrayVars = [];
    code.replace(/(let|var|const) (\w+) = (array|\[)/gm, (match, p1, varName) => {
      arrayVars.push(varName);
      return match;
    });
    if (shaderType !== "vertex" && shaderType !== "fragment") {
      code = code.replace(/(\w+)\[([\w\s+\-*\/]+)\]/gm, (match, p1, p2) => {
        if (arrayVars.includes(p1))
          return match;
        return `${p1}.values[${p2}]`;
      });
    } else {
      code = code.replace(/(position|vertex|color|normal|uv)|(\w+)\[([\w\s+\-*\/]+)\]/gm, (match, p1, p2, p3) => {
        if (p1 || arrayVars.includes(p2))
          return match;
        return `${p2}.values[${p3}]`;
      });
    }
    code = code.replace(/(\w+)\.length/gm, "arrayLength(&$1.values)");
    code = code.replace(/(\/\/[^\n]*);/gm, "$1");
    code = code.replace(/(let|var|const) (\w+) = \[([\s\S]*?)\];/gm, (match, varType, varName, values) => {
      const valuesLines = values.trim().split("\n");
      const vals = [];
      const cleanedValues = valuesLines.map((line) => {
        let cleaned = line.substring(0, line.indexOf("//") > 0 ? line.indexOf("//") : void 0);
        cleaned = cleaned.substring(0, line.indexOf("__CO") > 0 ? line.indexOf("__COMM") : void 0);
        vals.push(line);
        return cleaned?.indexOf(",") < 0 ? cleaned + "," : cleaned;
      }).join("\n");
      const valuesWithoutComments = cleanedValues.replace(/\/\*.*?\*\//gm, "").trim();
      const valuesArray = this.splitIgnoringBrackets(valuesWithoutComments);
      const size = valuesArray.length;
      const hasDecimal = valuesWithoutComments.includes(".");
      const isVecWithF = /^vec\d+f/.test(valuesWithoutComments);
      const inferredType = valuesWithoutComments.startsWith("mat") || hasDecimal || isVecWithF ? "f32" : "i32";
      let arrayValueType = inferredType;
      const arrayValueTypeMatch = valuesWithoutComments.match(/^(vec\d+f?|mat\d+x\d+)/gm);
      if (arrayValueTypeMatch) {
        arrayValueType = arrayValueTypeMatch[0];
      }
      return `${varType} ${varName} : array<${arrayValueType}, ${size}> = array<${arrayValueType}, ${size}>(
${vals.join("\n")}
);`;
    });
    function transformArrays(input) {
      let lines = input.split("\n");
      let output = [];
      function countCharacter(str, char) {
        return str.split(char).length - 1;
      }
      function extractFillValue(line) {
        let startIndex = line.indexOf(".fill(") + 6;
        let parenthesesCount = 1;
        let endIndex = startIndex;
        while (parenthesesCount !== 0 && endIndex < line.length) {
          endIndex++;
          if (line[endIndex] === "(") {
            parenthesesCount++;
          } else if (line[endIndex] === ")") {
            parenthesesCount--;
          }
        }
        return line.substring(startIndex, endIndex);
      }
      for (let line of lines) {
        line = line.trim();
        let transformedLine = line;
        if (/^(let|const|var)\s/.test(line) && line.includes(".fill(")) {
          let variableName = line.split("=")[0].trim().split(" ")[1];
          let size = line.split("new Array(")[1].split(")")[0].trim();
          let fillValue = extractFillValue(line);
          let sizeCount = countCharacter(size, "(") - countCharacter(size, ")");
          for (let i = 0; i < sizeCount; i++)
            size += ")";
          if (fillValue.startsWith("vec")) {
            let isVecWithF = /vec\d+f/.test(fillValue);
            let vecType = isVecWithF || fillValue.match(/\.\d+/) ? "f32" : "i32";
            transformedLine = `var ${variableName} : array<${fillValue.split("(")[0]}<${vecType}>, ${size}>;
for (var i: i32 = 0; i < ${size}; i = i + 1) {
	${variableName}[i] = ${fillValue.replace(fillValue.split("(")[0], fillValue.split("(")[0] + `<${vecType}>`)};
}`;
          } else if (fillValue.startsWith("mat")) {
            transformedLine = `var ${variableName} : array<${fillValue.split("(")[0]}<f32>, ${size}>;
for (var i: i32 = 0; i < ${size}; i = i + 1) {
	${variableName}[i] = ${fillValue.replace(/vec(\d)/g, "vec$1<f32>")};
}`;
          } else {
            transformedLine = `var ${variableName} : array<f32, ${size}>;
for (var i: i32 = 0; i < ${size}; i = i + 1) {
	${variableName}[i] = ${fillValue};
}`;
          }
        }
        output.push(transformedLine);
      }
      return output.join("\n");
    }
    code = transformArrays(code);
    code = code.replace(/(let|var|const) (\w+) = new (Float|Int|UInt)(\d+)Array\((\d+)\);/gm, (match, keyword, varName, typePrefix, bitSize, arraySize) => {
      let typeChar;
      switch (typePrefix) {
        case "Float":
          typeChar = "f";
          break;
        case "Int":
          typeChar = "i";
          break;
        case "UInt":
          typeChar = "u";
          break;
        default:
          typeChar = "f";
      }
      return `var ${varName} : array<${typeChar}${bitSize}, ${arraySize}>;`;
    });
    code = code.replace(/(let|var|const) (\w+) = new Array\((\d+)\);/gm, "var $2 : array<f32, $2>;");
    code = replaceJSFunctions(code, replacements);
    const vecMatCreationRegex = /(vec(\d+)|mat(\d+))\(([^)]+)\)/gm;
    code = code.replace(vecMatCreationRegex, (match, type, vecSize, matSize, args) => {
      const argArray = args.split(",").map((arg) => arg.trim());
      const hasDecimal = argArray.some((arg) => arg.includes("."));
      const isVecWithF = /^vec\d+f/.test(type);
      const inferredType = type.startsWith("mat") || isVecWithF || hasDecimal ? "f32" : "i32";
      if (type.startsWith("mat")) {
        return `${type}<f32>(${argArray.join(", ").replace(/vec(\d+)/gm, "vec$1<f32>")})`;
      } else {
        return `${type}<${inferredType}>(${argArray.join(", ")})`;
      }
    });
    params.forEach((param) => {
      if (param.isUniform) {
        const regex = new RegExp(`(?<![a-zA-Z0-9])${param.name}(?![a-zA-Z0-9])`, "gm");
        code = code.replace(regex, `uniforms.${param.name}`);
      }
    });
    Object.keys(this.builtInUniforms).forEach((param) => {
      const regex = new RegExp(`(?<![a-zA-Z0-9])${param}(?![a-zA-Z0-9])`, "gm");
      code = code.replace(regex, `defaults.${param}`);
    });
    for (const [placeholder, comment] of Object.entries(commentPlaceholders)) {
      code = code.replace(placeholder, comment);
    }
    for (const [placeholder, str] of Object.entries(stringPlaceholders)) {
      code = code.replace(placeholder, str);
    }
    if (shaderType === "fragment" || shaderType === "vertex") {
      const vertexVarMatches = shaderHead.match(/@location\(\d+\) (\w+):/gm);
      const vertexVars = vertexVarMatches ? vertexVarMatches.map((match) => {
        const parts = match.split(" ");
        return parts[1].replace(":", "");
      }) : [];
      vertexVars.push("position");
      vertexVars.forEach((varName) => {
        const regex = new RegExp(`(?<![a-zA-Z0-9_.])${varName}(?![a-zA-Z0-9_.])`, "gm");
        code = code.replace(regex, `pixel.${varName}`);
      });
    }
    code = code.replace(/^(.*[^;\s\{\[\(\,\>\}])(\s*\/\/.*)$/gm, "$1;$2");
    code = code.replace(/^(.*[^;\s\{\[\(\,\>\}])(?!\s*\/\/)(?=\s*$)/gm, "$1;");
    code = code.replace(/(\/\/[^\n]*);/gm, "$1");
    code = code.replace(/;([^\n]*)\s*(\n\s*)\)/gm, "$1$2)");
    let consts;
    if (extractConsts) {
      let extrConsts = function(text) {
        const pattern = /const\s+[a-zA-Z_][a-zA-Z0-9_]*\s*:\s*[a-zA-Z_][a-zA-Z0-9_<>,\s]*\s*=\s*[a-zA-Z_][a-zA-Z0-9_<>,\s]*(\([\s\S]*?\)|\d+\.?\d*);/gm;
        let match;
        const extractedConsts = [];
        while ((match = pattern.exec(text)) !== null) {
          extractedConsts.push(match[0]);
        }
        const pattern2 = /const\s+[a-zA-Z_][a-zA-Z0-9_]*\s*=\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\([\s\S]*?\)\s*;/gm;
        while ((match = pattern2.exec(text)) !== null) {
          extractedConsts.push(match[0]);
        }
        const modifiedText = text.replace(pattern, "").replace(pattern2, "").trim();
        return {
          consts: extractedConsts,
          code: modifiedText
        };
      };
      let extracted = extrConsts(code);
      code = extracted.code;
      consts = extracted.consts;
    }
    if (!returns)
      code = code.replace(/(return [^;]+;)/gm, "//$1");
    return { code, consts };
  };
  static indentCode(code) {
    let depth = 0;
    const tab = "    ";
    let result = "";
    let needsIndent = false;
    let leadingSpaceDetected = false;
    for (let i = 0; i < code.length; i++) {
      const char = code[i];
      if (char === "\n") {
        result += char;
        needsIndent = true;
        leadingSpaceDetected = false;
        continue;
      }
      if (char === " " && needsIndent) {
        leadingSpaceDetected = true;
      }
      if (needsIndent && !leadingSpaceDetected) {
        result += tab.repeat(depth);
        needsIndent = false;
      }
      if (char === "{" || char === "(") {
        depth++;
      }
      if (char === "}" || char === ")") {
        if (depth > 0)
          depth--;
        if (result.slice(-tab.length) === tab) {
          result = result.slice(0, -tab.length);
        }
      }
      result += char;
    }
    return result;
  }
  static addFunction = (func, shaders) => {
    if (!shaders.functions)
      shaders.functions = [];
    shaders.functions.push(func);
    for (const key of ["compute", "fragment", "vertex"]) {
      if (shaders[key])
        Object.assign(shaders[key], this.convertToWebGPU(shaders[key].funcStr, key, shaders[key].bindGroupNumber, shaders[key].nVertexBuffers, shaders[key].workGroupSize ? shaders[key].workGroupSize : void 0, shaders.functions));
    }
    return shaders;
  };
  //combine input bindings and create mappings so input arrays can be shared based on variable names, assuming same types in a continuous pipeline (the normal thing)
  static combineBindings(bindings1str, bindings2str) {
    const bindingRegex = /@group\((\d+)\) @binding\((\d+)\)[\s\S]*?var[\s\S]*? (\w+):/g;
    const structRegex = /struct (\w+) \{([\s\S]*?)\}/;
    const combinedStructs = /* @__PURE__ */ new Map();
    const replacementsOriginal = /* @__PURE__ */ new Map();
    const replacementsReplacement = /* @__PURE__ */ new Map();
    let changesOriginal = {};
    let changesReplacement = {};
    const extractBindings = (str, replacements2, changes) => {
      let match2;
      const regex = new RegExp(bindingRegex);
      while ((match2 = regex.exec(str)) !== null) {
        replacements2.set(match2[3], match2[0].slice(0, match2[0].indexOf(" var")));
        changes[match2[3]] = {
          group: match2[1],
          binding: match2[2]
        };
      }
    };
    extractBindings(bindings1str, replacementsOriginal, changesOriginal);
    extractBindings(bindings2str, replacementsReplacement, changesReplacement);
    let match = structRegex.exec(bindings1str);
    if (match) {
      const fields = match[2].trim().split(",\n").map((field) => field.trim());
      combinedStructs.set(match[1], fields);
    }
    match = structRegex.exec(bindings2str);
    if (match) {
      const fields = match[2].trim().split(",\n").map((field) => field.trim());
      const existing = combinedStructs.get(match[1]) || [];
      fields.forEach((field) => {
        const fieldName = field.split(":")[0].trim();
        if (!existing.some((e) => e.startsWith(fieldName))) {
          existing.push(field);
        }
      });
      combinedStructs.set(match[1], existing);
    }
    const constructCombinedStruct = (structName) => {
      if (combinedStructs.has(structName)) {
        return `struct ${structName} {
    ${combinedStructs.get(structName).join(",\n    ")}
};
`;
      }
      return "";
    };
    const result1 = bindings1str.replace(/struct UniformStruct \{[\s\S]*?\};/g, () => constructCombinedStruct("UniformStruct")).replace(bindingRegex, (match2) => {
      const varName = match2.split(" ").pop().split(":")[0];
      if (replacementsReplacement.has(varName)) {
        const updated = replacementsOriginal.get(varName) + " " + match2.split(" ").slice(-2).join(" ");
        const newGroup = updated.match(/@group\((\d+)\)/)[1];
        const newBinding = updated.match(/@binding\((\d+)\)/)[1];
        changesOriginal[varName] = { group: newGroup, binding: newBinding };
        return updated;
      }
      return match2;
    });
    const result2 = bindings2str.replace(/struct UniformStruct \{[\s\S]*?\};/g, () => constructCombinedStruct("UniformStruct")).replace(bindingRegex, (match2) => {
      const varName = match2.split(" ").pop().split(":")[0];
      if (replacementsOriginal.has(varName)) {
        const updated = replacementsOriginal.get(varName) + " " + match2.split(" ").slice(-2).join(" ");
        const newGroup = updated.match(/@group\((\d+)\)/)[1];
        const newBinding = updated.match(/@binding\((\d+)\)/)[1];
        changesReplacement[varName] = { group: newGroup, binding: newBinding };
        return updated;
      }
      return match2;
    });
    return {
      code1: result1.trim(),
      changes1: changesOriginal,
      code2: result2.trim(),
      changes2: changesReplacement
    };
  }
  static combineShaderParams(shader1Obj, shader2Obj) {
    let combinedAst = shader2Obj.ast ? [...shader2Obj.ast] : [];
    let combinedParams = shader2Obj.params ? [...shader2Obj.params] : [];
    let combinedReturnedVars = [];
    const returnMatches = shader2Obj.funcStr.match(/^(?![ \t]*\/\/).*\breturn .*;/gm);
    if (returnMatches) {
      const returnedVars = returnMatches.map((match) => match.replace(/^[ \t]*return /, "").replace(";", ""));
      combinedReturnedVars.push(..._WGSLTranspiler.flattenStrings(returnedVars));
    }
    const returnMatches2 = shader1Obj.funcStr.match(/^(?![ \t]*\/\/).*\breturn .*;/gm);
    if (returnMatches2) {
      const returnedVars2 = returnMatches2.map((match) => match.replace(/^[ \t]*return /, "").replace(";", ""));
      combinedReturnedVars.push(..._WGSLTranspiler.flattenStrings(returnedVars2));
    }
    if (shader1Obj.ast)
      combinedAst.push(...shader1Obj.ast);
    if (shader1Obj.params)
      combinedParams.push(...shader1Obj.params);
    const uniqueBindings = /* @__PURE__ */ new Set();
    const updatedParams = [];
    const bindingMap2 = /* @__PURE__ */ new Map();
    shader1Obj.params.forEach((entry, i) => {
      if (shader2Obj.params.some((param) => param.name === entry.name) && !uniqueBindings.has(entry.name)) {
        uniqueBindings.add(entry.name);
        const newBinding = i;
        updatedParams.push(entry);
        bindingMap2.set(entry.binding, newBinding);
      }
    });
    let maxSharedBinding = uniqueBindings.size - 1;
    shader2Obj.params.forEach((entry, i) => {
      if (!shader1Obj.params.some((param) => param.name === entry.name) && !uniqueBindings.has(entry.name)) {
        uniqueBindings.add(i);
        maxSharedBinding++;
        updatedParams.push(entry);
        bindingMap2.set(entry.binding, maxSharedBinding);
      }
    });
    combinedParams = updatedParams;
    let shaderCode2 = shader2Obj.code;
    for (let [oldBinding, newBinding] of bindingMap2.entries()) {
      const regex = new RegExp(`@binding\\(${oldBinding}\\)`, "g");
      shaderCode2 = shaderCode2.replace(regex, `@binding(${newBinding})`);
    }
    shader2Obj.code = shaderCode2;
    shader1Obj.ast = combinedAst;
    shader1Obj.returnedVars = combinedReturnedVars;
    shader1Obj.params = combinedParams;
    shader2Obj.ast = combinedAst;
    shader2Obj.returnedVars = combinedReturnedVars;
    shader2Obj.params = combinedParams;
  }
  //this pipeline is set to only use javascript functions so it can generate asts and infer all of the necessary buffering orders and types
  static convertToWebGPU(func, shaderType = "compute", bindGroupNumber = 0, nVertexBuffers = 1, workGroupSize = 256, gpuFuncs) {
    let funcStr = typeof func === "string" ? func : func.toString();
    funcStr = funcStr.replace(/(?<!\w)this\./g, "");
    const tokens = this.tokenize(funcStr);
    const ast = this.parse(funcStr, tokens, shaderType);
    let webGPUCode = this.generateDataStructures(funcStr, ast, bindGroupNumber);
    const bindings = webGPUCode.code;
    webGPUCode.code += "\n" + this.generateMainFunctionWorkGroup(
      funcStr,
      ast,
      webGPUCode.params,
      shaderType,
      nVertexBuffers,
      workGroupSize,
      gpuFuncs
    );
    return {
      code: this.indentCode(webGPUCode.code),
      bindings,
      ast,
      params: webGPUCode.params,
      funcStr,
      defaultUniforms: webGPUCode.defaultUniforms,
      type: shaderType,
      workGroupSize: shaderType === "compute" ? workGroupSize : void 0
    };
  }
};
function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}
function replaceJSFunctions(code, replacements2) {
  for (let [jsFunc, shaderFunc] of Object.entries(replacements2)) {
    const regex = new RegExp(jsFunc.replace(".", "\\."), "g");
    code = code.replace(regex, shaderFunc);
  }
  return code;
}
var replacements = {
  "Math.PI": `${Math.PI}`,
  "Math.E": `${Math.E}`,
  "Math.abs": "abs",
  "Math.acos": "acos",
  "Math.asin": "asin",
  "Math.atan": "atan",
  "Math.atan2": "atan2",
  // Note: Shader might handle atan2 differently, ensure compatibility
  "Math.ceil": "ceil",
  "Math.cos": "cos",
  "Math.exp": "exp",
  "Math.floor": "floor",
  "Math.log": "log",
  "Math.max": "max",
  "Math.min": "min",
  "Math.pow": "pow",
  "Math.round": "round",
  "Math.sin": "sin",
  "Math.sqrt": "sqrt",
  "Math.tan": "tan"
  // ... add more replacements as needed
};
var wgslTypeSizes32 = {
  "bool": { alignment: 1, size: 1 },
  "u8": { alignment: 1, size: 1 },
  "i8": { alignment: 1, size: 1 },
  "i32": { alignment: 4, size: 4 },
  "u32": { alignment: 4, size: 4 },
  "f32": { alignment: 4, size: 4 },
  "i64": { alignment: 8, size: 8 },
  "u64": { alignment: 8, size: 8 },
  "f64": { alignment: 8, size: 8 },
  "atomic": { alignment: 4, size: 4 },
  "vec2<f32>": { alignment: 8, size: 8 },
  "vec2f": { alignment: 8, size: 8 },
  "vec2<i32>": { alignment: 8, size: 8 },
  "vec2<u32>": { alignment: 8, size: 8 },
  "vec3<f32>": { alignment: 16, size: 12 },
  "vec3f": { alignment: 16, size: 12 },
  "vec3<i32>": { alignment: 16, size: 12 },
  "vec3<u32>": { alignment: 16, size: 12 },
  "vec4<f32>": { alignment: 16, size: 16 },
  "vec4f": { alignment: 16, size: 16 },
  "vec4<i32>": { alignment: 16, size: 16 },
  "vec4<u32>": { alignment: 16, size: 16 },
  "mat2x2<f32>": { alignment: 8, size: 16 },
  "mat2x2<i32>": { alignment: 8, size: 16 },
  "mat2x2<u32>": { alignment: 8, size: 16 },
  "mat3x2<f32>": { alignment: 8, size: 24 },
  "mat3x2<i32>": { alignment: 8, size: 24 },
  "mat3x2<u32>": { alignment: 8, size: 24 },
  "mat4x2<f32>": { alignment: 8, size: 32 },
  "mat4x2<i32>": { alignment: 8, size: 32 },
  "mat4x2<u32>": { alignment: 8, size: 32 },
  "mat2x3<f32>": { alignment: 16, size: 32 },
  "mat2x3<i32>": { alignment: 16, size: 32 },
  "mat2x3<u32>": { alignment: 16, size: 32 },
  "mat3x3<f32>": { alignment: 16, size: 48 },
  "mat3x3<i32>": { alignment: 16, size: 48 },
  "mat3x3<u32>": { alignment: 16, size: 48 },
  "mat4x3<f32>": { alignment: 16, size: 64 },
  "mat4x3<i32>": { alignment: 16, size: 64 },
  "mat4x3<u32>": { alignment: 16, size: 64 },
  "mat2x4<f32>": { alignment: 16, size: 32 },
  "mat2x4<i32>": { alignment: 16, size: 32 },
  "mat2x4<u32>": { alignment: 16, size: 32 },
  "mat3x4<f32>": { alignment: 16, size: 48 },
  "mat3x4<i32>": { alignment: 16, size: 48 },
  "mat3x4<u32>": { alignment: 16, size: 48 },
  "mat4x4<f32>": { alignment: 16, size: 64 },
  "mat4x4<i32>": { alignment: 16, size: 64 },
  "mat4x4<u32>": { alignment: 16, size: 64 }
};
var wgslTypeSizes16 = {
  "i16": { alignment: 2, size: 2 },
  //and we can do these
  "u16": { alignment: 2, size: 2 },
  //we can do these in javascript
  "f16": { alignment: 2, size: 2 },
  "vec2<f16>": { alignment: 4, size: 4 },
  "vec2<i16>": { alignment: 4, size: 4 },
  "vec2<u16>": { alignment: 4, size: 4 },
  "vec3<f16>": { alignment: 8, size: 6 },
  "vec3<i16>": { alignment: 8, size: 6 },
  "vec3<u16>": { alignment: 8, size: 6 },
  "vec4<f16>": { alignment: 8, size: 8 },
  "vec4<i16>": { alignment: 8, size: 8 },
  "vec4<u16>": { alignment: 8, size: 8 },
  "mat2x2<f16>": { alignment: 4, size: 8 },
  "mat2x2<i16>": { alignment: 4, size: 8 },
  "mat2x2<u16>": { alignment: 4, size: 8 },
  "mat3x2<f16>": { alignment: 4, size: 12 },
  "mat3x2<i16>": { alignment: 4, size: 12 },
  "mat3x2<u16>": { alignment: 4, size: 12 },
  "mat4x2<f16>": { alignment: 4, size: 16 },
  "mat4x2<i16>": { alignment: 4, size: 16 },
  "mat4x2<u16>": { alignment: 4, size: 16 },
  "mat2x3<f16>": { alignment: 8, size: 16 },
  "mat2x3<i16>": { alignment: 8, size: 16 },
  "mat2x3<u16>": { alignment: 8, size: 16 },
  "mat3x3<f16>": { alignment: 8, size: 24 },
  "mat3x3<i16>": { alignment: 8, size: 24 },
  "mat3x3<u16>": { alignment: 8, size: 24 },
  "mat4x3<f16>": { alignment: 8, size: 32 },
  "mat4x3<i16>": { alignment: 8, size: 32 },
  "mat4x3<u16>": { alignment: 8, size: 32 },
  "mat2x4<f16>": { alignment: 8, size: 16 },
  "mat2x4<i16>": { alignment: 8, size: 16 },
  "mat2x4<u16>": { alignment: 8, size: 16 },
  "mat3x4<f16>": { alignment: 8, size: 24 },
  "mat3x4<i16>": { alignment: 8, size: 24 },
  "mat3x4<u16>": { alignment: 8, size: 24 },
  "mat4x4<f16>": { alignment: 8, size: 32 },
  "mat4x4<i16>": { alignment: 8, size: 32 },
  "mat4x4<u16>": { alignment: 8, size: 32 }
};
var WGSLTypeSizes = Object.assign({}, wgslTypeSizes16, wgslTypeSizes32);
for (const [key, value] of Object.entries(WGSLTypeSizes)) {
  WGSLTypeSizes[key] = { ...value, type: key };
}

// ../src/shader.ts
var ShaderHelper = class {
  prototypes = {};
  compute;
  vertex;
  fragment;
  process = (...inputs) => {
    return this.compute?.run(this.compute.computePass, ...inputs);
  };
  render = (renderPass, ...inputs) => {
    return this.fragment?.run(renderPass ? renderPass : this.fragment.renderPass ? this.fragment.renderPass : { vertexCount: 1 }, ...inputs);
  };
  bindGroupLayouts = [];
  canvas;
  context;
  device;
  bufferGroups;
  bindGroups;
  functions = [];
  constructor(shaders, options) {
    if (shaders)
      this.init(shaders, options);
  }
  init = (shaders, options) => {
    Object.assign(this, options);
    if (!this.device)
      throw new Error(`
            No GPUDevice! Please retrieve e.g. via: 
            
            const gpu = navigator.gpu;
            const adapter = await gpu.requestAdapter();
            if(!adapter) throw new Error('No GPU Adapter found!');
            device = await adapter.requestDevice();
            shaderhelper.init(shaders,{device});
        `);
    if (shaders.fragment && !shaders.vertex || shaders.vertex && !shaders.fragment)
      shaders = this.generateShaderBoilerplate(shaders, options);
    if (!options.skipCombinedBindings) {
      if (shaders.compute && shaders.vertex) {
        let combined = WGSLTranspiler.combineBindings(shaders.compute.code, shaders.vertex.code);
        shaders.compute.code = combined.code1;
        shaders.compute.altBindings = combined.changes1;
        shaders.vertex.code = combined.code2;
        shaders.vertex.altBindings = combined.changes2;
      }
      if (shaders.compute && shaders.fragment) {
        let combined = WGSLTranspiler.combineBindings(shaders.compute.code, shaders.fragment.code);
        shaders.compute.code = combined.code1;
        shaders.compute.altBindings = combined.changes1;
        shaders.fragment.code = combined.code2;
        shaders.fragment.altBindings = combined.changes2;
      }
      if (shaders.vertex && shaders.fragment) {
        let combined = WGSLTranspiler.combineBindings(shaders.vertex.code, shaders.fragment.code);
        shaders.vertex.code = combined.code1;
        shaders.vertex.altBindings = combined.changes1;
        shaders.fragment.code = combined.code2;
        shaders.fragment.altBindings = combined.changes2;
      }
    }
    Object.assign(this.prototypes, shaders);
    if (shaders.compute) {
      this.compute = new ShaderContext(shaders.compute);
      this.compute.helper = this;
      Object.assign(this.compute, options);
    }
    if (shaders.fragment) {
      WGSLTranspiler.combineShaderParams(shaders.fragment, shaders.vertex);
      this.fragment = new ShaderContext(shaders.fragment);
      this.fragment.helper = this;
      Object.assign(this.fragment, options);
      this.vertex = Object.assign(new ShaderContext({}), this.fragment, shaders.vertex);
    }
    if (this.compute) {
      this.compute.bindGroupLayout = this.device.createBindGroupLayout({
        entries: this.createBindGroupFromEntries(this.compute, "compute", options?.renderPass?.textureSettings, options?.renderPass?.samplerSettings)
      });
      if (this.compute.bindGroupLayout) {
        if (typeof this.compute.bindGroupNumber === "undefined") {
          this.compute.bindGroupNumber = this.bindGroupLayouts.length;
          this.bindGroupLayouts.push(this.compute.bindGroupLayout);
        }
      }
    }
    if (this.vertex && this.fragment) {
      this.fragment.bindGroupLayout = this.device.createBindGroupLayout({
        entries: this.createBindGroupFromEntries(this.fragment, "fragment", options?.renderPass?.textureSettings, options?.renderPass?.samplerSettings)
      });
      this.vertex.bindGroupLayout = this.fragment.bindGroupLayout;
      if (this.fragment.bindGroupLayout) {
        if (typeof this.fragment.bindGroupNumber === "undefined") {
          this.fragment.bindGroupNumber = this.bindGroupLayouts.length;
          this.vertex.bindGroupNumber = this.fragment.bindGroupNumber;
        }
        this.bindGroupLayouts.push(this.fragment.bindGroupLayout);
      }
    }
    if (shaders.vertex && shaders.fragment) {
      this.vertex.shaderModule = this.device.createShaderModule({
        code: shaders.vertex.code
      });
      this.fragment.shaderModule = this.device.createShaderModule({
        code: shaders.fragment.code
      });
      this.fragment.pipelineLayout = this.device.createPipelineLayout({
        bindGroupLayouts: this.bindGroupLayouts
        //this should have the combined compute and vertex/fragment (and accumulated) layouts
      });
      this.vertex.pipelineLayout = this.fragment.pipelineLayout;
      this.updateGraphicsPipeline(options?.nVertexBuffers, options?.contextSettings, options?.renderPipelineSettings);
    }
    if (this.compute) {
      this.compute.shaderModule = this.device.createShaderModule({
        code: shaders.compute.code
      });
      this.compute.pipelineLayout = this.device.createPipelineLayout({
        bindGroupLayouts: this.bindGroupLayouts
        //this should have the combined compute and vertex/fragment (and accumulated) layouts
      });
      const pipeline = {
        layout: this.compute.pipelineLayout,
        compute: {
          module: this.compute.shaderModule,
          entryPoint: "compute_main"
        }
      };
      if (options?.computePipelineSettings)
        Object.assign(pipeline, options?.computePipelineSettings);
      this.compute.computePipeline = this.device.createComputePipeline(pipeline);
    }
  };
  addFunction = (func) => {
    this.functions.push(func);
    for (const key of ["compute", "fragment", "vertex"]) {
      if (this.prototypes[key])
        Object.assign(
          this.prototypes[key],
          WGSLTranspiler.convertToWebGPU(
            this.prototypes[key].funcStr,
            key,
            this.prototypes[key].bindGroupNumber,
            this.prototypes[key].nVertexBuffers,
            this.prototypes[key].workGroupSize ? this.prototypes[key].workGroupSize : void 0,
            this.functions
          )
        );
    }
    this.init(this.prototypes, { skipCombinedBindings: true });
  };
  generateShaderBoilerplate = (shaders, options) => {
    for (const shaderType of ["compute", "vertex", "fragment"]) {
      const shaderContext = shaders[shaderType];
      if (!shaderContext)
        continue;
      if (shaderContext && shaderType === "fragment" && !shaders.vertex) {
        let vboInputStrings = [];
        let vboStrings = Array.from({ length: options.nVertexBuffers }, (_, i) => {
          vboInputStrings.push(
            `@location(${4 * i}) color${i > 0 ? i + 1 : ""}In: vec4<f32>,
    @location(${4 * i + 1}) vertex${i > 0 ? i + 1 : ""}In: vec3<f32>, 
    @location(${4 * i + 2}) normal${i > 0 ? i + 1 : ""}In: vec3<f32>,
    @location(${4 * i + 3}) uv${i > 0 ? i + 1 : ""}In: vec2<f32>${i === options.nVertexBuffers - 1 ? "" : ","}`
          );
          return `
    @location(${4 * i}) color${i > 0 ? i + 1 : ""}: vec4<f32>,
    @location(${4 * i + 1}) vertex${i > 0 ? i + 1 : ""}: vec3<f32>, 
    @location(${4 * i + 2}) normal${i > 0 ? i + 1 : ""}: vec3<f32>,
    @location(${4 * i + 3}) uv${i > 0 ? i + 1 : ""}: vec2<f32>${i === options.nVertexBuffers - 1 ? "" : ","}`;
        });
        this.vertex = {
          code: `
struct Vertex {
    @builtin(position) position: vec4<f32>, //pixel location
    //uploaded vertices from CPU, in interleaved format
    ${vboStrings.join("\n")}
};

@vertex
fn vtx_main(
    @builtin(vertex_index) vertexIndex : u32,   //current vertex
    @builtin(instance_index) instanceIndex: u32, //current instance
    ${vboInputStrings}
) -> Vertex {
    var pixel: Vertex;
    pixel.color = pixel.position[vertexId];
    pixel.vertex = pixel.position[vertexId];
    return pixel;
}`
        };
      } else if (shaderContext && shaderType === "vertex" && !shaders.fragment) {
        this.fragment = {
          code: `
@fragment
fn frag_main(
    pixel: Vertex,
    @builtin(front_facing) is_front: bool,   //true when current fragment is on front-facing primitive
    @builtin(sample_index) sampleIndex: u32, //sample index for the current fragment
    @builtin(sample_mask) sampleMask: u32,   //contains a bitmask indicating which samples in this fragment are covered by the primitive being rendered
    @builtin(frag_depth) depth: f32          //Updated depth of the fragment, in the viewport depth range.
) -> @location(0) vec4<f32> {
    return pixel.color;
}`
        };
      }
      shaderContext.device = this.device;
    }
    return shaders;
  };
  cleanup = () => {
    if (this.device)
      this.device.destroy();
    if (this.context)
      this.context?.unconfigure();
  };
  // Extract all returned variables from the function string
  createBindGroupFromEntries = (shaderContext, shaderType, textureSettings = {}, samplerSettings = {}, visibility = GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT) => {
    shaderContext.type = shaderType;
    let bufferIncr = 0;
    let uniformBufferIdx;
    const entries = shaderContext.params.map((node, i) => {
      let isReturned = shaderContext.returnedVars === void 0 || shaderContext.returnedVars?.includes(node.name);
      if (node.isUniform) {
        if (typeof uniformBufferIdx === "undefined") {
          uniformBufferIdx = i;
          bufferIncr++;
          return {
            binding: uniformBufferIdx,
            visibility,
            buffer: {
              type: "uniform"
            }
          };
        }
        return void 0;
      } else if (node.isTexture) {
        const buffer = {
          binding: bufferIncr,
          visibility,
          texture: textureSettings[node.name] ? textureSettings[node.name] : {}
        };
        bufferIncr++;
        return buffer;
      } else if (node.isSampler) {
        const buffer = {
          binding: bufferIncr,
          visibility,
          sampler: samplerSettings[node.name] ? samplerSettings[node.name] : {}
        };
        bufferIncr++;
        return buffer;
      } else {
        const buffer = {
          binding: bufferIncr,
          visibility,
          buffer: {
            type: isReturned || node.isModified ? "storage" : "read-only-storage"
          }
        };
        bufferIncr++;
        return buffer;
      }
    }).filter((v) => v);
    if (shaderContext.defaultUniforms) {
      entries.push({
        binding: bufferIncr,
        visibility,
        buffer: {
          type: "uniform"
        }
      });
    }
    shaderContext.bindGroupLayoutEntries = entries;
    return entries;
  };
  createRenderPipelineDescriptors = (nVertexBuffers = 1, swapChainFormat = navigator.gpu.getPreferredCanvasFormat()) => {
    if (!this.fragment || !this.vertex)
      throw new Error("No Fragment and Vertex ShaderContext defined");
    const depthFormat = "depth24plus";
    const depthTexture = this.device.createTexture({
      size: { width: this.canvas.width, height: this.canvas.height },
      format: depthFormat,
      usage: GPUTextureUsage.RENDER_ATTACHMENT
    });
    const vertexBuffers = Array.from({ length: nVertexBuffers }, (_, i) => {
      return {
        arrayStride: 48,
        attributes: [
          { format: "float32x4", offset: 0, shaderLocation: 4 * i },
          //color
          { format: "float32x3", offset: 16, shaderLocation: 4 * i + 1 },
          //position
          { format: "float32x3", offset: 28, shaderLocation: 4 * i + 2 },
          //normal
          { format: "float32x2", offset: 40, shaderLocation: 4 * i + 3 }
          //uv
        ]
      };
    });
    const renderPipelineDescriptor = {
      //https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/createRenderPipeline
      layout: this.fragment.pipelineLayout,
      vertex: {
        module: this.vertex.shaderModule,
        entryPoint: "vtx_main",
        buffers: vertexBuffers
      },
      fragment: {
        module: this.fragment.shaderModule,
        entryPoint: "frag_main",
        targets: [{
          format: swapChainFormat
        }]
      },
      depthStencil: { format: depthFormat, depthWriteEnabled: true, depthCompare: "less" }
    };
    const view = this.context?.getCurrentTexture().createView();
    const renderPassDescriptor = {
      //some assumptions
      colorAttachments: [{
        view,
        loadValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: "clear",
        storeOp: "store"
      }],
      depthStencilAttachment: {
        view: depthTexture.createView(),
        depthLoadOp: "clear",
        depthClearValue: 1,
        depthStoreOp: "store"
        //stencilLoadOp: "clear",
        //stencilClearValue: 0,
        //stencilStoreOp: "store"
      }
    };
    this.vertex.renderPassDescriptor = renderPassDescriptor;
    this.fragment.renderPassDescriptor = renderPassDescriptor;
    return renderPipelineDescriptor;
  };
  //todo: break this down more
  updateGraphicsPipeline = (nVertexBuffers = 1, contextSettings, renderPipelineDescriptor, renderPassDescriptor) => {
    if (!this.fragment || !this.vertex)
      throw new Error("No Fragment and Vertex ShaderContext defined");
    const swapChainFormat = navigator.gpu.getPreferredCanvasFormat();
    this.context?.configure(contextSettings ? contextSettings : {
      device: this.device,
      format: swapChainFormat,
      //usage: GPUTextureUsage.RENDER_ATTACHMENT,
      alphaMode: "premultiplied"
    });
    let pipeline = this.createRenderPipelineDescriptors(nVertexBuffers, swapChainFormat);
    if (renderPipelineDescriptor)
      pipeline = renderPipelineDescriptor;
    if (renderPassDescriptor)
      this.fragment.renderPassDescriptor = renderPassDescriptor;
    this.vertex.graphicsPipeline = this.device.createRenderPipeline(pipeline);
    this.fragment.graphicsPipeline = this.vertex.graphicsPipeline;
  };
  static flattenArray(arr) {
    let result = [];
    for (let i = 0; i < arr.length; i++) {
      if (Array.isArray(arr[i])) {
        result = result.concat(this.flattenArray(isTypedArray(arr[i]) ? Array.from(arr[i]) : arr[i]));
      } else {
        result.push(arr[i]);
      }
    }
    return result;
  }
  static combineVertices(colors, positions, normal, uvs) {
    let length = 0;
    if (colors)
      length = colors.length / 4;
    if (positions?.length > length)
      length = positions.length / 3;
    if (normal?.length > length)
      length = normal.length / 3;
    if (uvs?.length > length)
      length = uvs.length / 2;
    const vertexCount = length;
    const interleavedVertices = new Float32Array(vertexCount * 12);
    for (let i = 0; i < vertexCount; i++) {
      const posOffset = i * 3;
      const colOffset = i * 4;
      const norOffset = i * 3;
      const uvOffset = i * 2;
      const interleavedOffset = i * 12;
      interleavedVertices[interleavedOffset] = colors ? colors[colOffset] || 0 : 0;
      interleavedVertices[interleavedOffset + 1] = colors ? colors[colOffset + 1] || 0 : 0;
      interleavedVertices[interleavedOffset + 2] = colors ? colors[colOffset + 2] || 0 : 0;
      interleavedVertices[interleavedOffset + 3] = colors ? colors[colOffset + 3] || 0 : 0;
      interleavedVertices[interleavedOffset + 4] = positions ? positions[posOffset] || 0 : 0;
      interleavedVertices[interleavedOffset + 5] = positions ? positions[posOffset + 1] || 0 : 0;
      interleavedVertices[interleavedOffset + 6] = positions ? positions[posOffset + 2] || 0 : 0;
      interleavedVertices[interleavedOffset + 7] = normal ? normal[norOffset] || 0 : 0;
      interleavedVertices[interleavedOffset + 8] = normal ? normal[norOffset + 1] || 0 : 0;
      interleavedVertices[interleavedOffset + 9] = normal ? normal[norOffset + 2] || 0 : 0;
      interleavedVertices[interleavedOffset + 10] = uvs ? uvs[uvOffset] || 0 : 0;
      interleavedVertices[interleavedOffset + 11] = uvs ? uvs[uvOffset + 1] || 0 : 0;
    }
    return interleavedVertices;
  }
  static splitVertices(interleavedVertices) {
    const vertexCount = interleavedVertices.length / 12;
    const colors = new Float32Array(vertexCount * 4);
    const positions = new Float32Array(vertexCount * 3);
    const normal = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    for (let i = 0; i < vertexCount; i++) {
      const offset = i * 12;
      const posOffset = i * 3;
      const colOffset = i * 4;
      const norOffset = i * 3;
      const uvOffset = i * 2;
      colors[colOffset] = interleavedVertices[offset];
      colors[colOffset + 1] = interleavedVertices[offset + 1];
      colors[colOffset + 2] = interleavedVertices[offset + 2];
      colors[colOffset + 3] = interleavedVertices[offset + 3];
      positions[posOffset] = interleavedVertices[offset + 4];
      positions[posOffset + 1] = interleavedVertices[offset + 5];
      positions[posOffset + 2] = interleavedVertices[offset + 6];
      normal[norOffset] = interleavedVertices[offset + 7];
      normal[norOffset + 1] = interleavedVertices[offset + 8];
      normal[norOffset + 2] = interleavedVertices[offset + 9];
      uvs[uvOffset] = interleavedVertices[offset + 10];
      uvs[uvOffset + 1] = interleavedVertices[offset + 11];
    }
    return {
      positions,
      colors,
      normal,
      uvs
    };
  }
};
var ShaderContext = class {
  canvas;
  context;
  device;
  helper;
  code;
  bindings;
  ast;
  params;
  funcStr;
  defaultUniforms;
  type;
  workGroupSize;
  functions;
  textures;
  samplers;
  shaderModule;
  pipelineLayout;
  computePass;
  renderPass;
  nVertexBuffers;
  computePipeline;
  graphicsPipeline;
  firstPass = true;
  renderPassDescriptor;
  renderBundle;
  vertexBuffers;
  indexBuffer;
  indexFormat;
  vertexCount;
  contextSettings;
  renderPipelineSettings;
  inputTypes;
  uniformBuffer;
  uniformBufferInputs;
  totalUniformBufferSize;
  altBindings;
  builtInUniforms;
  defaultUniformBinding;
  defaultUniformBuffer;
  totalDefaultUniformBufferSize;
  bindGroup;
  bindGroupLayout;
  bindGroupNumber;
  inputBuffers;
  outputBuffers;
  bufferGroup;
  bufferGroups;
  bindGroups;
  constructor(props) {
    Object.assign(this, props);
    const bIUCopy = {};
    for (const key in WGSLTranspiler.builtInUniforms) {
      bIUCopy[key] = Object.assign({}, WGSLTranspiler.builtInUniforms[key]);
    }
    this.builtInUniforms = bIUCopy;
  }
  updateVBO = (vertices, index = 0, bufferOffset = 0, dataOffset = 0) => {
    if (vertices) {
      if (!isTypedArray(vertices)) {
        if (!Array.isArray(vertices)) {
          vertices = ShaderHelper.combineVertices(
            typeof vertices.color?.[0] === "object" ? ShaderHelper.flattenArray(vertices.color) : vertices.color,
            typeof vertices.position?.[0] === "object" ? ShaderHelper.flattenArray(vertices.position) : vertices.position,
            typeof vertices.normal?.[0] === "object" ? ShaderHelper.flattenArray(vertices.normal) : vertices.normal,
            typeof vertices.uv?.[0] === "object" ? ShaderHelper.flattenArray(vertices.uv) : vertices.uv
          );
        } else
          vertices = new Float32Array(typeof vertices === "object" ? ShaderHelper.flattenArray(vertices) : vertices);
      }
      if (!this.vertexBuffers || this.vertexBuffers[index]?.size !== vertices.byteLength) {
        if (!this.vertexBuffers)
          this.vertexBuffers = [];
        const vertexBuffer = this.device.createBuffer({
          size: vertices.byteLength,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
          //assume read/write
        });
        this.vertexBuffers[index] = vertexBuffer;
      }
      if (!this.vertexCount)
        this.vertexCount = vertices.length / 12;
      this.device.queue.writeBuffer(this.vertexBuffers[index], bufferOffset, vertices, dataOffset, vertices.length);
    }
  };
  setUBOposition = (dataView, inputTypes, typeInfo, offset, input, inpIdx) => {
    offset = Math.ceil(offset / typeInfo.alignment) * typeInfo.alignment;
    if (input !== void 0) {
      if (inputTypes[inpIdx].type.startsWith("vec")) {
        const vecSize = typeInfo.size / 4;
        for (let j = 0; j < vecSize; j++) {
          if (inputTypes[inpIdx].type.includes("f"))
            dataView.setFloat32(offset + j * 4, input[j], true);
          else
            dataView.setInt32(offset + j * 4, input[j], true);
        }
      } else if (inputTypes[inpIdx].type.startsWith("mat")) {
        const flatMatrix = typeof input[0] === "object" ? ShaderHelper.flattenArray(input) : input;
        for (let j = 0; j < flatMatrix.length; j++) {
          dataView.setFloat32(offset + j * 4, flatMatrix[j], true);
        }
      } else {
        switch (inputTypes[inpIdx].type) {
          case "f32":
            dataView.setFloat32(offset, input, true);
            break;
          case "i32":
            dataView.setInt32(offset, input, true);
            break;
          case "u32":
            dataView.setUInt32(offset, input, true);
            break;
          case "f16":
            dataView.setFloat16(offset, input, true);
            break;
          case "i16":
            dataView.setInt16(offset, input, true);
            break;
          case "u16":
            dataView.setUInt16(offset, input, true);
            break;
          case "i8":
            dataView.setInt8(offset, input, true);
            break;
          case "u8":
            dataView.setUInt8(offset, input, true);
            break;
        }
      }
    }
    offset += typeInfo.size;
    return offset;
  };
  updateUBO = (inputs, inputTypes) => {
    if (!inputs)
      return;
    if (this.uniformBuffer) {
      const dataView = new DataView(this.uniformBuffer.getMappedRange());
      let offset = 0;
      let inpIdx = 0;
      this.params.forEach((node, i) => {
        if (node.isUniform) {
          let input;
          if (Array.isArray(inputs))
            input = inputs[inpIdx];
          else
            input = inputs?.[node.name];
          if (typeof input === "undefined" && typeof this.uniformBufferInputs?.[inpIdx] !== "undefined")
            input = this.uniformBufferInputs[inpIdx];
          const typeInfo = WGSLTypeSizes[inputTypes[inpIdx].type];
          if (!this.uniformBufferInputs) {
            this.uniformBufferInputs = {};
          }
          this.uniformBufferInputs[inpIdx] = input;
          offset = this.setUBOposition(dataView, inputTypes, typeInfo, offset, input, inpIdx);
        }
        if (node.isInput)
          inpIdx++;
      });
      this.uniformBuffer.unmap();
    }
    if (this.defaultUniforms) {
      const dataView = new DataView(this.defaultUniformBuffer.getMappedRange());
      let offset = 0;
      this.defaultUniforms.forEach((u, i) => {
        let value = this.builtInUniforms[u]?.callback(this);
        const typeInfo = WGSLTypeSizes[this.builtInUniforms[this.defaultUniforms[i]].type];
        offset = this.setUBOposition(dataView, inputTypes, typeInfo, offset, value, i);
      });
      this.defaultUniformBuffer.unmap();
    }
  };
  buffer = ({
    vbos,
    //[{vertices:[]}]
    textures,
    //[{data:Uint8Array([]), width:800, height:600, format:'rgba8unorm' (default), bytesPerRow: width*4 (default rgba) }], //all required
    samplerSettings,
    skipOutputDef,
    bindGroupNumber
  } = {}, ...inputs) => {
    if (!bindGroupNumber)
      bindGroupNumber = this.bindGroupNumber;
    if (vbos) {
      vbos.forEach((vertices, i) => {
        this.updateVBO(vertices, i);
      });
    }
    if (!this.inputTypes && this.params)
      this.inputTypes = this.params.map((p) => {
        let type = p.type;
        if (type.startsWith("array")) {
          type = type.substring(6, type.length - 1);
        }
        return WGSLTypeSizes[type];
      });
    const inputTypes = this.inputTypes;
    let newInputBuffer = false;
    if (this.inputBuffers) {
      inputs.forEach((inp, index) => {
        if (inp && inp?.length) {
          if (this.inputBuffers[index].size !== inp.length * inputTypes[index].byteSize) {
            newInputBuffer = true;
          }
        }
      });
    } else
      newInputBuffer = true;
    if (!this.textures) {
      this.textures = {};
      this.samplers = {};
    }
    if (!this.inputBuffers) {
      const bufferGroup = {};
      this.inputBuffers = [];
      this.uniformBuffer = void 0;
      this.outputBuffers = [];
      bufferGroup.inputBuffers = this.inputBuffers;
      bufferGroup.outputBuffers = this.outputBuffers;
      bufferGroup.textures = this.textures;
      bufferGroup.samplers = this.samplers;
      this.bufferGroup = bufferGroup;
      if (!this.bufferGroups) {
        if (this.helper) {
          if (!this.helper.bufferGroups)
            this.helper.bufferGroups = [];
          this.bufferGroups = this.helper.bufferGroups;
        } else
          this.bufferGroups = [];
      }
      this.bufferGroups[bindGroupNumber] = bufferGroup;
    }
    let uBufferPushed = false;
    let inpBuf_i = 0;
    let inpIdx = 0;
    let hasUniformBuffer = 0;
    let uBufferCreated = false;
    let textureIncr = 0;
    let samplerIncr = 0;
    let bindGroupAlts = [];
    let uniformValues = [];
    if (this.params)
      for (let i = 0; i < this.params.length; i++) {
        const node = this.params[i];
        if (typeof inputs[inpBuf_i] !== "undefined" && this.altBindings?.[node.name] && this.altBindings?.[node.name].group !== bindGroupNumber) {
          if (!bindGroupAlts[this.altBindings?.[node.name].group]) {
            if (bindGroupAlts[this.altBindings?.[node.name].group].length < this.altBindings?.[node.name].group)
              bindGroupAlts[this.altBindings?.[node.name].group].length = this.altBindings?.[node.name].group + 1;
            bindGroupAlts[this.altBindings?.[node.name].group] = [];
          }
          if (!bindGroupAlts[this.altBindings?.[node.name].group].length >= this.altBindings?.[node.name].group)
            bindGroupAlts[this.altBindings?.[node.name].group].length = this.altBindings?.[node.name].group + 1;
          bindGroupAlts[this.altBindings?.[node.name].group][this.altBindings?.[node.name].group] = inputs[i];
        } else if (node.isTexture) {
          let texture = textures?.[textureIncr] ? textures?.[textureIncr] : textures?.[node.name];
          if (texture) {
            this.textures[node.name] = this.device.createTexture({
              label: texture.label ? texture.label : `texture_g${bindGroupNumber}_b${i}`,
              format: texture.format ? texture.format : "rgba8unorm",
              size: [texture.width, texture.height],
              usage: texture.usage ? texture.usage : GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUBufferUsage.COPY_SRC
              //assume read/write (e.g. transforming a texture and returning it)
            });
            this.device.queue.writeTexture(
              { texture: texture.data },
              this.textures[node.name],
              { bytesPerRow: texture[textureIncr].bytesPerRow ? texture[textureIncr].bytesPerRow : texture[textureIncr].width * 4 },
              { width: texture[textureIncr].width, height: texture[textureIncr].height }
            );
          }
          textureIncr++;
        } else if (node.isSampler) {
          const sampler = this.samplers[node.name];
          if (!sampler) {
            this.samplers[node.name] = this.device.createSampler(
              samplerSettings ? samplerSettings?.[node.name] ? samplerSettings[node.name] : samplerSettings : {
                magFilter: "linear",
                minFilter: "linear",
                mipmapFilter: "linear",
                addressModeU: "repeat",
                addressModeV: "repeat"
              }
            );
          }
          samplerIncr++;
        } else {
          if (node.isUniform) {
            if (inputs[inpIdx] !== void 0)
              uniformValues[inpIdx] = inputs[inpIdx];
            if (!this.uniformBuffer || !uBufferCreated && inputs[inpBuf_i] !== void 0) {
              if (!this.totalUniformBufferSize) {
                let totalUniformBufferSize = 0;
                this.params.forEach((node2, j) => {
                  if (node2.isInput && node2.isUniform) {
                    if (inputTypes[j]) {
                      let size;
                      if (inputs[inpBuf_i]?.byteLength)
                        size = inputs[inpBuf_i].byteLength;
                      else if (inputs[inpBuf_i]?.length)
                        size = 4 * inputs[inpBuf_i].length;
                      else
                        size = inputTypes[j].size;
                      totalUniformBufferSize += inputTypes[j].size;
                      if (totalUniformBufferSize % 8 !== 0)
                        totalUniformBufferSize += WGSLTypeSizes[inputTypes[j].type].alignment;
                    }
                  }
                });
                if (totalUniformBufferSize < 8)
                  totalUniformBufferSize += 8 - totalUniformBufferSize;
                else
                  totalUniformBufferSize -= totalUniformBufferSize % 16;
                this.totalUniformBufferSize = totalUniformBufferSize;
              }
              this.uniformBuffer = this.device.createBuffer({
                size: this.totalUniformBufferSize ? this.totalUniformBufferSize : 8,
                // This should be the sum of byte sizes of all uniforms
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_SRC,
                mappedAtCreation: true
              });
              this.inputBuffers[inpBuf_i] = this.uniformBuffer;
              this.bufferGroup.uniformBuffer = this.uniformBuffer;
              uBufferCreated = true;
            }
            if (!hasUniformBuffer) {
              hasUniformBuffer = 1;
              inpBuf_i++;
            }
            inpIdx++;
          } else {
            if (typeof inputs[inpBuf_i] !== "undefined" || !this.inputBuffers[inpBuf_i]) {
              if (!inputs?.[inpBuf_i]?.byteLength && Array.isArray(inputs[inpBuf_i]?.[0]))
                inputs[inpBuf_i] = ShaderHelper.flattenArray(inputs[inpBuf_i]);
              this.inputBuffers[inpBuf_i] = this.device.createBuffer({
                size: inputs[inpBuf_i] ? inputs[inpBuf_i].byteLength ? inputs[inpBuf_i].byteLength : inputs[inpBuf_i]?.length ? inputs[inpBuf_i].length * 4 : 8 : 8,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
                mappedAtCreation: true
              });
              new Float32Array(this.inputBuffers[inpBuf_i].getMappedRange()).set(inputs[inpBuf_i]);
              this.inputBuffers[inpBuf_i].unmap();
            }
            inpBuf_i++;
            inpIdx++;
          }
          if (!skipOutputDef && node.isReturned && (!node.isUniform || node.isUniform && !uBufferPushed)) {
            if (!node.isUniform) {
              this.outputBuffers[inpBuf_i - 1] = this.inputBuffers[inpBuf_i - 1];
            } else if (!uBufferPushed) {
              uBufferPushed = true;
              this.outputBuffers[inpBuf_i - 1] = this.uniformBuffer;
            }
          }
        }
      }
    ;
    bindGroupAlts.forEach((inp, i) => {
      if (inp && i !== bindGroupNumber)
        this.buffer({ bindGroupNumber: i }, ...inp);
    });
    if (this.defaultUniforms) {
      if (!this.totalDefaultUniformBufferSize) {
        let totalUniformBufferSize = 0;
        this.defaultUniforms.forEach((u) => {
          totalUniformBufferSize += WGSLTypeSizes[this.builtInUniforms[u].type].size;
        });
        if (totalUniformBufferSize < 8)
          totalUniformBufferSize += 8 - totalUniformBufferSize;
        else
          totalUniformBufferSize -= totalUniformBufferSize % 16;
        this.totalDefaultUniformBufferSize = totalUniformBufferSize;
      }
      this.defaultUniformBuffer = this.device.createBuffer({
        size: this.totalDefaultUniformBufferSize,
        // This should be the sum of byte sizes of all uniforms
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_SRC,
        mappedAtCreation: true
      });
      if (!this.defaultUniformBinding) {
        this.defaultUniformBinding = this.inputBuffers.length;
      }
      this.bufferGroup.defaultUniformBuffer = this.defaultUniformBuffer;
    }
    this.updateUBO(uniformValues, inputTypes);
    if (newInputBuffer) {
      const bindGroupEntries = this.inputBuffers.map((buffer, index) => ({
        binding: index,
        resource: { buffer }
      }));
      if (this.defaultUniforms)
        bindGroupEntries.push({
          binding: this.defaultUniformBinding,
          resource: { buffer: this.defaultUniformBuffer }
        });
      this.bindGroup = this.device.createBindGroup({
        layout: this.bindGroupLayout,
        entries: bindGroupEntries
      });
      if (!this.bindGroups) {
        if (this.helper) {
          if (!this.helper.bindGroups)
            this.helper.bindGroups = [];
          this.bindGroups = this.helper.bindGroups;
        } else
          this.bindGroups = [];
      }
      this.bindGroups[bindGroupNumber] = this.bindGroup;
    }
    return newInputBuffer;
  };
  getOutputData = (commandEncoder) => {
    const stagingBuffers = this.outputBuffers.map((outputBuffer) => {
      return this.device.createBuffer({
        size: outputBuffer.size,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
      });
    });
    this.outputBuffers.forEach((outputBuffer, index) => {
      commandEncoder.copyBufferToBuffer(
        outputBuffer,
        0,
        stagingBuffers[index],
        0,
        outputBuffer.size
      );
    });
    this.device.queue.submit([commandEncoder.finish()]);
    const promises = stagingBuffers.map((buffer) => {
      return new Promise((resolve) => {
        buffer.mapAsync(GPUMapMode.READ).then(() => {
          const mappedRange = buffer.getMappedRange();
          const rawResults = new Float32Array(mappedRange);
          const copiedResults = new Float32Array(rawResults.length);
          copiedResults.set(rawResults);
          buffer.unmap();
          resolve(copiedResults);
        });
      });
    });
    return promises.length === 1 ? promises[0] : Promise.all(promises);
  };
  //bound to the shader scope. Todo: make this more robust for passing values for specific vertexbuffers or say texturebuffers etc
  run = ({
    vertexCount,
    //collapse into vertexData sets
    instanceCount,
    firstVertex,
    firstInstance,
    vbos,
    //[{vertices:[]}]
    textures,
    //({data:Uint8Array([]), width:800, height:600, format:'rgba8unorm' (default), bytesPerRow: width*4 (default rgba) })[], //all required
    bufferOnly,
    skipOutputDef,
    bindGroupNumber,
    samplerSettings,
    viewport,
    scissorRect,
    blendConstant,
    indexBuffer,
    firstIndex,
    indexFormat,
    //uint16 or uint32
    useRenderBundle,
    workgroupsX,
    workgroupsY,
    workgroupsZ
  } = {}, ...inputs) => {
    const newInputBuffer = this.buffer(
      {
        vbos,
        //[{vertices:[]}]
        textures,
        //[{data:Uint8Array([]), width:800, height:600, format:'rgba8unorm' (default), bytesPerRow: width*4 (default rgba) }], //all required
        skipOutputDef,
        bindGroupNumber,
        samplerSettings
      },
      ...inputs
    );
    if (!bufferOnly) {
      const commandEncoder = this.device.createCommandEncoder();
      if (this.computePipeline) {
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.computePipeline);
        const withBindGroup = (group, i) => {
          computePass.setBindGroup(i, group);
        };
        this.bindGroups.forEach(withBindGroup);
        let wX = workgroupsX ? workgroupsX : this.inputBuffers?.[0] ? this.inputBuffers[0].size / 4 / this.workGroupSize : 1;
        computePass.dispatchWorkgroups(wX, workgroupsY, workgroupsZ);
        computePass.end();
      }
      if (this.graphicsPipeline) {
        let renderPass;
        if (useRenderBundle && (newInputBuffer || !this.renderBundle)) {
          renderPass = this.device.createRenderBundleEncoder({
            colorFormats: [navigator.gpu.getPreferredCanvasFormat()]
            //depthStencilFormat: "depth24plus" //etc...
          });
          this.firstPass = true;
        } else {
          this.renderPassDescriptor.colorAttachments[0].view = this.context.getCurrentTexture().createView();
          renderPass = commandEncoder.beginRenderPass(this.renderPassDescriptor);
        }
        if (!useRenderBundle || !this.renderBundle) {
          renderPass.setPipeline(this.graphicsPipeline);
          const withBindGroup = (group, i) => {
            renderPass.setBindGroup(i, group);
          };
          this.bindGroups.forEach(withBindGroup);
          if (!this.vertexBuffers)
            this.updateVBO({ color: [1, 1, 1, 1] }, 0);
          if (this.vertexBuffers)
            this.vertexBuffers.forEach((vbo, i) => {
              renderPass.setVertexBuffer(i, vbo);
            });
          if (viewport) {
            renderPass.setViewPort(
              viewport.x,
              viewport.y,
              viewport.width,
              viewport.height,
              viewport.minDepth,
              viewport.maxDepth
            );
          }
          if (scissorRect) {
            renderPass.setScissorRect(
              scissorRect.x,
              scissorRect.y,
              scissorRect.width,
              scissorRect.height
            );
          }
          if (blendConstant) {
            renderPass.setBlendConstant(
              blendConstant
            );
          }
          if (indexBuffer || this.indexBuffer) {
            if (indexBuffer)
              this.indexBuffer = indexBuffer;
            if (!this.indexFormat)
              this.indexFormat = indexFormat ? indexFormat : "uint32";
            renderPass.setIndexBuffer(this.indexBuffer, this.indexFormat);
          }
          if (vertexCount)
            this.vertexCount = vertexCount;
          else if (!this.vertexCount)
            this.vertexCount = 1;
          if (this.indexBuffer)
            renderPass.drawIndexed(this.vertexCount ? this.vertexCount : 1, instanceCount, firstIndex, 0, firstInstance);
          else
            renderPass.draw(this.vertexCount ? this.vertexCount : 1, instanceCount, firstVertex, firstInstance);
          if (useRenderBundle && this.firstPass)
            this.renderBundle = renderPass.finish();
        } else {
          renderPass.executeBundles([this.renderBundle]);
        }
        renderPass.end();
      }
      if (!skipOutputDef) {
        return this.getOutputData(commandEncoder);
      } else
        return new Promise((r) => r(true));
    }
  };
};
function isTypedArray(x) {
  return ArrayBuffer.isView(x) && Object.prototype.toString.call(x) !== "[object DataView]";
}

// ../src/pipeline.ts
var WebGPUjs = class {
  static createPipeline = async (shaders, options = {}) => {
    let device = options.device;
    if (!device) {
      const gpu = navigator.gpu;
      const adapter = await gpu.requestAdapter();
      if (!adapter)
        throw new Error("No GPU Adapter found!");
      device = await adapter.requestDevice();
      options.device = device;
    }
    if (options.canvas) {
      if (!options.context)
        options.context = options.canvas.getContext("webgpu");
    }
    if (typeof shaders === "function") {
      const shader = WGSLTranspiler.convertToWebGPU(
        shaders,
        options.canvas ? "fragment" : "compute",
        options.bindGroupNumber,
        options.nVertexBuffers,
        options.workGroupSize,
        options.functions
      );
      if (options.getPrevShaderBindGroups) {
        let combined = WGSLTranspiler.combineBindings(shader.code, options.getPrevShaderBindGroups);
        shader.code = combined.code1;
        shader.altBindings = combined.changes1;
      }
      let shaderPipeline;
      if (shader.type === "compute") {
        shaderPipeline = new ShaderHelper({ compute: shader }, options);
      } else {
        shaderPipeline = new ShaderHelper({ fragment: shader }, options);
      }
      if (options.inputs || options.renderPass) {
        if (shaderPipeline["compute"]) {
          shaderPipeline.process(...options.inputs);
        }
        if (shaderPipeline["fragment"]) {
          let inps = options.inputs ? [...options.inputs] : [];
          shaderPipeline.render({ ...options.renderPass }, ...inps);
        }
      }
      return shaderPipeline;
    } else {
      const block = shaders;
      if (block.code) {
        if (typeof block.code === "function" || block.transpileString) {
          block.code = WGSLTranspiler.convertToWebGPU(
            block.code,
            options.canvas ? "fragment" : "compute",
            options.bindGroupNumber,
            options.nVertexBuffers,
            options.workGroupSize,
            options.functions
          );
        }
        if (options.getPrevShaderBindGroups) {
          let combined = WGSLTranspiler.combineBindings(block.code, options.getPrevShaderBindGroups);
          block.code = combined.code1;
          block.altBindings = combined.changes1;
        }
        const shaderPipeline = this.init(block, options);
        if (options.inputs || options.renderPass) {
          if (shaderPipeline["compute"]) {
            shaderPipeline.process(...options.inputs);
          }
          if (shaderPipeline["fragment"]) {
            let inps = options.inputs ? [...options.inputs] : [];
            shaderPipeline.render({ ...options.renderPass }, ...inps);
          }
        }
        return shaderPipeline;
      } else {
        if (block.compute) {
          if (typeof block.compute === "function" || block.transpileString) {
            block.compute = WGSLTranspiler.convertToWebGPU(
              block.compute,
              "compute",
              options.bindGroupNumber,
              options.nVertexBuffers,
              options.workGroupSize,
              options.functions
            );
          }
        }
        if (block.vertex) {
          if (typeof block.vertex === "function" || block.transpileString) {
            block.vertex = WGSLTranspiler.convertToWebGPU(
              block.vertex,
              "vertex",
              options.bindGroupNumber,
              options.nVertexBuffers,
              options.workGroupSize,
              options.functions
            );
          }
        }
        if (block.fragment) {
          if (typeof block.fragment === "function" || block.transpileString) {
            block.fragment = WGSLTranspiler.convertToWebGPU(
              block.fragment,
              "fragment",
              options.bindGroupNumber,
              options.nVertexBuffers,
              options.workGroupSize,
              options.functions
            );
          }
        }
        if (options.getPrevShaderBindGroups) {
          for (const key in block) {
            let combined = WGSLTranspiler.combineBindings(block[key].code, options.getPrevShaderBindGroups);
            block[key].code = combined.code1;
            block[key].altBindings = combined.changes1;
          }
        }
        const shaderPipeline = new ShaderHelper(block, options);
        if (options.inputs || options.renderPass) {
          if (shaderPipeline["compute"]) {
            shaderPipeline.process(...options.inputs);
          }
          if (shaderPipeline["fragment"]) {
            let inps = options.inputs ? [...options.inputs] : [];
            shaderPipeline.render({ ...options.renderPass }, ...inps);
          }
        }
        return shaderPipeline;
      }
    }
  };
  static init = (shaders, options) => {
    return new ShaderHelper(shaders, options);
  };
  static cleanup = (shaderPipeline) => {
    if (shaderPipeline.device)
      shaderPipeline.device.destroy();
    if (shaderPipeline.context)
      shaderPipeline.context.unconfigure();
  };
};

// examplets.js
function dft(inputData = new Float32Array(), outputData = [], outp3 = mat2x2(vec2(1, 1), vec2(1, 1)), outp4 = "i32", outp5 = vec3(1, 2, 3), outp6 = [vec2(1, 1)]) {
  function add(a = vec2f(0, 0), b2 = vec2f(0, 0)) {
    return a + b2;
  }
  let x = new Float32Array(32);
  let x2 = new Array(32).fill(inputData[0]);
  const x3 = [1, 2, 3];
  let x4 = new Array(100).fill(vec3(0, 0, 0));
  let x5 = new Array(100).fill(mat2x2(vec2(1, 1), vec2(1, 1)));
  const N = i32(inputData.length);
  const k = threadId.x;
  let sum = vec2f(0, 0);
  var sum2 = add(sum, sum);
  let width = resX;
  const b = 3 + outp4;
  `const bb : array<f32, 5> = array(1,2,3,4,5)`;
  var M = mat4x4(
    vec4f(1, 0, 0, 0),
    vec4f(0, 1, 0, 0),
    vec4f(0, 0, 1, 0),
    vec4f(0, 0, 0, 1)
  );
  let D = M + M;
  var Z = outp3 * mat2x2(vec2f(4, -1), vec2f(3, 2));
  var Zz = outp5 + vec3(4, 5, 6);
  for (let n = 0; n < N; n++) {
    const phase = 2 * Math.PI * f32(k) * f32(n) / f32(N);
    sum = sum + vec2f(
      inputData[n] * Math.cos(phase),
      -inputData[n] * Math.sin(phase)
    );
  }
  const outputIndex = k * 2;
  if (outputIndex + 1 < outputData.length) {
    outputData[outputIndex] = sum.x;
    outputData[outputIndex + 1] = sum.y;
  }
  return [inputData, outputData];
}
function setupWebGPUConverterUI(fn, target = document.body, shaderType) {
  let webGPUCode = WGSLTranspiler.convertToWebGPU(dft, shaderType);
  const uniqueID = Date.now();
  const beforeTextAreaID = `t2_${uniqueID}`;
  const afterTextAreaID = `t1_${uniqueID}`;
  target.style.backgroundColor = "black";
  target.style.color = "white";
  target.insertAdjacentHTML("beforeend", `
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
  parseFunction();
  document.getElementById(beforeTextAreaID).oninput = () => {
    parseFunction();
  };
  return uniqueID;
}
var ex1Id = setupWebGPUConverterUI(dft, document.getElementById("ex1"));
setTimeout(() => {
  console.time("createComputePipeline");
  WebGPUjs.createPipeline(dft).then((pipeline) => {
    console.timeEnd("createComputePipeline");
    const len = 256;
    const inputData = new Float32Array(len).fill(1);
    const outputData = new Float32Array(len * 2).fill(0);
    console.log("Note: single threaded test");
    console.time("run DFT with initial buffering");
    pipeline.process(inputData, outputData, void 0, 4).then((result) => {
      console.timeEnd("run DFT with initial buffering");
      console.log("Results can be multiple buffers:", result);
      const inputData2 = new Float32Array(len).fill(2);
      console.time("run DFT only updating inputData buffer values");
      pipeline.process(inputData2, void 0, void 0, 4).then((r2) => {
        console.timeEnd("run DFT only updating inputData buffer values");
        console.log("Result2:", r2);
        const len2 = 1024;
        const inputData3 = new Float32Array(len2).fill(3);
        const outputData3 = new Float32Array(len2 * 2).fill(0);
        console.time("run DFT dynamically resizing inputData and outputData");
        pipeline.process(inputData3, outputData3, void 0, 4).then((r3) => {
          console.timeEnd("run DFT dynamically resizing inputData and outputData");
          console.log("Results can be dynamically resized:", r3);
          console.time("addFunction and recompile shader pipeline");
          pipeline.addFunction(function mul(a = vec2f(2, 0), b = vec2f(2, 0)) {
            return a * b;
          });
          console.timeEnd("addFunction and recompile shader pipeline");
          console.log(pipeline);
          document.getElementById("t1_" + ex1Id).value = pipeline.compute.code;
        });
      });
    });
  });
}, 1e3);
function vertexExample() {
  const tri = array(
    vec2f(0, 0.5),
    vec2f(-0.5, -0.5),
    vec2f(0.5, -0.5)
  );
  const cols = [
    vec4f(1, 0, 0, 1),
    vec4f(0, 1, 0, 1),
    vec4f(0, 0, 1, 1)
  ];
  color = cols[vertexIndex];
  position = vec4f(tri[vertexIndex], 0, 1);
}
function fragmentExample() {
  return color;
}
var canvas = document.createElement("canvas");
canvas.width = 800;
canvas.height = 600;
document.getElementById("ex2").appendChild(canvas);
var ex12Id1 = setupWebGPUConverterUI(vertexExample, document.getElementById("ex2"), "vertex");
var ex12Id2 = setupWebGPUConverterUI(fragmentExample, document.getElementById("ex2"), "fragment");
console.time("createRenderPipeline and render triangle");
WebGPUjs.createPipeline({
  vertex: vertexExample,
  fragment: fragmentExample
}, {
  canvas,
  renderPass: {
    vertexCount: 3,
    vbos: [
      //we can upload vbos, though not necessary in current example (think)
      {
        //position
        color: new Array(3 * 4).fill(0)
        //
      }
    ]
    //textures:{}
  }
}).then((pipeline) => {
  console.timeEnd("createRenderPipeline and render triangle");
});
