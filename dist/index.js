'use strict'
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod }
  }
Object.defineProperty(exports, '__esModule', { value: true })
const clipanion_1 = require('clipanion')
const process_schema_1 = require('./process-schema')
const commands_1 = __importDefault(require('./commands'))
const main = async () => [
  await (0, process_schema_1.processSchema)('examples/schema.graphql')
]
main()
const cli = new clipanion_1.Cli({
  binaryLabel: 'GraphQL Data Dictionary Generator',
  binaryName: 'npx github:@apollosolutions/graphql-data-dictionary',
  binaryVersion: '0.1.0'
})
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const [_, __, ...args] = process.argv
cli.register(commands_1.default)
cli.register(clipanion_1.Builtins.HelpCommand)
cli.runExit(args)
