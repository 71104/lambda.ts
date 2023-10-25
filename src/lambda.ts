import { NodeInterface } from './ast.js';
import { Parser } from './parser.js';
import { TypeScheme } from './types.js';
import { ValueInterface } from './values.js';

import { GLOBAL_TYPE_CONTEXT, GLOBAL_VALUE_CONTEXT } from './globals.js';

export function parse(input: string): NodeInterface {
  const parser = new Parser(input);
  return parser.parse();
}

export function evaluate(input: string): [TypeScheme, ValueInterface] {
  const parser = new Parser(input);
  const ast = parser.parse();
  const { substitution, type } = ast.getType(GLOBAL_TYPE_CONTEXT);
  const value = ast.evaluate(GLOBAL_VALUE_CONTEXT);
  return [type.substitute(substitution).close(), value];
}
