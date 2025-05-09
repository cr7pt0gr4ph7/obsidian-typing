import { AnyVisitor, createVisitor, NodeType, Rules, Symbol, TChildrenBase } from "../index_base";

export const Scope = <R, C extends TChildrenBase, V extends AnyVisitor<{ Return: R, Children: C }>>(
    visitor: V,
    opts?: { shouldComplete: boolean }
): AnyVisitor<{ Return: R | null, Children: { visitor: V } }> => {
    let options: typeof opts = opts ?? { shouldComplete: true };
    // TODO: Review whether we can remove the type assertion;
    return createVisitor({
        rules: visitor.rules,
        tags: ["scope"],
        children: { visitor },
        symbols() {
            let symbols: Symbol[] = [];
            this.traverse((_, visitor) => {
                visitor.traverse((node, child) => {
                    for (let symbol of child.symbols(node)!) {
                        symbols.push(symbol);
                    }
                });
            });
            return symbols;
        },
        lint(node) {
            let unexpectedNodes: NodeType[] = [];
            this.traverse((_, visitor) => {
                visitor.traverse(() => { }, {
                    callbackNotAccepted(node) {
                        if (node.name == Rules.LineComment) return;
                        unexpectedNodes.push(node);
                    },
                });
            });

            for (let node of unexpectedNodes) {
                this.error("Unexpected statement.", node);
            }

            let set = new Set();
            for (let symbol of this.symbols(node)!) {
                if (set.has(symbol.name)) {
                    this.error(`Duplicate symbol: ${symbol.name}`, symbol.nameNode);
                }
                set.add(symbol.name);
            }
        },
        complete(node) {
            if (!options.shouldComplete) return [];
            let result = [];
            for (let key in visitor.children) {
                result.push(...visitor.children[key].snippets());
            }
            let symbols = this.symbols(node)!.map((x) => x.name);
            result = result.filter((x) => !x.symbol || !symbols.contains(x.symbol));
            for (let i = 0; i < result.length; i++) {
                result[i].boost = -i;
            }
            return result;
        },
        run(): R | null {
            return this.runChildren({ keys: ["visitor"] })["visitor"] ?? null;
        },
        snippets() {
            return this.children.visitor.snippets();
        },
        options: {
            traversal: { visitTop: true, visitChildren: false },
            // TODO: fix back
            cache: { lint: false, run: false, complete: false },
        },
    });
};
