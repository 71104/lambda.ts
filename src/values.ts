import { NodeInterface } from './ast.js';
import { Context } from './context.js';
import { InternalError, RuntimeError } from './errors.js';

export interface ValueInterface {
  toString(): string;

  bindThis(thisValue: ValueInterface): ValueInterface;

  getField(name: string): ValueInterface;
}

export type ValueContext = Context<ValueInterface>;
export const ValueContext = Context<ValueInterface>;
export const EMPTY_VALUE_CONTEXT = ValueContext.create<ValueInterface>();

export class ObjectValue implements ValueInterface {
  public constructor(public readonly fields: ValueContext) {}

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
    throw new RuntimeError(`cannot access field ${JSON.stringify(name)} of 'undefined'`);
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
    throw new RuntimeError(`cannot access field ${JSON.stringify(name)} of 'null'`);
  }
}

export class BooleanValue implements ValueInterface {
  public static readonly PROTOTYPE = EMPTY_VALUE_CONTEXT;

  public static readonly TRUE = new BooleanValue(true);
  public static readonly FALSE = new BooleanValue(false);

  private constructor(public readonly value: boolean) {}

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
}

export class ComplexValue implements ValueInterface {
  public static readonly PROTOTYPE = EMPTY_VALUE_CONTEXT;

  public readonly real: number;
  public readonly imaginary: number;

  public constructor(real: number, imaginary: number) {
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
}

export class RealValue implements ValueInterface {
  public static readonly PROTOTYPE = EMPTY_VALUE_CONTEXT;

  public readonly value: number;

  public constructor(value: number) {
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
}

export class RationalValue implements ValueInterface {
  public static readonly PROTOTYPE = EMPTY_VALUE_CONTEXT;

  public readonly numerator: number;
  public readonly denominator: number;

  public constructor(numerator: number, denominator: number) {
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
}

export class IntegerValue implements ValueInterface {
  public static readonly PROTOTYPE = EMPTY_VALUE_CONTEXT;

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
      throw new RuntimeError(`'integer' doesn't have a field named ${JSON.stringify(name)}`);
    }
  }
}

export class NaturalValue implements ValueInterface {
  public static readonly PROTOTYPE = EMPTY_VALUE_CONTEXT;
  public readonly value: number;

  public constructor(value: number) {
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
      return NaturalValue.PROTOTYPE.top(name);
    } else {
      throw new RuntimeError(`'natural' doesn't have a field named ${JSON.stringify(name)}`);
    }
  }
}

export class StringValue implements ValueInterface {
  public static readonly PROTOTYPE = EMPTY_VALUE_CONTEXT;

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
      return StringValue.PROTOTYPE.top(name);
    } else {
      throw new RuntimeError(`'string' doesn't have a field named ${JSON.stringify(name)}`);
    }
  }
}

export class ListValue implements ValueInterface {
  public static readonly PROTOTYPE = EMPTY_VALUE_CONTEXT;

  public constructor(
    public readonly array: ValueInterface[],
    public readonly offset: number,
    public readonly count: number,
  ) {
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
      return ListValue.PROTOTYPE.top(name);
    } else {
      throw new RuntimeError(`'list' doesn't have a field named ${JSON.stringify(name)}`);
    }
  }
}

export class Closure implements ValueInterface {
  public static readonly PROTOTYPE = EMPTY_VALUE_CONTEXT;

  public constructor(
    public readonly context: ValueContext,
    public readonly name: string,
    public readonly body: NodeInterface,
  ) {}

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
      return Closure.PROTOTYPE.top(name);
    } else {
      throw new RuntimeError(`'closure' doesn't have a field named ${JSON.stringify(name)}`);
    }
  }
}
