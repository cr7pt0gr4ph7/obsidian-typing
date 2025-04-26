import { TFile, TFolder } from "obsidian";
import { gctx } from "src/context";
import { StringFieldAccessor } from "src/middleware/field_accessor";
import { Prompt } from "src/ui";
import { DataClass, field, mergeDeep } from "src/utilities";
import { Action, Field, HookContainer, HookContextType, HookNames, Method, Note, NoteState, Prefix, Style } from ".";

export class Type extends DataClass {
    @field()
    public isAbstract: boolean = false;
    @field()
    public name!: string;
    @field()
    public parentNames: Array<string> = [];
    @field({ inherit: false })
    public parents: Array<Type> = [];
    @field({ inherit: false })
    public folder: string | null = null;
    @field({ inherit: false })
    public glob: string | null = null;
    @field()
    public icon: string | null = null;
    @field()
    public prefix: Prefix | null = null;
    @field()
    public style: Style = Style.new();
    @field({ inherit: (a, b) => ({ ...b, ...a }) })
    public fields: Record<string, Field> = {};
    @field({ inherit: (a, b) => ({ ...b, ...a }) })
    public actions: Record<string, Action> = {};
    @field({ inherit: (a, b) => ({ ...b, ...a }) })
    public methods: Record<string, Method> = {};
    @field()
    public hooks: HookContainer = HookContainer.new();

    private ancestors: Record<string, Type> = {};

    public onAfterCreate(): void {
        this.rebindFields();
    }

    public onAfterInherit(): void {
        this.rebindFields();
        this.indexAncestors();
    }

    rebindFields() {
        for (let key in this.fields) {
            this.fields[key] = this.fields[key].bind({ type: this });
        }
    }

    indexAncestors(type?: Type) {
        type = type ?? this;
        for (let parent of type.parents) {
            this.ancestors[parent.name] = parent;
            this.indexAncestors(parent);
        }
    }

    async runHook<T extends HookNames>(name: T, context: HookContextType<T>) {
        this.hooks.run(name, context);
    }

    async promptNew(initialState?: Partial<NoteState>) {
        initialState = initialState ?? {};

        let defaults: Record<string, string> = {};
        for (let fieldName in this.fields) {
            defaults[fieldName] = this.fields[fieldName].default;
        }
        let state = mergeDeep({ type: this, fields: defaults }, initialState) as NoteState;

        if (this.hooks.has(HookNames.CREATE)) {
            this.runHook(HookNames.CREATE, { type: this, state });
            return;
        }

        state = await gctx.api.prompt(
            <Prompt submitText={`Create new ${this.name}`} noteState={state}>
                <Prompt.Title />
                <Prompt.Text />
                <Prompt.Fields />
            </Prompt>,
            { confirmation: true }
        );
        return state;
    }

    async create(state: Omit<NoteState, "type"> | Promise<Omit<NoteState, "type">>) {
        state = await state;
        if (!state) {
            return;
        }
        let content = state.text ?? "";
        if (state.fields) {
            let fieldAccessor = new StringFieldAccessor(content, this);
            for (let key in state.fields) {
                await fieldAccessor.setValue(key, state.fields[key]);
            }
            content = fieldAccessor.content;
        }

        // TODO: generate prefix from `cdate` to have them in sync
        let fullname = `${state.prefix ?? ""} ${state.title ?? ""}`.trim();
        let path = `${this.folder}/${fullname}.md`;

        let vault = gctx.app.vault;
        if (!vault.getAbstractFileByPath(this.folder)) {
            await vault.createFolder(this.folder);
        }

        await gctx.app.vault.create(path, content);

        let note = Note.new(path);
        note.runHook(HookNames.ON_CREATE, { note });
        return note;
    }

    get isCreateable() {
        return this.folder != null;
    }

    getAllNotes(options?: { withSubtypes?: boolean }) {
        if (options?.withSubtypes) {
            throw new Error("NotImplemented: withSubtypes");
        }

        if (!this.isCreateable) {
            throw new Error("Non-createable types cannot getAllNotes()");
        }

        let paths;
        if (gctx.dv != null) {
            paths = gctx.dv.pagePaths(`"${this.folder}"`);
        } else {
            let folder = gctx.app.vault.getAbstractFileByPath(this.folder);
            if (folder == null) {
                return [];
            }
            if (!(folder instanceof TFolder)) {
                throw new Error("Specified type folder is a file");
            }
            paths = folder.children.filter((x) => x instanceof TFile && x.extension == "md").map((x) => x.path);
        }

        return [...paths].map((path) => Note.new(path, { type: this }));
    }

    getAncestor(name: string): Type | null {
        return this.ancestors[name];
    }
}
