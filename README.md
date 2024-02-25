# GraphQL Data Dictionary Generator

**The code in this repository is experimental and has been provided for reference purposes only. Community feedback is welcome but this project may not be supported in the same way that repositories in the official [Apollo GraphQL GitHub organization](https://github.com/apollographql) are. If you need help you can file an issue on this repository, [contact Apollo](https://www.apollographql.com/contact-sales) to talk to an expert, or create a ticket directly in Apollo Studio.**

This quick CLI will generate a CSV output of a provided schema at a determined location. A [data dictionary](https://library.ucmerced.edu/data-dictionaries) is "a collection of names, definitions, and attributes about data elements that are being used or captured in a database, information system, or part of a research project" (from [UC Merced](https://library.ucmerced.edu/data-dictionaries)).

This tool converts GraphQL SDL into a consumable CSV by other data management systems, and is fully federation-compliant and will add information about subgraphs if available.

**NOTE**: If desiring subgraph information, you will need the _supergraph_ SDL file from Apollo Studio or via `rover supergraph fetch <graph>@<variant>`.

Furthermore, it can read from a `@examples` directive; that definition looks like:

```gql
directive @example(samples: [String!]!) on FIELD_DEFINITION
```

To provide concrete examples of a given field.

For federated subgraph schemas, you will need to add this via the [`@composeDirective` directive](https://www.apollographql.com/docs/federation/federated-types/federated-directives/#composedirective), available in Federation 2.1 or higher to persist into the supergraph schema.

```gql
extend schema
  @link(
    url: "https://specs.apollo.dev/federation/v2.6"
    import: ["@composeDirective"]
  )
  @link(url: "https://examples.data/example/v1.0", import: ["@example"]) # the URL can be changed to any URL; it does not have to be the one in the example
  @composeDirective(name: "@example")
```

An example of the output is provided at [`examples/example_output.csv`](./examples/example_output.csv) which uses the [retail solution example](https://www.apollographql.com/solutions/retail).

## Usage

To use, simply run:

```sh
npx github:@apollosolutions/graphql-data-dictionary generate --schema <schema_file>
```

Optionally, you can set the output (defaults to `data.csv` in the folder being run in):

```sh
npx github:@apollosolutions/graphql-data-dictionary generate --schema <schema_file> --output output.csv
```

## Known Limitations

List any limitations of the project here:

- Published only as source code to Github. Not available on NPM
- All directives, including federation-specific directives, are included
