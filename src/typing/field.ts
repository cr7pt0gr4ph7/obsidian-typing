import { Bindable, DataClass, field } from "src/utilities";
import { Note } from ".";
import { FieldType } from "./field_type/base";
import { Type } from "./type";

export interface FieldBindingContext {
    type: Type;
    note?: Note;
}

export class Field extends DataClass implements Bindable<FieldBindingContext, Field> {
    context?: FieldBindingContext;

    @field()
    public name!: string;

    @field()
    public type!: FieldType;

    @field()
    public default!: string;

    public onAfterCreate(): void {
        if (!this.type.context) {
            this.type = this.type.bind({ field: this });
        }
        if (this.default != null) {
            this.default = this.type.parseDefault(this.default);
        }
    }

    bind(context: FieldBindingContext) {
        let result = Field.new({
            name: this.name,
            type: this.type.bind({ field: this, ...context }),
            default: this.default,
        });
        result.context = context;
        return result;
    }
}
