import { Command, Option } from "clipanion";
import { processSchema } from "./process-schema";

export default class GenerateCommand extends Command {
    static paths = [
        ['generate'],
    ];
    schema = Option.String('-s,--schema', {
        required: true,
        description: 'Path to the GraphQL schema file',
    })

    output = Option.String('-o,--output', {
        required: false,
        description: 'Path to the output file',
    });

    static usage = Command.Usage({
        category: 'Generate',
        description: 'Generate a data dictionary from a GraphQL schema',
        examples: [
            [
                'Generate a data dictionary from a schema',
                'generate --schema examples/schema.graphql',
            ],
        ],
    });

    async execute(): Promise<number | void> {
        if (!this.schema) {
            this.context.stdout.write('No schema provided');
            return 1;
        }

        this.context.stdout.write(`Generating data dictionary from schema: ${this.schema}\n`);
        await processSchema(this.schema, this.output);
        this.context.stdout.write(`Data dictionary generated; output is at ${this.output ?? 'data.csv'}\n`);
    }
}