import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { preserveShaderSources } from "./scripts/shader-sources.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const shared = {
  absWorkingDir: root,
  target: "es2022",
  includeDefaultPlugins: false,
  minify: true,
};

export default {
  bundler: [
    {
      ...shared,
      entryPoints: ["src/esbuild-plugin.mjs"],
      outfile: "dist/esbuild.js",
      bundleBrowser: true,
      format: "esm",
      platform: "node",
      plugins: [
        {
          name: "plugin-types",
          setup(build) {
            build.onEnd(async (result) => {
              if (!result.errors.length) {
                await mkdir(new URL("./dist/", import.meta.url), {
                  recursive: true,
                });
                await copyFile(
                  new URL("./src/esbuild-plugin.d.ts", import.meta.url),
                  new URL("./dist/esbuild.d.ts", import.meta.url),
                );
              }
            });
          },
        },
      ],
    },
    {
      ...shared,
      entryPoints: ["index.ts"],
      outfile: "dist/webgpujs",
      bundleBrowser: true,
      bundleESM: true,
      bundleTypes: true,
      globals: { "index.ts": ["WebGPUjs"] },
    },
    {
      ...shared,
      entryPoints: [
        "example/example.js",
        "example/editor.js",
        "example/standalone.js",
        "example/verify.js",
        "example/external-texture.js",
      ],
      outdir: "example/dist",
      // Keep the filenames used by the HTML pages while emitting ES modules.
      bundleBrowser: true,
      format: "esm",
      plugins: [preserveShaderSources],
      loader: { ".jpg": "file" },
    },
  ],
  server: {
    root: fileURLToPath(new URL("./example/", import.meta.url)),
    host: "localhost",
    port: 8080,
    startpage: "index.html",
    routes: {
      "/example": { redirect: "/" },
      "/example/": { redirect: "/" },
      "/example/:page": (request, response) => {
        const url = new URL(request.url, "http://localhost");
        const page = url.pathname.slice("/example".length);
        response.writeHead(302, {
          Location: (page === "/index.html" ? "/" : page) + url.search,
        });
        response.end();
        return true;
      },
    },
    hotreload: true,
    ignore: [".temp", ".tinybuild", "docs", "README.md", "WEBGPU-COVERAGE.md"],
  },
};
