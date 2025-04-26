import { gctx } from "src/context";
import { setPanelContent } from "src/editor/editor";
import { parser } from "src/language/grammar/otl_parser";
import { TVisitorBase, Visitors } from "src/language/visitors";
import { FileSpec, Module, ModuleManagerSync } from "src/utilities/module_manager_sync";

export class Interpreter extends ModuleManagerSync {
    extensions = ["otl"];

    public runCode(code: string, visitor: TVisitorBase) {
        let tree = parser.parse(code);
        let node = tree.topNode;
        if (!node) return null;

        let lint = visitor.lint(node, { interpreter: this, input: code });
        if (lint.hasErrors) return null;

        return visitor.run(node, { interpreter: this, input: code });
    }

    public evaluateModule(file: FileSpec, mod: Module): boolean {
        if (file.source === null || file.source === undefined) {
            setPanelContent(`Importing ${this.activeModule?.file.path} failed...`);
            return false;
        }

        setPanelContent(`Importing ${this.activeModule?.file.path}...`);
        let tree = parser.parse(file.source);

        let lint = Visitors.File.lint(tree.topNode, { interpreter: this });
        if (lint.hasErrors) {
            mod.error = lint.diagnostics.map((d) => `${file.path}:${d.from}-${d.to}: ${d.message}`).join("\n");
        }
        let types = Visitors.File.run(tree.topNode, { interpreter: this });

        if (types == null) {
            setPanelContent(`Importing ${this.activeModule?.file.path} failed...`);
            return false;
        }
        mod.env = types;
        setPanelContent(`Importing ${this.activeModule?.file.path} succeeded...`);
        return true;
    }

    protected onAfterImport(fileName: string): void {
        if (fileName == gctx.plugin.settings.schemaPath) {
            gctx.graph.clear();
            let mainModule = this.modules[fileName];
            for (let key in mainModule.env) {
                gctx.graph.add(mainModule.env[key]);
            }
            gctx.noteCache.invalidateAll();
            gctx.app.metadataCache.trigger("typing:schema-change");
        }
    }

    protected onAfterPreload(): void {
        this.importModule(gctx.plugin.settings.schemaPath, undefined, true);
        gctx.graph.isReady = true;
        gctx.noteCache.invalidateAll();
        gctx.app.metadataCache.trigger("typing:schema-ready");
    }
}
