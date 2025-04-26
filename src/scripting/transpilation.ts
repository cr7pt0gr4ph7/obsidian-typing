import { PluginItem, PluginObj, TransformOptions } from "@babel/core";
import { availablePlugins, transform } from "@babel/standalone";
import { customImportExportTransform } from "./transform";

const transformReactJSX = availablePlugins["transform-react-jsx"];
const transformModulesCommonJS = availablePlugins["transform-modules-commonjs"];

export interface TranspilationError {
    message: string;
    stack?: string;
}

export type TranspilationResult = {
    code?: string;
    errors?: Array<TranspilationError>;
};

const removeUseStrict: PluginObj = {
    visitor: {
        Directive(path) {
            if (path.node.value.value === "use strict") {
                path.remove();
            }
        },
    },
};

const DEFAULT_PLUGINS: PluginItem[] = [
    [transformReactJSX, { pragma: "h", pragmaFrag: "Fragment" }],
    transformModulesCommonJS,
    removeUseStrict,
];

const DEFAULT_PARSER_OPTS: TransformOptions["parserOpts"] = {
    allowReturnOutsideFunction: true,
    allowImportExportEverywhere: true,
    // allowAwaitOutsideFunction: true, TODO: do we need it?
};

const DEFAULT_TRANSPILE_OPTIONS: TransformOptions = {
    plugins: [
        customImportExportTransform({ ctxObject: "api", importFunction: "_import_explicit" }),
        ...DEFAULT_PLUGINS,
    ],
    parserOpts: DEFAULT_PARSER_OPTS,
    filename: "file.tsx",
};

const MODULE_TRANSPILE_OPTIONS: TransformOptions = DEFAULT_TRANSPILE_OPTIONS;

const FUNCTION_TRANSPILE_OPTIONS: TransformOptions = {
    plugins: [
        customImportExportTransform({ ctxObject: "__ctx", importFunction: "_import_explicit" }),
        ...DEFAULT_PLUGINS,
    ],
    parserOpts: DEFAULT_PARSER_OPTS,
    filename: "file.tsx",
};

export function transpile(source: string, options: TransformOptions = DEFAULT_TRANSPILE_OPTIONS): TranspilationResult {
    try {
        let result = transform(source, options);
        return { code: result.code };
    } catch (e) {
        return {
            errors: [{ message: e.message, stack: e.stack }],
        };
    }
}

export function transpileModule(source: string) {
    return transpile(source, MODULE_TRANSPILE_OPTIONS);
}

export function transpileFunction(source: string) {
    return transpile(source, FUNCTION_TRANSPILE_OPTIONS);
}

export function compileModuleWithContext(
    code: string,
    context: Record<string, any> = {},
    options: { transpile: boolean; filename?: string } = { transpile: true }
): Record<string, any> {
    if (options.transpile) {
        let transpiled = transpileModule(code);
        if (transpiled.errors != null) {
            throw transpiled.errors[0];
        }
        code = transpiled.code;
    }

    const exports = {};
    const module = { exports };

    const contextNames = Object.keys(context);

    // Use Function constructor to create a function
    const createModule = new Function(
        "exports",
        "module",
        ...contextNames,
        `${code}\n//# sourceURL=${options.filename}`
    );

    // Run the function to populate the exports object
    createModule(exports, module, ...contextNames.map((name) => context[name]));

    const result = { ...exports, ...module.exports };

    return result;
}

export function compileFunctionWithContext(
    code: string,
    context: Record<string, any> = {},
    args: string[] = ["ctx", "note"],
    options: { transpile: boolean } = { transpile: true }
): (Function & { message?: undefined }) | TranspilationError {
    if (options.transpile) {
        let transpiled = transpileFunction(code);
        if (transpiled.errors) {
            return transpiled.errors[0];
        }
        code = transpiled.code;
    }

    const contextNames = Object.keys(context);

    const fn = new Function(...contextNames, ...args, code);

    try {
        return partial(fn, ...contextNames.map((name) => context[name]));
    } catch (e) {
        return { message: e.message };
    }
}

function partial(fn: Function, ...args: any[]) {
    return function (...newArgs: any[]) {
        return fn.apply(null, args.concat(newArgs));
    };
}
