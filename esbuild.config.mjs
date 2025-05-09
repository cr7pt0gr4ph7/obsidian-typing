import builtins from "builtin-modules";
import esbuild from "esbuild";
import { postcssModules, sassPlugin } from "esbuild-sass-plugin";
import fs from "fs";
import process from "process";
import { lezerPlugin } from "./esbuild-lezer-plugin.mjs";
import { scssTypesPlugin } from "./esbuild-scss-types-plugin.mjs";

const banner = `/*
THIS IS A GENERATED/BUNDLED FILE BY ESBUILD
if you want to view the source, please visit the github repository of this plugin
*/
`;

const prod = process.argv[2] === "production";

/**
 * Renames `main.css(.map)` to `styles.css(.map)` in build dir
 *
 * @type {esbuild.Plugin}
 */
const renameCompiledCSS = {
    name: "rename-compiled-css",
    setup(build) {
        build.onEnd(() => {
            const { outfile } = build.initialOptions;
            const outCssSrc = outfile.replace(/\.js$/, ".css");
            const outCssDst = outfile.replace(/main\.js$/, "styles.css");
            if (fs.existsSync(outCssSrc)) {
                console.log(`RENAME COMPILED CSS: ${outCssSrc} -> ${outCssDst}`);
                fs.renameSync(outCssSrc, outCssDst);
            }
            const outCssMapSrc = `${outCssSrc}.map`;
            const outCssMapDst = `${outCssDst}.map`;;
            if (fs.existsSync(outCssMapSrc)) {
                console.log(`RENAME COMPILED CSS SOURCE MAP: ${outCssMapSrc} -> ${outCssMapDst}`);
                fs.renameSync(outCssMapSrc, outCssDst);
            }
        });
    },
};

/**
 * Copies `manifest.json` to build directory.
 *
 * @type {esbuild.Plugin}
 */
const copyManifest = {
    name: "copy-manifest",
    setup(build) {
        build.onEnd(() => {
            const { outfile } = build.initialOptions;
            const manifestSrc = "manifest.json";
            const manifestDst = outfile.replace(/main\.js$/, "manifest.json");
            if (fs.existsSync(manifestSrc)) {
                console.log(`COPY MANIFEST: ${manifestSrc} -> ${manifestDst}`);
                fs.copyFileSync(manifestSrc, manifestDst);
            }
        });
    },
};

/**
 * @type {esbuild.BuildContext}
 */
const context = await esbuild.context({
    banner: {
        js: banner,
    },
    tsconfig: "tsconfig.main.json",
    entryPoints: ["src/main.tsx"],
    bundle: true,
    external: [
        "obsidian",
        "electron",
        // "@codemirror/autocomplete",
        "@codemirror/collab",
        // "@codemirror/commands",
        "@codemirror/language",
        // "@codemirror/lint",
        "@codemirror/search",
        "@codemirror/state",
        "@codemirror/view",
        "@lezer/common",
        "@lezer/highlight",
        "@lezer/lr",
        ...builtins,
    ],
    format: "cjs",
    target: "es6",
    logLevel: "info",
    // sourcemap: prod ? false : "inline",
    sourcemap: true,
    metafile: false,
    // minifyWhitespace: true,
    // ref: https://github.com/mgmeyers/obsidian-kanban/blob/05e43e09100f8c8efd7a4cd5ccb391b850e65f28/esbuild.config.js#L129C8-L129C8
    inject: ["src/preact-globals.ts"],
    treeShaking: true,
    outfile: "build/main.js",
    alias: {
        react: "preact/compat",
        "react-dom": "preact/compat",
    },
    plugins: [
        lezerPlugin("./src/language/grammar/otl.grammar", !prod),
        scssTypesPlugin("src/styles/**/*.scss", !prod),
        sassPlugin({
            basedir: ".",
            transform: postcssModules({
                localsConvention: "camelCaseOnly",
                // generateScopedName: "typing--[local]",
                generateScopedName: (name, filename, css) => {
                    console.log("gen scoped name", name, filename);
                    if (filename.includes("notranspile")) return name;
                    if (/^[A-Z]/.test(name)) {
                        // only prefix uppercase names
                        return `typing--${name.toLowerCase()}`;
                    }
                    return name;
                },
                // generateScopedName: "[name]__[local]",
            }),
            type: "css",
        }),
        renameCompiledCSS,
        copyManifest,
    ],
});

if (prod) {
    await context.rebuild();
    process.exit(0);
} else {
    await context.watch();
}
