export type ShaderSourcePluginOptions = {
  /** Files containing shader exports; defaults to shaders.js and *.shaders.js. */
  filter?: RegExp;
  /** Limit conversion to these exported names. Use "default" for the default export. */
  exports?: readonly string[];
};
/** Compatible with esbuild's Plugin interface without a runtime esbuild dependency. */
export declare function preserveShaderSources(
  options?: ShaderSourcePluginOptions,
): {
  name: string;
  setup(build: {
    onLoad(
      options: { filter: RegExp },
      callback: (args: {
        path: string;
      }) => Promise<{ contents: string; loader: "js" }>,
    ): void;
  }): void;
};
