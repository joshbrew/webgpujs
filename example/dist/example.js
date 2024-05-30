(() => {
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
        if (!shaderContext.frame) shaderContext.frame = 0;
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
      let functionBody = funcStr.substring(funcStr.indexOf("{") + 1, funcStr.lastIndexOf("}"));
      const textureCallTokens = (functionBody.match(/texture.*\w+\(([^)]+)\)/g) || []).flatMap((call) => {
        let args = call.substring(call.indexOf("(") + 1, call.lastIndexOf(")"));
        return this.splitIgnoringBrackets(args).map((arg) => {
          arg = arg.trim();
          if (!isNaN(arg) || /^.*(vec|mat).*\(/.test(arg)) {
            return null;
          }
          return { token: arg, isInput: false };
        }).filter((arg) => arg !== null);
      });
      params = params.concat(assignmentTokens);
      params = params.concat(builtInUniformsTokens);
      params = params.concat(textureCallTokens);
      return params;
    }
    static excludedNames = {
      "position": true,
      "pixel": true
    };
    static parse = (fstr, tokens, shaderType = "compute", vertexBufferOptions) => {
      const ast = [];
      const returnMatches = fstr.match(/^(?![ \t]*\/\/).*\breturn .*;/gm);
      let returnedVars = returnMatches ? returnMatches.map((match) => match.replace(/^[ \t]*return /, "").replace(";", "")) : void 0;
      returnedVars = this.flattenStrings(returnedVars);
      if (typeof vertexBufferOptions?.[0] === "object") vertexBufferOptions.forEach((opt) => {
        const keys = Object.keys(opt).filter((n) => {
          if (n !== "stepMode" && n !== "__COUNT") return true;
        });
        keys.forEach((k) => {
          if (!(k in this.excludedNames)) {
            this.excludedNames[k] = true;
          }
        });
      });
      const functionBody = fstr.substring(fstr.indexOf("{"));
      let checked = {};
      const exnKeys = Object.keys(this.excludedNames);
      const biuKeys = Object.keys(this.builtInUniforms);
      tokens.forEach(({ token, isInput }, i) => {
        if (checked[token]) return;
        checked[token] = true;
        let isReturned = returnedVars?.find((v) => {
          if (token.includes(v)) {
            if (shaderType !== "compute" && exnKeys.find((t) => token.includes(t)) || biuKeys.find((t) => token.includes(t))) {
              tokens[i].isInput = false;
            } else return true;
          }
        });
        let variableName = token.split("=")[0].trim();
        if (variableName.includes(" ")) {
          let spl = variableName.split(" ");
          variableName = spl[1] ? spl[1] : spl[0];
        }
        let isModified = new RegExp(`(?<!\\blet\\s+|\\bvar\\s+|\\bconst\\s+)\\b${variableName}\\b(?:\\[[^\\]]*\\])?\\s*=`).test(functionBody);
        if (token.includes("=")) {
          const variableMatch = token.match(/(const|let|var)?\s*(\w+)\s*=\s*(.+)/);
          if (variableMatch && (variableMatch[3].startsWith("new") || variableMatch[3].startsWith("["))) {
            let length2;
            if (variableMatch[3].startsWith("new Array(")) {
              const arrayLengthMatch = variableMatch[3].match(/new Array\((\d+)\)/);
              length2 = arrayLengthMatch ? parseInt(arrayLengthMatch[1]) : void 0;
            } else if (variableMatch[3].startsWith("new")) {
              const typedArrayLengthMatch = variableMatch[3].match(/new \w+Array\(\[([^\]]+)\]\)/);
              length2 = typedArrayLengthMatch ? typedArrayLengthMatch[1].split(",").length : void 0;
            } else {
              const directArrayLengthMatch = variableMatch[3].match(/\[([^\]]+)\]/);
              length2 = directArrayLengthMatch ? directArrayLengthMatch[1].split(",").length : void 0;
            }
            ast.push({
              type: "array",
              name: variableMatch[2],
              value: variableMatch[3],
              isInput,
              length: length2,
              // Added this line to set the extracted length
              isReturned: returnedVars ? returnedVars?.includes(variableMatch[2]) : isInput ? true : false,
              isModified
            });
          } else if (token.startsWith("vec") || token.startsWith("mat")) {
            const typeMatch = token.match(/(vec\d+|mat\d+x\d+)(f|h|i|u|<[^>]+>)?\(([^)]+)\)/);
            if (typeMatch) {
              let type = typeMatch[1];
              let format = typeMatch[2];
              switch (format) {
                case "f":
                  format = "<f32>";
                  break;
                case "h":
                  format = "<f16>";
                  break;
                case "i":
                  format = "<i32>";
                  break;
                case "u":
                  format = "<u32>";
                  break;
                default:
                  format = format || "<f32>";
              }
              ast.push({
                type,
                // Combines type with format (e.g., 'vec3<f32>')
                name: token.split("=")[0].trim(),
                value: format,
                // Captures the arguments inside the parentheses
                isInput,
                isReturned: returnedVars ? returnedVars.includes(token.split("=")[0].trim()) : isInput ? true : false,
                isModified
              });
            }
          } else {
            if (variableMatch[3].includes("array")) {
              ast.push({
                type: "array",
                name: variableMatch[2],
                value: variableMatch[3],
                isInput,
                isReturned: returnedVars ? returnedVars?.includes(variableMatch[2]) : isInput ? true : false,
                isModified
              });
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
          }
        } else {
          ast.push({
            type: "variable",
            name: token,
            value: "unknown",
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
      if (value === "true" || value === "false") return "bool";
      else if (value.startsWith('"') || value.startsWith("'") || value.startsWith("`")) return value.substring(1, value.length - 1);
      else if (value.startsWith("vec")) {
        const VecMatch = value.match(/vec(\d+)(f|h|i|u|<[^>]+>)?/);
        if (VecMatch) {
          const vecSize = VecMatch[1];
          let type = VecMatch[2];
          if (!type) {
            type = value.includes(".") ? "<f32>" : "<i32>";
          } else if (type.length === 1) {
            switch (type) {
              case "f":
                type = "<f32>";
                break;
              case "h":
                type = "<f16>";
                break;
              case "i":
                type = "<i32>";
                break;
              case "u":
                type = "<u32>";
                break;
            }
          }
          return `vec${vecSize}${type}`;
        }
      } else if (value.startsWith("mat")) {
        const MatMatch = value.match(/mat(\d+)x(\d+)(f|h|i|u|<[^>]+>)?/);
        if (MatMatch) {
          const matSize = `${MatMatch[1]}x${MatMatch[2]}`;
          let type = MatMatch[3];
          if (!type) {
            type = "<f32>";
          } else if (type.length === 1) {
            switch (type) {
              case "f":
                type = "<f32>";
                break;
              case "h":
                type = "<f16>";
                break;
              default:
                type = "<f32>";
            }
          }
          return `mat${matSize}${type}`;
        }
      } else if (value.startsWith("[")) {
        const firstElement = value.split(",")[0].substring(1);
        if (firstElement === "]") return "array<f32>";
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
        } else return "f32";
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
      } else if (value.includes(".") || value.includes("e-")) {
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
      if (!arr) return [];
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
    static generateDataStructures(funcStr, ast, bindGroup = 0, shaderType, variableTypes, minBinding = 0) {
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
      let hasUniforms = false;
      let defaultUniforms;
      const params = [];
      let bindingIncr = minBinding;
      let names = {};
      let prevTextureBinding;
      ast.forEach((node, i) => {
        if (names[node.name]) return;
        names[node.name] = true;
        if (returnedVars.includes(node.name) && !this.excludedNames[node.name]) node.isInput = true;
        function escapeRegExp(string) {
          return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        }
        if (new RegExp(`textureSampleCompare\\(${escapeRegExp(node.name)},`).test(funcStr)) {
          let nm = node.name.toLowerCase();
          if (nm.includes("deptharr")) node.isDepthTextureArray = true;
          else if (nm.includes("depth")) node.isDepthTexture2d = true;
          else if (nm.includes("cubearr")) node.isDepthCubeArrayTexture = true;
          else if (nm.includes("cube")) node.isDepthCubeTexture = true;
          else if (nm.includes("ms2d")) node.isDepthMSAATexture = true;
          node.isTexture = true;
          node.isDepthTexture = true;
          prevTextureBinding = bindingIncr;
        } else if (new RegExp(`textureSampleCompare\\(\\w+\\s*,\\s*${escapeRegExp(node.name)}`).test(funcStr)) {
          node.isComparisonSampler = true;
          node.isSampler = true;
        } else if (new RegExp(`textureSample\\(\\w+\\s*,\\s*${escapeRegExp(node.name)}`).test(funcStr)) {
          node.isSampler = true;
        } else if (new RegExp(`textureStore\\(${escapeRegExp(node.name)},`).test(funcStr)) {
          let nm = node.name.toLowerCase();
          if (nm.includes("3d")) node.is3dStorageTexture = true;
          else if (nm.includes("1d")) node.is1dStorageTexture = true;
          else if (nm.includes("2darr")) node.is2dStorageTextureArray = true;
          node.isStorageTexture = true;
          if (prevTextureBinding !== void 0) node.isSharedStorageTexture = true;
        } else if (new RegExp(`texture.*\\(${escapeRegExp(node.name)},`).test(funcStr)) {
          let nm = node.name.toLowerCase();
          if (nm.includes("deptharr")) node.isDepthTextureArray = true;
          else if (nm.includes("depthcubearr")) node.isDepthCubeArrayTexture = true;
          else if (nm.includes("depthcube")) node.isDepthCubeTexture = true;
          else if (nm.includes("depthms2d")) node.isDepthMSAATexture = true;
          else if (nm.includes("depth")) node.isDepthTexture2d = true;
          else if (nm.includes("cubearr")) node.isCubeArrayTexture = true;
          else if (nm.includes("cube")) node.isCubeTexture = true;
          else if (nm.includes("3d")) node.is3dTexture = true;
          else if (nm.includes("2darr")) node.is2dTextureArray = true;
          else if (nm.includes("1d")) node.is1dTexture = true;
          else if (nm.includes("ms2d")) node.is2dMSAATexture = true;
          if (nm.includes("depth"))
            node.isDepthTexture = true;
          node.isTexture = true;
          prevTextureBinding = bindingIncr;
        }
        node.binding = bindingIncr;
        node.group = bindGroup;
        if (variableTypes && variableTypes[node.name]) {
          if (typeof variableTypes[node.name] === "string") {
            code += `@group(${bindGroup}) @binding(${bindingIncr}) var ${node.name}: ${variableTypes[node.name]};

`;
            node.type = variableTypes[node.name];
            bindingIncr++;
            params.push(node);
          } else if (typeof variableTypes[node.name] === "object") {
            code += `@group(${bindGroup}) @binding(${bindingIncr}) ${variableTypes[node.name].prefix || "var"} ${node.name}: ${variableTypes[node.name].type};

`;
            node.type = variableTypes[node.name].type;
            bindingIncr++;
            params.push(node);
          }
        } else if (node.isTexture) {
          params.push(node);
          let format = node.name.includes("i32") ? "i32" : node.name.includes("u32") ? "u32" : "f32";
          let typ;
          if (node.isDepthTextureArray) typ = "texture_depth_2d_array";
          else if (node.isDepthCubeArrayTexture) typ = "texture_depth_cube_array";
          else if (node.isDepthMSAATexture) typ = "texture_depth_multisampled_2d";
          else if (node.isDepthCubeTexture) typ = "texture_depth_cube";
          else if (node.isDepthTexture2d) typ = "texture_depth_2d";
          else if (node.isCubeArrayTexture) typ = "texture_cube_array<" + format + ">";
          else if (node.isCubeTexture) typ = "texture_cube<" + format + ">";
          else if (node.is3dTexture) typ = "texture_3d<" + format + ">";
          else if (node.is2dTextureArray) typ = "texture_2d_array<" + format + ">";
          else if (node.is1dTexture) typ = "texture_1d<" + format + ">";
          else if (node.is2dMSAATexture) typ = "texture_multisampled_2d<" + format + ">";
          else typ = `texture_2d<f32>`;
          code += `@group(${bindGroup}) @binding(${bindingIncr}) var ${node.name}: ${typ};
`;
          bindingIncr++;
        } else if (node.isStorageTexture) {
          let format = textureFormats.find((f) => {
            if (node.name.includes(f)) return true;
          });
          if (!format) format = "rgba8unorm";
          let typ;
          if (node.is3dStorageTexture) typ = "texture_storage_3d<" + format + ",write>";
          else if (node.is1dStorageTexture) typ = "texture_storage_3d<" + format + ",write>";
          else if (node.is2dStorageTextureArray) typ = "texture_storage_2d_array<" + format + ",write>";
          else typ = "texture_storage_2d<" + format + ",write>";
          params.push(node);
          code += `@group(${bindGroup}) @binding(${bindingIncr}) var ${node.name}: ${typ};
`;
          if (typeof prevTextureBinding === "undefined")
            bindingIncr++;
          else prevTextureBinding = void 0;
        } else if (node.isSampler) {
          let typ;
          if (node.isComparisonSampler) typ = "sampler_comparison";
          else typ = "sampler";
          params.push(node);
          code += `@group(${bindGroup}) @binding(${bindingIncr}) var ${node.name}: ${typ};

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
            if (!returnedVars || returnedVars?.includes(node.name) || node.isModified && !node.isUniform) {
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
      if (hasUniforms !== false) {
        uniformsStruct += "};\n\n";
        code += uniformsStruct;
        code += `@group(${bindGroup}) @binding(${hasUniforms}) var<uniform> uniforms: UniformsStruct;

`;
      }
      return { code, params, defaultUniforms, lastBinding: bindingIncr };
    }
    static extractAndTransposeInnerFunctions = (body, extract = true, ast, params, shaderType, vertexBufferOptions) => {
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
          if (!outputParam) outputParam = inferredType;
          return vname + ": " + inferredType;
        });
        const transposedBody = this.transposeBody(funcBody, funcBody, params2, shaderType, true, void 0, false, vertexBufferOptions).code;
        extractedFunctions += `fn ${funcName}(${params2}) -> ${outputParam} {${transposedBody}}

`;
      }
      if (extract) body = body.replace(functionRegex, "");
      return { body, extractedFunctions };
    };
    static generateMainFunctionWorkGroup(funcStr, ast, params, shaderType = "compute", vertexBufferOptions = [{
      color: "vec4<f32>"
    }], workGroupSize = 64, gpuFuncs) {
      let code = "";
      if (gpuFuncs) {
        gpuFuncs.forEach((f) => {
          let result = this.extractAndTransposeInnerFunctions(typeof f === "function" ? f.toString() : f, false, ast, params, shaderType, vertexBufferOptions);
          if (result.extractedFunctions) code += result.extractedFunctions;
        });
      }
      const { body: mainBody, extractedFunctions } = this.extractAndTransposeInnerFunctions(funcStr.match(/{([\s\S]+)}/)[1], true, ast, params, shaderType, vertexBufferOptions);
      code += extractedFunctions;
      let vtxInps;
      let vboInputStrings = [];
      if (shaderType === "vertex" || shaderType === "fragment") {
        let vboStrings = [];
        if (vertexBufferOptions) {
          const types = [];
          const keys = [];
          vertexBufferOptions.forEach((obj) => {
            keys.push(...Object.keys(obj));
            types.push(...Object.values(obj));
          });
          let loc = 0;
          let idx = 0;
          for (const key of keys) {
            const type = types[idx];
            idx++;
            if (key === "stepMode" || key === "__COUNT") continue;
            vboStrings.push(
              `@location(${loc}) ${key}: ${type}${idx === keys.length ? "" : ","}`
            );
            if (shaderType === "vertex") {
              vboInputStrings.push(
                `@location(${loc}) ${key}In: ${type}${idx === keys.length ? "" : ","}`
              );
            }
            loc++;
          }
        }
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
        code += "\n) -> Vertex {\n    var pixel: Vertex;\n";
      } else if (shaderType === "fragment") {
        code += `
@fragment
fn frag_main(
    pixel: Vertex,
    @builtin(front_facing) is_front: bool,   //true when current fragment is on front-facing primitive
    @builtin(sample_index) sampleIndex: u32, //sample index for the current fragment
    @builtin(sample_mask) sampleMask: u32   //contains a bitmask indicating which samples in this fragment are covered by the primitive being rendered
) -> @location(0) vec4<f32> {
`;
      }
      let shaderHead = code;
      let transposed = this.transposeBody(mainBody, funcStr, params, shaderType, shaderType === "fragment", shaderHead, true, vertexBufferOptions);
      code += transposed.code;
      if (transposed.consts?.length > 0)
        code = transposed.consts.join("\n") + "\n\n" + code;
      if (shaderType === "vertex") code += `
    return pixel; 
`;
      code += "\n}\n";
      return code;
    }
    static transposeBody = (body, funcStr, params, shaderType, returns = false, shaderHead = "", extractConsts = false, vertexBufferOptions) => {
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
          if (arrayVars.includes(p1)) return match;
          return `${p1}.values[${p2}]`;
        });
      } else {
        let names = ["position"];
        vertexBufferOptions.forEach((opt) => {
          names.push(...Object.keys(opt).filter((n) => {
            if (n !== "stepMode" && n !== "__COUNT") return true;
          }));
        });
        let namesPattern = names.join("|");
        code = code.replace(new RegExp(`(${namesPattern})|(\\w+)\\[([\\w\\s+\\-*\\/]+)\\]`, "gm"), (match, p1, p2, p3) => {
          if (p1 || arrayVars.includes(p2)) return match;
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
            for (let i = 0; i < sizeCount; i++) size += ")";
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
        const isVecOrMatWithSpecificType = /^(vec|mat)\d+[fuhi]/.test(type);
        let inferredType;
        if (isVecOrMatWithSpecificType) {
          const typeSuffix = type.match(/[fuhi]$/)[0];
          switch (typeSuffix) {
            case "f":
              inferredType = "f32";
              break;
            case "u":
              inferredType = "u32";
              break;
            case "i":
              inferredType = "i32";
              break;
            case "h":
              inferredType = "f16";
              break;
            default:
              inferredType = "f32";
          }
        } else {
          inferredType = hasDecimal ? "f32" : "i32";
        }
        if (type.startsWith("mat")) {
          const matInternalType = isVecOrMatWithSpecificType ? `<${inferredType}>` : "<f32>";
          return `${type}${matInternalType}(${argArray.join(", ").replace(/vec(\d+)/gm, `vec$1${matInternalType}`)})`;
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
          if (!varName.includes("In")) {
            const regex = new RegExp(`(?<![a-zA-Z0-9_.])${varName}(?![a-zA-Z0-9_.])`, "gm");
            code = code.replace(regex, `pixel.${varName}`);
          }
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
      if (!returns) code = code.replace(/(return [^;]+;)/gm, "//$1");
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
          if (depth > 0) depth--;
          if (result.slice(-tab.length) === tab) {
            result = result.slice(0, -tab.length);
          }
        }
        result += char;
      }
      return result;
    }
    static addFunction = (func, shaders) => {
      if (!shaders.functions) shaders.functions = [];
      shaders.functions.push(func);
      for (const key of ["compute", "fragment", "vertex"]) {
        if (shaders[key])
          Object.assign(shaders[key], this.convertToWebGPU(shaders[key].funcStr, key, shaders[key].bindGroupNumber, shaders[key].nVertexBuffers, shaders[key].workGroupSize ? shaders[key].workGroupSize : void 0, shaders.functions));
      }
      return shaders;
    };
    //combine input bindings and create mappings so input arrays can be shared based on variable names, assuming same types in a continuous pipeline (the normal thing)
    static combineBindings(bindings1str, bindings2str) {
      const bindingRegex = /@group\((\d+)\) @binding\((\d+)\)\s+(var(?:<[^>]+>)?)\s+(\w+)\s*:/g;
      const structRegex = /struct (\w+) \{([\s\S]*?)\}/;
      const combinedStructs = /* @__PURE__ */ new Map();
      const replacementsOriginal = /* @__PURE__ */ new Map();
      const replacementsReplacement = /* @__PURE__ */ new Map();
      let changesShader1 = {};
      let changesShader2 = {};
      let usedBindings = /* @__PURE__ */ new Set();
      let bmatch;
      while ((bmatch = bindingRegex.exec(bindings1str)) !== null) {
        usedBindings.add(`${bmatch[1]}-${bmatch[2]}`);
      }
      bindings2str = bindings2str.replace(bindingRegex, (match2, group, binding, varDecl, varName) => {
        let newBinding = binding;
        while (usedBindings.has(`${group}-${newBinding}`)) {
          newBinding = (parseInt(newBinding) + 1).toString();
          changesShader2[varName] = { group, binding: newBinding };
        }
        usedBindings.add(`${group}-${newBinding}`);
        return `@group(${group}) @binding(${newBinding}) ${varDecl} ${varName}:`;
      });
      const extractBindings = (str, replacements2, changes) => {
        let match2;
        const regex = new RegExp(bindingRegex);
        while ((match2 = regex.exec(str)) !== null) {
          replacements2.set(match2[4], match2[0].slice(0, match2[0].indexOf(" var")));
          changes[match2[4]] = {
            group: match2[1],
            binding: match2[2]
          };
          usedBindings.add(`${match2[1]}-${match2[2]}`);
        }
      };
      extractBindings(bindings1str, replacementsOriginal, changesShader1);
      extractBindings(bindings2str, replacementsReplacement, changesShader2);
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
          changesShader1[varName] = { group: newGroup, binding: newBinding };
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
          changesShader2[varName] = { group: newGroup, binding: newBinding };
          return updated;
        }
        return match2;
      });
      return {
        code1: result1.trim(),
        changes1: changesShader1,
        code2: result2.trim(),
        changes2: changesShader2
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
      if (shader1Obj.ast) combinedAst.push(...shader1Obj.ast);
      if (shader1Obj.params) combinedParams.push(...shader1Obj.params);
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
    static convertToWebGPU(func, shaderType = "compute", bindGroupNumber = 0, workGroupSize = 64, vertexBufferOptions = [{
      color: "vec4<f32>"
    }], gpuFuncs, variableTypes, lastBinding = 0) {
      let funcStr = typeof func === "string" ? func : func.toString();
      funcStr = funcStr.replace(/(?<!\w)this\./g, "");
      const tokens = this.tokenize(funcStr);
      const ast = this.parse(funcStr, tokens, shaderType, vertexBufferOptions);
      let webGPUCode = this.generateDataStructures(
        funcStr,
        ast,
        bindGroupNumber,
        shaderType,
        variableTypes,
        lastBinding
      );
      const header = webGPUCode.code;
      webGPUCode.code += "\n" + this.generateMainFunctionWorkGroup(
        funcStr,
        ast,
        webGPUCode.params,
        shaderType,
        vertexBufferOptions,
        workGroupSize,
        gpuFuncs
      );
      return {
        code: this.indentCode(webGPUCode.code),
        header,
        ast,
        params: webGPUCode.params,
        funcStr,
        defaultUniforms: webGPUCode.defaultUniforms,
        type: shaderType,
        workGroupSize: shaderType === "compute" ? workGroupSize : void 0,
        bindGroupNumber,
        lastBinding: webGPUCode.lastBinding
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
    "Math.LN10": `${Math.LN10}`,
    "Math.LN2": `${Math.LN2}`,
    "Math.LOG10E": `${Math.LOG10E}`,
    "Math.LOG2E": `${Math.LOG2E}`,
    "Math.SQRT1_2": `${Math.SQRT1_2}`,
    "Math.SQRT2": `${Math.SQRT2}`,
    "Math.abs": "abs",
    "Math.acos": "acos",
    "Math.acosh": "acosh",
    "Math.asin": "asin",
    "Math.asinh": "asinh",
    "Math.atan": "atan",
    "Math.atan2": "atan2",
    "Math.atanh": "atanh",
    // 'Math.cbrt': '', // No direct WGSL equivalent
    "Math.ceil": "ceil",
    "Math.cos": "cos",
    "Math.cosh": "cosh",
    "Math.clz32": "countLeadingZeros",
    // 'Math.imul': '', // No direct WGSL equivalent
    "Math.exp": "exp",
    // 'Math.expm1': '', // No direct WGSL equivalent
    "Math.floor": "floor",
    "Math.log": "log",
    "Math.log2": "log2",
    "Math.max": "max",
    "Math.min": "min",
    "Math.pow": "pow",
    // 'Math.random': '', // No direct WGSL equivalent
    "Math.round": "round",
    "Math.sin": "sin",
    "Math.sinh": "sinh",
    "Math.sqrt": "sqrt",
    "Math.tan": "tan",
    "Math.tanh": "tanh",
    "Math.trunc": "trunc"
    // ... add more replacements as needed
  };
  var wgslTypeSizes32 = {
    "bool": { alignment: 1, size: 1, ct: 1 },
    "u8": { alignment: 1, size: 1, ct: 1 },
    "i8": { alignment: 1, size: 1, ct: 1 },
    "i32": { alignment: 4, size: 4, vertexFormats: { "sint32": true }, ct: 1 },
    "u32": { alignment: 4, size: 4, vertexFormats: { "uint32": true }, ct: 1 },
    "f32": { alignment: 4, size: 4, vertexFormats: { "float32": true }, ct: 1 },
    "i64": { alignment: 8, size: 8, ct: 1 },
    "u64": { alignment: 8, size: 8, ct: 1 },
    "f64": { alignment: 8, size: 8, ct: 1 },
    "atomic<u32>": { alignment: 4, size: 4, ct: 1 },
    "atomic<i32>": { alignment: 4, size: 4, ct: 1 },
    "vec2<i32>": { alignment: 8, size: 8, vertexFormats: { "sint8x2": true, "sint16x2": true, "sint32x2": true }, ct: 2 },
    "vec2<u32>": { alignment: 8, size: 8, vertexFormats: { "uint8x2": true, "uint16x2": true, "uint32x2": true }, ct: 2 },
    "vec2<f32>": { alignment: 8, size: 8, vertexFormats: { "unorm8x2": true, "unorm16x2": true, "float32x2": true, "snorm8x2": true, "snorm16x2": true }, ct: 2 },
    "vec3<i32>": { alignment: 16, size: 12, vertexFormats: { "sint32x3": true }, ct: 3 },
    "vec3<u32>": { alignment: 16, size: 12, vertexFormats: { "uint32x3": true }, ct: 3 },
    "vec3<f32>": { alignment: 16, size: 12, vertexFormats: { "float32x3": true }, ct: 3 },
    "vec4<i32>": { alignment: 16, size: 16, vertexFormats: { "sint8x4": true, "sint16x4": true, "sint32x4": true }, ct: 4 },
    "vec4<u32>": { alignment: 16, size: 16, vertexFormats: { "uint8x4": true, "uint16x4": true, "uint32x4": true }, ct: 4 },
    "vec4<f32>": { alignment: 16, size: 16, vertexFormats: { "unorm8x4": true, "unorm16x4": true, "float32x4": true, "snorm8x4": true, "snorm16x4": true, "float16x4": true }, ct: 4 },
    "vec2i": { alignment: 8, size: 8, vertexFormats: { "sint8x2": true, "sint16x2": true, "sint32x2": true }, ct: 2 },
    // shorthand for vec2<i32>
    "vec2u": { alignment: 8, size: 8, vertexFormats: { "uint8x2": true, "uint16x2": true, "uint32x2": true }, ct: 2 },
    // shorthand for vec2<u32>
    "vec2f": { alignment: 8, size: 8, vertexFormats: { "unorm8x2": true, "unorm16x2": true, "float32x2": true, "snorm8x2": true, "snorm16x2": true }, ct: 2 },
    // shorthand for vec2<f32>
    "vec3i": { alignment: 16, size: 12, vertexFormats: { "sint32x3": true }, ct: 3 },
    // shorthand for vec3<i32>
    "vec3u": { alignment: 16, size: 12, vertexFormats: { "uint32x3": true }, ct: 3 },
    // shorthand for vec3<u32>
    "vec3f": { alignment: 16, size: 12, vertexFormats: { "float32x3": true }, ct: 3 },
    // shorthand for vec3<f32>
    "vec4i": { alignment: 16, size: 16, vertexFormats: { "sint8x4": true, "sint16x4": true, "sint32x4": true }, ct: 4 },
    // shorthand for vec4<i32>
    "vec4u": { alignment: 16, size: 16, vertexFormats: { "uint8x4": true, "uint16x4": true, "uint32x4": true }, ct: 4 },
    // shorthand for vec4<u32>
    "vec4f": { alignment: 16, size: 16, vertexFormats: { "unorm8x4": true, "unorm16x4": true, "float32x4": true, "snorm8x4": true, "snorm16x4": true, "float16x4": true }, ct: 4 },
    // shorthand for vec4<f32>
    //FYI matrix u and i formats are not supported in wgsl (yet) afaik
    "mat2x2<f32>": { alignment: 8, size: 16, ct: 4 },
    "mat2x2<i32>": { alignment: 8, size: 16, ct: 4 },
    "mat2x2<u32>": { alignment: 8, size: 16, ct: 4 },
    "mat3x2<f32>": { alignment: 8, size: 24, ct: 6 },
    "mat3x2<i32>": { alignment: 8, size: 24, ct: 6 },
    "mat3x2<u32>": { alignment: 8, size: 24, ct: 6 },
    "mat4x2<f32>": { alignment: 8, size: 32, ct: 8 },
    "mat4x2<i32>": { alignment: 8, size: 32, ct: 8 },
    "mat4x2<u32>": { alignment: 8, size: 32, ct: 8 },
    "mat2x3<f32>": { alignment: 16, size: 24, ct: 6 },
    "mat2x3<i32>": { alignment: 16, size: 24, ct: 6 },
    "mat2x3<u32>": { alignment: 16, size: 24, ct: 6 },
    "mat3x3<f32>": { alignment: 16, size: 36, ct: 9 },
    "mat3x3<i32>": { alignment: 16, size: 36, ct: 9 },
    "mat3x3<u32>": { alignment: 16, size: 36, ct: 9 },
    "mat4x3<f32>": { alignment: 16, size: 48, ct: 12 },
    "mat4x3<i32>": { alignment: 16, size: 48, ct: 12 },
    "mat4x3<u32>": { alignment: 16, size: 48, ct: 12 },
    "mat2x4<f32>": { alignment: 16, size: 32, ct: 8 },
    "mat2x4<i32>": { alignment: 16, size: 32, ct: 8 },
    "mat2x4<u32>": { alignment: 16, size: 32, ct: 8 },
    "mat3x4<f32>": { alignment: 16, size: 48, ct: 12 },
    "mat3x4<i32>": { alignment: 16, size: 48, ct: 12 },
    "mat3x4<u32>": { alignment: 16, size: 48, ct: 12 },
    "mat4x4<f32>": { alignment: 16, size: 64, ct: 16 },
    "mat4x4<i32>": { alignment: 16, size: 64, ct: 16 },
    "mat4x4<u32>": { alignment: 16, size: 64, ct: 16 },
    "mat2x2f": { alignment: 8, size: 16, ct: 4 },
    // shorthand for mat2x2<f32>
    "mat2x2i": { alignment: 8, size: 16, ct: 4 },
    // shorthand for mat2x2<i32>
    "mat2x2u": { alignment: 8, size: 16, ct: 4 },
    // shorthand for mat2x2<u32>
    "mat3x2f": { alignment: 8, size: 24, ct: 6 },
    // shorthand for mat3x2<f32>
    "mat3x2i": { alignment: 8, size: 24, ct: 6 },
    // shorthand for mat3x2<i32>
    "mat3x2u": { alignment: 8, size: 24, ct: 6 },
    // shorthand for mat3x2<u32>
    "mat4x2f": { alignment: 8, size: 32, ct: 8 },
    // shorthand for mat4x2<f32>
    "mat4x2i": { alignment: 8, size: 32, ct: 8 },
    // shorthand for mat4x2<i32>
    "mat4x2u": { alignment: 8, size: 32, ct: 8 },
    // shorthand for mat4x2<u32>
    "mat2x3f": { alignment: 16, size: 24, ct: 6 },
    // shorthand for mat2x3<f32>
    "mat2x3i": { alignment: 16, size: 24, ct: 6 },
    // shorthand for mat2x3<i32>
    "mat2x3u": { alignment: 16, size: 24, ct: 6 },
    // shorthand for mat2x3<u32>
    "mat3x3f": { alignment: 16, size: 36, ct: 9 },
    // shorthand for mat3x3<f32>
    "mat3x3i": { alignment: 16, size: 36, ct: 9 },
    // shorthand for mat3x3<i32>
    "mat3x3u": { alignment: 16, size: 36, ct: 9 },
    // shorthand for mat3x3<u32>
    "mat4x3f": { alignment: 16, size: 48, ct: 12 },
    // shorthand for mat4x3<f32>
    "mat4x3i": { alignment: 16, size: 48, ct: 12 },
    // shorthand for mat4x3<i32>
    "mat4x3u": { alignment: 16, size: 48, ct: 12 },
    // shorthand for mat4x3<u32>
    "mat2x4f": { alignment: 16, size: 32, ct: 8 },
    // shorthand for mat2x4<f32>
    "mat2x4i": { alignment: 16, size: 32, ct: 8 },
    // shorthand for mat2x4<i32>
    "mat2x4u": { alignment: 16, size: 32, ct: 8 },
    // shorthand for mat2x4<u32>
    "mat3x4f": { alignment: 16, size: 48, ct: 12 },
    // shorthand for mat3x4<f32>
    "mat3x4i": { alignment: 16, size: 48, ct: 12 },
    // shorthand for mat3x4<i32>
    "mat3x4u": { alignment: 16, size: 48, ct: 12 },
    // shorthand for mat3x4<u32>
    "mat4x4f": { alignment: 16, size: 64, ct: 16 },
    // shorthand for mat4x4<f32>
    "mat4x4i": { alignment: 16, size: 64, ct: 16 },
    // shorthand for mat4x4<i32>
    "mat4x4u": { alignment: 16, size: 64, ct: 16 }
    // shorthand for mat4x4<u32>
  };
  var wgslTypeSizes16 = {
    "i16": { alignment: 2, size: 2 },
    "u16": { alignment: 2, size: 2 },
    "f16": { alignment: 2, size: 2, vertexFormats: { "float16x2": true, "float16x4": true } },
    "vec2<f16>": { alignment: 4, size: 4, vertexFormats: { "float16x2": true } },
    "vec2<i16>": { alignment: 4, size: 4 },
    "vec2<u16>": { alignment: 4, size: 4 },
    "vec3<f16>": { alignment: 8, size: 6 },
    "vec3<i16>": { alignment: 8, size: 6 },
    "vec3<u16>": { alignment: 8, size: 6 },
    "vec4<f16>": { alignment: 8, size: 8, vertexFormats: { "float16x4": true } },
    "vec4<i16>": { alignment: 8, size: 8 },
    "vec4<u16>": { alignment: 8, size: 8 },
    //FYI matrix u and i formats are not supported in wgsl (yet) afaik
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
    "mat4x4<u16>": { alignment: 8, size: 32 },
    "mat2x2h": { alignment: 4, size: 8 },
    // shorthand for mat2x2<f16>
    "mat3x2h": { alignment: 4, size: 12 },
    // shorthand for mat3x2<f16>
    "mat4x2h": { alignment: 4, size: 16 },
    // shorthand for mat4x2<f16>
    "mat2x3h": { alignment: 8, size: 16 },
    // shorthand for mat2x3<f16>
    "mat3x3h": { alignment: 8, size: 24 },
    // shorthand for mat3x3<f16>
    "mat4x3h": { alignment: 8, size: 32 },
    // shorthand for mat4x3<f16>
    "mat2x4h": { alignment: 8, size: 16 },
    // shorthand for mat2x4<f16>
    "mat3x4h": { alignment: 8, size: 24 },
    // shorthand for mat3x4<f16>
    "mat4x4h": { alignment: 8, size: 32 }
    // shorthand for mat4x4<f16>
  };
  var textureFormats = [
    //https://www.w3.org/TR/webgpu/#texture-formats
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
    "astc-12x12-unorm-srgb"
  ];
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
      const shader = this.compute;
      if (shader)
        return this.compute?.run(this.compute.computePass, ...inputs);
    };
    render = (renderPass, ...inputs) => {
      let shader = this.fragment ? this.fragment : this.vertex;
      if (shader)
        return shader.run(renderPass ? renderPass : shader.renderPass ? shader.renderPass : { vertexCount: 1 }, ...inputs);
    };
    canvas;
    context;
    device;
    functions = [];
    //copy these to new ShaderHelpers to share buffers between shaders
    bindGroupLayouts = [];
    bindGroups = [];
    bufferGroups = [];
    constructor(shaders, options) {
      if (shaders) this.init(shaders, options);
    }
    init = (shaders, options = {}) => {
      Object.assign(this, options);
      if (!this.device) throw new Error(`
    No GPUDevice! Please retrieve e.g. via: 
    
    const gpu = navigator.gpu;
    const adapter = await gpu.requestAdapter();
    if(!adapter) throw new Error('No GPU Adapter found!');
    device = await adapter.requestDevice();
    shaderhelper.init(shaders,{device});
`);
      if (!options.device) options.device = this.device;
      if (shaders.fragment && !shaders.vertex)
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
        if (shaders.vertex?.params && shaders.fragment) {
          if (shaders.fragment.params) shaders.vertex.params.push(...shaders.fragment.params);
          shaders.fragment.params = shaders.vertex.params;
        }
      }
      Object.assign(this.prototypes, shaders);
      if (shaders.compute) {
        this.compute = new ShaderContext(Object.assign({}, shaders.compute, options));
        this.compute.helper = this;
        Object.assign(this.compute, options);
      }
      if (shaders.fragment && shaders.vertex) {
        WGSLTranspiler.combineShaderParams(shaders.vertex, shaders.fragment);
      }
      if (shaders.fragment) {
        this.fragment = new ShaderContext(Object.assign({}, shaders.fragment, options));
        this.fragment.helper = this;
      }
      if (shaders.vertex) {
        this.vertex = new ShaderContext(Object.assign({}, shaders.vertex, options));
        this.vertex.helper = this;
      }
      if (this.compute) {
        this.compute.bindGroupLayouts = this.bindGroupLayouts;
        this.compute.bindGroups = this.bindGroups;
        this.compute.bufferGroups = this.bufferGroups;
        const entries = this.compute.createBindGroupEntries(options?.renderPass?.textures);
        this.compute.bindGroupLayoutEntries = entries;
        this.compute.setBindGroupLayout(entries, options.bindGroupNumber);
      }
      if (this.fragment) {
        this.fragment.bufferGroups = this.bufferGroups;
        this.fragment.bindGroups = this.bindGroups;
        this.fragment.bindGroupLayouts = this.bindGroupLayouts;
        let entries = this.fragment.createBindGroupEntries(options?.renderPass?.textures, void 0, GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT);
        this.fragment.bindGroupLayoutEntries = entries;
        this.fragment.bindGroupLayout = this.device.createBindGroupLayout({
          label: "fragmentLayout",
          entries
        });
        this.fragment.setBindGroupLayout(entries, options.bindGroupNumber);
      }
      if (this.compute) {
        this.compute.shaderModule = this.device.createShaderModule({
          code: shaders.compute.code
        });
        if (this.bindGroupLayouts.length > 0) {
          this.compute.pipelineLayout = this.device.createPipelineLayout({
            label: "computeRenderPipelineDescriptor",
            bindGroupLayouts: this.bindGroupLayouts.filter((v) => {
              if (v) return true;
            })
            //this should have the combined compute and vertex/fragment (and accumulated) layouts
          });
        }
        const pipeline = {
          layout: this.compute.pipelineLayout ? this.compute.pipelineLayout : "auto",
          compute: {
            module: this.compute.shaderModule,
            entryPoint: "compute_main"
          }
        };
        if (options?.computePipelineSettings) Object.assign(pipeline, options?.computePipelineSettings);
        this.compute.computePipeline = this.device.createComputePipeline(pipeline);
      }
      if (this.vertex) {
        this.vertex.shaderModule = this.device.createShaderModule({
          code: shaders.vertex.code
        });
      }
      if (this.fragment) {
        this.fragment.shaderModule = this.device.createShaderModule({
          code: shaders.fragment.code
        });
      }
      if (this.vertex && this.fragment) {
        this.fragment.vertex = this.vertex;
        if (this.bindGroupLayouts.length > 0) {
          this.fragment.pipelineLayout = this.device.createPipelineLayout({
            label: "fragmentRenderPipelineDescriptor",
            bindGroupLayouts: this.bindGroupLayouts.filter((v) => {
              if (v) return true;
            })
            //this should have the combined compute and vertex/fragment (and accumulated) layouts
          });
        }
        this.fragment.updateGraphicsPipeline(
          options?.renderPass?.vbos,
          options?.contextSettings,
          options?.renderPipelineDescriptor,
          options?.renderPassDescriptor
        );
      } else if (this.vertex) {
        if (this.bindGroupLayouts.length > 0) {
          this.vertex.pipelineLayout = this.device.createPipelineLayout({
            label: "vertexRenderPipelineDescriptor",
            bindGroupLayouts: this.bindGroupLayouts.filter((v) => {
              if (v) return true;
            })
            //this should have the combined compute and vertex/fragment (and accumulated) layouts
          });
        }
        this.vertex.updateGraphicsPipeline(
          options?.renderPass?.vbos,
          options?.contextSettings,
          options?.renderPipelineDescriptor,
          options?.renderPassDescriptor
        );
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
              this.prototypes[key].vbos,
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
        if (!shaderContext) continue;
        if (shaderContext && shaderType === "fragment" && !shaders.vertex) {
          let vboInputStrings = [];
          let vboStrings = [];
          if (options.vbos) {
            const types = [];
            const keys = [];
            options.vbos.forEach((obj) => {
              keys.push(...Object.keys(obj));
              types.push(...Object.values(obj));
            });
            let loc = 0;
            for (const key of keys) {
              const type = types[loc];
              vboStrings.push(
                `@location(${loc}) ${key}: ${type}${loc === keys.length - 1 ? "" : ","}`
              );
              vboInputStrings.push(
                `@location(${loc}) ${key}In: ${type}${loc === keys.length - 1 ? "" : ","}`
              );
              loc++;
            }
          }
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
        }
        shaderContext.device = this.device;
      }
      return shaders;
    };
    cleanup = () => {
      if (this.device) this.device.destroy();
      if (this.context) this.context?.unconfigure();
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
    //we're just assuming that for the default frag/vertex we may want colors, positions, normals, or uvs. If you define your entire own shader pipeline then this can be ignored
    static combineVertices(vertices, colors, uvs, normals) {
      let length2 = 0;
      if (colors) length2 = colors.length / 4;
      if (vertices?.length / 4 > length2) length2 = vertices.length / 4;
      if (normals?.length / 3 > length2) length2 = normals.length / 3;
      if (uvs?.length / 2 > length2) length2 = uvs.length / 2;
      const vertexCount = length2;
      const interleavedVertices = new Float32Array(vertexCount * 13);
      for (let i = 0; i < vertexCount; i++) {
        const posOffset = i * 4;
        const colOffset = i * 4;
        const norOffset = i * 3;
        const uvOffset = i * 2;
        const interleavedOffset = i * 13;
        interleavedVertices[interleavedOffset] = vertices ? vertices[posOffset] || 0 : 0;
        interleavedVertices[interleavedOffset + 1] = vertices ? vertices[posOffset + 1] || 0 : 0;
        interleavedVertices[interleavedOffset + 2] = vertices ? vertices[posOffset + 2] || 0 : 0;
        interleavedVertices[interleavedOffset + 3] = vertices ? vertices[posOffset + 3] || 0 : 0;
        interleavedVertices[interleavedOffset + 4] = colors ? colors[colOffset] || 0 : 0;
        interleavedVertices[interleavedOffset + 5] = colors ? colors[colOffset + 1] || 0 : 0;
        interleavedVertices[interleavedOffset + 6] = colors ? colors[colOffset + 2] || 0 : 0;
        interleavedVertices[interleavedOffset + 7] = colors ? colors[colOffset + 3] || 0 : 0;
        interleavedVertices[interleavedOffset + 8] = uvs ? uvs[uvOffset] || 0 : 0;
        interleavedVertices[interleavedOffset + 9] = uvs ? uvs[uvOffset + 1] || 0 : 0;
        interleavedVertices[interleavedOffset + 10] = normals ? normals[norOffset] || 0 : 0;
        interleavedVertices[interleavedOffset + 11] = normals ? normals[norOffset + 1] || 0 : 0;
        interleavedVertices[interleavedOffset + 12] = normals ? normals[norOffset + 2] || 0 : 0;
      }
      return interleavedVertices;
    }
    static splitVertices(interleavedVertices) {
      const vertexCount = interleavedVertices.length / 13;
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
  };
  var ShaderContext = class {
    canvas;
    context;
    device;
    helper;
    vertex;
    //The vertex shader context if this is a fragment shader
    code;
    header;
    ast;
    params;
    funcStr;
    defaultUniforms;
    type;
    workGroupSize;
    returnedVars;
    functions;
    shaderModule;
    pipelineLayout;
    computePass;
    renderPass;
    computePipeline;
    graphicsPipeline;
    depthTexture;
    renderPassDescriptor;
    indexBuffer;
    indexFormat;
    contextSettings;
    altBindings;
    builtInUniforms;
    bufferGroup;
    bufferGroups = [];
    bindings;
    bindGroups = [];
    bindGroupLayouts = [];
    bindGroupNumber;
    bindGroupLayout;
    bindGroupLayoutEntries;
    vertexBufferOptions;
    constructor(props) {
      Object.assign(this, props);
      const bIUCopy = {};
      for (const key in WGSLTranspiler.builtInUniforms) {
        bIUCopy[key] = Object.assign({}, WGSLTranspiler.builtInUniforms[key]);
      }
      this.builtInUniforms = bIUCopy;
    }
    // Extract all returned variables from the function string
    createBindGroupEntries = (textures, bindGroupNumber = this.bindGroupNumber, visibility = GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT) => {
      let bufferIncr = 0;
      let uniformBufferIdx;
      let bufferGroup = this.bufferGroups[bindGroupNumber];
      if (!bufferGroup) {
        bufferGroup = this.makeBufferGroup(bindGroupNumber);
      }
      if (textures) for (const key in textures) {
        let isStorage = bufferGroup.params.find((node, i) => {
          if (node.name === key && node.isStorageTexture) return true;
        });
        if (isStorage) textures[key].isStorage = true;
        this.updateTexture(textures[key], key, bindGroupNumber);
      }
      let texKeys;
      let texKeyRot = 0;
      let baseMipLevel = 0;
      if (bufferGroup.textures) texKeys = Object.keys(bufferGroup.textures);
      let assignedEntries = {};
      const entries = bufferGroup.params ? bufferGroup.params.map((node, i) => {
        if (node.group !== bindGroupNumber) return void 0;
        assignedEntries[node.name] = true;
        let isReturned = bufferGroup.returnedVars === void 0 || bufferGroup.returnedVars?.includes(node.name);
        if (node.isUniform) {
          if (typeof uniformBufferIdx === "undefined") {
            uniformBufferIdx = i;
            bufferIncr++;
            const buffer = {
              binding: uniformBufferIdx,
              visibility,
              buffer: {
                type: "uniform"
              }
            };
            if (this.bindings?.[node.name]) Object.assign(buffer, this.bindings[node.name]);
            return buffer;
          } else return void 0;
        } else if (node.isTexture || node.isStorageTexture) {
          const buffer = {
            binding: node.binding,
            visibility
          };
          if (node.isDepthTexture) buffer.texture = { sampleType: "depth" };
          else if (bufferGroup.textures?.[node.name]) {
            buffer.texture = {
              sampleType: "float",
              viewDimension: node.name.includes("3d") ? "3d" : node.name.includes("1d") ? "1d" : node.name.includes("2darr") ? "2d-array" : "2d"
            };
            let viewSettings = void 0;
            if (bufferGroup.textures[node.name]) {
              if (bufferGroup.textures[node.name].mipLevelCount) {
                if (!viewSettings) viewSettings = {};
                viewSettings.baseMipLevel = baseMipLevel;
                viewSettings.mipLevelCount = bufferGroup.textures[node.name].mipLevelCount;
                baseMipLevel++;
              }
            }
            buffer.resource = bufferGroup.textures?.[node.name] ? bufferGroup.textures[node.name].createView(viewSettings) : {};
          } else if (node.isStorageTexture && !node.isSharedStorageTexture) {
            buffer.storageTexture = {
              //placeholder stuff but anyway you can provide your own bindings as the inferencing is a stretch after a point
              access: "write-only",
              //read-write only in chrome beta, todo: replace this when avaiable in production
              format: bufferGroup.textures[node.name]?.format ? bufferGroup.textures[node.name].format : "rgbaunorm",
              viewDimension: node.name.includes("3d") ? "3d" : node.name.includes("1d") ? "1d" : node.name.includes("2darr") ? "2d-array" : "2d"
            };
          } else {
            buffer.texture = { sampleType: "unfilterable-float" };
          }
          if (this.bindings?.[node.name]) Object.assign(buffer, this.bindings[node.name]);
          bufferIncr++;
          return buffer;
        } else if (node.isSampler) {
          if (!bufferGroup.samplers?.[node.name]) {
            const sampler = this.device.createSampler(
              texKeys && bufferGroup.textures[texKeys[texKeyRot]]?.samplerSettings?.[node.name] ? bufferGroup.textures[texKeys[texKeyRot]]?.samplerSettings[node.name] : {
                magFilter: "linear",
                minFilter: "linear",
                mipmapFilter: "linear"
                // addressModeU: "repeat",
                // addressModeV: "repeat"
              }
            );
            bufferGroup.samplers[node.name] = sampler;
          }
          const buffer = {
            binding: node.binding,
            visibility,
            sampler: {},
            resource: bufferGroup.samplers[node.name] || {}
          };
          texKeyRot++;
          if (texKeyRot >= texKeys?.length) texKeyRot = 0;
          bufferIncr++;
          if (this.bindings?.[node.name]) Object.assign(buffer, this.bindings[node.name]);
          return buffer;
        } else {
          const buffer = {
            binding: node.binding,
            visibility,
            buffer: {
              type: isReturned || node.isModified ? "storage" : "read-only-storage"
            }
          };
          bufferIncr++;
          if (this.bindings?.[node.name]) Object.assign(buffer, this.bindings[node.name]);
          return buffer;
        }
      }).filter((v, i) => {
        if (v) return true;
      }) : [];
      if (this.bindings) {
        for (const key in this.bindings) {
          if (!assignedEntries[key])
            entries.push(this.bindings[key]);
        }
      }
      if (bufferGroup.defaultUniforms) {
        entries.push({
          binding: bufferIncr,
          visibility,
          buffer: {
            type: "uniform"
          }
        });
      }
      this.bindGroupLayoutEntries = entries;
      return entries;
    };
    setBindGroupLayout = (entries = [], bindGroupNumber = this.bindGroupNumber) => {
      if (entries.length > 0) {
        this.bindGroupLayout = this.device.createBindGroupLayout({
          entries
        });
        this.bindGroupLayouts[bindGroupNumber] = this.bindGroupLayout;
        this.pipelineLayout = this.device.createPipelineLayout({
          bindGroupLayouts: this.bindGroupLayouts.filter((v) => {
            if (v) return true;
          })
          //this should have the combined compute and vertex/fragment (and accumulated) layouts
        });
      }
      return this.bindGroupLayout;
    };
    updateVBO = (vertices, index = 0, bufferOffset = 0, dataOffset = 0, bindGroupNumber = this.bindGroupNumber, indexBuffer, indexFormat) => {
      let bufferGroup = this.bufferGroups[bindGroupNumber];
      if (!bufferGroup) {
        bufferGroup = this.makeBufferGroup(bindGroupNumber);
      }
      if (vertices) {
        if (vertices instanceof GPUBuffer) {
          if (indexBuffer) {
            if (!bufferGroup.indexCount) bufferGroup.indexCount = 1;
            bufferGroup.indexBuffer = vertices;
          } else {
            if (!bufferGroup.vertexBuffers) bufferGroup.vertexBuffers = [];
            bufferGroup.vertexBuffers[index] = vertices;
          }
        } else {
          if (Array.isArray(vertices)) {
            vertices = new Float32Array(
              ShaderHelper.flattenArray(vertices)
            );
          }
          if (!isTypedArray(vertices)) return;
          if (indexBuffer || bufferGroup.vertexBuffers?.[index]?.size !== vertices.byteLength) {
            if (indexBuffer) {
              if (!bufferGroup.indexCount) bufferGroup.indexCount = vertices.length;
            } else {
              if (!bufferGroup.vertexBuffers) bufferGroup.vertexBuffers = [];
              if (!bufferGroup.vertexCount) bufferGroup.vertexCount = vertices.length ? vertices.length / (this.vertexBufferOptions[index]?.__COUNT || 4) : 1;
            }
            if (indexBuffer) {
              const vertexBuffer = this.device.createBuffer({
                label: "indexBuffer",
                size: vertices.byteLength,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC | GPUBufferUsage.INDEX
                //assume read/write
              });
              bufferGroup.indexBuffer = vertexBuffer;
            } else {
              const vertexBuffer = this.device.createBuffer({
                label: "vbo" + index,
                size: vertices.byteLength,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
                //assume read/write
              });
              bufferGroup.vertexBuffers[index] = vertexBuffer;
            }
          }
          if (indexBuffer) {
            this.device.queue.writeBuffer(
              bufferGroup.indexBuffer,
              bufferOffset,
              vertices,
              dataOffset,
              vertices.length
            );
          } else {
            this.device.queue.writeBuffer(
              bufferGroup.vertexBuffers[index],
              bufferOffset,
              vertices,
              dataOffset,
              vertices.length
            );
          }
        }
      }
    };
    updateTexture = (data, name, bindGroupNumber = this.bindGroupNumber) => {
      if (!data) return;
      if (!data.width && data.source) data.width = data.source.width;
      if (!data.height && data.source) data.height = data.source.height;
      let bufferGroup = this.bufferGroups[bindGroupNumber];
      if (!bufferGroup) {
        bufferGroup = this.makeBufferGroup(bindGroupNumber);
      }
      const defaultDescriptor = {
        label: data.label ? data.label : `texture_g${bindGroupNumber}_${name}`,
        format: data.format ? data.format : "rgba8unorm",
        size: [data.width, data.height, 1],
        usage: data.usage ? data.usage : data.source ? GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | (data.isStorage ? GPUTextureUsage.STORAGE_BINDING : GPUTextureUsage.RENDER_ATTACHMENT) : data.isStorage ? GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.STORAGE_BINDING : GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
        //GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC | 
      };
      const texture = this.device.createTexture(
        data.texture ? Object.assign(defaultDescriptor, data.texture) : defaultDescriptor
      );
      if (bufferGroup.textures[name]) bufferGroup.textures[name].destroy();
      bufferGroup.textures[name] = texture;
      let texInfo = {};
      if (data.source) texInfo.source = data.source;
      else texInfo.source = data;
      if (data.layout) Object.assign(texInfo, data.layout);
      if (data.buffer)
        this.device.queue.writeTexture(
          texInfo,
          data.buffer,
          {
            bytesPerRow: data.bytesPerRow ? data.bytesPerRow : data.width * 4
          },
          {
            width: data.width,
            height: data.height
          }
        );
      else if (texInfo.source)
        this.device.queue.copyExternalImageToTexture(
          texInfo,
          //e.g. an ImageBitmap
          { texture },
          [data.width, data.height]
        );
      return true;
    };
    setUBOposition = (dataView, inputTypes, typeInfo, offset, input, inpIdx) => {
      offset = Math.ceil(offset / typeInfo.alignment) * typeInfo.alignment;
      if (input !== void 0) {
        if (inputTypes[inpIdx].type.startsWith("vec")) {
          const vecSize = typeInfo.size / 4;
          for (let j = 0; j < vecSize; j++) {
            if (inputTypes[inpIdx].type.includes("f")) dataView.setFloat32(offset + j * 4, input[j], true);
            else dataView.setInt32(offset + j * 4, input[j], true);
          }
        } else if (inputTypes[inpIdx].type.startsWith("mat")) {
          const flatMatrix = typeof input[0] === "object" ? ShaderHelper.flattenArray(input) : input;
          for (let j = 0; j < flatMatrix.length; j++) {
            dataView.setFloat32(offset + j * 4, flatMatrix[j], true);
          }
        } else {
          switch (inputTypes[inpIdx].type) {
            case "f32":
            case "f":
              dataView.setFloat32(offset, input, true);
              break;
            case "i32":
            case "i":
              dataView.setInt32(offset, input, true);
              break;
            case "u32":
            case "u":
              dataView.setUint32(offset, input, true);
              break;
            case "f16":
            case "h":
              dataView.setUint16(offset, floatToHalf(input), true);
            case "i16":
              dataView.setInt16(offset, input, true);
              break;
            case "u16":
              dataView.setUint16(offset, input, true);
              break;
            case "i8":
              dataView.setInt8(offset, input);
              break;
            case "u8":
              dataView.setUint8(offset, input);
              break;
          }
        }
      }
      offset += typeInfo.size;
      return offset;
    };
    updateUBO = (inputs, inputTypes, bindGroupNumber = this.bindGroupNumber) => {
      if (!inputs) return;
      let bufferGroup = this.bufferGroups[bindGroupNumber];
      if (!bufferGroup) {
        bufferGroup = this.makeBufferGroup(bindGroupNumber);
      }
      if (bufferGroup.uniformBuffer) {
        const dataView = bufferGroup.uniformBuffer.mapState === "mapped" ? new DataView(bufferGroup.uniformBuffer.getMappedRange()) : new DataView(new Float32Array(bufferGroup.uniformBuffer.size / 4).buffer);
        let offset = 0;
        let inpIdx = 0;
        bufferGroup.params.forEach((node, i) => {
          if (node.isUniform) {
            let input;
            if (Array.isArray(inputs)) input = inputs[inpIdx];
            else input = inputs?.[node.name];
            if (typeof input === "undefined" && typeof bufferGroup.uniformBufferInputs?.[inpIdx] !== "undefined")
              input = bufferGroup.uniformBufferInputs[inpIdx];
            const typeInfo = WGSLTypeSizes[inputTypes[inpIdx].type];
            if (!bufferGroup.uniformBufferInputs) {
              bufferGroup.uniformBufferInputs = {};
            }
            bufferGroup.uniformBufferInputs[inpIdx] = input;
            offset = this.setUBOposition(dataView, inputTypes, typeInfo, offset, input, inpIdx);
          }
          if (node.isInput) inpIdx++;
        });
        if (bufferGroup.uniformBuffer.mapState === "mapped") bufferGroup.uniformBuffer.unmap();
      }
      if (bufferGroup.defaultUniforms) {
        const dataView = bufferGroup.defaultUniformBuffer.mapState === "mapped" ? new DataView(bufferGroup.defaultUniformBuffer.getMappedRange()) : new DataView(new Float32Array(bufferGroup.defaultUniformBuffer.size).buffer);
        let offset = 0;
        bufferGroup.defaultUniforms.forEach((u, i) => {
          let value = this.builtInUniforms[u]?.callback(this);
          const typeInfo = WGSLTypeSizes[this.builtInUniforms[bufferGroup.defaultUniforms[i]].type];
          offset = this.setUBOposition(dataView, inputTypes, typeInfo, offset, value, i);
        });
        if (bufferGroup.defaultUniformBuffer.mapState === "mapped") bufferGroup.defaultUniformBuffer.unmap();
      }
    };
    createRenderPipelineDescriptor = (vertexBufferOptions = [{
      color: "vec4<f32>"
    }], swapChainFormat = navigator.gpu.getPreferredCanvasFormat(), renderPipelineDescriptor = {}) => {
      const vertexBuffers = [];
      let loc = 0;
      this.vertexBufferOptions = vertexBufferOptions;
      vertexBufferOptions.forEach((opt, i) => {
        let arrayStride = 0;
        const attributes = [];
        let ct = 0;
        for (const key in opt) {
          if (key === "stepMode" || key === "__COUNT") continue;
          const typeInfo = WGSLTypeSizes[opt[key]];
          const format = Object.keys(typeInfo.vertexFormats).find((f) => {
            if (f.startsWith("float32")) return true;
          }) || Object.values(typeInfo.vertexFormats)[0];
          ct += typeInfo.ct;
          attributes.push({
            format,
            offset: arrayStride,
            shaderLocation: loc
          });
          arrayStride += typeInfo.size;
          loc++;
        }
        vertexBufferOptions[i].__COUNT = ct;
        const vtxState = {
          arrayStride,
          attributes
        };
        if (opt.stepMode)
          vtxState.stepMode = opt.stepMode;
        vertexBuffers.push(vtxState);
      });
      let desc = {
        //https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/createRenderPipeline
        label: "renderPipeline",
        layout: this.pipelineLayout ? this.pipelineLayout : "auto",
        vertex: this.vertex ? {
          module: this.vertex.shaderModule,
          entryPoint: "vtx_main",
          buffers: vertexBuffers
        } : {
          module: this.shaderModule,
          entryPoint: "vtx_main",
          targets: [{
            format: swapChainFormat
          }]
        },
        fragment: this.vertex ? {
          module: this.shaderModule,
          entryPoint: "frag_main",
          targets: [{
            format: swapChainFormat
          }]
        } : void 0,
        depthStencil: {
          format: "depth24plus",
          depthWriteEnabled: true,
          depthCompare: "less"
        }
      };
      if (!this.vertex) delete renderPipelineDescriptor.fragment;
      renderPipelineDescriptor = Object.assign(desc, renderPipelineDescriptor);
      return renderPipelineDescriptor;
    };
    createRenderPassDescriptor = () => {
      const depthTexture = this.device.createTexture({
        //allows 3D rendering
        size: [this.canvas.width, this.canvas.height],
        format: "depth24plus",
        usage: GPUTextureUsage.RENDER_ATTACHMENT
      });
      if (this.depthTexture) this.depthTexture.destroy();
      this.depthTexture = depthTexture;
      return {
        //some assumptions. todo: unassume
        colorAttachments: [{
          view: void 0,
          //view,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear",
          storeOp: "store"
          //discard
        }],
        depthStencilAttachment: {
          view: void 0,
          depthLoadOp: "clear",
          depthClearValue: 1,
          depthStoreOp: "store"
          //discard
          // stencilLoadOp: "clear",
          // stencilClearValue: 0,
          // stencilStoreOp: "store"
        }
      };
    };
    updateGraphicsPipeline = (vertexBufferOptions = [{
      color: "vec4<f32>"
    }], contextSettings, renderPipelineDescriptor, renderPassDescriptor) => {
      const swapChainFormat = navigator.gpu.getPreferredCanvasFormat();
      this.context?.configure(contextSettings ? contextSettings : {
        device: this.device,
        format: swapChainFormat,
        //usage: GPUTextureUsage.RENDER_ATTACHMENT,
        alphaMode: "premultiplied"
      });
      renderPipelineDescriptor = this.createRenderPipelineDescriptor(vertexBufferOptions, swapChainFormat, renderPipelineDescriptor);
      if (!renderPassDescriptor)
        renderPassDescriptor = this.createRenderPassDescriptor();
      this.renderPassDescriptor = renderPassDescriptor;
      this.graphicsPipeline = this.device.createRenderPipeline(renderPipelineDescriptor);
    };
    makeBufferGroup = (bindGroupNumber = this.bindGroupNumber) => {
      const bufferGroup = {};
      bufferGroup.params = this.params;
      bufferGroup.returnedVars = this.returnedVars;
      bufferGroup.defaultUniforms = this.defaultUniforms;
      bufferGroup.inputBuffers = [];
      bufferGroup.outputBuffers = [];
      bufferGroup.textures = {};
      bufferGroup.samplers = {};
      bufferGroup.uniformBuffer = void 0;
      bufferGroup.bindGroupLayoutEntries = this.bindGroupLayoutEntries;
      this.bufferGroups[bindGroupNumber] = bufferGroup;
      if (!this.bufferGroup) this.bufferGroup = bufferGroup;
      return bufferGroup;
    };
    firstRun = true;
    buffer = ({
      vbos,
      //[{vertices:[]}]
      textures,
      //{tex0:{data:Uint8Array([]), width:800, height:600, format:'rgba8unorm' (default), bytesPerRow: width*4 (default rgba) }}, //all required
      indexBuffer,
      indexFormat,
      skipOutputDef,
      bindGroupNumber,
      outputVBOs,
      //we can read out the VBO e.g. to receive pixel data
      outputTextures,
      newBindings
    } = {}, ...inputs) => {
      if (!bindGroupNumber) bindGroupNumber = this.bindGroupNumber;
      let bufferGroup = this.bufferGroups[bindGroupNumber];
      if (!bufferGroup) {
        bufferGroup = this.makeBufferGroup(bindGroupNumber);
      }
      if (vbos) {
        vbos.forEach((vertices, i) => {
          this.updateVBO(vertices, i, void 0, void 0, bindGroupNumber);
        });
      }
      if (indexBuffer) {
        this.updateVBO(indexBuffer, 0, void 0, void 0, bindGroupNumber, true, indexFormat);
      }
      if (!bufferGroup.inputTypes && bufferGroup.params)
        bufferGroup.inputTypes = bufferGroup.params.map((p) => {
          let type = p.type;
          if (type.startsWith("array")) {
            type = type.substring(6, type.length - 1);
          }
          return WGSLTypeSizes[type];
        });
      const inputBuffers = bufferGroup.inputBuffers;
      let uniformBuffer = bufferGroup.uniformBuffer;
      const outputBuffers = bufferGroup.outputBuffers;
      const params = bufferGroup.params;
      const inputTypes = bufferGroup.inputTypes;
      let newBindGroupBuffer = newBindings;
      if (inputBuffers?.length > 0) {
        inputs.forEach((inp, index) => {
          if (inp && inp?.length) {
            if (inputBuffers.size !== inp.length * inputTypes[index].byteSize) {
              newBindGroupBuffer = true;
            }
          }
        });
      } else if (!bufferGroup.bindGroup) newBindGroupBuffer = true;
      if (textures) {
        const entries = this.createBindGroupEntries(
          textures,
          bindGroupNumber,
          this.vertex || !this.vertex && this.graphicsPipeline ? GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT : void 0
        );
        this.bindGroupLayoutEntries = entries;
        bufferGroup.bindGroupLayoutEntries = entries;
        this.setBindGroupLayout(entries, bindGroupNumber);
        newBindGroupBuffer = true;
      }
      if (newBindGroupBuffer && bindGroupNumber === this.bindGroupNumber) {
        bufferGroup.bindGroupLayoutEntries = this.bindGroupLayoutEntries;
      }
      let uBufferPushed = false;
      let inpBuf_i = 0;
      let inpIdx = 0;
      let hasUniformBuffer = 0;
      let uBufferSet = false;
      let bindGroupAlts = [];
      let uniformValues = [];
      if (params) for (let i = 0; i < params.length; i++) {
        const node = params[i];
        if (typeof inputs[inpBuf_i] !== "undefined" && this.altBindings?.[node.name] && parseInt(this.altBindings?.[node.name].group) !== bindGroupNumber) {
          if (!bindGroupAlts[this.altBindings?.[node.name].group]) {
            bindGroupAlts[this.altBindings?.[node.name].group] = [];
          }
          bindGroupAlts[this.altBindings?.[node.name].group][this.altBindings?.[node.name].group] = inputs[i];
        } else {
          if (node.isUniform) {
            if (inputs[inpIdx] !== void 0)
              uniformValues[inpIdx] = inputs[inpIdx];
            if (!bufferGroup.uniformBuffer || !uBufferSet && inputs[inpBuf_i] !== void 0) {
              if (!bufferGroup.totalUniformBufferSize) {
                let totalUniformBufferSize = 0;
                params.forEach((node2, j) => {
                  if (node2.isInput && node2.isUniform) {
                    if (inputTypes[j]) {
                      let size;
                      if (inputs[inpBuf_i]?.byteLength) size = inputs[inpBuf_i].byteLength;
                      else if (inputs[inpBuf_i]?.length) size = 4 * inputs[inpBuf_i].length;
                      else size = inputTypes[j].size;
                      totalUniformBufferSize += inputTypes[j].size;
                      if (totalUniformBufferSize % 8 !== 0)
                        totalUniformBufferSize += WGSLTypeSizes[inputTypes[j].type].alignment;
                    }
                  }
                });
                if (totalUniformBufferSize < 8) totalUniformBufferSize += 8 - totalUniformBufferSize;
                else totalUniformBufferSize -= totalUniformBufferSize % 16;
                bufferGroup.totalUniformBufferSize = totalUniformBufferSize;
              }
              uniformBuffer = this.device.createBuffer({
                label: "uniform",
                size: bufferGroup.totalUniformBufferSize ? bufferGroup.totalUniformBufferSize : 8,
                // This should be the sum of byte sizes of all uniforms
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_SRC,
                mappedAtCreation: true
              });
              inputBuffers[inpBuf_i] = uniformBuffer;
              bufferGroup.uniformBuffer = uniformBuffer;
              uBufferSet = true;
            }
            if (!hasUniformBuffer) {
              hasUniformBuffer = 1;
              inpBuf_i++;
            }
            inpIdx++;
          } else {
            if (typeof inputs[inpBuf_i] !== "undefined" || typeof inputs[inpBuf_i] !== "undefined" && !inputBuffers[inpBuf_i]) {
              if (!inputs?.[inpBuf_i]?.byteLength && Array.isArray(inputs[inpBuf_i]?.[0])) inputs[inpBuf_i] = ShaderHelper.flattenArray(inputs[inpBuf_i]);
              if (inputBuffers[inpBuf_i] && inputs[inpBuf_i].length === inputBuffers[inpBuf_i].size / 4) {
                let buf = new Float32Array(inputs[inpBuf_i]);
                this.device.queue.writeBuffer(
                  inputBuffers[inpBuf_i],
                  0,
                  buf,
                  buf.byteOffset,
                  buf.length || 8
                );
                inputBuffers[inpBuf_i].unmap();
              } else {
                if (inputs[inpBuf_i] instanceof GPUBuffer) {
                  inputBuffers[inpBuf_i] = inputs[inpBuf_i];
                } else {
                  inputBuffers[inpBuf_i] = this.device.createBuffer({
                    label: `arrayBuffer${inpBuf_i}`,
                    size: inputs[inpBuf_i] ? inputs[inpBuf_i].byteLength ? inputs[inpBuf_i].byteLength : inputs[inpBuf_i]?.length ? inputs[inpBuf_i].length * 4 : 8 : 8,
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX,
                    mappedAtCreation: true
                  });
                  new Float32Array(inputBuffers[inpBuf_i].getMappedRange()).set(inputs[inpBuf_i]);
                  inputBuffers[inpBuf_i].unmap();
                }
              }
            }
            inpBuf_i++;
            inpIdx++;
          }
          if (!skipOutputDef && node.isReturned && (!node.isUniform || node.isUniform && !uBufferPushed)) {
            if (!node.isUniform) {
              outputBuffers[inpBuf_i - 1] = inputBuffers[inpBuf_i - 1];
            } else if (!uBufferPushed) {
              uBufferPushed = true;
              outputBuffers[inpBuf_i - 1] = uniformBuffer;
            }
          }
        }
      }
      ;
      if (bufferGroup.vertexBuffers && outputVBOs) {
        outputBuffers.push(...bufferGroup.vertexBuffers);
      }
      if (bufferGroup.textures && outputTextures) {
        for (const key in bufferGroup.textures) {
          outputBuffers.push(bufferGroup.textures[key]);
        }
      }
      bindGroupAlts.forEach((inp, i) => {
        if (inp && i !== bindGroupNumber)
          this.buffer({ bindGroupNumber: i }, ...inp);
      });
      if (bufferGroup.defaultUniforms) {
        if (!bufferGroup.totalDefaultUniformBufferSize) {
          let totalUniformBufferSize = 0;
          bufferGroup.defaultUniforms.forEach((u) => {
            totalUniformBufferSize += WGSLTypeSizes[this.builtInUniforms[u].type].size;
          });
          if (totalUniformBufferSize < 8) totalUniformBufferSize += 8 - totalUniformBufferSize;
          else totalUniformBufferSize -= totalUniformBufferSize % 16;
          bufferGroup.totalDefaultUniformBufferSize = totalUniformBufferSize;
        }
        bufferGroup.defaultUniformBuffer = this.device.createBuffer({
          label: "defaultUniforms",
          size: bufferGroup.totalDefaultUniformBufferSize,
          // This should be the sum of byte sizes of all uniforms
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_SRC,
          mappedAtCreation: true
        });
        if (!bufferGroup.defaultUniformBinding) {
          bufferGroup.defaultUniformBinding = inputBuffers.length;
        }
      }
      if (uniformValues.length > 0) this.updateUBO(uniformValues, inputTypes, bindGroupNumber);
      if (this.bindGroupLayouts[bindGroupNumber] && newBindGroupBuffer) {
        let bindGroupEntries = [];
        if (bufferGroup.bindGroupLayoutEntries) {
          bindGroupEntries.push(...bufferGroup.bindGroupLayoutEntries);
          let inpBufi = 0;
          bufferGroup.bindGroupLayoutEntries.forEach((entry, i) => {
            let type = entry.buffer?.type;
            if (type) {
              if (type.includes("storage") && inputBuffers[inpBufi] && inputBuffers[inpBufi].label !== "uniform") {
                entry.resource = { buffer: inputBuffers[inpBufi] };
                inpBufi++;
              } else if (type.includes("uniform") && bufferGroup.uniformBuffer) {
                entry.resource = { buffer: bufferGroup.uniformBuffer };
                inpBufi++;
              }
            }
          });
          if (bufferGroup.defaultUniformBuffer) bindGroupEntries[bindGroupEntries.length - 1].resource = {
            buffer: bufferGroup.defaultUniformBuffer
          };
        } else if (inputBuffers) {
          bindGroupEntries.push(...inputBuffers.map((buffer, index) => ({
            binding: index,
            resource: { buffer }
          })));
          if (bufferGroup.defaultUniformBuffer)
            bindGroupEntries.push({
              binding: bufferGroup.defaultUniformBinding,
              resource: { buffer: bufferGroup.defaultUniformBuffer }
            });
        }
        const bindGroup = this.device.createBindGroup({
          label: `bindGroup${bindGroupNumber}`,
          layout: this.bindGroupLayouts[bindGroupNumber],
          entries: bindGroupEntries
        });
        bufferGroup.bindGroup = bindGroup;
        this.bindGroups[bindGroupNumber] = bindGroup;
      }
      return newBindGroupBuffer;
    };
    getOutputData = (commandEncoder, outputBuffers) => {
      if (!outputBuffers) outputBuffers = this.bufferGroups[this.bindGroupNumber].outputBuffers;
      const stagingBuffers = outputBuffers.map((outputBuffer) => {
        return this.device.createBuffer({
          size: outputBuffer.size,
          usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
        });
      });
      outputBuffers.forEach((outputBuffer, index) => {
        if (outputBuffer.width) {
          commandEncoder.copyTextureToBuffer(
            //easier to copy the texture to an array and reuse it that way
            outputBuffer,
            stagingBuffers[index],
            [outputBuffer.width, outputBuffer.height, outputBuffer.depthOrArrayLayers]
          );
        } else commandEncoder.copyBufferToBuffer(
          outputBuffer,
          0,
          stagingBuffers[index],
          0,
          outputBuffer.size
        );
      });
      this.device.queue.submit([commandEncoder.finish()]);
      const promises = stagingBuffers.map((buffer, i) => {
        return new Promise((resolve) => {
          buffer.mapAsync(GPUMapMode.READ).then(() => {
            const mappedRange = buffer.getMappedRange();
            const rawResults = outputBuffers[i].format?.includes("8") ? new Uint8Array(mappedRange) : new Float32Array(mappedRange);
            const copiedResults = outputBuffers[i].format?.includes("8") ? new Uint8Array(rawResults.length) : new Float32Array(rawResults.length);
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
      outputVBOs,
      textures,
      //({data:Uint8Array([]), width:800, height:600, format:'rgba8unorm' (default), bytesPerRow: width*4 (default rgba) })[], //all required
      outputTextures,
      bufferOnly,
      skipOutputDef,
      bindGroupNumber,
      viewport,
      scissorRect,
      blendConstant,
      indexBuffer,
      indexFormat,
      //uint16 or uint32
      firstIndex,
      useRenderBundle,
      workgroupsX,
      workgroupsY,
      workgroupsZ,
      newBindings
    } = {}, ...inputs) => {
      if (!bindGroupNumber) bindGroupNumber = this.bindGroupNumber;
      const newInputBuffer = this.buffer(
        {
          vbos,
          //[{vertices:[]}]
          textures,
          //[{data:Uint8Array([]), width:800, height:600, format:'rgba8unorm' (default), bytesPerRow: width*4 (default rgba) }], //all required
          indexBuffer,
          indexFormat,
          skipOutputDef,
          bindGroupNumber,
          outputVBOs,
          outputTextures,
          newBindings
        },
        ...inputs
      );
      if (!bufferOnly) {
        const bufferGroup = this.bufferGroups[bindGroupNumber];
        if (!bufferGroup) this.makeBufferGroup(bindGroupNumber);
        const commandEncoder = this.device.createCommandEncoder();
        if (this.computePipeline) {
          const computePass = commandEncoder.beginComputePass();
          computePass.setPipeline(this.computePipeline);
          const withBindGroup = (group, i) => {
            computePass.setBindGroup(i, group);
          };
          this.bindGroups.forEach(withBindGroup);
          let wX = workgroupsX ? workgroupsX : bufferGroup.inputBuffers?.[0] ? bufferGroup.inputBuffers[0].size / 4 / this.workGroupSize : 1;
          computePass.dispatchWorkgroups(wX, workgroupsY, workgroupsZ);
          computePass.end();
        }
        if (this.graphicsPipeline) {
          let renderPass;
          if (useRenderBundle && (newInputBuffer || !bufferGroup.renderBundle)) {
            if (!this.renderPassDescriptor.colorAttachments[0].view) {
              const curTex = this.context.getCurrentTexture();
              const view = curTex.createView();
              this.renderPassDescriptor.colorAttachments[0].view = view;
            }
            if (!this.renderPassDescriptor.depthStencilAttachment.view) {
              const view = this.depthTexture.createView();
              this.renderPassDescriptor.depthStencilAttachment.view = view;
            }
            renderPass = this.device.createRenderBundleEncoder({
              colorFormats: [navigator.gpu.getPreferredCanvasFormat()]
              //depthStencilFormat: "depth24plus" //etc...
            });
            bufferGroup.firstPass = true;
          } else {
            const curTex = this.context.getCurrentTexture();
            const view = curTex.createView();
            this.renderPassDescriptor.colorAttachments[0].view = view;
            const depthView = this.depthTexture.createView();
            this.renderPassDescriptor.depthStencilAttachment.view = depthView;
            renderPass = commandEncoder.beginRenderPass(this.renderPassDescriptor);
          }
          if (vertexCount) bufferGroup.vertexCount = vertexCount;
          else if (!bufferGroup.vertexCount) bufferGroup.vertexCount = 1;
          if (!useRenderBundle || !bufferGroup.renderBundle) {
            renderPass.setPipeline(this.graphicsPipeline);
            const withBindGroup = (group, i) => {
              renderPass.setBindGroup(i, group);
            };
            this.bindGroups.forEach(withBindGroup);
            if (!bufferGroup.vertexBuffers?.length)
              this.updateVBO(new Float32Array(bufferGroup.vertexCount * 4), 0);
            if (bufferGroup.vertexBuffers)
              bufferGroup.vertexBuffers.forEach((vbo, i) => {
                renderPass.setVertexBuffer(i, vbo);
              });
            if (!useRenderBundle) {
              if (viewport) {
                renderPass.setViewport(
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
            }
            if (bufferGroup.indexBuffer) {
              if (!bufferGroup.indexFormat) bufferGroup.indexFormat = indexFormat ? indexFormat : "uint32";
              renderPass.setIndexBuffer(bufferGroup.indexBuffer, bufferGroup.indexFormat);
              renderPass.drawIndexed(
                bufferGroup.indexCount,
                instanceCount,
                firstIndex,
                0,
                firstInstance
              );
            } else {
              renderPass.draw(
                bufferGroup.vertexCount,
                instanceCount,
                firstVertex,
                firstInstance
              );
            }
            if (useRenderBundle && bufferGroup.firstPass) {
              bufferGroup.renderBundle = renderPass.finish();
              bufferGroup.firstPass = false;
            }
          } else {
            renderPass.executeBundles([bufferGroup.renderBundle]);
          }
          renderPass.end();
        }
        if (!skipOutputDef && bufferGroup.outputBuffers?.length > 0) {
          return this.getOutputData(commandEncoder, bufferGroup.outputBuffers);
        } else {
          this.device.queue.submit([commandEncoder.finish()]);
          return new Promise((r) => r(true));
        }
      }
    };
  };
  function isTypedArray(x) {
    return ArrayBuffer.isView(x) && Object.prototype.toString.call(x) !== "[object DataView]";
  }
  function floatToHalf(float32) {
    const float32View = new Float32Array(1);
    const int32View = new Int32Array(float32View.buffer);
    float32View[0] = float32;
    const f = int32View[0];
    const sign = (f >>> 31) * 32768;
    const exponent = (f >>> 23 & 255) - 127;
    const mantissa = f & 8388607;
    if (exponent === 128) {
      return sign | 31744 | (mantissa ? 1 : 0) * (mantissa >> 13);
    }
    if (exponent < -14) {
      return sign;
    }
    if (exponent > 15) {
      return sign | 31744;
    }
    const normalizedExponent = exponent + 15;
    const normalizedMantissa = mantissa >> 13;
    return sign | normalizedExponent << 10 | normalizedMantissa;
  }

  // ../src/pipeline.ts
  var WebGPUjs = class _WebGPUjs {
    static device;
    static createPipeline = async (shaders, options = {}) => {
      let device = options.device;
      if (!device) {
        device = _WebGPUjs.device;
        if (!device) {
          const gpu = navigator.gpu;
          const adapter = await gpu.requestAdapter();
          if (!adapter) throw new Error("No GPU Adapter found!");
          device = await adapter.requestDevice();
          _WebGPUjs.device = device;
        }
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
          options.workGroupSize,
          options.renderPass?.vbos,
          options.functions,
          options.variableTypes,
          options.lastBinding
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
              options.workGroupSize,
              options.renderPass?.vbos,
              options.functions,
              options.variableTypes,
              options.lastBinding
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
                options.workGroupSize,
                options.renderPass?.vbos,
                options.functions,
                options.variableTypes,
                options.lastBinding
              );
            }
          }
          if (block.vertex) {
            if (typeof block.vertex === "function" || block.transpileString) {
              block.vertex = WGSLTranspiler.convertToWebGPU(
                block.vertex,
                "vertex",
                block.compute ? block.compute.bindGroupNumber + 1 : options.bindGroupNumber,
                options.workGroupSize,
                options.renderPass?.vbos,
                options.functions,
                options.variableTypes,
                options.lastBinding
              );
              options.lastBinding = block.vertex.lastBinding;
            }
          }
          if (block.fragment) {
            if (typeof block.fragment === "function" || block.transpileString) {
              block.fragment = WGSLTranspiler.convertToWebGPU(
                block.fragment,
                "fragment",
                block.compute ? block.compute.bindGroupNumber + 1 : options.bindGroupNumber,
                options.workGroupSize,
                options.renderPass?.vbos,
                options.functions,
                options.variableTypes,
                options.lastBinding
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
            let inps = options.inputs ? [...options.inputs] : [];
            if (options.inputs && shaderPipeline["compute"]) {
              shaderPipeline.process(...inps);
            }
            if (shaderPipeline["fragment"] || shaderPipeline["vertex"]) {
              let opts;
              if (options.renderPass) {
                opts = { ...options.renderPass, newBindings: true };
                delete opts.textures;
              }
              shaderPipeline.render(opts, ...inps);
            }
          }
          return shaderPipeline;
        }
      }
    };
    static init = (shaders, options) => {
      return new ShaderHelper(shaders, options);
    };
    //we can compile shaders linearly so that bindings with the same variable names/usage become shared
    static combineShaders = (shaders, options = {}, previousPipeline) => {
      let bindGroupNumber = previousPipeline.bindGroupLayouts.length;
      options.device = previousPipeline.device;
      if (options.bindGroupLayouts) options.bindGroupLayouts;
      previousPipeline.bindGroupLayouts.push(...options.bindGroupLayouts);
      options.bindGroupNumber = bindGroupNumber;
      options.bindGroupLayouts = previousPipeline.bindGroupLayouts;
      options.bindGroups = previousPipeline.bindGroups;
      options.bufferGroups = previousPipeline.bufferGroups;
      if (previousPipeline.fragment) {
        options.getPrevShaderBindGroups = previousPipeline.fragment.code;
      } else if (previousPipeline.compute) {
        options.getPrevShaderBindGroups = previousPipeline.compute.code;
      }
      return _WebGPUjs.createPipeline(shaders, options);
    };
    static cleanup = (shaderPipeline) => {
      if (shaderPipeline.device) shaderPipeline.device.destroy();
      if (shaderPipeline.context) shaderPipeline.context.unconfigure();
    };
  };

  // exampleCube.js
  var cubeVertices = new Float32Array([
    // float4 vertex, float4 color, float2 uv, float3 normal
    1,
    -1,
    1,
    1,
    1,
    0,
    1,
    1,
    0,
    1,
    //0,0,0,
    -1,
    -1,
    1,
    1,
    0,
    0,
    1,
    1,
    1,
    1,
    //0,0,0,
    -1,
    -1,
    -1,
    1,
    0,
    0,
    0,
    1,
    1,
    0,
    //0,0,0,
    1,
    -1,
    -1,
    1,
    1,
    0,
    0,
    1,
    0,
    0,
    //0,0,0,
    1,
    -1,
    1,
    1,
    1,
    0,
    1,
    1,
    0,
    1,
    //0,0,0,
    -1,
    -1,
    -1,
    1,
    0,
    0,
    0,
    1,
    1,
    0,
    //0,0,0,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    0,
    1,
    //0,0,0,
    1,
    -1,
    1,
    1,
    1,
    0,
    1,
    1,
    1,
    1,
    //0,0,0,
    1,
    -1,
    -1,
    1,
    1,
    0,
    0,
    1,
    1,
    0,
    //0,0,0,
    1,
    1,
    -1,
    1,
    1,
    1,
    0,
    1,
    0,
    0,
    // 0,0,0,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    0,
    1,
    //0,0,0,
    1,
    -1,
    -1,
    1,
    1,
    0,
    0,
    1,
    1,
    0,
    //0,0,0,
    -1,
    1,
    1,
    1,
    0,
    1,
    1,
    1,
    0,
    1,
    //0,0,0,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    //0,0,0,
    1,
    1,
    -1,
    1,
    1,
    1,
    0,
    1,
    1,
    0,
    //0,0,0,
    -1,
    1,
    -1,
    1,
    0,
    1,
    0,
    1,
    0,
    0,
    //0,0,0,
    -1,
    1,
    1,
    1,
    0,
    1,
    1,
    1,
    0,
    1,
    // 0,0,0,
    1,
    1,
    -1,
    1,
    1,
    1,
    0,
    1,
    1,
    0,
    // 0,0,0,
    -1,
    -1,
    1,
    1,
    0,
    0,
    1,
    1,
    0,
    1,
    //0,0,0,
    -1,
    1,
    1,
    1,
    0,
    1,
    1,
    1,
    1,
    1,
    //0,0,0,
    -1,
    1,
    -1,
    1,
    0,
    1,
    0,
    1,
    1,
    0,
    //0,0,0,
    -1,
    -1,
    -1,
    1,
    0,
    0,
    0,
    1,
    0,
    0,
    //0,0,0,
    -1,
    -1,
    1,
    1,
    0,
    0,
    1,
    1,
    0,
    1,
    //0,0,0,
    -1,
    1,
    -1,
    1,
    0,
    1,
    0,
    1,
    1,
    0,
    //0,0,0,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    0,
    1,
    //0,0,0,
    -1,
    1,
    1,
    1,
    0,
    1,
    1,
    1,
    1,
    1,
    //0,0,0,
    -1,
    -1,
    1,
    1,
    0,
    0,
    1,
    1,
    1,
    0,
    //0,0,0,
    -1,
    -1,
    1,
    1,
    0,
    0,
    1,
    1,
    1,
    0,
    // 0,0,0,
    1,
    -1,
    1,
    1,
    1,
    0,
    1,
    1,
    0,
    0,
    // 0,0,0,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    0,
    1,
    // 0,0,0,
    1,
    -1,
    -1,
    1,
    1,
    0,
    0,
    1,
    0,
    1,
    //0,0,0,
    -1,
    -1,
    -1,
    1,
    0,
    0,
    0,
    1,
    1,
    1,
    //0,0,0,
    -1,
    1,
    -1,
    1,
    0,
    1,
    0,
    1,
    1,
    0,
    //0,0,0,
    1,
    1,
    -1,
    1,
    1,
    1,
    0,
    1,
    0,
    0,
    // 0,0,0,
    1,
    -1,
    -1,
    1,
    1,
    0,
    0,
    1,
    0,
    1,
    // 0,0,0,
    -1,
    1,
    -1,
    1,
    0,
    1,
    0,
    1,
    1,
    0
    //0,0,0
  ]);
  var cubeIndices = new Uint16Array([
    0,
    1,
    2,
    3,
    4,
    5,
    // Bottom face
    6,
    7,
    8,
    9,
    10,
    11,
    // Right face
    12,
    13,
    14,
    15,
    16,
    17,
    // Top face
    18,
    19,
    20,
    21,
    22,
    23,
    // Left face
    24,
    25,
    26,
    27,
    28,
    29,
    // Front face
    30,
    31,
    32,
    33,
    34,
    35
    // Back face
  ]);

  // node_modules/wgpu-matrix/dist/2.x/wgpu-matrix.module.js
  var EPSILON = 1e-6;
  var VecType$1 = Float32Array;
  function setDefaultType$5(ctor) {
    const oldType = VecType$1;
    VecType$1 = ctor;
    return oldType;
  }
  function create$4(x, y, z) {
    const dst = new VecType$1(3);
    if (x !== void 0) {
      dst[0] = x;
      if (y !== void 0) {
        dst[1] = y;
        if (z !== void 0) {
          dst[2] = z;
        }
      }
    }
    return dst;
  }
  var ctorMap = /* @__PURE__ */ new Map([
    [Float32Array, () => new Float32Array(12)],
    [Float64Array, () => new Float64Array(12)],
    [Array, () => new Array(12).fill(0)]
  ]);
  var newMat3 = ctorMap.get(Float32Array);
  var fromValues$2 = create$4;
  function set$3(x, y, z, dst) {
    dst = dst || new VecType$1(3);
    dst[0] = x;
    dst[1] = y;
    dst[2] = z;
    return dst;
  }
  function ceil$1(v, dst) {
    dst = dst || new VecType$1(3);
    dst[0] = Math.ceil(v[0]);
    dst[1] = Math.ceil(v[1]);
    dst[2] = Math.ceil(v[2]);
    return dst;
  }
  function floor$1(v, dst) {
    dst = dst || new VecType$1(3);
    dst[0] = Math.floor(v[0]);
    dst[1] = Math.floor(v[1]);
    dst[2] = Math.floor(v[2]);
    return dst;
  }
  function round$1(v, dst) {
    dst = dst || new VecType$1(3);
    dst[0] = Math.round(v[0]);
    dst[1] = Math.round(v[1]);
    dst[2] = Math.round(v[2]);
    return dst;
  }
  function clamp$1(v, min = 0, max = 1, dst) {
    dst = dst || new VecType$1(3);
    dst[0] = Math.min(max, Math.max(min, v[0]));
    dst[1] = Math.min(max, Math.max(min, v[1]));
    dst[2] = Math.min(max, Math.max(min, v[2]));
    return dst;
  }
  function add$2(a, b, dst) {
    dst = dst || new VecType$1(3);
    dst[0] = a[0] + b[0];
    dst[1] = a[1] + b[1];
    dst[2] = a[2] + b[2];
    return dst;
  }
  function addScaled$1(a, b, scale, dst) {
    dst = dst || new VecType$1(3);
    dst[0] = a[0] + b[0] * scale;
    dst[1] = a[1] + b[1] * scale;
    dst[2] = a[2] + b[2] * scale;
    return dst;
  }
  function angle$1(a, b) {
    const ax = a[0];
    const ay = a[1];
    const az = a[2];
    const bx = a[0];
    const by = a[1];
    const bz = a[2];
    const mag1 = Math.sqrt(ax * ax + ay * ay + az * az);
    const mag2 = Math.sqrt(bx * bx + by * by + bz * bz);
    const mag = mag1 * mag2;
    const cosine = mag && dot$2(a, b) / mag;
    return Math.acos(cosine);
  }
  function subtract$2(a, b, dst) {
    dst = dst || new VecType$1(3);
    dst[0] = a[0] - b[0];
    dst[1] = a[1] - b[1];
    dst[2] = a[2] - b[2];
    return dst;
  }
  var sub$2 = subtract$2;
  function equalsApproximately$3(a, b) {
    return Math.abs(a[0] - b[0]) < EPSILON && Math.abs(a[1] - b[1]) < EPSILON && Math.abs(a[2] - b[2]) < EPSILON;
  }
  function equals$3(a, b) {
    return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
  }
  function lerp$2(a, b, t, dst) {
    dst = dst || new VecType$1(3);
    dst[0] = a[0] + t * (b[0] - a[0]);
    dst[1] = a[1] + t * (b[1] - a[1]);
    dst[2] = a[2] + t * (b[2] - a[2]);
    return dst;
  }
  function lerpV$1(a, b, t, dst) {
    dst = dst || new VecType$1(3);
    dst[0] = a[0] + t[0] * (b[0] - a[0]);
    dst[1] = a[1] + t[1] * (b[1] - a[1]);
    dst[2] = a[2] + t[2] * (b[2] - a[2]);
    return dst;
  }
  function max$1(a, b, dst) {
    dst = dst || new VecType$1(3);
    dst[0] = Math.max(a[0], b[0]);
    dst[1] = Math.max(a[1], b[1]);
    dst[2] = Math.max(a[2], b[2]);
    return dst;
  }
  function min$1(a, b, dst) {
    dst = dst || new VecType$1(3);
    dst[0] = Math.min(a[0], b[0]);
    dst[1] = Math.min(a[1], b[1]);
    dst[2] = Math.min(a[2], b[2]);
    return dst;
  }
  function mulScalar$2(v, k, dst) {
    dst = dst || new VecType$1(3);
    dst[0] = v[0] * k;
    dst[1] = v[1] * k;
    dst[2] = v[2] * k;
    return dst;
  }
  var scale$3 = mulScalar$2;
  function divScalar$2(v, k, dst) {
    dst = dst || new VecType$1(3);
    dst[0] = v[0] / k;
    dst[1] = v[1] / k;
    dst[2] = v[2] / k;
    return dst;
  }
  function inverse$3(v, dst) {
    dst = dst || new VecType$1(3);
    dst[0] = 1 / v[0];
    dst[1] = 1 / v[1];
    dst[2] = 1 / v[2];
    return dst;
  }
  var invert$2 = inverse$3;
  function cross(a, b, dst) {
    dst = dst || new VecType$1(3);
    const t1 = a[2] * b[0] - a[0] * b[2];
    const t2 = a[0] * b[1] - a[1] * b[0];
    dst[0] = a[1] * b[2] - a[2] * b[1];
    dst[1] = t1;
    dst[2] = t2;
    return dst;
  }
  function dot$2(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }
  function length$2(v) {
    const v0 = v[0];
    const v1 = v[1];
    const v2 = v[2];
    return Math.sqrt(v0 * v0 + v1 * v1 + v2 * v2);
  }
  var len$2 = length$2;
  function lengthSq$2(v) {
    const v0 = v[0];
    const v1 = v[1];
    const v2 = v[2];
    return v0 * v0 + v1 * v1 + v2 * v2;
  }
  var lenSq$2 = lengthSq$2;
  function distance$1(a, b) {
    const dx = a[0] - b[0];
    const dy = a[1] - b[1];
    const dz = a[2] - b[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  var dist$1 = distance$1;
  function distanceSq$1(a, b) {
    const dx = a[0] - b[0];
    const dy = a[1] - b[1];
    const dz = a[2] - b[2];
    return dx * dx + dy * dy + dz * dz;
  }
  var distSq$1 = distanceSq$1;
  function normalize$2(v, dst) {
    dst = dst || new VecType$1(3);
    const v0 = v[0];
    const v1 = v[1];
    const v2 = v[2];
    const len = Math.sqrt(v0 * v0 + v1 * v1 + v2 * v2);
    if (len > 1e-5) {
      dst[0] = v0 / len;
      dst[1] = v1 / len;
      dst[2] = v2 / len;
    } else {
      dst[0] = 0;
      dst[1] = 0;
      dst[2] = 0;
    }
    return dst;
  }
  function negate$2(v, dst) {
    dst = dst || new VecType$1(3);
    dst[0] = -v[0];
    dst[1] = -v[1];
    dst[2] = -v[2];
    return dst;
  }
  function copy$3(v, dst) {
    dst = dst || new VecType$1(3);
    dst[0] = v[0];
    dst[1] = v[1];
    dst[2] = v[2];
    return dst;
  }
  var clone$3 = copy$3;
  function multiply$3(a, b, dst) {
    dst = dst || new VecType$1(3);
    dst[0] = a[0] * b[0];
    dst[1] = a[1] * b[1];
    dst[2] = a[2] * b[2];
    return dst;
  }
  var mul$3 = multiply$3;
  function divide$1(a, b, dst) {
    dst = dst || new VecType$1(3);
    dst[0] = a[0] / b[0];
    dst[1] = a[1] / b[1];
    dst[2] = a[2] / b[2];
    return dst;
  }
  var div$1 = divide$1;
  function random(scale = 1, dst) {
    dst = dst || new VecType$1(3);
    const angle = Math.random() * 2 * Math.PI;
    const z = Math.random() * 2 - 1;
    const zScale = Math.sqrt(1 - z * z) * scale;
    dst[0] = Math.cos(angle) * zScale;
    dst[1] = Math.sin(angle) * zScale;
    dst[2] = z * scale;
    return dst;
  }
  function zero$1(dst) {
    dst = dst || new VecType$1(3);
    dst[0] = 0;
    dst[1] = 0;
    dst[2] = 0;
    return dst;
  }
  function transformMat4$1(v, m, dst) {
    dst = dst || new VecType$1(3);
    const x = v[0];
    const y = v[1];
    const z = v[2];
    const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
    dst[0] = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
    dst[1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
    dst[2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w;
    return dst;
  }
  function transformMat4Upper3x3(v, m, dst) {
    dst = dst || new VecType$1(3);
    const v0 = v[0];
    const v1 = v[1];
    const v2 = v[2];
    dst[0] = v0 * m[0 * 4 + 0] + v1 * m[1 * 4 + 0] + v2 * m[2 * 4 + 0];
    dst[1] = v0 * m[0 * 4 + 1] + v1 * m[1 * 4 + 1] + v2 * m[2 * 4 + 1];
    dst[2] = v0 * m[0 * 4 + 2] + v1 * m[1 * 4 + 2] + v2 * m[2 * 4 + 2];
    return dst;
  }
  function transformMat3(v, m, dst) {
    dst = dst || new VecType$1(3);
    const x = v[0];
    const y = v[1];
    const z = v[2];
    dst[0] = x * m[0] + y * m[4] + z * m[8];
    dst[1] = x * m[1] + y * m[5] + z * m[9];
    dst[2] = x * m[2] + y * m[6] + z * m[10];
    return dst;
  }
  function transformQuat(v, q, dst) {
    dst = dst || new VecType$1(3);
    const qx = q[0];
    const qy = q[1];
    const qz = q[2];
    const w2 = q[3] * 2;
    const x = v[0];
    const y = v[1];
    const z = v[2];
    const uvX = qy * z - qz * y;
    const uvY = qz * x - qx * z;
    const uvZ = qx * y - qy * x;
    dst[0] = x + uvX * w2 + (qy * uvZ - qz * uvY) * 2;
    dst[1] = y + uvY * w2 + (qz * uvX - qx * uvZ) * 2;
    dst[2] = z + uvZ * w2 + (qx * uvY - qy * uvX) * 2;
    return dst;
  }
  function getTranslation$1(m, dst) {
    dst = dst || new VecType$1(3);
    dst[0] = m[12];
    dst[1] = m[13];
    dst[2] = m[14];
    return dst;
  }
  function getAxis$1(m, axis, dst) {
    dst = dst || new VecType$1(3);
    const off = axis * 4;
    dst[0] = m[off + 0];
    dst[1] = m[off + 1];
    dst[2] = m[off + 2];
    return dst;
  }
  function getScaling$1(m, dst) {
    dst = dst || new VecType$1(3);
    const xx = m[0];
    const xy = m[1];
    const xz = m[2];
    const yx = m[4];
    const yy = m[5];
    const yz = m[6];
    const zx = m[8];
    const zy = m[9];
    const zz = m[10];
    dst[0] = Math.sqrt(xx * xx + xy * xy + xz * xz);
    dst[1] = Math.sqrt(yx * yx + yy * yy + yz * yz);
    dst[2] = Math.sqrt(zx * zx + zy * zy + zz * zz);
    return dst;
  }
  var vec3Impl = /* @__PURE__ */ Object.freeze({
    __proto__: null,
    create: create$4,
    setDefaultType: setDefaultType$5,
    fromValues: fromValues$2,
    set: set$3,
    ceil: ceil$1,
    floor: floor$1,
    round: round$1,
    clamp: clamp$1,
    add: add$2,
    addScaled: addScaled$1,
    angle: angle$1,
    subtract: subtract$2,
    sub: sub$2,
    equalsApproximately: equalsApproximately$3,
    equals: equals$3,
    lerp: lerp$2,
    lerpV: lerpV$1,
    max: max$1,
    min: min$1,
    mulScalar: mulScalar$2,
    scale: scale$3,
    divScalar: divScalar$2,
    inverse: inverse$3,
    invert: invert$2,
    cross,
    dot: dot$2,
    length: length$2,
    len: len$2,
    lengthSq: lengthSq$2,
    lenSq: lenSq$2,
    distance: distance$1,
    dist: dist$1,
    distanceSq: distanceSq$1,
    distSq: distSq$1,
    normalize: normalize$2,
    negate: negate$2,
    copy: copy$3,
    clone: clone$3,
    multiply: multiply$3,
    mul: mul$3,
    divide: divide$1,
    div: div$1,
    random,
    zero: zero$1,
    transformMat4: transformMat4$1,
    transformMat4Upper3x3,
    transformMat3,
    transformQuat,
    getTranslation: getTranslation$1,
    getAxis: getAxis$1,
    getScaling: getScaling$1
  });
  var MatType = Float32Array;
  function setDefaultType$3(ctor) {
    const oldType = MatType;
    MatType = ctor;
    return oldType;
  }
  function create$2(v0, v1, v2, v3, v4, v5, v6, v7, v8, v9, v10, v11, v12, v13, v14, v15) {
    const dst = new MatType(16);
    if (v0 !== void 0) {
      dst[0] = v0;
      if (v1 !== void 0) {
        dst[1] = v1;
        if (v2 !== void 0) {
          dst[2] = v2;
          if (v3 !== void 0) {
            dst[3] = v3;
            if (v4 !== void 0) {
              dst[4] = v4;
              if (v5 !== void 0) {
                dst[5] = v5;
                if (v6 !== void 0) {
                  dst[6] = v6;
                  if (v7 !== void 0) {
                    dst[7] = v7;
                    if (v8 !== void 0) {
                      dst[8] = v8;
                      if (v9 !== void 0) {
                        dst[9] = v9;
                        if (v10 !== void 0) {
                          dst[10] = v10;
                          if (v11 !== void 0) {
                            dst[11] = v11;
                            if (v12 !== void 0) {
                              dst[12] = v12;
                              if (v13 !== void 0) {
                                dst[13] = v13;
                                if (v14 !== void 0) {
                                  dst[14] = v14;
                                  if (v15 !== void 0) {
                                    dst[15] = v15;
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    return dst;
  }
  function set$2(v0, v1, v2, v3, v4, v5, v6, v7, v8, v9, v10, v11, v12, v13, v14, v15, dst) {
    dst = dst || new MatType(16);
    dst[0] = v0;
    dst[1] = v1;
    dst[2] = v2;
    dst[3] = v3;
    dst[4] = v4;
    dst[5] = v5;
    dst[6] = v6;
    dst[7] = v7;
    dst[8] = v8;
    dst[9] = v9;
    dst[10] = v10;
    dst[11] = v11;
    dst[12] = v12;
    dst[13] = v13;
    dst[14] = v14;
    dst[15] = v15;
    return dst;
  }
  function fromMat3(m3, dst) {
    dst = dst || new MatType(16);
    dst[0] = m3[0];
    dst[1] = m3[1];
    dst[2] = m3[2];
    dst[3] = 0;
    dst[4] = m3[4];
    dst[5] = m3[5];
    dst[6] = m3[6];
    dst[7] = 0;
    dst[8] = m3[8];
    dst[9] = m3[9];
    dst[10] = m3[10];
    dst[11] = 0;
    dst[12] = 0;
    dst[13] = 0;
    dst[14] = 0;
    dst[15] = 1;
    return dst;
  }
  function fromQuat(q, dst) {
    dst = dst || new MatType(16);
    const x = q[0];
    const y = q[1];
    const z = q[2];
    const w = q[3];
    const x2 = x + x;
    const y2 = y + y;
    const z2 = z + z;
    const xx = x * x2;
    const yx = y * x2;
    const yy = y * y2;
    const zx = z * x2;
    const zy = z * y2;
    const zz = z * z2;
    const wx = w * x2;
    const wy = w * y2;
    const wz = w * z2;
    dst[0] = 1 - yy - zz;
    dst[1] = yx + wz;
    dst[2] = zx - wy;
    dst[3] = 0;
    dst[4] = yx - wz;
    dst[5] = 1 - xx - zz;
    dst[6] = zy + wx;
    dst[7] = 0;
    dst[8] = zx + wy;
    dst[9] = zy - wx;
    dst[10] = 1 - xx - yy;
    dst[11] = 0;
    dst[12] = 0;
    dst[13] = 0;
    dst[14] = 0;
    dst[15] = 1;
    return dst;
  }
  function negate$1(m, dst) {
    dst = dst || new MatType(16);
    dst[0] = -m[0];
    dst[1] = -m[1];
    dst[2] = -m[2];
    dst[3] = -m[3];
    dst[4] = -m[4];
    dst[5] = -m[5];
    dst[6] = -m[6];
    dst[7] = -m[7];
    dst[8] = -m[8];
    dst[9] = -m[9];
    dst[10] = -m[10];
    dst[11] = -m[11];
    dst[12] = -m[12];
    dst[13] = -m[13];
    dst[14] = -m[14];
    dst[15] = -m[15];
    return dst;
  }
  function copy$2(m, dst) {
    dst = dst || new MatType(16);
    dst[0] = m[0];
    dst[1] = m[1];
    dst[2] = m[2];
    dst[3] = m[3];
    dst[4] = m[4];
    dst[5] = m[5];
    dst[6] = m[6];
    dst[7] = m[7];
    dst[8] = m[8];
    dst[9] = m[9];
    dst[10] = m[10];
    dst[11] = m[11];
    dst[12] = m[12];
    dst[13] = m[13];
    dst[14] = m[14];
    dst[15] = m[15];
    return dst;
  }
  var clone$2 = copy$2;
  function equalsApproximately$2(a, b) {
    return Math.abs(a[0] - b[0]) < EPSILON && Math.abs(a[1] - b[1]) < EPSILON && Math.abs(a[2] - b[2]) < EPSILON && Math.abs(a[3] - b[3]) < EPSILON && Math.abs(a[4] - b[4]) < EPSILON && Math.abs(a[5] - b[5]) < EPSILON && Math.abs(a[6] - b[6]) < EPSILON && Math.abs(a[7] - b[7]) < EPSILON && Math.abs(a[8] - b[8]) < EPSILON && Math.abs(a[9] - b[9]) < EPSILON && Math.abs(a[10] - b[10]) < EPSILON && Math.abs(a[11] - b[11]) < EPSILON && Math.abs(a[12] - b[12]) < EPSILON && Math.abs(a[13] - b[13]) < EPSILON && Math.abs(a[14] - b[14]) < EPSILON && Math.abs(a[15] - b[15]) < EPSILON;
  }
  function equals$2(a, b) {
    return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3] && a[4] === b[4] && a[5] === b[5] && a[6] === b[6] && a[7] === b[7] && a[8] === b[8] && a[9] === b[9] && a[10] === b[10] && a[11] === b[11] && a[12] === b[12] && a[13] === b[13] && a[14] === b[14] && a[15] === b[15];
  }
  function identity$1(dst) {
    dst = dst || new MatType(16);
    dst[0] = 1;
    dst[1] = 0;
    dst[2] = 0;
    dst[3] = 0;
    dst[4] = 0;
    dst[5] = 1;
    dst[6] = 0;
    dst[7] = 0;
    dst[8] = 0;
    dst[9] = 0;
    dst[10] = 1;
    dst[11] = 0;
    dst[12] = 0;
    dst[13] = 0;
    dst[14] = 0;
    dst[15] = 1;
    return dst;
  }
  function transpose(m, dst) {
    dst = dst || new MatType(16);
    if (dst === m) {
      let t;
      t = m[1];
      m[1] = m[4];
      m[4] = t;
      t = m[2];
      m[2] = m[8];
      m[8] = t;
      t = m[3];
      m[3] = m[12];
      m[12] = t;
      t = m[6];
      m[6] = m[9];
      m[9] = t;
      t = m[7];
      m[7] = m[13];
      m[13] = t;
      t = m[11];
      m[11] = m[14];
      m[14] = t;
      return dst;
    }
    const m00 = m[0 * 4 + 0];
    const m01 = m[0 * 4 + 1];
    const m02 = m[0 * 4 + 2];
    const m03 = m[0 * 4 + 3];
    const m10 = m[1 * 4 + 0];
    const m11 = m[1 * 4 + 1];
    const m12 = m[1 * 4 + 2];
    const m13 = m[1 * 4 + 3];
    const m20 = m[2 * 4 + 0];
    const m21 = m[2 * 4 + 1];
    const m22 = m[2 * 4 + 2];
    const m23 = m[2 * 4 + 3];
    const m30 = m[3 * 4 + 0];
    const m31 = m[3 * 4 + 1];
    const m32 = m[3 * 4 + 2];
    const m33 = m[3 * 4 + 3];
    dst[0] = m00;
    dst[1] = m10;
    dst[2] = m20;
    dst[3] = m30;
    dst[4] = m01;
    dst[5] = m11;
    dst[6] = m21;
    dst[7] = m31;
    dst[8] = m02;
    dst[9] = m12;
    dst[10] = m22;
    dst[11] = m32;
    dst[12] = m03;
    dst[13] = m13;
    dst[14] = m23;
    dst[15] = m33;
    return dst;
  }
  function inverse$2(m, dst) {
    dst = dst || new MatType(16);
    const m00 = m[0 * 4 + 0];
    const m01 = m[0 * 4 + 1];
    const m02 = m[0 * 4 + 2];
    const m03 = m[0 * 4 + 3];
    const m10 = m[1 * 4 + 0];
    const m11 = m[1 * 4 + 1];
    const m12 = m[1 * 4 + 2];
    const m13 = m[1 * 4 + 3];
    const m20 = m[2 * 4 + 0];
    const m21 = m[2 * 4 + 1];
    const m22 = m[2 * 4 + 2];
    const m23 = m[2 * 4 + 3];
    const m30 = m[3 * 4 + 0];
    const m31 = m[3 * 4 + 1];
    const m32 = m[3 * 4 + 2];
    const m33 = m[3 * 4 + 3];
    const tmp0 = m22 * m33;
    const tmp1 = m32 * m23;
    const tmp2 = m12 * m33;
    const tmp3 = m32 * m13;
    const tmp4 = m12 * m23;
    const tmp5 = m22 * m13;
    const tmp6 = m02 * m33;
    const tmp7 = m32 * m03;
    const tmp8 = m02 * m23;
    const tmp9 = m22 * m03;
    const tmp10 = m02 * m13;
    const tmp11 = m12 * m03;
    const tmp12 = m20 * m31;
    const tmp13 = m30 * m21;
    const tmp14 = m10 * m31;
    const tmp15 = m30 * m11;
    const tmp16 = m10 * m21;
    const tmp17 = m20 * m11;
    const tmp18 = m00 * m31;
    const tmp19 = m30 * m01;
    const tmp20 = m00 * m21;
    const tmp21 = m20 * m01;
    const tmp22 = m00 * m11;
    const tmp23 = m10 * m01;
    const t0 = tmp0 * m11 + tmp3 * m21 + tmp4 * m31 - (tmp1 * m11 + tmp2 * m21 + tmp5 * m31);
    const t1 = tmp1 * m01 + tmp6 * m21 + tmp9 * m31 - (tmp0 * m01 + tmp7 * m21 + tmp8 * m31);
    const t2 = tmp2 * m01 + tmp7 * m11 + tmp10 * m31 - (tmp3 * m01 + tmp6 * m11 + tmp11 * m31);
    const t3 = tmp5 * m01 + tmp8 * m11 + tmp11 * m21 - (tmp4 * m01 + tmp9 * m11 + tmp10 * m21);
    const d = 1 / (m00 * t0 + m10 * t1 + m20 * t2 + m30 * t3);
    dst[0] = d * t0;
    dst[1] = d * t1;
    dst[2] = d * t2;
    dst[3] = d * t3;
    dst[4] = d * (tmp1 * m10 + tmp2 * m20 + tmp5 * m30 - (tmp0 * m10 + tmp3 * m20 + tmp4 * m30));
    dst[5] = d * (tmp0 * m00 + tmp7 * m20 + tmp8 * m30 - (tmp1 * m00 + tmp6 * m20 + tmp9 * m30));
    dst[6] = d * (tmp3 * m00 + tmp6 * m10 + tmp11 * m30 - (tmp2 * m00 + tmp7 * m10 + tmp10 * m30));
    dst[7] = d * (tmp4 * m00 + tmp9 * m10 + tmp10 * m20 - (tmp5 * m00 + tmp8 * m10 + tmp11 * m20));
    dst[8] = d * (tmp12 * m13 + tmp15 * m23 + tmp16 * m33 - (tmp13 * m13 + tmp14 * m23 + tmp17 * m33));
    dst[9] = d * (tmp13 * m03 + tmp18 * m23 + tmp21 * m33 - (tmp12 * m03 + tmp19 * m23 + tmp20 * m33));
    dst[10] = d * (tmp14 * m03 + tmp19 * m13 + tmp22 * m33 - (tmp15 * m03 + tmp18 * m13 + tmp23 * m33));
    dst[11] = d * (tmp17 * m03 + tmp20 * m13 + tmp23 * m23 - (tmp16 * m03 + tmp21 * m13 + tmp22 * m23));
    dst[12] = d * (tmp14 * m22 + tmp17 * m32 + tmp13 * m12 - (tmp16 * m32 + tmp12 * m12 + tmp15 * m22));
    dst[13] = d * (tmp20 * m32 + tmp12 * m02 + tmp19 * m22 - (tmp18 * m22 + tmp21 * m32 + tmp13 * m02));
    dst[14] = d * (tmp18 * m12 + tmp23 * m32 + tmp15 * m02 - (tmp22 * m32 + tmp14 * m02 + tmp19 * m12));
    dst[15] = d * (tmp22 * m22 + tmp16 * m02 + tmp21 * m12 - (tmp20 * m12 + tmp23 * m22 + tmp17 * m02));
    return dst;
  }
  function determinant(m) {
    const m00 = m[0 * 4 + 0];
    const m01 = m[0 * 4 + 1];
    const m02 = m[0 * 4 + 2];
    const m03 = m[0 * 4 + 3];
    const m10 = m[1 * 4 + 0];
    const m11 = m[1 * 4 + 1];
    const m12 = m[1 * 4 + 2];
    const m13 = m[1 * 4 + 3];
    const m20 = m[2 * 4 + 0];
    const m21 = m[2 * 4 + 1];
    const m22 = m[2 * 4 + 2];
    const m23 = m[2 * 4 + 3];
    const m30 = m[3 * 4 + 0];
    const m31 = m[3 * 4 + 1];
    const m32 = m[3 * 4 + 2];
    const m33 = m[3 * 4 + 3];
    const tmp0 = m22 * m33;
    const tmp1 = m32 * m23;
    const tmp2 = m12 * m33;
    const tmp3 = m32 * m13;
    const tmp4 = m12 * m23;
    const tmp5 = m22 * m13;
    const tmp6 = m02 * m33;
    const tmp7 = m32 * m03;
    const tmp8 = m02 * m23;
    const tmp9 = m22 * m03;
    const tmp10 = m02 * m13;
    const tmp11 = m12 * m03;
    const t0 = tmp0 * m11 + tmp3 * m21 + tmp4 * m31 - (tmp1 * m11 + tmp2 * m21 + tmp5 * m31);
    const t1 = tmp1 * m01 + tmp6 * m21 + tmp9 * m31 - (tmp0 * m01 + tmp7 * m21 + tmp8 * m31);
    const t2 = tmp2 * m01 + tmp7 * m11 + tmp10 * m31 - (tmp3 * m01 + tmp6 * m11 + tmp11 * m31);
    const t3 = tmp5 * m01 + tmp8 * m11 + tmp11 * m21 - (tmp4 * m01 + tmp9 * m11 + tmp10 * m21);
    return m00 * t0 + m10 * t1 + m20 * t2 + m30 * t3;
  }
  var invert$1 = inverse$2;
  function multiply$2(a, b, dst) {
    dst = dst || new MatType(16);
    const a00 = a[0];
    const a01 = a[1];
    const a02 = a[2];
    const a03 = a[3];
    const a10 = a[4 + 0];
    const a11 = a[4 + 1];
    const a12 = a[4 + 2];
    const a13 = a[4 + 3];
    const a20 = a[8 + 0];
    const a21 = a[8 + 1];
    const a22 = a[8 + 2];
    const a23 = a[8 + 3];
    const a30 = a[12 + 0];
    const a31 = a[12 + 1];
    const a32 = a[12 + 2];
    const a33 = a[12 + 3];
    const b00 = b[0];
    const b01 = b[1];
    const b02 = b[2];
    const b03 = b[3];
    const b10 = b[4 + 0];
    const b11 = b[4 + 1];
    const b12 = b[4 + 2];
    const b13 = b[4 + 3];
    const b20 = b[8 + 0];
    const b21 = b[8 + 1];
    const b22 = b[8 + 2];
    const b23 = b[8 + 3];
    const b30 = b[12 + 0];
    const b31 = b[12 + 1];
    const b32 = b[12 + 2];
    const b33 = b[12 + 3];
    dst[0] = a00 * b00 + a10 * b01 + a20 * b02 + a30 * b03;
    dst[1] = a01 * b00 + a11 * b01 + a21 * b02 + a31 * b03;
    dst[2] = a02 * b00 + a12 * b01 + a22 * b02 + a32 * b03;
    dst[3] = a03 * b00 + a13 * b01 + a23 * b02 + a33 * b03;
    dst[4] = a00 * b10 + a10 * b11 + a20 * b12 + a30 * b13;
    dst[5] = a01 * b10 + a11 * b11 + a21 * b12 + a31 * b13;
    dst[6] = a02 * b10 + a12 * b11 + a22 * b12 + a32 * b13;
    dst[7] = a03 * b10 + a13 * b11 + a23 * b12 + a33 * b13;
    dst[8] = a00 * b20 + a10 * b21 + a20 * b22 + a30 * b23;
    dst[9] = a01 * b20 + a11 * b21 + a21 * b22 + a31 * b23;
    dst[10] = a02 * b20 + a12 * b21 + a22 * b22 + a32 * b23;
    dst[11] = a03 * b20 + a13 * b21 + a23 * b22 + a33 * b23;
    dst[12] = a00 * b30 + a10 * b31 + a20 * b32 + a30 * b33;
    dst[13] = a01 * b30 + a11 * b31 + a21 * b32 + a31 * b33;
    dst[14] = a02 * b30 + a12 * b31 + a22 * b32 + a32 * b33;
    dst[15] = a03 * b30 + a13 * b31 + a23 * b32 + a33 * b33;
    return dst;
  }
  var mul$2 = multiply$2;
  function setTranslation(a, v, dst) {
    dst = dst || identity$1();
    if (a !== dst) {
      dst[0] = a[0];
      dst[1] = a[1];
      dst[2] = a[2];
      dst[3] = a[3];
      dst[4] = a[4];
      dst[5] = a[5];
      dst[6] = a[6];
      dst[7] = a[7];
      dst[8] = a[8];
      dst[9] = a[9];
      dst[10] = a[10];
      dst[11] = a[11];
    }
    dst[12] = v[0];
    dst[13] = v[1];
    dst[14] = v[2];
    dst[15] = 1;
    return dst;
  }
  function getTranslation(m, dst) {
    dst = dst || create$4();
    dst[0] = m[12];
    dst[1] = m[13];
    dst[2] = m[14];
    return dst;
  }
  function getAxis(m, axis, dst) {
    dst = dst || create$4();
    const off = axis * 4;
    dst[0] = m[off + 0];
    dst[1] = m[off + 1];
    dst[2] = m[off + 2];
    return dst;
  }
  function setAxis(a, v, axis, dst) {
    if (dst !== a) {
      dst = copy$2(a, dst);
    }
    const off = axis * 4;
    dst[off + 0] = v[0];
    dst[off + 1] = v[1];
    dst[off + 2] = v[2];
    return dst;
  }
  function getScaling(m, dst) {
    dst = dst || create$4();
    const xx = m[0];
    const xy = m[1];
    const xz = m[2];
    const yx = m[4];
    const yy = m[5];
    const yz = m[6];
    const zx = m[8];
    const zy = m[9];
    const zz = m[10];
    dst[0] = Math.sqrt(xx * xx + xy * xy + xz * xz);
    dst[1] = Math.sqrt(yx * yx + yy * yy + yz * yz);
    dst[2] = Math.sqrt(zx * zx + zy * zy + zz * zz);
    return dst;
  }
  function perspective(fieldOfViewYInRadians, aspect, zNear, zFar, dst) {
    dst = dst || new MatType(16);
    const f = Math.tan(Math.PI * 0.5 - 0.5 * fieldOfViewYInRadians);
    dst[0] = f / aspect;
    dst[1] = 0;
    dst[2] = 0;
    dst[3] = 0;
    dst[4] = 0;
    dst[5] = f;
    dst[6] = 0;
    dst[7] = 0;
    dst[8] = 0;
    dst[9] = 0;
    dst[11] = -1;
    dst[12] = 0;
    dst[13] = 0;
    dst[15] = 0;
    if (zFar === Infinity) {
      dst[10] = -1;
      dst[14] = -zNear;
    } else {
      const rangeInv = 1 / (zNear - zFar);
      dst[10] = zFar * rangeInv;
      dst[14] = zFar * zNear * rangeInv;
    }
    return dst;
  }
  function ortho(left, right, bottom, top, near, far, dst) {
    dst = dst || new MatType(16);
    dst[0] = 2 / (right - left);
    dst[1] = 0;
    dst[2] = 0;
    dst[3] = 0;
    dst[4] = 0;
    dst[5] = 2 / (top - bottom);
    dst[6] = 0;
    dst[7] = 0;
    dst[8] = 0;
    dst[9] = 0;
    dst[10] = 1 / (near - far);
    dst[11] = 0;
    dst[12] = (right + left) / (left - right);
    dst[13] = (top + bottom) / (bottom - top);
    dst[14] = near / (near - far);
    dst[15] = 1;
    return dst;
  }
  function frustum(left, right, bottom, top, near, far, dst) {
    dst = dst || new MatType(16);
    const dx = right - left;
    const dy = top - bottom;
    const dz = near - far;
    dst[0] = 2 * near / dx;
    dst[1] = 0;
    dst[2] = 0;
    dst[3] = 0;
    dst[4] = 0;
    dst[5] = 2 * near / dy;
    dst[6] = 0;
    dst[7] = 0;
    dst[8] = (left + right) / dx;
    dst[9] = (top + bottom) / dy;
    dst[10] = far / dz;
    dst[11] = -1;
    dst[12] = 0;
    dst[13] = 0;
    dst[14] = near * far / dz;
    dst[15] = 0;
    return dst;
  }
  var xAxis;
  var yAxis;
  var zAxis;
  function aim(position2, target, up, dst) {
    dst = dst || new MatType(16);
    xAxis = xAxis || create$4();
    yAxis = yAxis || create$4();
    zAxis = zAxis || create$4();
    normalize$2(subtract$2(target, position2, zAxis), zAxis);
    normalize$2(cross(up, zAxis, xAxis), xAxis);
    normalize$2(cross(zAxis, xAxis, yAxis), yAxis);
    dst[0] = xAxis[0];
    dst[1] = xAxis[1];
    dst[2] = xAxis[2];
    dst[3] = 0;
    dst[4] = yAxis[0];
    dst[5] = yAxis[1];
    dst[6] = yAxis[2];
    dst[7] = 0;
    dst[8] = zAxis[0];
    dst[9] = zAxis[1];
    dst[10] = zAxis[2];
    dst[11] = 0;
    dst[12] = position2[0];
    dst[13] = position2[1];
    dst[14] = position2[2];
    dst[15] = 1;
    return dst;
  }
  function cameraAim(eye, target, up, dst) {
    dst = dst || new MatType(16);
    xAxis = xAxis || create$4();
    yAxis = yAxis || create$4();
    zAxis = zAxis || create$4();
    normalize$2(subtract$2(eye, target, zAxis), zAxis);
    normalize$2(cross(up, zAxis, xAxis), xAxis);
    normalize$2(cross(zAxis, xAxis, yAxis), yAxis);
    dst[0] = xAxis[0];
    dst[1] = xAxis[1];
    dst[2] = xAxis[2];
    dst[3] = 0;
    dst[4] = yAxis[0];
    dst[5] = yAxis[1];
    dst[6] = yAxis[2];
    dst[7] = 0;
    dst[8] = zAxis[0];
    dst[9] = zAxis[1];
    dst[10] = zAxis[2];
    dst[11] = 0;
    dst[12] = eye[0];
    dst[13] = eye[1];
    dst[14] = eye[2];
    dst[15] = 1;
    return dst;
  }
  function lookAt(eye, target, up, dst) {
    dst = dst || new MatType(16);
    xAxis = xAxis || create$4();
    yAxis = yAxis || create$4();
    zAxis = zAxis || create$4();
    normalize$2(subtract$2(eye, target, zAxis), zAxis);
    normalize$2(cross(up, zAxis, xAxis), xAxis);
    normalize$2(cross(zAxis, xAxis, yAxis), yAxis);
    dst[0] = xAxis[0];
    dst[1] = yAxis[0];
    dst[2] = zAxis[0];
    dst[3] = 0;
    dst[4] = xAxis[1];
    dst[5] = yAxis[1];
    dst[6] = zAxis[1];
    dst[7] = 0;
    dst[8] = xAxis[2];
    dst[9] = yAxis[2];
    dst[10] = zAxis[2];
    dst[11] = 0;
    dst[12] = -(xAxis[0] * eye[0] + xAxis[1] * eye[1] + xAxis[2] * eye[2]);
    dst[13] = -(yAxis[0] * eye[0] + yAxis[1] * eye[1] + yAxis[2] * eye[2]);
    dst[14] = -(zAxis[0] * eye[0] + zAxis[1] * eye[1] + zAxis[2] * eye[2]);
    dst[15] = 1;
    return dst;
  }
  function translation(v, dst) {
    dst = dst || new MatType(16);
    dst[0] = 1;
    dst[1] = 0;
    dst[2] = 0;
    dst[3] = 0;
    dst[4] = 0;
    dst[5] = 1;
    dst[6] = 0;
    dst[7] = 0;
    dst[8] = 0;
    dst[9] = 0;
    dst[10] = 1;
    dst[11] = 0;
    dst[12] = v[0];
    dst[13] = v[1];
    dst[14] = v[2];
    dst[15] = 1;
    return dst;
  }
  function translate(m, v, dst) {
    dst = dst || new MatType(16);
    const v0 = v[0];
    const v1 = v[1];
    const v2 = v[2];
    const m00 = m[0];
    const m01 = m[1];
    const m02 = m[2];
    const m03 = m[3];
    const m10 = m[1 * 4 + 0];
    const m11 = m[1 * 4 + 1];
    const m12 = m[1 * 4 + 2];
    const m13 = m[1 * 4 + 3];
    const m20 = m[2 * 4 + 0];
    const m21 = m[2 * 4 + 1];
    const m22 = m[2 * 4 + 2];
    const m23 = m[2 * 4 + 3];
    const m30 = m[3 * 4 + 0];
    const m31 = m[3 * 4 + 1];
    const m32 = m[3 * 4 + 2];
    const m33 = m[3 * 4 + 3];
    if (m !== dst) {
      dst[0] = m00;
      dst[1] = m01;
      dst[2] = m02;
      dst[3] = m03;
      dst[4] = m10;
      dst[5] = m11;
      dst[6] = m12;
      dst[7] = m13;
      dst[8] = m20;
      dst[9] = m21;
      dst[10] = m22;
      dst[11] = m23;
    }
    dst[12] = m00 * v0 + m10 * v1 + m20 * v2 + m30;
    dst[13] = m01 * v0 + m11 * v1 + m21 * v2 + m31;
    dst[14] = m02 * v0 + m12 * v1 + m22 * v2 + m32;
    dst[15] = m03 * v0 + m13 * v1 + m23 * v2 + m33;
    return dst;
  }
  function rotationX(angleInRadians, dst) {
    dst = dst || new MatType(16);
    const c = Math.cos(angleInRadians);
    const s = Math.sin(angleInRadians);
    dst[0] = 1;
    dst[1] = 0;
    dst[2] = 0;
    dst[3] = 0;
    dst[4] = 0;
    dst[5] = c;
    dst[6] = s;
    dst[7] = 0;
    dst[8] = 0;
    dst[9] = -s;
    dst[10] = c;
    dst[11] = 0;
    dst[12] = 0;
    dst[13] = 0;
    dst[14] = 0;
    dst[15] = 1;
    return dst;
  }
  function rotateX$1(m, angleInRadians, dst) {
    dst = dst || new MatType(16);
    const m10 = m[4];
    const m11 = m[5];
    const m12 = m[6];
    const m13 = m[7];
    const m20 = m[8];
    const m21 = m[9];
    const m22 = m[10];
    const m23 = m[11];
    const c = Math.cos(angleInRadians);
    const s = Math.sin(angleInRadians);
    dst[4] = c * m10 + s * m20;
    dst[5] = c * m11 + s * m21;
    dst[6] = c * m12 + s * m22;
    dst[7] = c * m13 + s * m23;
    dst[8] = c * m20 - s * m10;
    dst[9] = c * m21 - s * m11;
    dst[10] = c * m22 - s * m12;
    dst[11] = c * m23 - s * m13;
    if (m !== dst) {
      dst[0] = m[0];
      dst[1] = m[1];
      dst[2] = m[2];
      dst[3] = m[3];
      dst[12] = m[12];
      dst[13] = m[13];
      dst[14] = m[14];
      dst[15] = m[15];
    }
    return dst;
  }
  function rotationY(angleInRadians, dst) {
    dst = dst || new MatType(16);
    const c = Math.cos(angleInRadians);
    const s = Math.sin(angleInRadians);
    dst[0] = c;
    dst[1] = 0;
    dst[2] = -s;
    dst[3] = 0;
    dst[4] = 0;
    dst[5] = 1;
    dst[6] = 0;
    dst[7] = 0;
    dst[8] = s;
    dst[9] = 0;
    dst[10] = c;
    dst[11] = 0;
    dst[12] = 0;
    dst[13] = 0;
    dst[14] = 0;
    dst[15] = 1;
    return dst;
  }
  function rotateY$1(m, angleInRadians, dst) {
    dst = dst || new MatType(16);
    const m00 = m[0 * 4 + 0];
    const m01 = m[0 * 4 + 1];
    const m02 = m[0 * 4 + 2];
    const m03 = m[0 * 4 + 3];
    const m20 = m[2 * 4 + 0];
    const m21 = m[2 * 4 + 1];
    const m22 = m[2 * 4 + 2];
    const m23 = m[2 * 4 + 3];
    const c = Math.cos(angleInRadians);
    const s = Math.sin(angleInRadians);
    dst[0] = c * m00 - s * m20;
    dst[1] = c * m01 - s * m21;
    dst[2] = c * m02 - s * m22;
    dst[3] = c * m03 - s * m23;
    dst[8] = c * m20 + s * m00;
    dst[9] = c * m21 + s * m01;
    dst[10] = c * m22 + s * m02;
    dst[11] = c * m23 + s * m03;
    if (m !== dst) {
      dst[4] = m[4];
      dst[5] = m[5];
      dst[6] = m[6];
      dst[7] = m[7];
      dst[12] = m[12];
      dst[13] = m[13];
      dst[14] = m[14];
      dst[15] = m[15];
    }
    return dst;
  }
  function rotationZ(angleInRadians, dst) {
    dst = dst || new MatType(16);
    const c = Math.cos(angleInRadians);
    const s = Math.sin(angleInRadians);
    dst[0] = c;
    dst[1] = s;
    dst[2] = 0;
    dst[3] = 0;
    dst[4] = -s;
    dst[5] = c;
    dst[6] = 0;
    dst[7] = 0;
    dst[8] = 0;
    dst[9] = 0;
    dst[10] = 1;
    dst[11] = 0;
    dst[12] = 0;
    dst[13] = 0;
    dst[14] = 0;
    dst[15] = 1;
    return dst;
  }
  function rotateZ$1(m, angleInRadians, dst) {
    dst = dst || new MatType(16);
    const m00 = m[0 * 4 + 0];
    const m01 = m[0 * 4 + 1];
    const m02 = m[0 * 4 + 2];
    const m03 = m[0 * 4 + 3];
    const m10 = m[1 * 4 + 0];
    const m11 = m[1 * 4 + 1];
    const m12 = m[1 * 4 + 2];
    const m13 = m[1 * 4 + 3];
    const c = Math.cos(angleInRadians);
    const s = Math.sin(angleInRadians);
    dst[0] = c * m00 + s * m10;
    dst[1] = c * m01 + s * m11;
    dst[2] = c * m02 + s * m12;
    dst[3] = c * m03 + s * m13;
    dst[4] = c * m10 - s * m00;
    dst[5] = c * m11 - s * m01;
    dst[6] = c * m12 - s * m02;
    dst[7] = c * m13 - s * m03;
    if (m !== dst) {
      dst[8] = m[8];
      dst[9] = m[9];
      dst[10] = m[10];
      dst[11] = m[11];
      dst[12] = m[12];
      dst[13] = m[13];
      dst[14] = m[14];
      dst[15] = m[15];
    }
    return dst;
  }
  function axisRotation(axis, angleInRadians, dst) {
    dst = dst || new MatType(16);
    let x = axis[0];
    let y = axis[1];
    let z = axis[2];
    const n = Math.sqrt(x * x + y * y + z * z);
    x /= n;
    y /= n;
    z /= n;
    const xx = x * x;
    const yy = y * y;
    const zz = z * z;
    const c = Math.cos(angleInRadians);
    const s = Math.sin(angleInRadians);
    const oneMinusCosine = 1 - c;
    dst[0] = xx + (1 - xx) * c;
    dst[1] = x * y * oneMinusCosine + z * s;
    dst[2] = x * z * oneMinusCosine - y * s;
    dst[3] = 0;
    dst[4] = x * y * oneMinusCosine - z * s;
    dst[5] = yy + (1 - yy) * c;
    dst[6] = y * z * oneMinusCosine + x * s;
    dst[7] = 0;
    dst[8] = x * z * oneMinusCosine + y * s;
    dst[9] = y * z * oneMinusCosine - x * s;
    dst[10] = zz + (1 - zz) * c;
    dst[11] = 0;
    dst[12] = 0;
    dst[13] = 0;
    dst[14] = 0;
    dst[15] = 1;
    return dst;
  }
  var rotation = axisRotation;
  function axisRotate(m, axis, angleInRadians, dst) {
    dst = dst || new MatType(16);
    let x = axis[0];
    let y = axis[1];
    let z = axis[2];
    const n = Math.sqrt(x * x + y * y + z * z);
    x /= n;
    y /= n;
    z /= n;
    const xx = x * x;
    const yy = y * y;
    const zz = z * z;
    const c = Math.cos(angleInRadians);
    const s = Math.sin(angleInRadians);
    const oneMinusCosine = 1 - c;
    const r00 = xx + (1 - xx) * c;
    const r01 = x * y * oneMinusCosine + z * s;
    const r02 = x * z * oneMinusCosine - y * s;
    const r10 = x * y * oneMinusCosine - z * s;
    const r11 = yy + (1 - yy) * c;
    const r12 = y * z * oneMinusCosine + x * s;
    const r20 = x * z * oneMinusCosine + y * s;
    const r21 = y * z * oneMinusCosine - x * s;
    const r22 = zz + (1 - zz) * c;
    const m00 = m[0];
    const m01 = m[1];
    const m02 = m[2];
    const m03 = m[3];
    const m10 = m[4];
    const m11 = m[5];
    const m12 = m[6];
    const m13 = m[7];
    const m20 = m[8];
    const m21 = m[9];
    const m22 = m[10];
    const m23 = m[11];
    dst[0] = r00 * m00 + r01 * m10 + r02 * m20;
    dst[1] = r00 * m01 + r01 * m11 + r02 * m21;
    dst[2] = r00 * m02 + r01 * m12 + r02 * m22;
    dst[3] = r00 * m03 + r01 * m13 + r02 * m23;
    dst[4] = r10 * m00 + r11 * m10 + r12 * m20;
    dst[5] = r10 * m01 + r11 * m11 + r12 * m21;
    dst[6] = r10 * m02 + r11 * m12 + r12 * m22;
    dst[7] = r10 * m03 + r11 * m13 + r12 * m23;
    dst[8] = r20 * m00 + r21 * m10 + r22 * m20;
    dst[9] = r20 * m01 + r21 * m11 + r22 * m21;
    dst[10] = r20 * m02 + r21 * m12 + r22 * m22;
    dst[11] = r20 * m03 + r21 * m13 + r22 * m23;
    if (m !== dst) {
      dst[12] = m[12];
      dst[13] = m[13];
      dst[14] = m[14];
      dst[15] = m[15];
    }
    return dst;
  }
  var rotate = axisRotate;
  function scaling(v, dst) {
    dst = dst || new MatType(16);
    dst[0] = v[0];
    dst[1] = 0;
    dst[2] = 0;
    dst[3] = 0;
    dst[4] = 0;
    dst[5] = v[1];
    dst[6] = 0;
    dst[7] = 0;
    dst[8] = 0;
    dst[9] = 0;
    dst[10] = v[2];
    dst[11] = 0;
    dst[12] = 0;
    dst[13] = 0;
    dst[14] = 0;
    dst[15] = 1;
    return dst;
  }
  function scale$2(m, v, dst) {
    dst = dst || new MatType(16);
    const v0 = v[0];
    const v1 = v[1];
    const v2 = v[2];
    dst[0] = v0 * m[0 * 4 + 0];
    dst[1] = v0 * m[0 * 4 + 1];
    dst[2] = v0 * m[0 * 4 + 2];
    dst[3] = v0 * m[0 * 4 + 3];
    dst[4] = v1 * m[1 * 4 + 0];
    dst[5] = v1 * m[1 * 4 + 1];
    dst[6] = v1 * m[1 * 4 + 2];
    dst[7] = v1 * m[1 * 4 + 3];
    dst[8] = v2 * m[2 * 4 + 0];
    dst[9] = v2 * m[2 * 4 + 1];
    dst[10] = v2 * m[2 * 4 + 2];
    dst[11] = v2 * m[2 * 4 + 3];
    if (m !== dst) {
      dst[12] = m[12];
      dst[13] = m[13];
      dst[14] = m[14];
      dst[15] = m[15];
    }
    return dst;
  }
  function uniformScaling(s, dst) {
    dst = dst || new MatType(16);
    dst[0] = s;
    dst[1] = 0;
    dst[2] = 0;
    dst[3] = 0;
    dst[4] = 0;
    dst[5] = s;
    dst[6] = 0;
    dst[7] = 0;
    dst[8] = 0;
    dst[9] = 0;
    dst[10] = s;
    dst[11] = 0;
    dst[12] = 0;
    dst[13] = 0;
    dst[14] = 0;
    dst[15] = 1;
    return dst;
  }
  function uniformScale(m, s, dst) {
    dst = dst || new MatType(16);
    dst[0] = s * m[0 * 4 + 0];
    dst[1] = s * m[0 * 4 + 1];
    dst[2] = s * m[0 * 4 + 2];
    dst[3] = s * m[0 * 4 + 3];
    dst[4] = s * m[1 * 4 + 0];
    dst[5] = s * m[1 * 4 + 1];
    dst[6] = s * m[1 * 4 + 2];
    dst[7] = s * m[1 * 4 + 3];
    dst[8] = s * m[2 * 4 + 0];
    dst[9] = s * m[2 * 4 + 1];
    dst[10] = s * m[2 * 4 + 2];
    dst[11] = s * m[2 * 4 + 3];
    if (m !== dst) {
      dst[12] = m[12];
      dst[13] = m[13];
      dst[14] = m[14];
      dst[15] = m[15];
    }
    return dst;
  }
  var mat4Impl = /* @__PURE__ */ Object.freeze({
    __proto__: null,
    setDefaultType: setDefaultType$3,
    create: create$2,
    set: set$2,
    fromMat3,
    fromQuat,
    negate: negate$1,
    copy: copy$2,
    clone: clone$2,
    equalsApproximately: equalsApproximately$2,
    equals: equals$2,
    identity: identity$1,
    transpose,
    inverse: inverse$2,
    determinant,
    invert: invert$1,
    multiply: multiply$2,
    mul: mul$2,
    setTranslation,
    getTranslation,
    getAxis,
    setAxis,
    getScaling,
    perspective,
    ortho,
    frustum,
    aim,
    cameraAim,
    lookAt,
    translation,
    translate,
    rotationX,
    rotateX: rotateX$1,
    rotationY,
    rotateY: rotateY$1,
    rotationZ,
    rotateZ: rotateZ$1,
    axisRotation,
    rotation,
    axisRotate,
    rotate,
    scaling,
    scale: scale$2,
    uniformScaling,
    uniformScale
  });

  // example.js
  function dft(inputData = new Float32Array(), outputData = [], outp3 = mat2x2(vec2(1, 1), vec2(1, 1)), outp4 = "i32", outp5 = vec3(1, 2, 3), outp6 = [vec2(1, 1)]) {
    function add(a = vec2f(0, 0), b2 = vec2f(0, 0)) {
      return a + b2;
    }
    let x = new Float32Array(32);
    let x2 = new Array(32).fill(inputData[0]);
    const x3 = [1, 2, 3];
    let x4 = new Array(100).fill(vec3(0, 0, 0));
    let x5 = new Array(100).fill(mat2x2(vec2(1, 1), vec2(1, 1)));
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
    const N = i32(inputData.length);
    const k = threadId.x;
    let sum = vec2f(0, 0);
    var sum2 = add(sum, sum);
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
  function setupWebGPUConverterUI(fn, target = document.body, shaderType, lastBinding, vbos) {
    let webGPUCode = WGSLTranspiler.convertToWebGPU(
      fn,
      shaderType,
      void 0,
      void 0,
      vbos,
      void 0,
      void 0,
      lastBinding
    );
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
    document.getElementById(beforeTextAreaID).oninput = () => {
      parseFunction();
    };
    return { uniqueID, webGPUCode };
  }
  var ex1Id = setupWebGPUConverterUI(dft, document.getElementById("ex1"), "compute");
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
            document.getElementById("t1_" + ex1Id.uniqueID).value = pipeline.compute.code;
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
  var ex12Id1 = setupWebGPUConverterUI(vertexExample, document.getElementById("ex2"), "vertex", void 0, [{ color: "vec4f" }]);
  var ex12Id2 = setupWebGPUConverterUI(fragmentExample, document.getElementById("ex2"), "fragment", ex12Id1.lastBinding, [{ color: "vec4f" }]);
  setTimeout(() => {
    console.time("createRenderPipeline and render triangle");
    WebGPUjs.createPipeline({
      vertex: vertexExample,
      fragment: fragmentExample
    }, {
      canvas,
      renderPass: {
        vertexCount: 3,
        vbos: [
          {
            color: "vec4f"
          }
        ]
      }
    }).then((pipeline) => {
      console.timeEnd("createRenderPipeline and render triangle");
      console.log(pipeline);
    });
  }, 500);
  function cubeExampleVert(modelViewProjectionMatrix = "mat4x4<f32>") {
    position = modelViewProjectionMatrix * vertexIn;
    uv = uvIn;
    vertex = 0.5 * (vertexIn + vec4f(1, 1, 1, 1));
    color = colorIn;
  }
  function cubeExampleFrag() {
    return textureSample(image, imgSampler, uv) * color;
  }
  var createImageExample = async () => {
    const response = await fetch("./knucks.jpg");
    let data = await response.blob();
    console.log(data);
    const imageBitmap = await createImageBitmap(data);
    const textureData = {
      source: imageBitmap,
      texture: {},
      //overrides to texture settings //mipLevelCount:numMipLevels(imageBitmap.width, imageBitmap.height)
      layout: { flipY: true }
    };
    let canv2 = document.createElement("canvas");
    canv2.width = 800;
    canv2.height = 600;
    document.getElementById("ex3").appendChild(canv2);
    const vbos = [
      //we can upload vbos
      {
        //named variables for this VBO that we will upload in interleaved format (i.e. [pos vec4 0,color vec4 0,uv vec2 0,norm vec3 0, pos vec4 1, ...])
        vertex: "vec4f",
        color: "vec4f",
        uv: "vec2f"
        //normal:'vec3f'
      }
      //the shader system will set the draw call count based on the number of rows (assumed to be position4,color4,uv2,normal3 or vertexCount = len/13) in the vertices of the first supplied vbo
    ];
    let ex3Id1 = setupWebGPUConverterUI(cubeExampleVert, document.getElementById("ex3"), "vertex", void 0, vbos);
    let ex3Id2 = setupWebGPUConverterUI(cubeExampleFrag, document.getElementById("ex3"), "fragment", ex3Id1.webGPUCode.lastBinding, vbos);
    const aspect = canv2.width / canv2.height;
    const projectionMatrix = mat4Impl.perspective(
      2 * Math.PI / 5,
      aspect,
      1,
      100
    );
    const modelViewProjectionMatrix = mat4Impl.create();
    function getTransformationMatrix() {
      const viewMatrix = mat4Impl.identity();
      mat4Impl.translate(viewMatrix, vec3Impl.fromValues(0, 0, -4), viewMatrix);
      const now = Date.now() / 1e3;
      mat4Impl.rotate(
        viewMatrix,
        vec3Impl.fromValues(Math.sin(now), Math.cos(now), 0),
        1,
        viewMatrix
      );
      mat4Impl.multiply(projectionMatrix, viewMatrix, modelViewProjectionMatrix);
      return modelViewProjectionMatrix;
    }
    let transformationMatrix = getTransformationMatrix();
    console.time("createRenderPipeline and render texture");
    WebGPUjs.createPipeline({
      vertex: cubeExampleVert,
      fragment: cubeExampleFrag
    }, {
      canvas: canv2,
      renderPass: {
        //tell it to make an initial render pass with these inputs
        vertexCount: cubeVertices.length / 10,
        vbos: [
          //we can upload vbos
          {
            //named variables for this VBO that we will upload in interleaved format (i.e. [pos vec4 0,color vec4 0,uv vec2 0,norm vec3 0, pos vec4 1, ...])
            vertex: "vec4f",
            color: "vec4f",
            uv: "vec2f"
            //normal:'vec3f'
          }
          //the shader system will set the draw call count based on the number of rows (assumed to be position4,color4,uv2,normal3 or vertexCount = len/13) in the vertices of the first supplied vbo
        ],
        textures: {
          image: textureData
          //corresponds to the variable which is defined implicitly by usage with texture calls
        },
        indexBuffer: cubeIndices,
        indexFormat: "uint16"
      },
      // bindings:{ //binding overrides (assigned to our custom-generated layout)
      //     image:{
      //         texture:{viewDimension:'2d', sampleType:'float'} 
      //     }
      // },
      //overrides for pipeline descriptor will be assigned so you can add or rewrite what you need over the defaults
      renderPipelineDescriptor: { primitive: { topology: "triangle-list", cullMode: "back" } },
      //additional render or compute pass inputs (just the UBO update in this case)
      inputs: [transformationMatrix]
      //placeholder mat4 projection matrix (copy wgsl-matrix library example from webgpu samples)
    }).then((pipeline) => {
      console.timeEnd("createRenderPipeline and render texture");
      console.log(pipeline);
      pipeline.fragment.updateVBO(cubeVertices, 0);
      let now = performance.now();
      let fps = [];
      let fpsticker = document.getElementById("ex3fps");
      let anim = () => {
        let time = performance.now();
        let f = 1e3 / (time - now);
        fps.push(f);
        let frameTimeAvg = fps.reduce((a, b) => a + b) / fps.length;
        fpsticker.innerText = frameTimeAvg.toFixed(1);
        if (fps.length > 10) fps.shift();
        now = time;
        transformationMatrix = getTransformationMatrix();
        pipeline.render({
          vertexCount: cubeVertices.length / 10
          // pos vec4, color vec4, uv vec2, normal vec3
        }, transformationMatrix);
        requestAnimationFrame(anim);
      };
      anim();
    });
  };
  createImageExample();
  function boidsCompute(particles = "array<vec2f>", deltaT = 0.04, rule1Distance = 0.1, rule2Distance = 0.025, rule3Distance = 0.025, rule1Scale = 0.02, rule2Scale = 0.05, rule3Scale = 5e-3) {
    let index = i32(threadId.x * 2);
    var pPos = particles[index];
    var pVel = particles[index + 1];
    var plen = i32(f32(particles.length) * 0.5);
    var cMass = vec2f(0, 0);
    var cVel = vec2f(0, 0);
    var colVel = vec2f(0, 0);
    var cMassCount = 0;
    var cVelCount = 0;
    for (let i = 0; i < plen; i++) {
      if (i == index) {
        continue;
      }
      let j = i * 2;
      var pos = particles[j];
      var vel = particles[j + 1];
      if (distance(pos, pPos) < rule1Distance) {
        cMass += pos;
        cMassCount++;
      }
      if (distance(pos, pPos) < rule2Distance) {
        colVel -= pos - pPos;
      }
      if (distance(pos, pPos) < rule3Distance) {
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
    pVel += cMass * rule1Scale + colVel * rule2Scale + cVel * rule3Scale;
    pVel = normalize(pVel) * clamp(length(pVel), 0, 0.1);
    pPos = pPos + pVel * deltaT;
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
    particles[index] = pPos;
    particles[index + 1] = pVel;
  }
  function boidsVertex() {
    let angle = -atan2(vVelIn.x, vVelIn.y);
    let pos = vec2(
      a_posIn.x * cos(angle) - a_posIn.y * sin(angle),
      a_posIn.x * sin(angle) + a_posIn.y * cos(angle)
    );
    position = vec4f(pos + vPosIn, 0, 1);
    color = vec4f(
      1 - sin(angle + 1) - vVelIn.y,
      pos.x * 100 - vVelIn.y + 0.1,
      vVelIn.x + cos(angle + 0.5),
      1
    );
  }
  function boidsFragment() {
    return color;
  }
  var canvas3 = document.createElement("canvas");
  canvas3.width = 500;
  canvas3.height = 500;
  var numParticles = 1500;
  WebGPUjs.createPipeline({
    compute: boidsCompute,
    vertex: boidsVertex,
    fragment: boidsFragment
  }, {
    canvas: canvas3,
    workGroupSize: 64,
    computePass: {
      workgroupsX: numParticles / 64
    },
    renderPass: {
      //tell it to make an initial render pass with these inputs
      vbos: [
        //we can upload vbos
        {
          vVel: "vec2f",
          vPos: "vec2f",
          stepMode: "instance"
          //speeds up rendering, can execute vertex and instance counts with different values
        },
        {
          a_pos: "vec2f"
        },
        {
          color: "vec4f"
        }
      ]
    },
    // bindings:{ //binding overrides (assigned to our custom-generated layout)
    //     image:{
    //         texture:{viewDimension:'2d', sampleType:'float'} 
    //     }
    // },
    //overrides for pipeline descriptor will be assigned so you can add or rewrite what you need over the defaults
    renderPipelineDescriptor: { primitive: { topology: "triangle-list" } }
    //additional render or compute pass inputs (just the UBO update in this case)
  }).then((pipeline) => {
    console.log(
      "Boids pipeline",
      pipeline,
      pipeline.compute.code,
      pipeline.fragment.code,
      pipeline.vertex.code
    );
    const particleBuffer = new Float32Array(numParticles * 4);
    for (let i = 0; i < numParticles; i += 4) {
      particleBuffer[i] = Math.random();
      particleBuffer[i + 1] = Math.random();
    }
    pipeline.compute.buffer(
      void 0,
      particleBuffer,
      //also include uniforms
      0.04,
      //deltaT
      0.1,
      //rule1Distance
      0.025,
      //rule2Distance
      0.025,
      //rule3Distance
      0.02,
      //rule1Scale
      0.05,
      //rule2Scale
      5e-3
      //rule3Scale
    );
    pipeline.fragment.updateVBO(
      pipeline.compute.bufferGroup.inputBuffers[0],
      0
    );
    pipeline.fragment.updateVBO(
      new Float32Array([
        -0.01,
        -0.02,
        0.01,
        -0.02,
        0,
        0.02
      ]),
      1
    );
    pipeline.fragment.updateVBO(
      new Float32Array([
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0
      ]),
      2
    );
    pipeline.process();
    pipeline.render({
      vertexCount: 3,
      instanceCount: numParticles
    });
  });
})();
