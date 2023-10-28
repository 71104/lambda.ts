import { Context } from './context.js';

export abstract class TauType {
  public abstract toString(): string;

  public abstract getFreeVariables(): Map<string, VariableType>;

  public abstract substitute(substitution: Substitution): TauType;

  protected static _substituteIfNoCycles(
    substitution: Substitution,
    name: string,
    type: TauType,
  ): Substitution | null {
    substitution = substitution.push(name, type);
    const visited = new Set<string>();
    const visiting = [...type.getFreeVariables().keys()];
    while (visiting.length > 0) {
      const current = visiting.pop()!;
      if (current === name) {
        return null;
      }
      if (!visited.has(current)) {
        visited.add(current);
        if (substitution.has(current)) {
          const names = substitution.top(current).getFreeVariables().keys();
          visiting.push(...names);
        }
      }
    }
    return substitution;
  }

  public abstract bindThis(thisType: TauType, substitution: Substitution): TypeResults | null;

  public abstract leq(other: TauType, substitution: Substitution): Substitution | null;

  public simpleLeq(other: TauType): boolean {
    const result = this.leq(other, EMPTY_SUBSTITUTION);
    return !!result && result.isEmpty();
  }

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
        [...this.getFreeVariables().keys()].filter(name => !context.has(name)),
        this,
      );
    } else {
      return new TypeScheme([...this.getFreeVariables().keys()], this);
    }
  }

  public closeAndRename(): TypeScheme {
    return this.close().rename();
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
  public getFreeVariables(): Map<string, VariableType> {
    return new Map<string, VariableType>();
  }

  public substitute(): IotaType {
    return this;
  }

  public bindThis(_thisType: TauType, substitution: Substitution): TypeResults {
    return new TypeResults(substitution, this);
  }
}

export type IotaTypeName =
  | 'boolean'
  | 'complex'
  | 'real'
  | 'rational'
  | 'integer'
  | 'natural'
  | 'string';

export interface IotaTypeConstructor {
  INSTANCE: IotaType;
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
    const variables = this.type.getFreeVariables();
    const hash: { [name: string]: TauType } = Object.create(null);
    this.names.forEach(name => {
      if (variables.has(name)) {
        const variable = variables.get(name)!;
        hash[name] = VariableType.getNew(variable.constraints);
      } else {
        hash[name] = VariableType.getNew();
      }
    });
    return this.type.substitute(Substitution.create<TauType>(hash));
  }

  public getFreeVariables(): Map<string, VariableType> {
    const result = this.type.getFreeVariables();
    for (const name of this.names) {
      result.delete(name);
    }
    return result;
  }

  public substitute(substitution: Substitution): TypeScheme {
    return new TypeScheme(this.names, this.type.substitute(substitution.remove(...this.names)));
  }

  public rename(): TypeScheme {
    const hash: { [name: string]: TauType } = Object.create(null);
    this.names.forEach((name, index) => {
      hash[name] = VariableType.create(`$${index + 1}`);
    });
    return new TypeScheme(
      this.names.map((_name: string, index: number) => `$${index + 1}`),
      this.type.substitute(Substitution.create<TauType>(hash)),
    );
  }
}

export type TypeContext = Context<TypeScheme>;
export const TypeContext = Context<TypeScheme>;
export const EMPTY_TYPE_CONTEXT = TypeContext.create<TypeScheme>();

export class VariableType extends TauType {
  private static _next_id = 0;

  private static _optimizeConstraints(constraints: TauType[]): TauType[] {
    const flattened: TauType[] = [];
    constraints.forEach(type => {
      if (type instanceof VariableType && type.constraints) {
        flattened.push(...type.constraints);
      } else {
        flattened.push(type);
      }
    });
    const removed = flattened.map(() => false);
    for (let i = 0; i < flattened.length - 1; i++) {
      for (let j = i + 1; j < flattened.length; j++) {
        if (flattened[i].simpleLeq(flattened[j])) {
          removed[i] = true;
        } else if (flattened[j].simpleLeq(flattened[i])) {
          removed[j] = true;
        }
      }
    }
    const types: TauType[] = [];
    for (let i = 0; i < flattened.length; i++) {
      if (!removed[i]) {
        types.push(flattened[i]);
      }
    }
    return types;
  }

  public readonly name: string;
  public readonly constraints: TauType[];

  private constructor(name: string | null, constraints: TauType[] = []) {
    super();
    if (name !== null) {
      this.name = name;
    } else {
      this.name = '#' + VariableType._next_id++;
    }
    this.constraints = VariableType._optimizeConstraints(constraints);
  }

  public static getNew(constraints: TauType[] = []): VariableType {
    return new VariableType(null, constraints);
  }

  public static newVar<Result>(callback: (variable: VariableType) => Result): Result {
    return callback(VariableType.getNew());
  }

  public static create(name: string): VariableType {
    return new VariableType(name);
  }

  public toString(): string {
    if (this.constraints.length > 0) {
      return this.constraints.map(type => `(${type.toString()})`).join('|');
    } else {
      return this.name;
    }
  }

  public getFreeVariables(): Map<string, VariableType> {
    return new Map<string, VariableType>([[this.name, this]]);
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
        for (const type of this.constraints) {
          const result = type.leq(other, substitution);
          if (result) {
            substitution = result;
          } else {
            return null;
          }
        }
        return TauType._substituteIfNoCycles(substitution, other.name, this);
      }
    } else {
      return TauType._substituteIfNoCycles(substitution, this.name, other);
    }
  }

  public geq(other: TauType, substitution: Substitution): Substitution | null {
    if (substitution.has(this.name)) {
      return other.leq(substitution.top(this.name), substitution);
    } else if (this.constraints.length > 0) {
      const candidates = this.constraints
        .map(constraint => other.leq(constraint, substitution))
        .filter(candidate => !!candidate);
      if (candidates.length !== 1) {
        return null;
      } else {
        return TauType._substituteIfNoCycles(candidates[0]!, this.name, other);
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
      return other.geq(this, substitution);
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
      return other.geq(this, substitution);
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
      return other.geq(this, substitution);
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
      return other.geq(this, substitution);
    } else {
      return null;
    }
  }
}

export class Prototype {
  public static readonly EMPTY = new Prototype(EMPTY_TYPE_CONTEXT);

  public constructor(public readonly context: TypeContext) {}

  public leq(parent: TauType, other: ObjectType, substitution: Substitution): Substitution | null {
    return other.fields.reduce((substitution, name, field) => {
      if (!this.context.has(name)) {
        return null;
      }
      const bound = this.context.top(name).instantiate().bindThis(parent, substitution);
      if (bound) {
        return bound.type.leq(field, bound.substitution);
      } else {
        return null;
      }
    }, substitution);
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

  public getFreeVariables(): Map<string, VariableType> {
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
      return other.geq(this, substitution);
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
      return other.geq(this, substitution);
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
      return other.geq(this, substitution);
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
      return other.geq(this, substitution);
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
      return other.geq(this, substitution);
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
      return other.geq(this, substitution);
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
      return other.geq(this, substitution);
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
      return other.geq(this, substitution);
    } else {
      return null;
    }
  }
}

export class LambdaType extends TauType {
  public static readonly PROTOTYPE = new Prototype(
    TypeContext.create<TypeScheme>({
      prototype: ObjectType.EMPTY.close(),
    }),
  );

  public constructor(
    public readonly left: TauType,
    public readonly right: TauType,
  ) {
    super();
  }

  public toString(): string {
    return `fn (${this.left.toString()}) => (${this.right.toString()})`;
  }

  public getFreeVariables(): Map<string, VariableType> {
    return new Map<string, VariableType>([
      ...this.left.getFreeVariables(),
      ...this.right.getFreeVariables(),
    ]);
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
    } else if (other instanceof ObjectType) {
      return LambdaType.PROTOTYPE.leq(this, other, substitution);
    } else if (other instanceof LambdaType) {
      const leftResult = other.left.leq(this.left, substitution);
      if (leftResult) {
        return this.right.leq(other.right, leftResult);
      } else {
        return null;
      }
    } else if (other instanceof VariableType) {
      return other.geq(this, substitution);
    } else {
      return null;
    }
  }
}

export const IOTA_TYPE_CONSTRUCTORS: { [name in IotaTypeName]: IotaTypeConstructor } = {
  boolean: BooleanType,
  complex: ComplexType,
  real: RealType,
  rational: RationalType,
  integer: IntegerType,
  natural: NaturalType,
  string: StringType,
};
