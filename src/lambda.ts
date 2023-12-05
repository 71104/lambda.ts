import { NodeInterface } from './ast.js';
import { Parser } from './parser.js';
import { TypeInterface } from './types.js';
import { ValueInterface } from './values.js';

import {
  GLOBAL_TYPE_CONSTRAINTS,
  GLOBAL_TYPE_CONTEXT,
  GLOBAL_TYPE_SUBSTITUTION,
  GLOBAL_VALUE_CONTEXT,
} from './globals.js';

export function parse(input: string): NodeInterface {
  const parser = new Parser(input);
  return parser.parse();
}

export function evaluate(input: string): [TypeInterface, ValueInterface] {
  const parser = new Parser(input);
  const ast = parser.parse();
  const { type, substitution } = ast.getType(
    GLOBAL_TYPE_CONTEXT,
    GLOBAL_TYPE_CONSTRAINTS,
    GLOBAL_TYPE_SUBSTITUTION,
  );
  const value = ast.evaluate(GLOBAL_VALUE_CONTEXT);
  return [type.substitute(substitution).closeAll(), value];
}
