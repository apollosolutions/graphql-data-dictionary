"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const clipanion_1 = require("clipanion");
const process_schema_1 = require("./process-schema");
class GenerateCommand extends clipanion_1.Command {
    static paths = [
        ['generate'],
    ];
    schema = clipanion_1.Option.String('-s,--schema', {
        required: true,
        description: 'Path to the GraphQL schema file',
    });
    output = clipanion_1.Option.String('-o,--output', {
        required: false,
        description: 'Path to the output file',
    });
    static usage = clipanion_1.Command.Usage({
        category: 'Generate',
        description: 'Generate a data dictionary from a GraphQL schema',
        examples: [
            [
                'Generate a data dictionary from a schema',
                'generate --schema examples/schema.graphql',
            ],
        ],
    });
    async execute() {
        if (!this.schema) {
            this.context.stdout.write('No schema provided');
            return 1;
        }
        this.context.stdout.write(`Generating data dictionary from schema: ${this.schema}\n`);
        await (0, process_schema_1.processSchema)(this.schema, this.output);
        this.context.stdout.write(`Data dictionary generated; output is at ${this.output ?? 'data.csv'}\n`);
    }
}
exports.default = GenerateCommand;
