import { Visitors } from "src/language";
import { Pickers } from "src/ui";
import { field } from "src/utilities";
import { report, TypedValidator, Validation } from "src/validation";
import { FieldType, FieldTypeBindingContext } from "./base";

import styles from "src/styles/prompt.scss";

export class List extends FieldType<List> implements TypedValidator<unknown[]> {
    name = "List";

    @field()
    public type!: FieldType;

    @field({ required: false })
    public unique: boolean = false;

    validate(target: Validation.Target<unknown>): void | Promise<void> {
        if (Array.isArray(target.value)) {
            this.validateTyped(target.asTyped(target.value))
        } else {
            report(target, {
                message: `Field ${target.path} must be a list`
            });
        }
    }

    async validateTyped(target: Validation.Target<(unknown | undefined | null)[]>): Promise<void> {
        for (let key in target.value) {
            await this.type.validate(target.field(key as any) as Validation.Target<unknown>);
        }
    }

    Display: FieldType["Display"] = ({ value }) => {
        let itemValues;
        if (typeof value == "string")
            // TODO: fix the same bug with comma inside values as in picker
            itemValues = value
                ?.split(",")
                .map((x) => x.trim())
                .filter((x) => x.trim());
        else itemValues = value;
        let displays = [];
        for (let itemValue of itemValues) {
            displays.push(
                <div className={styles.listElement}>
                    <this.type.Display value={itemValue} />
                </div>
            );
        }

        return <div className={styles.list}>{displays}</div>;
    };

    Picker = () => {
        return <Pickers.List SubPicker={this.type.Picker} />;
    };

    get default() {
        return "";
    }

    parseDefault(value: string | any[]): string {
        if (Array.isArray(value)) {
            let result = value.map(this.type.parseDefault).join(", ");
            if (value.length == 1) result += ",";
            return result;
        }
        return value;
    }

    bind(context: FieldTypeBindingContext): List {
        let result = super.bind(context);
        // TODO: there may be some troubles with field name, as it will be the same as of outer type
        // result.type = result.type.bind({ type: context.type });
        result.type = result.type.bind({ ...context, inList: true });
        return result;
    }

    static ParametersVisitor() {
        return Visitors.ParametersVisitorFactory({
            args: Visitors.FieldType(),
            kwargs: {
                unique: Visitors.Literal(Visitors.Boolean),
            },
            init(args, kwargs) {
                return List.new({ type: args[0], ...kwargs });
            },
        });
    }

    get isRelation() {
        return this.type.isRelation;
    }

    get isList() {
        return true;
    }

    get underlyingType() {
        return this.type.underlyingType;
    }
}
