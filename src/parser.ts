import {
  ApplicationNode,
  FixNode,
  LambdaNode,
  LetNode,
  LiteralNode,
  NodeInterface,
  VariableNode,
} from './ast.js';
import { InternalError, SyntaxError } from './errors.js';
import { Lexer, Token } from './lexer.js';
import {
  BooleanType,
  ComplexType,
  IntegerType,
  LambdaType,
  NaturalType,
  NullType,
  RealType,
  StringType,
  TauType,
  TypeScheme,
  UndefinedType,
  VariableType,
} from './types.js';
import {
  BooleanValue,
  ComplexValue,
  NaturalValue,
  NullValue,
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

  private _parseType(): TauType {
    switch (this._lexer.token) {
      case 'bracket-left': {
        this._lexer.next();
        const type = this._parseType();
        this._lexer.skip('bracket-right');
        return type;
      }
      case 'identifier':
        return new VariableType(this._lexer.step());
      case 'keyword:boolean':
        this._lexer.next();
        return BooleanType.INSTANCE;
      case 'keyword:complex':
        this._lexer.next();
        return ComplexType.INSTANCE;
      case 'keyword:fn': {
        this._lexer.next();
        const left = this._parseType();
        this._lexer.expect('fat-arrow');
        const right = this._parseType();
        return new LambdaType(left, right);
      }
      case 'keyword:integer':
        this._lexer.next();
        return IntegerType.INSTANCE;
      case 'keyword:natural':
        this._lexer.next();
        return NaturalType.INSTANCE;
      case 'keyword:real':
        this._lexer.next();
        return RealType.INSTANCE;
      case 'keyword:string':
        this._lexer.next();
        return StringType.INSTANCE;
      case 'keyword:undefined':
        this._lexer.next();
        return UndefinedType.INSTANCE;
      default:
        throw new SyntaxError(`unexpected token: '${this._lexer.token}'`);
    }
  }

  private _parseOptionalType(): TauType | null {
    if ('colon' !== this._lexer.token) {
      return null;
    } else {
      this._lexer.next();
      return this._parseType();
    }
  }

  private _parseOptionalTypeScheme(): TypeScheme | null {
    if ('colon' !== this._lexer.token) {
      return null;
    }
    if (this._lexer.next() !== 'keyword:scheme') {
      return new TypeScheme([], this._parseType());
    } else {
      const names: string[] = [];
      do {
        this._lexer.next();
        names.push(this._lexer.expect('identifier'));
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
      } while (this._lexer.token === 'comma');
      this._lexer.skip('fat-arrow');
      return new TypeScheme(names, this._parseType());
    }
  }

  private _parseLambdaInternal(terminators: Token[]): NodeInterface {
    const name = this._lexer.expect('identifier');
    const type = this._parseOptionalType();
    switch (this._lexer.token) {
      case 'comma':
        this._lexer.next();
        return new LambdaNode(name, type, this._parseLambdaInternal(terminators));
      case 'arrow':
        this._lexer.next();
        return new LambdaNode(name, type, this._parseRoot(terminators));
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
    const type = this._parseOptionalTypeScheme();
    this._lexer.skip('assign');
    const expression = this._parseRoot(['comma', 'keyword:in']);
    switch (this._lexer.token) {
      case 'comma':
        this._lexer.next();
        return new LetNode(name, type, expression, this._parseLetInternal(terminators));
      case 'keyword:in':
        this._lexer.next();
        return new LetNode(name, type, expression, this._parseRoot(terminators));
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
        this._lexer.next();
        const inner = this._parseRoot(['bracket-right']);
        this._lexer.skip('bracket-right');
        return inner;
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
      case 'keyword:null':
        this._lexer.next();
        return new LiteralNode(NullValue.INSTANCE, NullType.INSTANCE);
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

  public resetVariableGenerator(): void {
    VariableType.resetNextId();
  }
}
