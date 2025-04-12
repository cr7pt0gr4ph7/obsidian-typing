import { useEffect, useRef, useState } from "react";
import { default as ReactDatePicker } from "react-datepicker";
import "src/styles/react-datepicker.notranspile.scss";
import { parseDate } from "src/utilities";
import { Picker } from ".";
import { Dropdown, Input } from "..";
import { useControls } from "../hooks";

function toLocalISOString(date: Date, showTime: boolean) {
    let yyyy = date.getFullYear();
    let mm = String(date.getMonth() + 1).padStart(2, "0"); // Months are 0-indexed.
    let dd = String(date.getDate()).padStart(2, "0");

    if (showTime) {
        let HH = String(date.getHours()).padStart(2, "0");
        let MM = String(date.getMinutes()).padStart(2, "0");

        return `${yyyy}-${mm}-${dd} ${HH}:${MM}`;
    } else {
        return `${yyyy}-${mm}-${dd}`;
    }
}

export function Date({ showTime }: { showTime: boolean }) {
    let controls = useControls({
        parse(value) {
            return { str: value };
        },
        compose({ str }) {
            let date = parseDate(str);
            if (!date) return "";
            return toLocalISOString(date, showTime);
        },
    });

    let ref = useRef();

    function DummyContainer({ children }) {
        return (
            <div ref={ref} style={{ position: "relative" }}>
                {children}
            </div>
        );
    }

    let [dateQuery, setDateQuery] = useState(controls.value);

    useEffect(() => {
        // we do it on first render to synchronize displayed and stored values
        // for example, `today` -> `2023-11-30`
        if (controls.value != controls.str.value) {
            controls.str.setValue(controls.value);
        }
    }, []);

    return (
        <Picker>
            <Picker.Display>{controls.value}</Picker.Display>
            <Picker.Body>
                <Dropdown>
                    <Input
                        autofocus
                        value={dateQuery}
                        onSetValue={async (value, e) => {
                            e.preventDefault();
                            setDateQuery(await controls.str.setValue(value));
                        }}
                        onSubmitValue={async (value, e) => {
                            e.preventDefault();
                            setDateQuery(await controls.str.submitValue(value));
                            // dispatch({ type: "EXIT" });
                        }}
                        onChange={(value) => {
                            setDateQuery(value);
                        }}
                        onBeforeKeyDown={(e) => {
                            switch (e.key) {
                                case "ArrowDown":
                                    e.preventDefault();
                                    e.stopPropagation();
                                    let calendarContainer = ref.current;

                                    const selectedDay =
                                        calendarContainer &&
                                        calendarContainer.querySelector('.react-datepicker__day[tabindex="0"]');

                                    selectedDay && selectedDay.focus({ preventScroll: true });

                                    return true;
                                default:
                                    return false;
                            }
                        }}
                    />
                    <Dropdown.Panel static>
                        <ReactDatePicker
                            selected={parseDate(dateQuery)}
                            showTimeInput={showTime}
                            inline
                            onSelect={async (date) => {
                                let newValue = await controls.str.setValue(toLocalISOString(date, showTime));
                                setDateQuery(newValue);
                                // dispatch({ type: "EXIT" });
                            }}
                            onChange={async (date) => {
                                let newValue = await controls.str.setValue(toLocalISOString(date, showTime));
                                setDateQuery(newValue);
                            }}
                            calendarContainer={DummyContainer}
                        />
                    </Dropdown.Panel>
                </Dropdown>
                <Picker.SubmitButton controls={controls} />
            </Picker.Body>
        </Picker>
    );
}
