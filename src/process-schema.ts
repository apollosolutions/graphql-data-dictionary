import { readFileSync } from 'fs'
import {
  TypeDefinitionNode,
  parse,
  visit,
  Kind,
  ASTNode,
  FieldDefinitionNode,
  InputValueDefinitionNode,
  EnumValueDefinitionNode,
  DirectiveDefinitionNode
} from 'graphql'
import { createObjectCsvWriter as createCsvWriter } from 'csv-writer'

type Result = {
  object: string
  returnType: string
  args?: string
  description?: string
  deprecated?: string
  deprecationReason?: string
  defaultValue?: string
  subgraphs?: string[]
  sourceInterfaces?: string[]
  implementations?: string[]
  examples?: string
}

type Results = Result[]

type DetermineTypeInput = {
  nodes: ASTNode[]
  typeName: string
  type?: ASTNode
}

type Parent = {
  name: string
  subgraphs: string[]
}

const BUILT_IN_DIRECTIVES = [
  'join__type',
  'join__unionMember',
  'join__enumValue',
  'join__field',
  'join__inputField',
  'join__implements',
  'join__graph',
  'link',
]

const BUILT_IN_SCALARS = [
  'join__FieldSet',
  'link__Import',
]

const BUILT_IN_ENUMS = [
  'join__Graph',
  'link__Purpose'
]

const results: Results = []

const interfaceMap = new Map<string, string[]>()

let parent: Parent = {
  name: '',
  subgraphs: []
}

const determineDefaultOrValue = (
  dv: InputValueDefinitionNode['defaultValue']
): string => {
  switch (dv?.kind) {
    case Kind.INT:
    case Kind.FLOAT:
    case Kind.STRING:
    case Kind.ENUM:
      return dv.value
    case Kind.BOOLEAN:
      return dv.value.toString()
    case Kind.LIST:
      return `${dv.values.map((v) => {
        return determineDefaultOrValue(v)
      })}`
    case Kind.OBJECT:
      return `{${dv.fields?.map((f) => `${f.name.value}: ${determineDefaultOrValue(f.value)}`).join(', ')}}`
    default:
      return ''
  }
}

const determineType = (i: DetermineTypeInput): string => {
  switch (i.type?.kind) {
    case Kind.FIELD_DEFINITION:
    case Kind.INPUT_VALUE_DEFINITION:
    case Kind.NON_NULL_TYPE:
    case Kind.LIST_TYPE:
      return determineType({
        nodes: [...i.nodes, i.type.type],
        type: i.type.type,
        typeName: i.typeName
      })
    case Kind.ENUM_VALUE_DEFINITION:
      return 'ENUM_VALUE'
    case Kind.NAMED_TYPE:
      return determineType({
        nodes: [...i.nodes],
        type: undefined,
        typeName: i.type.name.value
      })
    default: {
      const typeName = i.nodes.reverse().reduce((acc, n) => {
        if (!n) {
          return acc
        }
        if (n.kind === Kind.LIST) {
          return (acc = `[${acc}]`)
        } else if (n.kind === Kind.NON_NULL_TYPE) {
          return (acc = `${acc}!`)
        } else {
          return acc
        }
      }, i.typeName)

      return typeName
    }
  }
}

const pullSubgraphs = (
  node:
    | TypeDefinitionNode
    | FieldDefinitionNode
    | InputValueDefinitionNode
    | EnumValueDefinitionNode
) => {
  if (!node.directives?.length) return []
  const subgraphs: string[] = []

  node.directives.forEach((d) => {
    switch (d.name.value) {
      case 'join__type':
      case 'join__unionMember':
      case 'join__field':
      case 'join__enumValue':
      case 'join__inputField':
      case 'join__implements':
        d.arguments?.forEach((a) => {
          if (a.name.value === 'graph') {
            subgraphs.push(determineDefaultOrValue(a.value))
          }
        })
        break
      default:
        break
    }
  })

  return subgraphs
}

const processArgs = (
  field: FieldDefinitionNode | DirectiveDefinitionNode,
  args: Array<InputValueDefinitionNode>
) => {
  args.forEach((arg) => {
    const result: Result = {
      object: `${parent.name}.${field.name.value}.${arg.name.value}`,
      returnType: determineType({
        type: arg,
        nodes: [arg],
        typeName: ''
      }),
      args: '',
      defaultValue: determineDefaultOrValue(arg.defaultValue)
    }
    if (field.kind === Kind.DIRECTIVE_DEFINITION) {
      result.object = `${field.name.value}.${arg.name.value}`
    }
    if (field.kind === Kind.FIELD_DEFINITION) {
      result.subgraphs = [
        ...pullSubgraphs(arg),
        ...pullSubgraphs(field),
      ]

      // avoid setting the query/mutation/subgraph type parents since all subgraphs will have it if defined
      // and isn't representative of the actual subgraphs defining that field 
      if (parent.name != 'Query' && parent.name != 'Mutation' && parent.name != 'Subscription') {
        result.subgraphs.push(...parent.subgraphs)
      }

      // remove duplicate subgraphs
      result.subgraphs = result.subgraphs.filter((elem, pos) => {
        return result.subgraphs?.indexOf(elem) == pos
      })
    }
    results.push(result)
  })
}

const processField = (
  field:
    | FieldDefinitionNode
    | EnumValueDefinitionNode
    | InputValueDefinitionNode,
  parentNode: TypeDefinitionNode
) => {
  let fieldSubgraphs = pullSubgraphs(field)

  if (fieldSubgraphs.length === 0) {
    fieldSubgraphs = parent.subgraphs
  }
  // remove any newlines from the description to avoid the csv from becoming invalid
  const description = field.description?.value.replace(/\r?\n|\r/g, " ");
  const result: Result = {
    object: `${parentNode.name.value}.${field.name.value}`,
    returnType: determineType({
      type: field,
      nodes: [field],
      typeName: ''
    }),
    description: description,
    subgraphs: fieldSubgraphs.filter((elem, pos) => {
      return fieldSubgraphs.indexOf(elem) == pos
    })
  }

  if (field.kind === Kind.ENUM_VALUE_DEFINITION) {
    results.push(result)
    return
  } else if (field.kind === Kind.FIELD_DEFINITION) {
    result.args = field.arguments
      ?.map((a) => {
        let defaultValue = ''
        if (a.defaultValue) {
          defaultValue = determineType({
            type: a.defaultValue,
            nodes: [a.defaultValue],
            typeName: ''
          })
        }

        return `${a.name.value}: ${determineType({
          type: a.type,
          nodes: [a.type],
          typeName: ''
        })} ${defaultValue ? `= ${defaultValue}` : ''}`
      })
      .join(', ')

    processArgs(field, [...(field.arguments ?? [])])
  } else if (field.kind === Kind.INPUT_VALUE_DEFINITION) {
    result.defaultValue = determineDefaultOrValue(field.defaultValue)
  }

  const example: string[] = []
  if (field.directives) {
    field.directives.forEach((d) => {
      if (d.name.value === 'example') {
        d.arguments?.forEach((a) => {
          if (a.name.value === 'samples') {
            example.push(determineDefaultOrValue(a.value))
          }
        })
        result.examples = example ? example.join(', ') : ''
      } else if (d.name.value === 'deprecated') {
        result.deprecated = 'true'
        result.deprecationReason = d.arguments
          ?.map((a) => determineDefaultOrValue(a.value))
          .join(', ')
      }
    })
  }

  results.push(result)
}

const processType = (node: TypeDefinitionNode, kind: string) => {
  if (BUILT_IN_ENUMS.includes(node.name.value) || BUILT_IN_SCALARS.includes(node.name.value)) return

  const subgraphs = pullSubgraphs(node)

  parent = {
    name: node.name.value,
    subgraphs: subgraphs
  }

  // avoid adding newlines to the csv
  const description = node.description?.value.replace(/\r?\n|\r/g, " ");

  const result: Result = {
    object: node.name.value,
    returnType: kind,
    args: '',
    description: description,
    subgraphs: subgraphs
  }

  if (
    node.kind !== Kind.SCALAR_TYPE_DEFINITION &&
    node.kind !== Kind.UNION_TYPE_DEFINITION &&
    node.kind !== Kind.ENUM_TYPE_DEFINITION
  ) {
    if (node.kind === Kind.OBJECT_TYPE_DEFINITION) {
      result.sourceInterfaces = node.interfaces?.map((i) => i.name.value)
    }
    node.fields?.forEach((field) => processField(field, node))
  } else if (node.kind === Kind.ENUM_TYPE_DEFINITION) {
    node.values?.forEach((field) => processField(field, node))
  }

  if (node.kind === Kind.UNION_TYPE_DEFINITION)
    result.implementations = node.types?.map((t) => t.name.value)

  if (
    node.kind === Kind.INTERFACE_TYPE_DEFINITION ||
    node.kind === Kind.OBJECT_TYPE_DEFINITION
  ) {
    node.interfaces?.forEach((i) => {
      const existing = interfaceMap.get(i.name.value) || []
      interfaceMap.set(i.name.value, [...existing, node.name.value])
    })
  }

  results.push(result)
}

const processDirective = (node: DirectiveDefinitionNode) => {
  if (BUILT_IN_DIRECTIVES.includes(node.name.value)) return
  const description = node.description?.value.replace(/\r?\n|\r/g, " ");
  const result: Result = {
    object: node.name.value,
    returnType: 'Directive',
    args: '',
    description: description,
  }

  result.args = node.arguments
    ?.map((a) => {
      let defaultValue = ''
      if (a.defaultValue) {
        defaultValue = determineType({
          type: a.defaultValue,
          nodes: [a.defaultValue],
          typeName: ''
        })
      }
      const defaultArg = defaultValue ? `= ${defaultValue}` : ''
      return `${a.name.value}: ${determineType({
        type: a.type,
        nodes: [a.type],
        typeName: ''
      })} ${defaultArg}`
    })
    .join(', ')

  processArgs(node, [...(node.arguments ?? [])])

  results.push(result)
}

export const processSchema = async (schemaPath: string, output?: string) => {
  const s = readFileSync(schemaPath, 'utf8')
  const schema = parse(s)

  const csvWriter = createCsvWriter({
    path: output ?? 'data.csv',
    header: [
      { id: 'object', title: 'Object' },
      { id: 'returnType', title: 'Type' },
      { id: 'args', title: 'Arguments' },
      { id: 'description', title: 'Description' },
      { id: 'deprecated', title: 'Deprecated' },
      { id: 'deprecationReason', title: 'Deprecation Reason' },
      { id: 'defaultValue', title: 'Default Value' },
      { id: 'subgraphs', title: 'Subgraphs' },
      { id: 'sourceInterfaces', title: 'Source Interface(s)' },
      { id: 'implementations', title: 'Implementations' },
      { id: 'examples', title: 'Example' } // requires directive @example(sample: [String!]!) on FieldDefinition to be added to schema + applied to fields
    ]
  })

  visit(schema, {
    ObjectTypeDefinition: {
      enter: (node) => processType(node, 'Type definition')
    },
    UnionTypeDefinition: {
      enter: (node) => processType(node, 'Union')
    },
    InterfaceTypeDefinition: {
      enter: (node) => processType(node, 'Interface')
    },
    ScalarTypeDefinition: {
      enter: (node) => processType(node, 'Scalar')
    },
    InputObjectTypeDefinition: {
      enter: (node) => processType(node, 'Input object')
    },
    EnumTypeDefinition: {
      enter: (node) => processType(node, 'Enum')
    },
    DirectiveDefinition: {
      enter: (node) => processDirective(node)
    }
  })

  for (const [key, value] of interfaceMap) {
    const result = results.find((r) => r.object === key)
    if (result) {
      result.implementations = value
    }
  }
  await csvWriter.writeRecords(results)
}
