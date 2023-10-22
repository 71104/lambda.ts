import { LambdaNode, NativeNode, NodeInterface, SemiNativeNode } from './ast.js';
import { Context } from './context.js';
import { InternalError, RuntimeError } from './errors.js';

export interface ValueInterface {
  toString(): string;

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
      } else if (value instanceof ComplexValue || value instanceof RationalValue) {
        return value;
      } else {
        return new NativeObjectValue(value);
      }
    case 'function':
      return Closure.unmarshal(value);
    default:
      throw new RuntimeError('unsupported value');
  }
}

export class UndefinedValue implements ValueInterface {
  private constructor() {}

  public static readonly INSTANCE = new UndefinedValue();

  public toString(): string {
    return 'undefined';
  }

  public bindThis(): ValueInterface {
    return this;
  }

  public getField(name: string): ValueInterface {
    throw new RuntimeError(`cannot read field ${JSON.stringify(name)} of undefined`);
  }

  public marshal(): undefined {
    return void 0;
  }
}

export class NullValue implements ValueInterface {
  private constructor() {}

  public static readonly INSTANCE = new NullValue();

  public toString(): string {
    return 'null';
  }

  public bindThis(): ValueInterface {
    return this;
  }

  public getField(name: string): ValueInterface {
    throw new RuntimeError(`cannot read field ${JSON.stringify(name)} of null`);
  }

  public marshal(): null {
    return null;
  }
}

export class ObjectValue implements ValueInterface {
  public static readonly EMPTY = new ObjectValue(EMPTY_VALUE_CONTEXT);

  public constructor(public readonly fields: ValueContext) {}

  public toString(): string {
    return 'object';
  }

  public bindThis(): ValueInterface {
    return this;
  }

  public getField(name: string): ValueInterface {
    if (this.fields.has(name)) {
      return this.fields.top(name).bindThis(this);
    } else {
      throw new RuntimeError(`object doesn't have a field named ${JSON.stringify(name)}`);
    }
  }

  public marshal(): object {
    const result: { [name: string]: unknown } = Object.create(null);
    this.fields.forEach((name, value) => (result[name] = value.marshal()));
    return result;
  }
}

export class NativeObjectValue implements ValueInterface {
  public constructor(public readonly value: object) {}

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

export class ListValue implements ValueInterface {
  public static readonly PROTOTYPE = EMPTY_VALUE_CONTEXT;
  public static readonly EMPTY = new ListValue([], 0, 0);

  public constructor(
    public readonly elements: ValueInterface[],
    public readonly offset: number,
    public readonly count: number,
  ) {
    if (offset < 0) {
      throw new RuntimeError(`invalid list view offset ${offset}`);
    }
    if (count < 0) {
      throw new RuntimeError(`invalid list view count ${count}`);
    }
    if (offset + count > elements.length) {
      throw new RuntimeError(
        `list view offset+count exceeds length (${offset}+${count}>${elements.length})`,
      );
    }
  }

  public toString(): string {
    return `[${this.elements.map(element => element.toString()).join(', ')}]`;
  }

  public bindThis(): ValueInterface {
    return this;
  }

  public getField(name: string): ValueInterface {
    if (ListValue.PROTOTYPE.has(name)) {
      return ListValue.PROTOTYPE.top(name).bindThis(this);
    } else {
      throw new RuntimeError(`cannot read field ${JSON.stringify(name)} of list`);
    }
  }

  public marshal(): unknown[] {
    return Array.from({ length: this.count }, (_, i) => this.elements[this.offset + i].marshal());
  }
}

export class BooleanValue implements ValueInterface {
  public static readonly PROTOTYPE = EMPTY_VALUE_CONTEXT;
  public static readonly FALSE = new BooleanValue(false);
  public static readonly TRUE = new BooleanValue(true);

  public readonly value: boolean;

  public constructor(value: boolean) {
    this.value = !!value;
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
      throw new RuntimeError(`cannot read field ${JSON.stringify(name)} of boolean`);
    }
  }

  public marshal(): boolean {
    return this.value;
  }
}

export class ComplexValue implements ValueInterface {
  public static readonly PROTOTYPE = EMPTY_VALUE_CONTEXT;
  public static readonly ZERO = new ComplexValue(0, 0);

  public readonly real: number;
  public readonly imaginary: number;

  public constructor(real: number, imaginary: number) {
    this.real = +real;
    this.imaginary = +imaginary;
  }

  public toString(): string {
    if (this.imaginary < 0) {
      return `${this.real}${this.imaginary}i`;
    } else {
      return `${this.real}+${this.imaginary}i`;
    }
  }

  public bindThis(): ValueInterface {
    return this;
  }

  public getField(name: string): ValueInterface {
    if (ComplexValue.PROTOTYPE.has(name)) {
      return ComplexValue.PROTOTYPE.top(name).bindThis(this);
    } else {
      throw new RuntimeError(`cannot read field ${JSON.stringify(name)} of complex`);
    }
  }

  public marshal(): ComplexValue {
    return this;
  }
}

export class RealValue implements ValueInterface {
  public static readonly PROTOTYPE = EMPTY_VALUE_CONTEXT;
  public static readonly ZERO = new RealValue(0);

  public readonly value: number;

  public constructor(value: number) {
    this.value = +value;
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
      throw new RuntimeError(`cannot read field ${JSON.stringify(name)} of real`);
    }
  }

  public marshal(): number {
    return this.value;
  }
}

export class RationalValue implements ValueInterface {
  public static readonly PROTOTYPE = EMPTY_VALUE_CONTEXT;
  public static readonly ZERO = new RationalValue(0, 1);

  public readonly numerator: number;
  public readonly denominator: number;

  public constructor(numerator: number, denominator: number) {
    this.numerator = ~~numerator;
    this.denominator = ~~denominator;
  }

  public toString(): string {
    if (Math.sign(this.numerator) != Math.sign(this.denominator)) {
      return `-${Math.abs(this.numerator)}/${Math.abs(this.denominator)}`;
    } else {
      return `${Math.abs(this.numerator)}/${Math.abs(this.denominator)}`;
    }
  }

  public bindThis(): ValueInterface {
    return this;
  }

  public getField(name: string): ValueInterface {
    if (RationalValue.PROTOTYPE.has(name)) {
      return RationalValue.PROTOTYPE.top(name).bindThis(this);
    } else {
      throw new RuntimeError(`cannot read field ${JSON.stringify(name)} of rational`);
    }
  }

  public marshal(): RationalValue {
    return this;
  }
}

export class IntegerValue implements ValueInterface {
  public static readonly PROTOTYPE = EMPTY_VALUE_CONTEXT;
  public static readonly ZERO = new IntegerValue(0);

  public readonly value: number;

  public constructor(value: number) {
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
      throw new RuntimeError(`cannot read field ${JSON.stringify(name)} of integer`);
    }
  }

  public marshal(): number {
    return this.value;
  }
}

export class NaturalValue implements ValueInterface {
  public static readonly PROTOTYPE = EMPTY_VALUE_CONTEXT;
  public static readonly ZERO = new NaturalValue(0);

  public readonly value: number;

  public constructor(value: number) {
    value = ~~value;
    if (value < 0) {
      throw new RuntimeError(`natural value must be positive (received ${value})`);
    }
    this.value = value;
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
      throw new RuntimeError(`cannot read field ${JSON.stringify(name)} of natural`);
    }
  }

  public marshal(): number {
    return this.value;
  }
}

export class StringValue implements ValueInterface {
  public static readonly PROTOTYPE = EMPTY_VALUE_CONTEXT;
  public static readonly EMPTY = new StringValue('');

  public readonly value: string;

  public constructor(value: string) {
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
      throw new RuntimeError(`cannot read field ${JSON.stringify(name)} of string`);
    }
  }

  public marshal(): string {
    return this.value;
  }
}

export class Closure implements ValueInterface {
  public constructor(
    public readonly context: ValueContext,
    public readonly name: string,
    public readonly body: NodeInterface,
  ) {}

  public toString(): string {
    return `closure`;
  }

  public bindThis(thisValue: ValueInterface): ValueInterface {
    return this.apply(thisValue);
  }

  public getField(name: string): ValueInterface {
    throw new RuntimeError(`cannot read field ${JSON.stringify(name)} of closure`);
  }

  public _getArgNames(): string[] {
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

  public apply(argument: ValueInterface): ValueInterface {
    return this.body.evaluate(this.context.push(this.name, argument));
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
      new SemiNativeNode(fn as (...args: ValueInterface[]) => ValueInterface),
    );
    for (let i = arity - 1; i > 0; i--) {
      node = new LambdaNode('$' + i, null, node);
    }
    return node.evaluate(EMPTY_VALUE_CONTEXT);
  }
}
