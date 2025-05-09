import { Plugin, TFile, Vault } from "obsidian";
import { dirname, join, normalize } from "path-browserify";
import { DependencyGraph } from "src/utilities/dependency_graph";

export type FilePath = string;

export interface FileSpec {
    source: string;
    path: FilePath;
    // hash: string;
}

export type FailedModule<T> = {
    error: string;
    env?: T;
    file?: FileSpec;
};

export type LoadedModule<T> = {
    error?: undefined;
    env: T;
    file: FileSpec;
};

export type Module<T> = FailedModule<T> | LoadedModule<T>;

interface StackFrame<T> {
    module: Module<T> & { file: FileSpec };
}

export interface ImportStatusListener {
    onImportStarted(path: FilePath): void;
    onImportFailed(path: FilePath): void;
    onImportCompleted(path: FilePath): void;
}

const RELATIVE_PATH_REGEX = /^\.\.?($|\/)/;

export abstract class ModuleManagerSync<T = any> {
    protected modules: Record<FilePath, Module<T>>;
    protected files: Record<FilePath, FileSpec>;
    protected dependencyGraph: DependencyGraph<FilePath>;
    protected callStack: StackFrame<T>[] = [];

    public readonly extensions: string[] = [];

    constructor(private vault: Vault, private plugin: Plugin, private statusReport?: ImportStatusListener) {
        this.modules = {};
        this.files = {};
        this.dependencyGraph = new DependencyGraph();
    }

    public importSmart(path: FilePath, basePath?: FilePath) {
        // Determine the base directory for relative paths
        basePath = basePath ?? this.currentFrame?.module?.file.path;
        if (basePath) {
            basePath = dirname(basePath);
        } else {
            basePath = "";
        }

        // Resolve relative paths from base directory
        if (RELATIVE_PATH_REGEX.exec(path)) {
            let newPath = normalize(join(basePath, path));
            path = newPath;
        }

        // Attempt to find a matching file with the proper file extension
        // if path does not already contain a file extension.
        if (!this.extensions.some((ext) => path.endsWith("." + ext))) {
            for (let ext of this.extensions) {
                let result = this.importModule(path + "." + ext);
                if (result !== null) return result;
            }
            for (let ext of this.extensions) {
                let result = this.importModule(path + "/index" + "." + ext);
                if (result !== null) return result;
            }
        }

        // Try to import from the path as specified
        return this.importModule(path);
    }

    public importModule(path: FilePath, source?: string, forceReload: boolean = false): Module<T> | null {
        for (let frame of this.callStack) {
            if (frame.module.file.path == path) {
                return { error: `Recursive import: ${path}` };
            }
        }
        this.onBeforeImport(path);

        const importerModule = this.activeModule;
        if (importerModule) {
            this.dependencyGraph.addDependency(importerModule.file.path, path);
        }

        // TODO: was commented out
        if (!forceReload && path in this.modules && (source === null || source === undefined)) {
            return this.modules[path];
        }

        let file = source === null || source === undefined ? this.getFile(path) : { source, path };
        if (!file) {
            return null;
        }

        // The expression below is used to make the TypeScript compiler
        // "forget" the const values and fix type inference.
        const module = ((x: StackFrame<T>["module"]) => x)({ env: {} as T, file })

        this.enterFrame({ module });

        this.modules[path] = module;

        let success = false;

        try {
            this.statusReport?.onImportStarted(path);

            success = this.evaluateModule(file, module);

            if (!success) {
                this.statusReport?.onImportFailed(path);
            } else {
                this.statusReport?.onImportCompleted(path);
            }
        } catch (e) {
            this.exitFrame();
            return { error: `Unexpected error: ${e}`};
        }

        if (!success) {
            this.exitFrame();
            if (module.error) return { error: module.error };
            return null;
        }

        if (source != null) {
            this.setFile(file);
        }

        this.exitFrame();
        this.onAfterImport(path);
        return module;
    }

    public async setup() {
        await this.setupFileWatcher();
    }

    private enterFrame(frame: StackFrame<T>) {
        this.callStack.push(frame);
    }

    private exitFrame() {
        this.callStack.pop();
    }

    get currentFrame() {
        return this.callStack.length ? this.callStack[this.callStack.length - 1] : null;
    }

    get activeModule() {
        return this.currentFrame?.module;
    }

    private getFile(path: FilePath): FileSpec {
        return this.files[path];
    }

    private setFile({ source, path }: FileSpec) {
        this.files[path] = { source, path };
    }

    protected async unloadModule(path: FilePath) {
        delete this.files[path];
        delete this.modules[path];
        this.onModuleUpdate(path);
        this.reloadDependents(path);
        this.onAfterReload(path);
    }

    protected async reloadModule(path: FilePath) {
        let file = await this.loadFile(path);
        this.setFile({ source: file ?? "", path });

        // TODO: was removed to not fail when new files are created
        if (path in this.modules) {
            this.onBeforeReload(path);
            this.importModule(path, undefined, true);
            this.onModuleUpdate(path);
        }

        this.reloadDependents(path);
        this.onAfterReload(path);
    }

    protected reloadDependents(path: FilePath): void {
        const dependents = this.dependencyGraph.getDependents(path);
        if (dependents) {
            for (const dependent of dependents) {
                this.reloadModule(dependent);
            }
        }
    }

    protected abstract evaluateModule(file: FileSpec, mod: Module<T>): mod is LoadedModule<T>;

    protected async loadFile(path: FilePath): Promise<string | null> {
        let tfile = this.vault.getAbstractFileByPath(path);
        if (!(tfile instanceof TFile)) {
            return null;
        }
        return await this.vault.read(tfile);
    }

    protected preloadFiles = async () => {
        for (let { path } of this.vault.getFiles()) {
            if (this.shouldRead(path)) {
                await this.reloadModule(path);
            }
        }
        this.onAfterPreload();
    };

    protected async setupFileWatcher() {
        this.plugin.app.workspace.onLayoutReady(this.preloadFiles);
        this.plugin.registerEvent(
            this.vault.on("modify", async ({ path }) => {
                if (this.shouldRead(path)) {
                    this.reloadModule(path);
                }
            })
        );
        this.plugin.registerEvent(
            this.vault.on("rename", async ({ path }, oldPath) => {
                if (this.shouldRead(oldPath)) {
                    this.unloadModule(oldPath);
                }
                if (this.shouldRead(path)) {
                    this.reloadModule(path);
                }
            })
        );
        this.plugin.registerEvent(
            this.vault.on("create", async ({ path }) => {
                if (this.shouldRead(path)) {
                    this.reloadModule(path);
                }
            })
        );
        this.plugin.registerEvent(
            this.vault.on("delete", async ({ path }) => {
                if (this.shouldRead(path)) {
                    this.unloadModule(path);
                }
            })
        );
    }

    protected shouldRead(path: FilePath): boolean {
        return this.extensions.some((ext) => path.endsWith("." + ext));
    }

    protected onAfterPreload(): void { }
    protected onModuleUpdate(path: FilePath): void { }
    protected onBeforeImport(path: FilePath): void { }
    protected onAfterImport(path: FilePath): void { }
    protected onBeforeReload(path: FilePath): void { }
    protected onAfterReload(path: FilePath): void { }
}
