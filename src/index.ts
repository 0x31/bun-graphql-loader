import { EOL } from "os";
import { gql } from "graphql-tag";
import MagicString, { SourceMap } from "magic-string";
import {
    bunGraphqlLoaderUniqueChecker,
    bunGraphqlLoaderExtractQuery,
} from "./snippets.js";
import { DocumentNode } from "graphql";
import { BunPlugin, PluginBuilder } from "bun";

const DOC_NAME = "_gql_doc";

// Resolves GraphQL #import statements into ESM import statements.
const expandImports = (
    source: string,
): { imports: string[]; importAppends: string[] } => {
    const lines = source.split(/\r\n|\r|\n/);

    const importNames = new Set<string>();
    const imports = [];
    const importAppends = [];

    // Go through each line, checking if it is an import. Uses `.some` instead
    // of `.forEach` so it can return early after finding a non-export.
    lines.some((line: string) => {
        const result = line.match(/^#\s?import (.+)$/);

        // If it's an import, replace it with an ESM import.
        if (result) {
            const [_, importFile] = result;

            // Generate name for the import based on the filepath.
            let importName = "Import_" + importFile.replace(/[^a-z0-9]/gi, "_");
            // Ensure import name is unique.
            while (importNames.has(importName)) {
                importName = importName + "_";
            }
            importNames.add(importName);

            imports.push(`import ${importName} from ${importFile};\n`);
            importAppends.push(
                `${DOC_NAME}.definitions = ${DOC_NAME}.definitions.concat(${bunGraphqlLoaderUniqueChecker.name}(${importName}.definitions));\n`,
            );
        }

        // One we've reached a non-import line, return true to stop iterating.
        return line.length !== 0 && line[0] !== "#";
    });

    return { imports, importAppends };
};

/** Bun GraphQL Loader */
export const bunGraphqlLoader = (options?: {
    noSourceMap?: boolean;
}): BunPlugin => {
    // RegEx to match GraphQL file extensions.
    const graphqlRegex = /\.(?:gql|graphql)$/;

    return {
        name: "bun-graphql-loader",

        async setup({ onLoad }: PluginBuilder) {
            onLoad({ filter: graphqlRegex }, async (args) => {
                const fileRef = Bun.file(args.path);
                let source: string = await fileRef.text();

                let documentNode: DocumentNode;
                try {
                    documentNode = gql`
                        ${source}
                    `;
                } catch (error) {
                    // graphql-tag error thrown from bun-graphql-loader:
                    throw new Error(String(error));
                }

                // MagicString is used to generate the source map.
                let outputCode = new MagicString(source).replaceAll("`", "\\`");

                outputCode.prepend(`const _gql_source = \``);
                // ORIGINAL SOURCE CODE ENDS UP BETWEEN THESE TWO LINES, AS A JS
                // STRING.
                outputCode.append(`\`;\n`);

                const plainDocument = Object.assign({}, documentNode);
                Object.assign(plainDocument.loc, documentNode.loc);

                // Convert document node to plain object.
                const documentObject = JSON.parse(JSON.stringify(documentNode));

                const sourceBodyIdentifier = `_gql_uuid_${new Date().getTime()}`;
                if (documentNode.loc && documentNode.loc.source) {
                    // In order to set `loc.source.body` to _gql_source, we replace
                    // it with a temporary identifier and then replace it with a
                    // reference to _gql_source, which is the source-mapped version.
                    documentObject.loc.source = {
                        name: documentNode.loc.source.name,
                        locationOffset: documentNode.loc.source.locationOffset,
                        body: sourceBodyIdentifier,
                    };
                }

                outputCode.append(
                    `const ${DOC_NAME} = ${JSON.stringify(
                        documentObject,
                    ).replace(`"${sourceBodyIdentifier}"`, "_gql_source")};\n`,
                );

                // Resolve #import statements.
                const { imports, importAppends } = expandImports(source);
                if (imports.length) {
                    outputCode.prepend(imports.join(""));
                    outputCode.append(
                        `const ${bunGraphqlLoaderUniqueChecker.name} = ${bunGraphqlLoaderUniqueChecker.toString()};\n`,
                    );
                    outputCode.append(importAppends.join(""));
                }

                // Allow multiple query/mutation definitions in a file. This parses out dependencies
                // at compile time, and then uses those at load time to create minimal query documents
                // We cannot do the latter at compile time due to how the #import code works.
                const operationCount = documentNode.definitions.filter(
                    (op) =>
                        (op.kind === "OperationDefinition" ||
                            op.kind === "FragmentDefinition") &&
                        op.name,
                ).length;

                const queryNames = [];
                const fragmentNames = [];

                if (operationCount >= 1) {
                    const extractQueries =
                        operationCount > 1 || imports.length > 0;
                    if (extractQueries) {
                        outputCode.append(
                            `const ${bunGraphqlLoaderExtractQuery.name} = ${bunGraphqlLoaderExtractQuery.toString()};\n`,
                        );
                    }

                    for (const op of documentNode.definitions) {
                        if (
                            op.kind === "OperationDefinition" ||
                            op.kind === "FragmentDefinition"
                        ) {
                            if (!op.name) {
                                if (operationCount > 1) {
                                    throw new Error(
                                        "Query/mutation names are required for a document with multiple definitions",
                                    );
                                } else {
                                    continue;
                                }
                            }

                            const opName = op.name.value;
                            outputCode.append(
                                `export const ${opName} = ${extractQueries ? `${bunGraphqlLoaderExtractQuery.name}(${DOC_NAME}, "${opName}")` : DOC_NAME};\n`,
                            );

                            if (op.kind === "OperationDefinition") {
                                queryNames.push(opName);
                            } else {
                                fragmentNames.push(opName);
                            }
                        }
                    }
                }

                outputCode.append(
                    `export const _queries = {${queryNames.join(",")}};\n`,
                );
                outputCode.append(
                    `export const _fragments = {${fragmentNames.join(",")}};\n`,
                );

                outputCode.append(`export default ${DOC_NAME};\n`);

                outputCode.replaceAll("\n", EOL);

                return {
                    // Return transformed code.
                    contents: outputCode.toString(),
                    // Indicate that the value of contents is JavaScript.
                    loader: "js",
                    // map: options?.noSourceMap
                    //     ? ({ mappings: "" } as SourceMap)
                    //     : outputCode.generateMap(),
                };
            });
        },
    };
};

export default bunGraphqlLoader;
