import { NodeInterface, VariableNode } from './ast.js';
import { SyntaxError } from './errors.js';
import { Lexer, Token } from './lexer.js';

export class Parser {
  private readonly _lexer: Lexer;

  public constructor(input: string) {
    this._lexer = new Lexer(input);
  }

  private _parse0(terminators: Token[]): NodeInterface {
    switch (this._lexer.token) {
      case 'identifier':
        return new VariableNode(this._lexer.step());
      default:
        throw new SyntaxError(`unexpected token '${this._lexer.token}'`);
    }
  }

  private _parseRoot(terminators: Token[]): NodeInterface {
    return this._parse0(terminators);
  }

  public parse(): NodeInterface {
    return this._parseRoot(['end']);
  }
}
