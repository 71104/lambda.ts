import { Context } from './context.js';

export abstract class TauType {
  public abstract toString(): string;

  public abstract getFreeVariables(): Set<string>;

  public abstract substitute(substitution: Substitution): TauType;

  public abstract leq(other: TauType, substitution: Substitution): Substitution | null;

  public close(context?: TypeContext): TypeScheme {
    if (context) {
      return new TypeScheme(
        [...this.getFreeVariables()].filter(name => !context.has(name)),
        this,
      );
    } else {
      return new TypeScheme([...this.getFreeVariables()], this);
    }
  }
}

export type Substitution = Context<TauType>;
export const Substitution = Context<TauType>;
export const EMPTY_SUBSTITUTION = Substitution.create<TauType>();

export abstract class IotaType extends TauType {
  public getFreeVariables(): Set<string> {
    return new Set<string>();
  }

  public substitute(): IotaType {
    return this;
  }
}

export class TypeScheme {
  public constructor(
    public readonly names: string[],
    public readonly type: TauType,
  ) {}

  public toString(): string {
    if (this.names.length > 0) {
      return `scheme ${this.names.join(', ')} => ${this.type.toString()}`;
    } else {
      return this.type.toString();
    }
  }

  public substitute(substitution: Substitution): TypeScheme {
    return new TypeScheme(this.names, this.type.substitute(substitution.remove(...this.names)));
  }
}

export type TypeContext = Context<TypeScheme>;
export const TypeContext = Context<TypeScheme>;
export const EMPTY_TYPE_CONTEXT = TypeContext.create<TypeScheme>();

export class VariableType extends TauType {
  private static _next_id = 0;

  public static resetNextId(): void {
    VariableType._next_id = 0;
  }

  public constructor(public readonly name: string) {
    super();
  }

  public static getNew(): VariableType {
    return new VariableType('#' + VariableType._next_id++);
  }

  public toString(): string {
    return this.name;
  }

  public getFreeVariables(): Set<string> {
    return new Set<string>([this.name]);
  }

  public substitute(substitution: Substitution): TauType {
    if (substitution.has(this.name)) {
      return substitution.top(this.name).substitute(substitution);
    } else {
      return this;
    }
  }

  public leq(other: TauType, substitution: Substitution): Substitution | null {
    if (substitution.has(this.name)) {
      return substitution.top(this.name).substitute(substitution).leq(other, substitution);
    } else if (other instanceof VariableType) {
      if (this.name === other.name) {
        return substitution;
      } else if (substitution.has(other.name)) {
        return this.leq(substitution.top(other.name).substitute(substitution), substitution);
      } else {
        return substitution.push(other.name, this);
      }
    } else if (other.getFreeVariables().has(this.name)) {
      return null;
    } else {
      return substitution.push(this.name, other);
    }
  }
}

export class UndefinedType extends IotaType {
  public static readonly INSTANCE = new UndefinedType();

  private constructor() {
    super();
  }

  public toString(): string {
    return 'undefined';
  }

  public leq(other: TauType, substitution: Substitution): Substitution | null {
    if (other instanceof UndefinedType) {
      return substitution;
    } else if (other instanceof VariableType) {
      if (substitution.has(other.name)) {
        return this.leq(substitution.top(other.name).substitute(substitution), substitution);
      } else {
        return substitution.push(other.name, this);
      }
    } else {
      return null;
    }
  }
}

export class UnknownType extends IotaType {
  public static readonly INSTANCE = new UnknownType();

  private constructor() {
    super();
  }

  public toString(): string {
    return 'unknown';
  }

  public leq(_other: TauType, substitution: Substitution): Substitution | null {
    return substitution;
  }
}

export class NullType extends IotaType {
  public static readonly INSTANCE = new NullType();

  private constructor() {
    super();
  }

  public toString(): string {
    return 'null';
  }

  public leq(other: TauType, substitution: Substitution): Substitution | null {
    if (other instanceof UndefinedType || other instanceof NullType) {
      return substitution;
    } else if (other instanceof VariableType) {
      if (substitution.has(other.name)) {
        return this.leq(substitution.top(other.name).substitute(substitution), substitution);
      } else {
        return substitution.push(other.name, this);
      }
    } else {
      return null;
    }
  }
}

export class BooleanType extends IotaType {
  public static readonly INSTANCE = new BooleanType();

  private constructor() {
    super();
  }

  public toString(): string {
    return 'boolean';
  }

  public leq(other: TauType, substitution: Substitution): Substitution | null {
    if (other instanceof UndefinedType || other instanceof BooleanType) {
      return substitution;
    } else if (other instanceof VariableType) {
      if (substitution.has(other.name)) {
        return this.leq(substitution.top(other.name).substitute(substitution), substitution);
      } else {
        return substitution.push(other.name, this);
      }
    } else {
      return null;
    }
  }
}

export class ComplexType extends IotaType {
  public static readonly INSTANCE = new ComplexType();

  private constructor() {
    super();
  }

  public toString(): string {
    return 'complex';
  }

  public leq(other: TauType, substitution: Substitution): Substitution | null {
    if (other instanceof UndefinedType || other instanceof ComplexType) {
      return substitution;
    } else if (other instanceof VariableType) {
      if (substitution.has(other.name)) {
        return this.leq(substitution.top(other.name).substitute(substitution), substitution);
      } else {
        return substitution.push(other.name, this);
      }
    } else {
      return null;
    }
  }
}

export class RealType extends IotaType {
  public static readonly INSTANCE = new RealType();

  private constructor() {
    super();
  }

  public toString(): string {
    return 'real';
  }

  public leq(other: TauType, substitution: Substitution): Substitution | null {
    if (
      other instanceof UndefinedType ||
      other instanceof ComplexType ||
      other instanceof RealType
    ) {
      return substitution;
    } else if (other instanceof VariableType) {
      if (substitution.has(other.name)) {
        return this.leq(substitution.top(other.name).substitute(substitution), substitution);
      } else {
        return substitution.push(other.name, this);
      }
    } else {
      return null;
    }
  }
}

export class IntegerType extends IotaType {
  public static readonly INSTANCE = new IntegerType();

  private constructor() {
    super();
  }

  public toString(): string {
    return 'integer';
  }

  public leq(other: TauType, substitution: Substitution): Substitution | null {
    if (
      other instanceof UndefinedType ||
      other instanceof ComplexType ||
      other instanceof RealType ||
      other instanceof IntegerType
    ) {
      return substitution;
    } else if (other instanceof VariableType) {
      if (substitution.has(other.name)) {
        return this.leq(substitution.top(other.name).substitute(substitution), substitution);
      } else {
        return substitution.push(other.name, this);
      }
    } else {
      return null;
    }
  }
}

export class NaturalType extends IotaType {
  public static readonly INSTANCE = new NaturalType();

  private constructor() {
    super();
  }

  public toString(): string {
    return 'natural';
  }

  public leq(other: TauType, substitution: Substitution): Substitution | null {
    if (
      other instanceof UndefinedType ||
      other instanceof ComplexType ||
      other instanceof RealType ||
      other instanceof IntegerType ||
      other instanceof NaturalType
    ) {
      return substitution;
    } else if (other instanceof VariableType) {
      if (substitution.has(other.name)) {
        return this.leq(substitution.top(other.name).substitute(substitution), substitution);
      } else {
        return substitution.push(other.name, this);
      }
    } else {
      return null;
    }
  }
}

export class StringType extends IotaType {
  public static readonly INSTANCE = new StringType();

  private constructor() {
    super();
  }

  public toString(): string {
    return 'string';
  }

  public leq(other: TauType, substitution: Substitution): Substitution | null {
    if (other instanceof UndefinedType || other instanceof StringType) {
      return substitution;
    } else if (other instanceof VariableType) {
      if (substitution.has(other.name)) {
        return this.leq(substitution.top(other.name).substitute(substitution), substitution);
      } else {
        return substitution.push(other.name, this);
      }
    } else {
      return null;
    }
  }
}

export class LambdaType extends TauType {
  public constructor(
    public readonly left: TauType,
    public readonly right: TauType,
  ) {
    super();
  }

  public toString(): string {
    return `fn (${this.left.toString()}) => (${this.right.toString()})`;
  }

  public getFreeVariables(): Set<string> {
    return new Set<string>([...this.left.getFreeVariables(), ...this.right.getFreeVariables()]);
  }

  public substitute(substitution: Substitution): TauType {
    return new LambdaType(this.left.substitute(substitution), this.right.substitute(substitution));
  }

  public leq(other: TauType, substitution: Substitution): Substitution | null {
    if (other instanceof UndefinedType) {
      return substitution;
    } else if (other instanceof LambdaType) {
      const leftResult = other.left.leq(this.left, substitution);
      if (leftResult) {
        return this.right.leq(other.right, leftResult);
      } else {
        return null;
      }
    } else if (other instanceof VariableType) {
      if (substitution.has(other.name)) {
        return this.leq(substitution.top(other.name).substitute(substitution), substitution);
      } else {
        return substitution.push(other.name, this);
      }
    } else {
      return null;
    }
  }
}
