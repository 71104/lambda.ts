import { Context } from './context.js';

/**
 * Represents a type with zero or more type variables in its structure, also known as a "tau type"
 * in the original HMD paper[^1].
 *
 * [^1]: https://web.cs.wpi.edu/~cs4536/c12/milner-damas_principal_types.pdf
 */
export abstract class TauType {
  public abstract toString(): string;

  /**
   * Returns a map of all type variables in this type and its subtypes, indexed by variable name.
   */
  public abstract getFreeVariables(): Map<string, VariableType>;

  /**
   * Substitutes type variables recursively. The returned `TauType` will no longer have any of the
   * type variables whose names were in the substitution.
   *
   * WARNING: this method doesn't check the substituted types against possible constraints of their
   * respective variables. The caller is responsible for checking before adding types into a
   * `Substitution` object.
   *
   * @param substitution A mapping from the variables to substitute to their respective tau types.
   */
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

  /**
   * Solves a type equation of the form "this less than or equal to other" by performing Robinson
   * unification. "leq" stands for "less than or equal to", meaning that the left-hand side type is
   * a subset of the right-hand side.
   *
   * If the equation is compatible the algorithm returns a `Substitution` object containing the
   * requirements to satisfy it, otherwise it returns `null`. The new `Substitution` object will
   * also include all preexisting requirements specified in the `substitution` argument.
   *
   * This algorithm is the core of the entire type system.
   *
   * @param other The right-hand side of the equation.
   * @param substitution Preexisting requirements.
   * @returns A `Substitution` containing all requirements (both new and preexisting) to satisfy
   *  the equation; `null` if the equation is incompatible.
   */
  public abstract leq(other: TauType, substitution: Substitution): Substitution | null;

  /**
   * Invokes `leq` using an empty `substitution` (i.e. no preexisting requirements) and returns a
   * boolean indicating whether the equation is compatible.
   *
   * @param other The right-hand side of the type equation.
   * @returns True iff the equation is compatible.
   */
  public leqSimple(other: TauType): boolean {
    const result = this.leq(other, EMPTY_SUBSTITUTION);
    return !!result && result.isEmpty();
  }

  /**
   * Like `leq`, but throws a `TypeError` instead of returning `null` if the equation is
   * incompatible.
   *
   * @param other The right-hand side of the equation.
   * @param substitution Preexisting requirements.
   * @returns A `Substitution` containing all requirements (both new and preexisting) to satisfy
   *  the equation.
   * @throws A `TypeError` if the equation is incompatible.
   */
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

/**
 * Contains data returned by the typing algorithm (i.e. the `NodeInterface.getType` methods).
 *
 * The caller of the typing algorithm can safely assume that `substitution` has already been
 * applied to `type`, therefore implementors must always perform the substitution before
 * constructing the `TypeResults`.
 */
export class TypeResults {
  public constructor(
    public readonly substitution: Substitution,
    public readonly type: TauType,
  ) {}
}

/**
 * Represents a primitive type (e.g. numbers, strings, etc.), also known as a "iota type" in the
 * original HMD paper[^1].
 *
 * [^1]: https://web.cs.wpi.edu/~cs4536/c12/milner-damas_principal_types.pdf
 */
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

/**
 * Represents a "type scheme" as defined in the original HMD paper[^1], that is a tau type with
 * some bound variables. By contrast, all variables in tau types are free.
 *
 * A type scheme contains the list of bound variables and a tau type. Note that the tau type may
 * contain extra variables that are not bound in this scheme.
 *
 * [^1]: https://web.cs.wpi.edu/~cs4536/c12/milner-damas_principal_types.pdf
 */
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

  /**
   * Instantiates this type scheme into a tau type by replacing all bound variables with new ones,
   * maintaining their respective constraints.
   *
   * Replacing variables with new ones is a crucial element of algorithm W. Instantiation is
   * performed every time the type of a program variable is read from the `TypeContext`.
   *
   * @returns The instantiated tau type.
   */
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

  /**
   * Returns the type variables that are still free in this scheme, i.e. the free variables of the
   * wrapped tau type minus those bound by the scheme.
   */
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
    const variables = this.type.getFreeVariables();
    const hash: { [name: string]: TauType } = Object.create(null);
    this.names.forEach((name, index) => {
      hash[name] = VariableType.create(`$${index + 1}`, variables.get(name)!.constraints);
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

/**
 * Represents a type variable.
 *
 * In Lambda, type variables may have one or more "constraints". Each constraint is a tau type and
 * the variable may only be replaced by a type that's a subtype of at least one of the contraints.
 * Constraints are used to implement Lambda's union types, e.g. `integer|string`.
 */
export class VariableType extends TauType {
  private static _next_id = 0;

  /**
   * Called at construction time to eliminate redundant constraints. For example, the union type
   * `real|integer` is automatically converted into a single `real` constraint because `integer` is
   * a subtype of `real`.
   *
   * @param constraints The constraints specified by the user at construction.
   * @returns The optimized constraints.
   */
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
        if (flattened[i].leqSimple(flattened[j])) {
          removed[i] = true;
        } else if (flattened[j].leqSimple(flattened[i])) {
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

  /**
   * Constructs a `VariableType` with the specified name and constraints. If the name is `null` a
   * new unique name is automatically assigned.
   */
  private constructor(name: string | null, constraints: TauType[] = []) {
    super();
    if (name !== null) {
      this.name = name;
    } else {
      this.name = '#' + VariableType._next_id++;
    }
    this.constraints = VariableType._optimizeConstraints(constraints);
  }

  /**
   * Returns a new type variable with a new unique name and the specified constraints.
   */
  public static getNew(constraints: TauType[] = []): VariableType {
    return new VariableType(null, constraints);
  }

  /**
   * Like `getNew`, but passes the newly generated variable to the specified callback rather than
   * returning it directly. It then returns whatever value is returned by the callback.
   */
  public static newVar<Result>(callback: (variable: VariableType) => Result): Result {
    return callback(VariableType.getNew());
  }

  /**
   * Creates a new type variable with the specified name and constraints.
   */
  public static create(name: string, constraints: TauType[] = []): VariableType {
    return new VariableType(name, constraints);
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
    } else if (this.constraints.length > 0) {
      return new VariableType(
        this.name,
        this.constraints.map(type => type.substitute(substitution)),
      );
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

export class ObjectType extends TauType {
  public static readonly EMPTY = new ObjectType(Context.create<TauType>(), /*bind=*/ false);

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

  private constructor(fields: Context<TauType>, bind: boolean) {
    super();
    if (bind) {
      this.fields = ObjectType._bindFields(this, fields);
    } else {
      this.fields = fields;
    }
  }

  public static create(fields: Context<TauType>): ObjectType {
    return new ObjectType(fields, /*bind=*/ true);
  }

  public toString(): string {
    return 'object';
  }

  public getFreeVariables(): Map<string, VariableType> {
    const variables = new Map<string, VariableType>();
    this.fields.forEach((_name, field) => {
      field.getFreeVariables().forEach((variable, name) => {
        variables.set(name, variable);
      });
    });
    return variables;
  }

  public substitute(substitution: Substitution): ObjectType {
    return new ObjectType(
      this.fields.map((_name, field) => field.substitute(substitution)),
      /*bind=*/ false,
    );
  }

  public bindThis(_thisType: TauType, substitution: Substitution): TypeResults {
    return new TypeResults(substitution, this);
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
