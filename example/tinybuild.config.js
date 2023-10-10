const config = {
    bundler: { //esbuild settings, set false to skip build step or add bundle:true to config object to only bundle (alt methods)
        entryPoints: [ //entry point file(s). These can include .js, .mjs, .ts, .jsx, .tsx, or other javascript files. Make sure your entry point is a ts file if you want to generate types
            "examplets.js",
        ],
        outfile: "dist/example", //exit point file, will append .js as well as indicators like .esm.js, .node.js for other build flags
        //outdir:'dist'         //exit point folder, define for multiple entryPoints
        bundleBrowser: true, //create plain js build? Can include globals and init scripts
        bundleESM: false, //create esm module js files // { platform:'node' } //etc you can also supply an object here to add more specific esbuild settings
        bundleTypes: false, //create .d.ts files, //you need a .tsconfig for this to work
        bundleNode: false, //create node platform plain js build, specify platform:'node' to do the rest of the files 
        bundleHTML: false, //wrap the first entry point file as a plain js script in a boilerplate html file, frontend scripts can be run standalone like a .exe! Server serves this as start page if set to true.
        //bundleIIFE:false,   //create an iife build, this is compiled temporarily to create the types files and only saved with bundleIIFE:true
        //bundleCommonJS:false, //cjs format outputted as .cjs
        minify: false,
        sourcemap: false,
        //plugins:{} //custom esbuild plugins? e.g. esbuild-sass-plugin for scss support
        //includeDefaultPlugins:true //true by default, includes the presets for the streaming imports, worker bundling, and auto npm install
        //blobWorkers:true, //package workers as blobs or files? blobs are faster but inflate the main package size
        //workerBundler:{minifyWhitespace:true} //bundler settings specific to the worker. e.g. apply platform:'node' when bundling node workers, 
        //globalThis:null //'mymodule'
        //globals:{'webgpujs.js':['WebGPUjs']}
        //init:{'index.js':function(bundle) { console.log('prepackaged bundle script!', bundle); }.toString(); }      
        //  outputs:{ //overwrites main config settings for specific use cases
        //     node:{ //e.g. for bundleNode
        //     // external:[] //externals for node environment builds
        //     },
        //     //commonjs:{} //bundleCommonJS
        //     //browser:{}
        //     //esm:{}
        //     iife:{
        //     // external:[] //we only use the iife for types so it doesn't really matter if it bundles node, just note otherwise if you need iife for some obscure reason
        //     }
        // },
        
        //refer to esbuild docs for more settings
     },
    server: {  //node server settings, set false to skip server step or add serve:true to config object to only serve (alt methods)
        debug: false,
        protocol: "http",  //'http' or 'https'. HTTPS required for Nodejs <---> Python sockets. If using http, set production to False in python/server.py as well
        host: "localhost", //'localhost' or '127.0.0.1' etc.
        port: 8080, //e.g. port 80, 443, 8000
        //redirect: 'http://localhost:8082' //instead of serving the default content, redirect ot another url e.g. another server
        startpage: "index.html", //home page
        socket_protocol: "ws", //frontend socket protocol, wss for served, ws for localhost
        hotreload: 5001,  //hotreload websocket server port
        reloadscripts: false, //hot swap scripts, can break things if script handles initializations, otherwise css, link, srcs all hot swap without page reloading fairly intelligently
        //delay: 50, //millisecond delay on the watch command for hot reloading
        //pwa: "dist/service-worker.js",  //pwa mode? Injects service worker registry code in (see pwa README.md)
        watch: ['../'], //watch additional directories other than the current working directory
        python: false,//7000,  //quart server port (configured via the python server script file still)
        python_node:7001, //websocket relay port (relays messages to client from nodejs that were sent to it by python)
        errpage: 'node_modules/tinybuild/tinybuild/node_server/other/404.html', //default error page, etc.
        certpath:'node_modules/tinybuild/tinybuild/node_server/ssl/cert.pem',//if using https, this is required. See cert.pfx.md for instructions
        keypath:'node_modules/tinybuild/tinybuild/node_server/ssl/key.pem'//if using https, this is required. See cert.pfx.md for instructions
    }
}
export default config; //module.exports = config; //es5