import { expect, describe, it } from "bun:test";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";

import bunGraphqlLoader from "../src/index";
import { readFile, readdir, rm, writeFile } from "fs/promises";
import { basename, extname, join } from "path";
import { existsSync } from "fs";
import { gql } from "graphql-tag";
// import { ASTNode, DefinitionNode, Kind } from "graphql";
import {
    BunPlugin,
    OnLoadCallback,
    OnLoadResult,
    OnLoadResultSourceCode,
    PluginBuilder,
    PluginConstraints,
} from "bun";

const plugin = bunGraphqlLoader();

// Check that the plugin implements the PluginOption interface.
const _: BunPlugin = plugin;

// Any .gql or .graphql files in the testcase directory are tested.
const TESTCASE_DIR = "tests/testcases";

describe(`bun-graphql-loader`, async () => {
    // Find .gql and .graphql files in `tests/testcases`:
    const testcases = []
        .concat(
            (await readdir(TESTCASE_DIR, { recursive: true })).filter(
                (f: string) => f.endsWith(".gql") || f.endsWith(".graphql"),
            ),
        )
        .filter((testcase) => !basename(testcase).startsWith("_"));

    it.each(testcases)(
        `Testcase %s is generated to a module as expected.`,
        async (testcase: string) => {
            const expectedFilepath = join(
                TESTCASE_DIR,
                testcase.replace(extname(testcase), "-expected.js"),
            );
            const expected = existsSync(expectedFilepath)
                ? await readFile(expectedFilepath, "utf-8")
                : undefined;

            let results: OnLoadResult | Promise<OnLoadResult>;
            const pluginBuilder = {
                onLoad: (
                    _constraints: PluginConstraints,
                    callback: OnLoadCallback,
                ) => {
                    results = callback({
                        loader: "js",
                        namespace: "",
                        path: `tests/testcases/${testcase}`,
                    });
                },
            };
            plugin.setup(pluginBuilder as PluginBuilder);

            const { loader } = await results;
            const transformed = (
                (await results) as OnLoadResultSourceCode
            ).contents.toString();

            expect(loader).toBe(loader);

            if (!expected) {
                await writeFile(expectedFilepath, transformed);
                // Continue test, which will fail. The tests should be run a
                // second time.
            }

            const actualFilepath = join(
                TESTCASE_DIR,
                testcase.replace(extname(testcase), "-actual.js"),
            );

            // Just to allow manual comparison.
            if (expected !== transformed) {
                await writeFile(actualFilepath, transformed);
            } else {
                if (existsSync(actualFilepath)) {
                    await rm(actualFilepath);
                }
            }

            expect(transformed).toBe(expected);
            // expect(map).toBeDefined();

            // Validate that the generated code is valid ESM JavaScript.
            const ast = parse(transformed, { sourceType: "module" });
            expect(ast).toBeDefined();

            // Validate that the exports match the queries and fragments in the
            // GraphQL file.
            const exports = getExports(ast);
            const fileContent = await readFile(
                join(TESTCASE_DIR, testcase),
                "utf-8",
            );
            const { definitions } = gql(fileContent);
            const expectedExports = [
                "_queries",
                "_fragments",
                "default",
                ...definitions
                    .map((definition) =>
                        "name" in definition
                            ? definition.name?.value
                            : undefined,
                    )
                    .filter((name) => name !== undefined),
            ];

            expect(exports.sort()).toEqual(expectedExports.sort());
        },
    );
});

// Traverse @babel/parser AST to find exports.
const getExports = (ast: any): string[] => {
    // Track found exports
    const foundExports: string[] = [];

    // Traverse the AST to find export declarations
    traverse(ast, {
        ExportNamedDeclaration(path) {
            const declaration = path.node.declaration;
            if (declaration && declaration.type === "VariableDeclaration") {
                declaration.declarations.forEach((decl) => {
                    if (decl.id.type === "Identifier") {
                        foundExports.push(decl.id.name);
                    }
                });
            }
        },
        ExportDefaultDeclaration() {
            foundExports.push("default");
        },
    });

    return foundExports;
};
