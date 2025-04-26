import { Plugin, TFolder } from "obsidian";

export function registerFileCreationMenu(plugin: Plugin) {
    plugin.registerEvent(
        plugin.app.workspace.on("file-menu", (menu, file, source, _leaf) => {
            if (source != "file-explorer-context-menu") return;
            if (!(file instanceof TFolder)) return;
            for (let extension of ["otl", "js", "jsx", "ts", "tsx"]) {
                menu.addItem((item) => {
                    item.setTitle(`New .${extension} file`);
                    item.setSection("typing");
                    item.onClick(async () => {
                        let freeName;
                        let suffix = "";
                        let serial = 0;
                        do {
                            if (serial > 0) suffix = ` ${serial}`;
                            freeName = `${file.path}/Untitled${suffix}.${extension}`;
                            serial += 1;
                        } while (plugin.app.vault.getAbstractFileByPath(freeName) !== null);

                        let tfile = await plugin.app.vault.create(freeName, "");
                        plugin.app.workspace.getLeaf(false).openFile(tfile);
                    });
                });
            }
        })
    );
}
