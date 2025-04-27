/**
 * @type {import("@jest/types").Config.InitialOptions}
 */
module.exports = {
    preset: "ts-jest",
    testEnvironment: "jsdom",
    moduleDirectories: ["node_modules", "src", "<rootDir>"],
    transform: {
        "^.+\\.tsx?$": [
            "ts-jest",
            {
                ignoreCodes: ["TS7053"],
                diagnostics: { exclude: ["**"] },
                tsconfig: "tsconfig.test.ci.json",
            },
        ],
    },
    testEnvironmentOptions: {
        customExportConditions: [""],
    },
    moduleNameMapper: {
        "^react$": "preact/compat",
        "^react-dom/test-utils$": "preact/test-utils",
        "^react-dom$": "preact/compat",
        "^react/jsx-runtime$": "preact/jsx-runtime",
        "^.+\\.(css|less|scss)$": "babel-jest",
    },
};
