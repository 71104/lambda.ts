import { NodeInterface } from './ast.js';
import { Parser } from './parser.js';
import { EMPTY_VALUE_CONTEXT, ValueInterface } from './values.js';

export function parse(input: string): NodeInterface {
  const parser = new Parser(input);
  return parser.parse();
}

export function evaluate(input: string): ValueInterface {
  const parser = new Parser(input);
  const ast = parser.parse();
  return ast.evaluate(EMPTY_VALUE_CONTEXT);
}
