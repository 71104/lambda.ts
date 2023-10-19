import { ApplicationNode, LambdaNode, LiteralNode, NodeInterface, VariableNode } from './ast.js';
import { SyntaxError } from './errors.js';
import { Lexer, Token } from './lexer.js';
import {
  BooleanValue,
  ComplexValue,
  NaturalValue,
  RealValue,
  StringValue,
  UndefinedValue,
} from './values.js';

function unescapeString(input: string): string {
  return input
    .replace(/\\b/g, '\b')
    .replace(/\\f/g, '\f')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\v/g, '\v')
    .replace(/\\\\/g, '\\');
}

export class Parser {
  private readonly _lexer: Lexer;

  public constructor(input: string) {
    this._lexer = new Lexer(input);
  }

  private _parseLambdaInternal(terminators: Token[]): NodeInterface {
    const name = this._lexer.expect('identifier');
    switch (this._lexer.token) {
      case 'comma':
        this._lexer.next();
        return new LambdaNode(name, this._parseLambdaInternal(terminators));
      case 'arrow':
        this._lexer.next();
        return new LambdaNode(name, this._parseRoot(terminators));
      default:
        throw new SyntaxError(`unexpected token '${this._lexer.token}'`);
    }
  }

  private _parseLambda(terminators: Token[]): NodeInterface {
    this._lexer.skip('keyword:fn');
    return this._parseLambdaInternal(terminators);
  }

  private _parse0(terminators: Token[]): NodeInterface {
    switch (this._lexer.token) {
      case 'bracket-left': {
        this._lexer.next();
        const inner = this._parseRoot(['bracket-right']);
        this._lexer.skip('bracket-right');
        return inner;
      }
      case 'complex':
        return new LiteralNode(new ComplexValue(0, parseFloat(this._lexer.step())));
      case 'identifier':
        return new VariableNode(this._lexer.step());
      case 'keyword:false':
        this._lexer.next();
        return new LiteralNode(BooleanValue.FALSE);
      case 'keyword:fn':
        return this._parseLambda(terminators);
      case 'keyword:true':
        this._lexer.next();
        return new LiteralNode(BooleanValue.TRUE);
      case 'keyword:undefined':
        this._lexer.next();
        return new LiteralNode(UndefinedValue.INSTANCE);
      case 'natural':
        return new LiteralNode(new NaturalValue(parseInt(this._lexer.step(), 10)));
      case 'real':
        return new LiteralNode(new RealValue(parseFloat(this._lexer.step())));
      case 'string': {
        const label = this._lexer.step();
        const stringValue = unescapeString(label.slice(1, -1));
        return new LiteralNode(new StringValue(stringValue));
      }
      default:
        throw new SyntaxError(`unexpected token '${this._lexer.token}'`);
    }
  }

  private _parse1(terminators: Token[]): NodeInterface {
    let node = this._parse0(terminators);
    while (!terminators.includes(this._lexer.token)) {
      node = new ApplicationNode(node, this._parse0(terminators));
    }
    return node;
  }

  private _parseRoot(terminators: Token[]): NodeInterface {
    return this._parse1(terminators);
  }

  public parse(): NodeInterface {
    return this._parseRoot(['end']);
  }
}
