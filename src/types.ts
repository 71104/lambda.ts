import { Context } from './context.js';

export abstract class TauType {
  public abstract toString(): string;

  public abstract getFreeVariables(): Set<string>;

  public abstract substitute(substitution: Substitution): TauType;

  protected static _substituteIfNoCycles(
    substitution: Substitution,
    name: string,
    type: TauType,
  ): Substitution | null {
    substitution = substitution.push(name, type);
    const visited = new Set<string>();
    const visiting = [...type.getFreeVariables()];
    while (visiting.length > 0) {
      const current = visiting.pop()!;
      if (current === name) {
        return null;
      }
      if (!visited.has(current)) {
        visited.add(current);
        if (substitution.has(current)) {
          const names = substitution.top(current).getFreeVariables();
          visiting.push(...names);
        }
      }
    }
    return substitution;
  }

  public abstract bindThis(thisType: TauType, substitution: Substitution): TypeResults | null;

  public abstract leq(other: TauType, substitution: Substitution): Substitution | null;

  public leqOrThrow(other: TauType, substitution: Substitution): Substitution {
    const result = this.leq(other, substitution);
    if (result) {
      return result;
    } else {
      throw new TypeError(`cannot unify '${this.toString()}' and '${other.toString()}'`);
    }
  }

  public max(other: TauType, substitution: Substitution): TypeResults {
    const leftAttempt = this.leq(other, substitution);
    const rightAttempt = other.leq(this, substitution);
    if (leftAttempt) {
      return new TypeResults(leftAttempt, other.substitute(leftAttempt));
    } else if (rightAttempt) {
      return new TypeResults(rightAttempt, this.substitute(rightAttempt));
    } else {
      throw new TypeError(`cannot unify '${this.toString()}' and '${other.toString()}'`);
    }
  }

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

export class TypeResults {
  public constructor(
    public readonly substitution: Substitution,
    public readonly type: TauType,
  ) {}
}

export abstract class IotaType extends TauType {
  public getFreeVariables(): Set<string> {
    return new Set<string>();
  }

  public substitute(): IotaType {
    return this;
  }

  public bindThis(_thisType: TauType, substitution: Substitution): TypeResults {
    return new TypeResults(substitution, this);
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

  public instantiate(): TauType {
    const hash: { [name: string]: VariableType } = Object.create(null);
    this.names.forEach(name => (hash[name] = VariableType.getNew()));
    return this.type.substitute(Substitution.create<TauType>(hash));
  }

  public getFreeVariables(): Set<string> {
    const result = this.type.getFreeVariables();
    for (const name of this.names) {
      result.delete(name);
    }
    return result;
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

  public bindThis(thisType: TauType, substitution: Substitution): TypeResults | null {
    if (substitution.has(this.name)) {
      return this.substitute(substitution).bindThis(thisType, substitution);
    } else {
      return new TypeResults(substitution, VariableType.getNew());
    }
  }

  public leq(other: TauType, substitution: Substitution): Substitution | null {
    if (substitution.has(this.name)) {
      return this.substitute(substitution).leq(other, substitution);
    } else if (other instanceof VariableType) {
      if (this.name === other.name) {
        return substitution;
      } else if (substitution.has(other.name)) {
        return this.leq(other.substitute(substitution), substitution);
      } else {
        return TauType._substituteIfNoCycles(substitution, other.name, this);
      }
    } else {
      return TauType._substituteIfNoCycles(substitution, this.name, other);
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
        return this.leq(other.substitute(substitution), substitution);
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

  public leq(other: TauType, substitution: Substitution): Substitution | null {
    if (other instanceof ObjectType) {
      return other.fields.reduce((substitution, _name, field) => {
        return field.leq(UnknownType.INSTANCE, substitution);
      }, substitution);
    } else if (other instanceof ListType) {
      return new ListType(UnknownType.INSTANCE).leq(other, substitution);
    } else if (other instanceof LambdaType) {
      return new LambdaType(UndefinedType.INSTANCE, UnknownType.INSTANCE).leq(other, substitution);
    } else if (other instanceof VariableType) {
      if (substitution.has(other.name)) {
        return this.leq(other.substitute(substitution), substitution);
      } else {
        return substitution.push(other.name, this);
      }
    } else {
      return substitution;
    }
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
        return this.leq(other.substitute(substitution), substitution);
      } else {
        return substitution.push(other.name, this);
      }
    } else {
      return null;
    }
  }
}

export class ObjectType extends IotaType {
  public static readonly EMPTY = new ObjectType(Context.create<TauType>());

  public readonly fields: Context<TauType>;

  private static _bindField(parent: TauType, field: TauType): TauType {
    const result = field.bindThis(parent, EMPTY_SUBSTITUTION);
    if (result) {
      return result.type.substitute(result.substitution);
    } else {
      throw new TypeError(`cannot bind '${parent.toString()}' as 'this' in '${field.toString()}'`);
    }
  }

  private static _bindFields(parent: TauType, fields: Context<TauType>): Context<TauType> {
    return fields.map((_name, field) => ObjectType._bindField(parent, field));
  }

  public constructor(fields: Context<TauType>) {
    super();
    this.fields = ObjectType._bindFields(this, fields);
  }

  public toString(): string {
    return 'object';
  }

  public leq(other: TauType, substitution: Substitution): Substitution | null {
    if (other instanceof UndefinedType) {
      return substitution;
    } else if (other instanceof ObjectType) {
      return other.fields.reduce((substitution, name, field) => {
        if (this.fields.has(name)) {
          return this.fields.top(name).leq(field, substitution);
        } else {
          return null;
        }
      }, substitution);
    } else if (other instanceof VariableType) {
      if (substitution.has(other.name)) {
        return this.leq(other.substitute(substitution), substitution);
      } else {
        return TauType._substituteIfNoCycles(substitution, other.name, this);
      }
    } else {
      return null;
    }
  }
}

export class Prototype {
  public static readonly EMPTY = new Prototype(EMPTY_TYPE_CONTEXT);

  public constructor(public readonly context: TypeContext) {}

  private _bindField(parent: TauType, name: string, substitution: Substitution): TypeResults {
    const field = this.context.top(name).instantiate();
    const variable = VariableType.getNew();
    const result = field.leq(new LambdaType(parent, variable), substitution);
    if (result) {
      return new TypeResults(result, variable.substitute(result));
    } else {
      throw new TypeError(
        `cannot bind type '${parent.toString()}' to its field ${JSON.stringify(
          name,
        )} of type '${field.toString()}'`,
      );
    }
  }

  public leq(parent: TauType, other: ObjectType, substitution: Substitution): Substitution | null {
    return other.fields.reduce((substitution, name, field) => {
      if (!this.context.has(name)) {
        throw new TypeError(
          `cannot unify '${parent.toString()}' and '${other.toString()}': unknown field ${JSON.stringify(
            name,
          )}`,
        );
      }
      const bound = this._bindField(parent, name, substitution);
      return bound.type.leq(field, bound.substitution);
    }, substitution);
  }

  public getField(parent: TauType, name: string, substitution: Substitution): TypeResults {
    if (this.context.has(name)) {
      return this._bindField(parent, name, substitution);
    } else {
      throw new TypeError(`undefined field ${name}`);
    }
  }
}

export class ListType extends TauType {
  public static readonly PROTOTYPE = Prototype.EMPTY;

  public constructor(public readonly inner: TauType) {
    super();
  }

  public toString(): string {
    return `(${this.inner.toString()})[]`;
  }

  public getFreeVariables(): Set<string> {
    return this.inner.getFreeVariables();
  }

  public substitute(substitution: Substitution): TauType {
    return new ListType(this.inner.substitute(substitution));
  }

  public bindThis(_thisType: TauType, substitution: Substitution): TypeResults {
    return new TypeResults(substitution, this);
  }

  public leq(other: TauType, substitution: Substitution): Substitution | null {
    if (other instanceof UndefinedType) {
      return substitution;
    } else if (other instanceof ObjectType) {
      return ListType.PROTOTYPE.leq(this, other, substitution);
    } else if (other instanceof ListType) {
      return this.inner.leq(other.inner, substitution);
    } else if (other instanceof VariableType) {
      if (substitution.has(other.name)) {
        return this.leq(other.substitute(substitution), substitution);
      } else {
        return substitution.push(other.name, this);
      }
    } else {
      return null;
    }
  }
}

export class BooleanType extends IotaType {
  public static readonly PROTOTYPE = Prototype.EMPTY;
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
    } else if (other instanceof ObjectType) {
      return BooleanType.PROTOTYPE.leq(this, other, substitution);
    } else if (other instanceof VariableType) {
      if (substitution.has(other.name)) {
        return this.leq(other.substitute(substitution), substitution);
      } else {
        return substitution.push(other.name, this);
      }
    } else {
      return null;
    }
  }
}

export class ComplexType extends IotaType {
  public static readonly PROTOTYPE = Prototype.EMPTY;
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
    } else if (other instanceof ObjectType) {
      return ComplexType.PROTOTYPE.leq(this, other, substitution);
    } else if (other instanceof VariableType) {
      if (substitution.has(other.name)) {
        return this.leq(other.substitute(substitution), substitution);
      } else {
        return substitution.push(other.name, this);
      }
    } else {
      return null;
    }
  }
}

export class RealType extends IotaType {
  public static readonly PROTOTYPE = Prototype.EMPTY;
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
    } else if (other instanceof ObjectType) {
      return RealType.PROTOTYPE.leq(this, other, substitution);
    } else if (other instanceof VariableType) {
      if (substitution.has(other.name)) {
        return this.leq(other.substitute(substitution), substitution);
      } else {
        return substitution.push(other.name, this);
      }
    } else {
      return null;
    }
  }
}

export class RationalType extends IotaType {
  public static readonly PROTOTYPE = Prototype.EMPTY;
  public static readonly INSTANCE = new RationalType();

  private constructor() {
    super();
  }

  public toString(): string {
    return 'rational';
  }

  public leq(other: TauType, substitution: Substitution): Substitution | null {
    if (
      other instanceof UndefinedType ||
      other instanceof ComplexType ||
      other instanceof RealType ||
      other instanceof RationalType
    ) {
      return substitution;
    } else if (other instanceof ObjectType) {
      return RationalType.PROTOTYPE.leq(this, other, substitution);
    } else if (other instanceof VariableType) {
      if (substitution.has(other.name)) {
        return this.leq(other.substitute(substitution), substitution);
      } else {
        return substitution.push(other.name, this);
      }
    } else {
      return null;
    }
  }
}

export class IntegerType extends IotaType {
  public static readonly PROTOTYPE = Prototype.EMPTY;
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
      other instanceof RationalType ||
      other instanceof IntegerType
    ) {
      return substitution;
    } else if (other instanceof ObjectType) {
      return IntegerType.PROTOTYPE.leq(this, other, substitution);
    } else if (other instanceof VariableType) {
      if (substitution.has(other.name)) {
        return this.leq(other.substitute(substitution), substitution);
      } else {
        return substitution.push(other.name, this);
      }
    } else {
      return null;
    }
  }
}

export class NaturalType extends IotaType {
  public static readonly PROTOTYPE = Prototype.EMPTY;
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
      other instanceof RationalType ||
      other instanceof IntegerType ||
      other instanceof NaturalType
    ) {
      return substitution;
    } else if (other instanceof ObjectType) {
      return NaturalType.PROTOTYPE.leq(this, other, substitution);
    } else if (other instanceof VariableType) {
      if (substitution.has(other.name)) {
        return this.leq(other.substitute(substitution), substitution);
      } else {
        return substitution.push(other.name, this);
      }
    } else {
      return null;
    }
  }
}

export class StringType extends IotaType {
  public static readonly PROTOTYPE = Prototype.EMPTY;
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
    } else if (other instanceof ObjectType) {
      return StringType.PROTOTYPE.leq(this, other, substitution);
    } else if (other instanceof VariableType) {
      if (substitution.has(other.name)) {
        return this.leq(other.substitute(substitution), substitution);
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

  public bindThis(thisType: TauType, substitution: Substitution): TypeResults | null {
    const result = this.leq(new LambdaType(thisType, this.right), substitution);
    if (result) {
      return new TypeResults(result, this.right.substitute(result));
    } else {
      return null;
    }
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
        return this.leq(other.substitute(substitution), substitution);
      } else {
        return TauType._substituteIfNoCycles(substitution, other.name, this);
      }
    } else {
      return null;
    }
  }
}
