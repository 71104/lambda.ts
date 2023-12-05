import { LambdaNode, NativeNode, NodeInterface, SemiNativeNode } from './ast.js';
import { Context } from './context.js';
import { InternalError, RuntimeError } from './errors.js';
import { UnknownType } from './types.js';

export type ValueConstructor<ValueType extends ValueInterface> =
  | { INSTANCE: ValueType }
  | { new (...args: never[]): ValueType };

export interface ValueInterface {
  toString(): string;

  cast<ValueType extends ValueInterface>(constructor: ValueConstructor<ValueType>): ValueType;

  bindThis(thisValue: ValueInterface): ValueInterface;

  getField(name: string): ValueInterface;

  marshal(): unknown;
}

export type ValueContext = Context<ValueInterface>;
export const ValueContext = Context<ValueInterface>;
export const EMPTY_VALUE_CONTEXT = ValueContext.create<ValueInterface>();

export function unmarshal(value: unknown): ValueInterface {
  switch (typeof value) {
    case 'undefined':
      return UndefinedValue.INSTANCE;
    case 'boolean':
      if (value) {
        return BooleanValue.TRUE;
      } else {
        return BooleanValue.FALSE;
      }
    case 'number':
      return new RealValue(value);
    case 'string':
      return new StringValue(value);
    case 'object':
      if (!value) {
        return NullValue.INSTANCE;
      } else if (value instanceof ComplexValue) {
        return value;
      } else if (Array.isArray(value)) {
        return new ListValue(value, 0, value.length);
      } else {
        return new NativeObjectValue(value);
      }
    case 'function':
      return Closure.unmarshal(value);
    default:
      throw new RuntimeError('unsupported value');
  }
}

abstract class BaseValue implements ValueInterface {
  public abstract toString(): string;

  public cast<ValueType extends ValueInterface>(
    constructor: ValueConstructor<ValueType>,
  ): ValueType {
    // @ts-expect-error
    if (this instanceof constructor) {
      return this as unknown as ValueType;
    } else {
      throw new InternalError(`bad value cast`);
    }
  }

  public abstract bindThis(thisValue: ValueInterface): ValueInterface;

  public abstract getField(name: string): ValueInterface;

  public abstract marshal(): unknown;
}

export class ObjectValue extends BaseValue implements ValueInterface {
  public constructor(public readonly fields: ValueContext) {
    super();
  }

  public toString(): string {
    return `{${this.fields.toArray((name, value) => `${name}: ${value}`).join(', ')}}`;
  }

  public bindThis(): ValueInterface {
    return this;
  }

  public getField(name: string): ValueInterface {
    if (this.fields.has(name)) {
      return this.fields.top(name).bindThis(this);
    } else {
      throw new RuntimeError(`object '${this}' doesn't have a field named ${JSON.stringify(name)}`);
    }
  }

  public marshal(): object {
    return this.fields.reduce<{ [name: string]: unknown }>((result, name, value) => {
      result[name] = value.marshal();
      return result;
    }, Object.create(null));
  }
}

export class NativeObjectValue extends BaseValue implements ValueInterface {
  public constructor(public readonly value: object) {
    super();
  }

  public toString(): string {
    return this.value.toString();
  }

  public bindThis(): ValueInterface {
    return this;
  }

  public getField(name: string): ValueInterface {
    return unmarshal((this.value as { [name: string]: unknown })[name]).bindThis(this);
  }

  public marshal(): object {
    return this.value;
  }
}

export class UndefinedValue extends BaseValue implements ValueInterface {
  public static readonly INSTANCE = new UndefinedValue();

  private constructor() {
    super();
  }

  public toString(): string {
    return 'undefined';
  }

  public bindThis(): ValueInterface {
    return this;
  }

  public getField(name: string): ValueInterface {
    throw new RuntimeError(`cannot access field ${JSON.stringify(name)} of 'undefined'`);
  }

  public marshal(): undefined {
    return void 0;
  }
}

export class NullValue extends BaseValue implements ValueInterface {
  public static readonly INSTANCE = new NullValue();

  private constructor() {
    super();
  }

  public toString(): string {
    return 'null';
  }

  public bindThis(): ValueInterface {
    return this;
  }

  public getField(name: string): ValueInterface {
    throw new RuntimeError(`cannot access field ${JSON.stringify(name)} of 'null'`);
  }

  public marshal(): null {
    return null;
  }
}

export class BooleanValue extends BaseValue implements ValueInterface {
  public static readonly PROTOTYPE = EMPTY_VALUE_CONTEXT;

  public static readonly TRUE = new BooleanValue(true);
  public static readonly FALSE = new BooleanValue(false);

  public constructor(public readonly value: boolean) {
    super();
  }

  public toString(): string {
    return this.value ? 'true' : 'false';
  }

  public bindThis(): ValueInterface {
    return this;
  }

  public getField(name: string): ValueInterface {
    if (BooleanValue.PROTOTYPE.has(name)) {
      return BooleanValue.PROTOTYPE.top(name).bindThis(this);
    } else {
      throw new RuntimeError(`'boolean' doesn't have a field named ${JSON.stringify(name)}`);
    }
  }

  public marshal(): boolean {
    return !!this.value;
  }
}

export class ComplexValue extends BaseValue implements ValueInterface {
  public static readonly PROTOTYPE = EMPTY_VALUE_CONTEXT;

  public readonly real: number;
  public readonly imaginary: number;

  public constructor(real: number, imaginary: number) {
    super();
    this.real = parseFloat(real as unknown as string);
    this.imaginary = parseFloat(imaginary as unknown as string);
  }

  public toString(): string {
    if (this.imaginary < 0) {
      return `${this.real}-${Math.abs(this.imaginary)}i`;
    } else {
      return `${this.real}+${Math.abs(this.imaginary)}i`;
    }
  }

  public bindThis(): ValueInterface {
    return this;
  }

  public getField(name: string): ValueInterface {
    if (ComplexValue.PROTOTYPE.has(name)) {
      return ComplexValue.PROTOTYPE.top(name).bindThis(this);
    } else {
      throw new RuntimeError(`'complex' doesn't have a field named ${JSON.stringify(name)}`);
    }
  }

  public marshal(): ComplexValue {
    return this;
  }
}

export class RealValue extends BaseValue implements ValueInterface {
  public static readonly PROTOTYPE = EMPTY_VALUE_CONTEXT;

  public readonly value: number;

  public constructor(value: number) {
    super();
    this.value = parseFloat(value as unknown as string);
  }

  public toString(): string {
    return '' + this.value;
  }

  public bindThis(): ValueInterface {
    return this;
  }

  public getField(name: string): ValueInterface {
    if (RealValue.PROTOTYPE.has(name)) {
      return RealValue.PROTOTYPE.top(name).bindThis(this);
    } else {
      throw new RuntimeError(`'real' doesn't have a field named ${JSON.stringify(name)}`);
    }
  }

  public marshal(): number {
    return this.value;
  }
}

export class RationalValue extends BaseValue implements ValueInterface {
  public static readonly PROTOTYPE = EMPTY_VALUE_CONTEXT;

  public readonly numerator: number;
  public readonly denominator: number;

  public constructor(numerator: number, denominator: number) {
    super();
    this.numerator = ~~numerator;
    this.denominator = ~~denominator;
  }

  public toString(): string {
    return `${this.numerator}/${this.denominator}`;
  }

  public bindThis(): ValueInterface {
    return this;
  }

  public getField(name: string): ValueInterface {
    if (RationalValue.PROTOTYPE.has(name)) {
      return RationalValue.PROTOTYPE.top(name).bindThis(this);
    } else {
      throw new RuntimeError(`'rational' doesn't have a field named ${JSON.stringify(name)}`);
    }
  }

  public marshal(): number {
    return this.numerator / this.denominator;
  }
}

export class IntegerValue extends BaseValue implements ValueInterface {
  public static readonly PROTOTYPE = EMPTY_VALUE_CONTEXT;

  public readonly value: number;

  public constructor(value: number) {
    super();
    this.value = ~~value;
  }

  public toString(): string {
    return '' + this.value;
  }

  public bindThis(): ValueInterface {
    return this;
  }

  public getField(name: string): ValueInterface {
    if (IntegerValue.PROTOTYPE.has(name)) {
      return IntegerValue.PROTOTYPE.top(name).bindThis(this);
    } else {
      throw new RuntimeError(`'integer' doesn't have a field named ${JSON.stringify(name)}`);
    }
  }

  public marshal(): number {
    return this.value;
  }
}

export class NaturalValue extends BaseValue implements ValueInterface {
  public static readonly PROTOTYPE = EMPTY_VALUE_CONTEXT;
  public readonly value: number;

  public constructor(value: number) {
    super();
    this.value = ~~value;
    if (this.value < 0) {
      throw new InternalError(`natural values must not be negative (received ${value})`);
    }
  }

  public toString(): string {
    return '' + this.value;
  }

  public bindThis(): ValueInterface {
    return this;
  }

  public getField(name: string): ValueInterface {
    if (NaturalValue.PROTOTYPE.has(name)) {
      return NaturalValue.PROTOTYPE.top(name).bindThis(this);
    } else {
      throw new RuntimeError(`'natural' doesn't have a field named ${JSON.stringify(name)}`);
    }
  }

  public marshal(): number {
    return this.value;
  }
}

export class StringValue extends BaseValue implements ValueInterface {
  public static readonly PROTOTYPE = EMPTY_VALUE_CONTEXT;

  public readonly value: string;

  public constructor(value: string) {
    super();
    this.value = '' + value;
  }

  public toString(): string {
    return JSON.stringify(this.value);
  }

  public bindThis(): ValueInterface {
    return this;
  }

  public getField(name: string): ValueInterface {
    if (StringValue.PROTOTYPE.has(name)) {
      return StringValue.PROTOTYPE.top(name).bindThis(this);
    } else {
      throw new RuntimeError(`'string' doesn't have a field named ${JSON.stringify(name)}`);
    }
  }

  public marshal(): string {
    return this.value;
  }
}

export class ListValue extends BaseValue implements ValueInterface {
  public static readonly PROTOTYPE = EMPTY_VALUE_CONTEXT;

  public constructor(
    public readonly array: ValueInterface[],
    public readonly offset: number,
    public readonly count: number,
  ) {
    super();
    if (offset < 0) {
      throw new RuntimeError(`offset must not be negative (was ${offset})`);
    }
    if (offset > array.length) {
      throw new RuntimeError(
        `offset is out of bounds (received ${offset}, must be < ${array.length})`,
      );
    }
    if (count < 0) {
      throw new RuntimeError(`count must not be negative (was ${count})`);
    }
    if (offset + count > array.length) {
      throw new RuntimeError(
        `count is out of bounds (must be ${offset} + ${count} <= ${array.length})`,
      );
    }
  }

  private *_elements(): Generator<ValueInterface> {
    for (let i = this.offset; i < this.offset + this.count; i++) {
      yield this.array[i];
    }
  }

  public get elements(): Generator<ValueInterface> {
    return this._elements();
  }

  public toString(): string {
    return `[${[...this.elements].map(value => value.toString()).join(', ')}]`;
  }

  public bindThis(): ValueInterface {
    return this;
  }

  public getField(name: string): ValueInterface {
    if (ListValue.PROTOTYPE.has(name)) {
      return ListValue.PROTOTYPE.top(name).bindThis(this);
    } else {
      throw new RuntimeError(`'list' doesn't have a field named ${JSON.stringify(name)}`);
    }
  }

  public marshal(): unknown[] {
    return [...this.elements].map(element => element.marshal());
  }
}

export class TupleValue extends BaseValue implements ValueInterface {
  public static readonly PROTOTYPE = EMPTY_VALUE_CONTEXT;

  public constructor(public readonly elements: ValueInterface[]) {
    super();
  }

  public toString(): string {
    return `(${this.elements.map(element => element.toString()).join(', ')})`;
  }

  public bindThis(): ValueInterface {
    return this;
  }

  public getField(name: string): ValueInterface {
    if (TupleValue.PROTOTYPE.has(name)) {
      return TupleValue.PROTOTYPE.top(name).bindThis(this);
    } else {
      throw new RuntimeError(`'tuple' doesn't have a field named ${JSON.stringify(name)}`);
    }
  }

  public marshal(): unknown[] {
    return this.elements.map(element => element.marshal());
  }
}

export class Closure extends BaseValue implements ValueInterface {
  public static readonly PROTOTYPE = EMPTY_VALUE_CONTEXT;

  public constructor(
    public readonly context: ValueContext,
    public readonly name: string,
    public readonly body: NodeInterface,
  ) {
    super();
  }

  public toString(): string {
    return 'closure';
  }

  public apply(argument: ValueInterface): ValueInterface {
    return this.body.evaluate(this.context.push(this.name, argument));
  }

  public bindThis(thisValue: ValueInterface): ValueInterface {
    return this.apply(thisValue);
  }

  public getField(name: string): ValueInterface {
    if (Closure.PROTOTYPE.has(name)) {
      return Closure.PROTOTYPE.top(name).bindThis(this);
    } else {
      throw new RuntimeError(`'closure' doesn't have a field named ${JSON.stringify(name)}`);
    }
  }

  private _getArgNames(): string[] {
    const names = [this.name];
    for (let node = this.body; node instanceof LambdaNode; node = node.body) {
      names.push(node.name);
    }
    return names;
  }

  // eslint-disable-next-line @typescript-eslint/ban-types
  public marshal(): Function {
    const node = this.body;
    const context = this.context;
    const argNames = this._getArgNames();
    return function (...args: unknown[]): unknown {
      const hash: { [name: string]: ValueInterface } = Object.create(null);
      // @ts-expect-error
      hash.this = unmarshal(this);
      argNames.forEach((name, index) => (hash[name] = unmarshal(args[index])));
      return node.evaluate(context.pushAll(hash)).marshal();
    };
  }

  // eslint-disable-next-line @typescript-eslint/ban-types
  public static unmarshal(fn: Function): Closure {
    return new Closure(
      EMPTY_VALUE_CONTEXT,
      'this',
      new LambdaNode('arguments', null, new NativeNode(fn)),
    );
  }

  // eslint-disable-next-line @typescript-eslint/ban-types
  public static wrap(fn: Function): Closure {
    const arity = fn.length;
    if (arity < 1) {
      throw new InternalError('cannot wrap a no-arg function');
    }
    let node = new LambdaNode(
      '$' + arity,
      null,
      new SemiNativeNode(UnknownType.INSTANCE, fn as (...args: ValueInterface[]) => ValueInterface),
    );
    for (let i = arity - 1; i > 0; i--) {
      node = new LambdaNode('$' + i, null, node);
    }
    return node.evaluate(EMPTY_VALUE_CONTEXT);
  }
}
