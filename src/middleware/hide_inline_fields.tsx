import { MarkdownPostProcessorContext, Plugin } from "obsidian";
import { gctx } from "src/context";
import TypingPlugin from "src/main";
import { FieldSearchResult, regexField } from "./field_accessor";

export function hideInlineFields(plugin: Plugin) {
    return async function (el: HTMLElement, ctx: MarkdownPostProcessorContext) {
        if (!gctx.graph.isReady) {
            await new Promise((resolve) => {
                plugin.registerEvent(
                    gctx.app.metadataCache.on("typing:schema-ready", () => {
                        resolve(true);
                    })
                );
            });
        }
        let note = gctx.api.note(ctx.sourcePath);
        let hideSetting = note.type?.style?.hide_inline_fields;
        if (!hideSetting || hideSetting == "none") return;

        let parNodes = el.querySelectorAll("p");
        for (let i = 0; i < parNodes.length; i++) {
            let par = parNodes[i];
            let parChildren = par.childNodes;
            let childrenToRemove: Array<Node> = [];
            for (let j = 0; j < parChildren.length; j++) {
                let child = parChildren[j];
                // NOTE: text node
                if (child.nodeType == 3 && child.textContent) {
                    let match = regexField.exec(child.textContent) as FieldSearchResult["match"];
                    if (
                        match &&
                        (hideSetting == "all" ||
                            (hideSetting == "defined" && note.type?.fields[match?.groups?.field] != null))
                    )
                        for (let k = j; k < parChildren.length; k++) {
                            childrenToRemove.push(parChildren[k]);
                            if (parChildren[k].nodeName == "BR") {
                                break;
                            }
                        }
                }
            }
            for (let child of childrenToRemove) {
                par.removeChild(child);
            }
        }
    };
}

export function registerInlineFieldsHider(plugin: TypingPlugin) {
    plugin.registerMarkdownPostProcessor(hideInlineFields(plugin));
}
