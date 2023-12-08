import {
  ApplicationNode,
  FieldNode,
  FixNode,
  IfNode,
  LambdaNode,
  LetNode,
  ListLiteralNode,
  LiteralNode,
  NodeInterface,
  ObjectFieldNode,
  ObjectLiteralNode,
  TemplateStringLiteral,
  TupleLiteralNode,
  VariableNode,
} from './ast.js';
import { InternalError } from './errors.js';
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

  private _parseSubTermOrTuple(): NodeInterface {
    this._lexer.next();
    if (this._lexer.token === 'bracket-right') {
      this._lexer.step();
      return new TupleLiteralNode([]);
    }
    const first = this._parseRoot(['comma', 'bracket-right']);
    // @ts-expect-error
    if (this._lexer.token !== 'bracket-right') {
      this._lexer.skip('comma');
      const elements = [first];
      // @ts-expect-error
      while (this._lexer.token !== 'bracket-right') {
        elements.push(this._parseRoot(['comma', 'bracket-right']));
        if (this._lexer.token !== 'comma') {
          break;
        } else {
          this._lexer.next();
        }
      }
      this._lexer.skip('bracket-right');
      return new TupleLiteralNode(elements);
    } else {
      this._lexer.next();
      return first;
    }
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

  private _parseTemplate(): NodeInterface {
    const pieces: NodeInterface[] = [
      new LiteralNode(
        new StringValue(unescapeString(this._lexer.expect('template-begin').slice(1, -2))),
        StringType.INSTANCE,
      ),
    ];
    // eslint-disable-next-line no-constant-condition
    while (true) {
      pieces.push(this._parseRoot(['template-middle', 'template-end']));
      switch (this._lexer.token) {
        case 'template-middle':
          pieces.push(
            new LiteralNode(
              new StringValue(unescapeString(this._lexer.step().slice(1, -2))),
              StringType.INSTANCE,
            ),
          );
          break;
        case 'template-end':
          pieces.push(
            new LiteralNode(
              new StringValue(unescapeString(this._lexer.step().slice(1, -1))),
              StringType.INSTANCE,
            ),
          );
          return new TemplateStringLiteral(pieces);
        default:
          throw new InternalError(`template string expected but '${this._lexer.token}' found`);
      }
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

  private _parseObjectLiteral(): NodeInterface {
    this._lexer.skip('curly-left');
    const fields: ObjectFieldNode[] = [];
    while (this._lexer.token !== 'curly-right') {
      const name = this._lexer.expect('identifier-or-keyword');
      this._lexer.skip('colon');
      fields.push(new ObjectFieldNode(name, this._parseRoot(['comma', 'curly-right'])));
      if (this._lexer.token !== 'comma') {
        break;
      } else {
        this._lexer.next();
      }
    }
    this._lexer.skip('curly-right');
    return new ObjectLiteralNode(fields);
  }

  private _parseList(): NodeInterface {
    this._lexer.skip('square-left');
    const elements: NodeInterface[] = [];
    while ('square-right' !== this._lexer.token) {
      elements.push(this._parseRoot(['comma', 'square-right']));
      if ('comma' !== this._lexer.token) {
        break;
      } else {
        this._lexer.next();
      }
    }
    this._lexer.skip('square-right');
    return new ListLiteralNode(elements);
  }

  private _parseIf(terminators: Token[]): NodeInterface {
    this._lexer.skip('keyword:if');
    const condition = this._parseRoot(['keyword:then']);
    this._lexer.skip('keyword:then');
    const thenExpression = this._parseRoot(['keyword:else']);
    this._lexer.skip('keyword:else');
    const elseExpression = this._parseRoot(terminators);
    return new IfNode(condition, thenExpression, elseExpression);
  }

  private _parse0(terminators: Token[]): NodeInterface {
    switch (this._lexer.token) {
      case 'bracket-left':
        return this._parseSubTermOrTuple();
      case 'complex': {
        const imaginaryValue = parseFloat(this._lexer.step());
        return new LiteralNode(new ComplexValue(0, imaginaryValue), ComplexType.INSTANCE);
      }
      case 'curly-left':
        return this._parseObjectLiteral();
      case 'field':
        return FieldNode.create(this._lexer.step().substring(1));
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
      case 'keyword:if':
        return this._parseIf(terminators);
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
      case 'minus':
        return FieldNode.createBinaryOperator(this._lexer.step());
      case 'natural': {
        const naturalValue = parseInt(this._lexer.step(), 10);
        return new LiteralNode(new NaturalValue(naturalValue), NaturalType.INSTANCE);
      }
      case 'plus':
        return FieldNode.createBinaryOperator(this._lexer.step());
      case 'real': {
        const realValue = parseFloat(this._lexer.step());
        return new LiteralNode(new RealValue(realValue), RealType.INSTANCE);
      }
      case 'square-left':
        return this._parseList();
      case 'string':
      case 'template': {
        const label = this._lexer.step();
        const stringValue = unescapeString(label.slice(1, -1));
        return new LiteralNode(new StringValue(stringValue), StringType.INSTANCE);
      }
      case 'template-begin':
        return this._parseTemplate();
      default:
        throw new SyntaxError(`unexpected token '${this._lexer.token}'`);
    }
  }

  private _parse1(terminators: Token[]): NodeInterface {
    let node: NodeInterface = this._parse0(terminators);
    while (this._lexer.token === 'field') {
      node = new ApplicationNode(FieldNode.create(this._lexer.step().substring(1)), node);
    }
    return node;
  }

  private _parse2(terminators: Token[]): NodeInterface {
    switch (this._lexer.token) {
      case 'keyword:not':
      case 'tilde': {
        const operator = FieldNode.createUnaryOperator(this._lexer.step());
        if (terminators.includes(this._lexer.token)) {
          return operator;
        } else {
          return new ApplicationNode(operator, this._parse2(terminators));
        }
      }
      case 'minus':
        // Unary operator `-` cannot be used as a standalone function because it would be ambiguous
        // with its binary counterpart.
        return new ApplicationNode(
          FieldNode.createUnaryOperator(this._lexer.step()),
          this._parse2(terminators),
        );
      default:
        return this._parse1(terminators);
    }
  }

  private _parse3(terminators: Token[]): NodeInterface {
    let node = this._parse2(terminators);
    while (!terminators.includes(this._lexer.token)) {
      node = new ApplicationNode(node, this._parse2(terminators));
    }
    return node;
  }

  private _parse4(terminators: Token[]): NodeInterface {
    const operators: Token[] = ['plus', 'minus'];
    terminators = terminators.concat(operators);
    let node = this._parse3(terminators);
    while (operators.includes(this._lexer.token)) {
      node = new ApplicationNode(
        new ApplicationNode(FieldNode.createBinaryOperator(this._lexer.step()), node),
        this._parse3(terminators),
      );
    }
    return node;
  }

  private _parseRoot(terminators: Token[]): NodeInterface {
    return this._parse4(terminators);
  }

  public parse(): NodeInterface {
    return this._parseRoot(['end']);
  }
}
