# bun-graphql-loader

![License](https://img.shields.io/github/license/0x31/bun-graphql-loader?style=for-the-badge&labelColor=2e3440&color=6f4fbe)
![Version](https://img.shields.io/npm/v/bun-graphql-loader.svg?label=Version&style=for-the-badge&labelColor=2e3440&color=eea837)
![Downloads](https://img.shields.io/npm/dw/bun-graphql-loader?style=for-the-badge&labelColor=2e3440&color=50b6a9)
![Bun Badge](https://img.shields.io/badge/Bun-000?logo=bun&logoColor=fff&style=for-the-badge&color=2e3440)
![GraphQL Badge](https://img.shields.io/badge/GraphQL-E10098?logo=graphql&logoColor=fff&style=for-the-badge&color=ee4367)
![TypeScript Badge](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=fff&style=for-the-badge)

A Bun plugin for loading GraphQL .gql and .graphql files, using on [graphql-tag](https://github.com/apollographql/graphql-tag). Based on [vite-plugin-graphql-loader](https://www.npmjs.com/package/vite-plugin-graphql-loader).

## Install

```bash
bun add --dev bun-graphql-loader
```

## Usage

Calling `Bun.build`:

```typescript
import bunGraphqlLoader from 'bun-graphql-loader';

await Bun.build({
    ...
    plugins: [
        ...
        bunGraphqlLoader(),
        ...
    ],
    ...
});
```

Using with `bun test`:

Create a file called `bunGraphqlLoader.ts` with the following content:

```ts
import bunGraphqlLoader from "bun-graphql-loader";
import { plugin } from "bun";

plugin(bunGraphqlLoader());
```

And add it to your `bunfig.toml` (customizing the path if necessary):

```toml
[test]
preload = [
  "./bunGraphqlLoader.ts",
]
```

Now you can import queries from `.gql` or `.graphql` files.

`example.graphql`:

```graphql
#import "./ExampleImport.graphql"

fragment ExampleFragment on example {
    id
    name
}

query ExampleQuery {
    example {
        ...ExampleFragment
        ...ExampleImport
    }
}
```

`example.js`:

```javascript
import ExampleQuery, { ExampleFragment } from "./example.graphql";
```

If you have multiple queries in the same file, import them like this:

```javascript
import { FirstQuery, SecondQuery } from "./example.graphql";
```

## TypeScript

If you are using TypeScript, you will have to declare `.gql` or `.graphql` files.

Create `graphql.d.ts` anywhere in your source directory and

```typescript
declare module "*.gql";
declare module "*.graphql";
```

**_Alternatively_**, change it to this (replacing .gql with .graphql depending on what you use):

```typescript
declare module "*.gql" {
    const Query: import("graphql").DocumentNode;
    export default Query;
    export const _queries: Record<string, import("graphql").DocumentNode>;
    export const _fragments: Record<
        string,
        import("graphql").FragmentDefinitionNode
    >;
}
```

And then import fragments and queries like so in order to type them as `DocumentNode` and `FragmentDefinitionNode` objects.

```typescript
import Document, { _queries, _fragments } from "./example.graphql";
console.log(Document); // Has type `DocumentNode`
console.log(_queries.ExampleQuery); // Has type `DocumentNode`
console.log(_fragments.ExampleFragment); // Has type `FragmentDefinitionNode`
```

## Changelog

**_v1.0.0_**:

-   Adapted from [vite-plugin-graphql-loader](https://www.npmjs.com/package/vite-plugin-graphql-loader).
