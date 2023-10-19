import { NodeInterface } from './ast.js';
import { Context } from './context.js';
import { RuntimeError } from './errors.js';

export interface ValueInterface {
  toString(): string;
}

export type ValueContext = Context<ValueInterface>;
export const ValueContext = Context<ValueInterface>;

export const EMPTY_VALUE_CONTEXT = ValueContext.create<ValueInterface>();

export class UndefinedValue implements ValueInterface {
  private constructor() {}

  public static readonly INSTANCE: UndefinedValue = new UndefinedValue();

  public toString(): string {
    return 'undefined';
  }
}

export class BooleanValue implements ValueInterface {
  public static readonly PROTOTYPE = EMPTY_VALUE_CONTEXT;
  public static readonly FALSE = new BooleanValue(false);
  public static readonly TRUE = new BooleanValue(true);

  public constructor(public readonly value: boolean) {}

  public toString(): string {
    return this.value ? 'true' : 'false';
  }
}

export class ComplexValue implements ValueInterface {
  public static readonly PROTOTYPE = EMPTY_VALUE_CONTEXT;
  public static readonly ZERO = new ComplexValue(0, 0);

  public constructor(
    public readonly real: number,
    public readonly imaginary: number,
  ) {}

  public toString(): string {
    if (this.imaginary < 0) {
      return `${this.real}${this.imaginary}i`;
    } else {
      return `${this.real}+${this.imaginary}i`;
    }
  }
}

export class RealValue implements ValueInterface {
  public static readonly PROTOTYPE = EMPTY_VALUE_CONTEXT;
  public static readonly ZERO = new RealValue(0);

  public constructor(public readonly value: number) {}

  public toString(): string {
    return '' + this.value;
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
}

export class StringValue implements ValueInterface {
  public static readonly PROTOTYPE = EMPTY_VALUE_CONTEXT;
  public static readonly EMPTY = new StringValue('');

  public constructor(public readonly value: string) {}

  public toString(): string {
    return JSON.stringify(this.value);
  }
}

export class Closure implements ValueInterface {
  public constructor(
    public readonly context: ValueContext,
    public readonly name: string,
    public readonly body: NodeInterface,
  ) {}

  public toString(): string {
    return `[Function]`;
  }

  public apply(argument: ValueInterface): ValueInterface {
    return this.body.evaluate(this.context.push(this.name, argument));
  }
}
