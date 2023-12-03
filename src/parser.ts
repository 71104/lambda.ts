import {
  ApplicationNode,
  FixNode,
  LambdaNode,
  LetNode,
  LiteralNode,
  NodeInterface,
  VariableNode,
} from './ast.js';
import { InternalError } from './errors.js';
import { Lexer, Token } from './lexer.js';
import {
  BooleanType,
  ComplexType,
  NaturalType,
  RealType,
  StringType,
  UndefinedType,
} from './types.js';
import {
  BooleanValue,
  ComplexValue,
  NaturalValue,
  RealValue,
  StringValue,
  UndefinedValue,
} from './values.js';

import './operators.js';
import './prototypes.js';

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
        return new LambdaNode(name, null, this._parseLambdaInternal(terminators));
      case 'arrow':
        this._lexer.next();
        return new LambdaNode(name, null, this._parseRoot(terminators));
      default:
        throw new SyntaxError(`unexpected token '${this._lexer.token}'`);
    }
  }

  private _parseLambda(terminators: Token[]): NodeInterface {
    this._lexer.skip('keyword:fn');
    return this._parseLambdaInternal(terminators);
  }

  private _parseLetInternal(terminators: Token[]): NodeInterface {
    const name = this._lexer.expect('identifier');
    this._lexer.skip('assign');
    const expression = this._parseRoot(['comma', 'keyword:in']);
    switch (this._lexer.token) {
      case 'comma':
        this._lexer.next();
        return new LetNode(name, expression, this._parseLetInternal(terminators));
      case 'keyword:in':
        this._lexer.next();
        return new LetNode(name, expression, this._parseRoot(terminators));
      default:
        throw new InternalError(`unexpected token '${this._lexer.token}'`);
    }
  }

  private _parseLet(terminators: Token[]): NodeInterface {
    this._lexer.skip('keyword:let');
    return this._parseLetInternal(terminators);
  }

  private _parse0(terminators: Token[]): NodeInterface {
    switch (this._lexer.token) {
      case 'bracket-left': {
        this._lexer.step();
        const node = this._parseRoot(['bracket-right']);
        this._lexer.expect('bracket-right');
        return node;
      }
      case 'complex': {
        const imaginaryValue = parseFloat(this._lexer.step());
        return new LiteralNode(new ComplexValue(0, imaginaryValue), ComplexType.INSTANCE);
      }
      case 'identifier':
        return new VariableNode(this._lexer.step());
      case 'keyword:false':
        this._lexer.next();
        return new LiteralNode(BooleanValue.FALSE, BooleanType.INSTANCE);
      case 'keyword:fix':
        this._lexer.next();
        return FixNode.INSTANCE;
      case 'keyword:fn':
        return this._parseLambda(terminators);
      case 'keyword:let':
        return this._parseLet(terminators);
      case 'keyword:true':
        this._lexer.next();
        return new LiteralNode(BooleanValue.TRUE, BooleanType.INSTANCE);
      case 'keyword:undefined':
        this._lexer.next();
        return new LiteralNode(UndefinedValue.INSTANCE, UndefinedType.INSTANCE);
      case 'natural': {
        const naturalValue = parseInt(this._lexer.step(), 10);
        return new LiteralNode(new NaturalValue(naturalValue), NaturalType.INSTANCE);
      }
      case 'real': {
        const realValue = parseFloat(this._lexer.step());
        return new LiteralNode(new RealValue(realValue), RealType.INSTANCE);
      }
      case 'string': {
        const label = this._lexer.step();
        const stringValue = unescapeString(label.slice(1, -1));
        return new LiteralNode(new StringValue(stringValue), StringType.INSTANCE);
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
