import { Builtins, Cli } from 'clipanion'
import { processSchema } from './process-schema'
import GenerateCommand from './commands'

const main = async () => [await processSchema('examples/schema.graphql')]

main()

const cli = new Cli({
  binaryLabel: 'GraphQL Data Dictionary Generator',
  binaryName: 'npx github:@apollosolutions/graphql-data-dictionary',
  binaryVersion: '0.1.0'
})

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const [_, __, ...args] = process.argv

cli.register(GenerateCommand)
cli.register(Builtins.HelpCommand)
cli.runExit(args)
