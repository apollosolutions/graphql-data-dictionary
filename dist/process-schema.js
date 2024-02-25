'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
exports.processSchema = void 0
const fs_1 = require('fs')
const graphql_1 = require('graphql')
const csv_writer_1 = require('csv-writer')
const results = []
const interfaceMap = new Map()
let parent = {
  name: '',
  subgraphs: []
}
const determineDefaultOrValue = (dv) => {
  switch (dv?.kind) {
    case graphql_1.Kind.INT:
    case graphql_1.Kind.FLOAT:
    case graphql_1.Kind.STRING:
      return dv.value
    case graphql_1.Kind.BOOLEAN:
      return dv.value.toString()
    case graphql_1.Kind.LIST:
      return `${dv.values.map((v) => {
        return determineDefaultOrValue(v)
      })}`
    case graphql_1.Kind.OBJECT:
      return `{${dv.fields?.map((f) => `${f.name.value}: ${determineDefaultOrValue(f.value)}`).join(', ')}}`
    default:
      return ''
  }
}
const determineType = (i) => {
  switch (i.type?.kind) {
    case graphql_1.Kind.FIELD_DEFINITION:
    case graphql_1.Kind.INPUT_VALUE_DEFINITION:
    case graphql_1.Kind.NON_NULL_TYPE:
    case graphql_1.Kind.LIST_TYPE:
      return determineType({
        nodes: [...i.nodes, i.type.type],
        type: i.type.type,
        typeName: i.typeName
      })
    case graphql_1.Kind.ENUM_VALUE_DEFINITION:
      return 'ENUM_VALUE'
    case graphql_1.Kind.NAMED_TYPE:
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
        if (n.kind === graphql_1.Kind.LIST) {
          return (acc = `[${acc}]`)
        } else if (n.kind === graphql_1.Kind.NON_NULL_TYPE) {
          return (acc = `${acc}!`)
        } else {
          return acc
        }
      }, i.typeName)
      return typeName
    }
  }
}
const pullSubgraphs = (node) => {
  if (!node.directives?.length) return []
  const subgraphs = []
  node.directives.forEach((d) => {
    switch (d.name.value) {
      case 'join__type':
      case 'join_unionMember':
      case 'join__field':
      case 'join__enumValue':
      case 'join__inputField':
      case 'join__implement':
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
const processArgs = (field, args) => {
  args.forEach((arg) => {
    const result = {
      object: `${parent.name}.${field.name.value}.${arg.name.value}`,
      returnType: determineType({
        type: arg,
        nodes: [arg],
        typeName: ''
      }),
      args: '',
      defaultValue: determineDefaultOrValue(arg.defaultValue)
    }
    if (field.kind === graphql_1.Kind.DIRECTIVE_DEFINITION) {
      result.object = `${field.name.value}.${arg.name.value}`
    }
    if (field.kind === graphql_1.Kind.FIELD_DEFINITION) {
      result.subgraphs = [
        ...pullSubgraphs(arg),
        ...pullSubgraphs(field),
        ...parent.subgraphs
      ]
    }
    results.push(result)
  })
}
const processField = (field, parentNode) => {
  let fieldSubgraphs = pullSubgraphs(field)
  if (fieldSubgraphs.length === 0) {
    fieldSubgraphs = parent.subgraphs
  }
  const result = {
    object: `${parentNode.name.value}.${field.name.value}`,
    returnType: determineType({
      type: field,
      nodes: [field],
      typeName: ''
    }),
    description: field.description?.value,
    subgraphs: fieldSubgraphs.filter((elem, pos) => {
      return fieldSubgraphs.indexOf(elem) == pos
    })
  }
  if (field.kind === graphql_1.Kind.ENUM_VALUE_DEFINITION) {
    results.push(result)
    return
  } else if (field.kind === graphql_1.Kind.FIELD_DEFINITION) {
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
  } else if (field.kind === graphql_1.Kind.INPUT_VALUE_DEFINITION) {
    result.defaultValue = determineDefaultOrValue(field.defaultValue)
  }
  const example = []
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
const processType = (node, kind) => {
  const subgraphs = pullSubgraphs(node)
  parent = {
    name: node.name.value,
    subgraphs: subgraphs
  }
  const result = {
    object: node.name.value,
    returnType: kind,
    args: '',
    description: node.description?.value,
    subgraphs: subgraphs
  }
  if (
    node.kind !== graphql_1.Kind.SCALAR_TYPE_DEFINITION &&
    node.kind !== graphql_1.Kind.UNION_TYPE_DEFINITION &&
    node.kind !== graphql_1.Kind.ENUM_TYPE_DEFINITION
  ) {
    if (node.kind === graphql_1.Kind.OBJECT_TYPE_DEFINITION) {
      result.sourceInterfaces = node.interfaces?.map((i) => i.name.value)
    }
    node.fields?.forEach((field) => processField(field, node))
  } else if (node.kind === graphql_1.Kind.ENUM_TYPE_DEFINITION) {
    node.values?.forEach((field) => processField(field, node))
  }
  if (node.kind === graphql_1.Kind.UNION_TYPE_DEFINITION)
    result.implementations = node.types?.map((t) => t.name.value)
  if (
    node.kind === graphql_1.Kind.INTERFACE_TYPE_DEFINITION ||
    node.kind === graphql_1.Kind.OBJECT_TYPE_DEFINITION
  ) {
    node.interfaces?.forEach((i) => {
      const existing = interfaceMap.get(i.name.value) || []
      interfaceMap.set(i.name.value, [...existing, node.name.value])
    })
  }
  results.push(result)
}
const processDirective = (node) => {
  const result = {
    object: node.name.value,
    returnType: 'Directive',
    args: '',
    description: node.description?.value
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
const processSchema = async (schemaPath, output) => {
  const s = (0, fs_1.readFileSync)(schemaPath, 'utf8')
  const schema = (0, graphql_1.parse)(s)
  const csvWriter = (0, csv_writer_1.createObjectCsvWriter)({
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
  ;(0, graphql_1.visit)(schema, {
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
exports.processSchema = processSchema
