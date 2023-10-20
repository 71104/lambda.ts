import { NodeInterface } from './ast.js';
import { Parser } from './parser.js';
import { EMPTY_TYPE_CONTEXT, TypeScheme } from './types.js';
import { EMPTY_VALUE_CONTEXT, ValueInterface } from './values.js';

export function parse(input: string): NodeInterface {
  const parser = new Parser(input);
  const ast = parser.parse();
  parser.resetVariableGenerator();
  return ast;
}

export function evaluate(input: string): [TypeScheme, ValueInterface] {
  const parser = new Parser(input);
  const ast = parser.parse();
  parser.resetVariableGenerator();
  const { substitution, type } = ast.getType(EMPTY_TYPE_CONTEXT);
  const value = ast.evaluate(EMPTY_VALUE_CONTEXT);
  return [type.substitute(substitution).close(), value];
}
