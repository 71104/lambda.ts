import { Context } from './context.js';

export interface TypeInterface {
  toString(): string;

  getFreeVariables(): Set<string>;

  instantiate(constraints: Constraints, substitution: Substitution): TypingResults;

  substitute(substitution: Substitution): TypeInterface;
}

export type TypeContext = Context<TypeInterface>;
export const TypeContext = Context<TypeInterface>;
export const EMPTY_TYPE_CONTEXT = TypeContext.create<TypeInterface>();

export class TypeScheme implements TypeInterface {
  public constructor(
    public readonly name: string,
    public readonly constraint: TypeInterface,
    public readonly inner: TypeInterface,
  ) {}

  public toString(): string {
    const variables: string[] = [];
    let type: TypeInterface = this;
    while (type instanceof TypeScheme) {
      variables.push(type.name);
      type = type.inner;
    }
    return `scheme ${variables.join(', ')} => ${type}`;
  }

  public getFreeVariables(): Set<string> {
    const variables = this.inner.getFreeVariables();
    variables.delete(this.name);
    return variables;
  }

  public instantiate(constraints: Constraints, substitution: Substitution): TypingResults {
    let constraint: TauType;
    ({
      type: constraint,
      constraints,
      substitution,
    } = this.constraint.instantiate(constraints, substitution));
    const variable = VariableType.getNew();
    return this.inner.instantiate(
      constraints.push(variable.name, constraint),
      substitution.push(this.name, variable),
    );
  }

  public substitute(substitution: Substitution): TypeScheme {
    const variable = VariableType.getNew();
    return new TypeScheme(
      variable.name,
      this.constraint,
      this.inner.substitute(substitution.push(this.name, variable)),
    );
  }
}

export abstract class TauType implements TypeInterface {
  public abstract toString(): string;

  public abstract getFreeVariables(): Set<string>;

  public instantiate(constraints: Constraints, substitution: Substitution): TypingResults {
    return new TypingResults(this.substitute(substitution), constraints, substitution);
  }

  public abstract substitute(substitution: Substitution): TauType;

  public abstract bindThis(
    thisType: TauType,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults;

  protected _fieldAccessFailure(name: string): TypeError {
    return new TypeError(`'${this}' has no field named ${JSON.stringify(name)}`);
  }

  public abstract getField(
    name: string,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults;

  protected _intersectionFailure(other: TauType): TypeError {
    return new TypeError(`no intersection found between '${this}' and '${other}'`);
  }

  public abstract intersect(
    other: TauType,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults;

  protected _unificationFailure(other: TauType): TypeError {
    return new TypeError(`cannot unify '${this}' and '${other}'`);
  }

  public abstract leq(
    other: TauType,
    constraints: Constraints,
    substitution: Substitution,
  ): Environment;

  public leqNoThrow(
    other: TauType,
    constraints: Constraints,
    substitution: Substitution,
  ): Environment | null {
    try {
      return this.leq(other, constraints, substitution);
    } catch (e) {
      if (e instanceof TypeError) {
        return null;
      } else {
        throw e;
      }
    }
  }

  public static min(
    first: TauType,
    second: TauType,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    const leftToRightAttempt = first.leqNoThrow(second, constraints, substitution);
    if (leftToRightAttempt) {
      ({ constraints, substitution } = leftToRightAttempt);
      return new TypingResults(first.substitute(substitution), constraints, substitution);
    }
    const rightToLeftAttempt = second.leqNoThrow(first, constraints, substitution);
    if (rightToLeftAttempt) {
      ({ constraints, substitution } = rightToLeftAttempt);
      return new TypingResults(second.substitute(substitution), constraints, substitution);
    }
    throw first._intersectionFailure(second);
  }

  public static max(
    first: TauType,
    second: TauType,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    const leftToRightAttempt = first.leqNoThrow(second, constraints, substitution);
    if (leftToRightAttempt) {
      ({ constraints, substitution } = leftToRightAttempt);
      return new TypingResults(second.substitute(substitution), constraints, substitution);
    }
    const rightToLeftAttempt = second.leqNoThrow(first, constraints, substitution);
    if (rightToLeftAttempt) {
      ({ constraints, substitution } = rightToLeftAttempt);
      return new TypingResults(first.substitute(substitution), constraints, substitution);
    }
    throw first._intersectionFailure(second);
  }

  public close(context: TypeContext): TypeInterface {
    const freeVariables = context.reduce<Set<string>>(
      (variables, _name, type) => new Set<string>([...variables, ...type.getFreeVariables()]),
      new Set<string>(),
    );
    let type: TypeInterface = this;
    for (const name of this.getFreeVariables()) {
      if (!freeVariables.has(name)) {
        type = new TypeScheme(name, UndefinedType.INSTANCE, type);
      }
    }
    return type;
  }

  public closeAll(): TypeInterface {
    return [...this.getFreeVariables()].reduce<TypeInterface>(
      (type, name) => new TypeScheme(name, UndefinedType.INSTANCE, type),
      this,
    );
  }
}

export type Constraints = Context<TauType>;
export const Constraints = Context<TauType>;
export const EMPTY_TYPE_CONSTRAINTS = Constraints.create<TauType>();

export type Substitution = Context<TauType>;
export const Substitution = Context<TauType>;
export const EMPTY_TYPE_SUBSTITUTION = Substitution.create<TauType>();

export class Environment {
  public constructor(
    public readonly constraints: Constraints,
    public readonly substitution: Substitution,
  ) {}
}

export class TypingResults {
  public constructor(
    public readonly type: TauType,
    public readonly constraints: Constraints,
    public readonly substitution: Substitution,
  ) {}
}

export class FieldBindingResults {
  public constructor(
    public readonly fields: Context<TauType>,
    public readonly constraints: Constraints,
    public readonly substitution: Substitution,
  ) {}
}

export class VariableType extends TauType {
  private static _nextId = 0;

  public constructor(public readonly name: string) {
    super();
  }

  public static getNew(): VariableType {
    return new VariableType('#' + VariableType._nextId++);
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

  public bindThis(
    thisType: TauType,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    if (substitution.has(this.name)) {
      return this.substitute(substitution).bindThis(thisType, constraints, substitution);
    } else {
      const field = VariableType.getNew();
      ({ constraints, substitution } = this.leq(
        new LambdaType(ObjectType.EMPTY, field),
        constraints,
        substitution,
      ));
      return new TypingResults(field.substitute(substitution), constraints, substitution);
    }
  }

  public getField(
    name: string,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    const container = ObjectType.create({ [name]: VariableType.getNew() });
    ({ constraints, substitution } = this.leq(container, constraints, substitution));
    return container.getField(name, constraints, substitution);
  }

  public getConstraint(constraints: Constraints): TauType {
    return constraints.topDef(this.name, UndefinedType.INSTANCE);
  }

  private _intersectWithVariable(
    other: VariableType,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    let constraint: TauType;
    ({
      type: constraint,
      constraints,
      substitution,
    } = this.getConstraint(constraints).intersect(
      other.getConstraint(constraints),
      constraints,
      substitution,
    ));
    const result = VariableType.getNew();
    return new TypingResults(
      result,
      constraints.push(result.name, constraint),
      substitution.pushAll({
        [this.name]: result,
        [other.name]: result,
      }),
    );
  }

  public intersect(
    other: TauType,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    if (substitution.has(this.name)) {
      return this.substitute(substitution).intersect(other, constraints, substitution);
    } else if (other instanceof VariableType) {
      if (other.name === this.name) {
        return new TypingResults(this, constraints, substitution);
      } else if (substitution.has(other.name)) {
        return this.intersect(other.substitute(substitution), constraints, substitution);
      } else {
        return this._intersectWithVariable(other, constraints, substitution);
      }
    } else {
      let constraint: TauType;
      ({
        type: constraint,
        constraints,
        substitution,
      } = this.getConstraint(constraints).intersect(other, constraints, substitution));
      const result = VariableType.getNew();
      return new TypingResults(
        result,
        constraints.push(result.name, constraint),
        substitution.push(this.name, result),
      );
    }
  }

  public geq(other: TauType, constraints: Constraints, substitution: Substitution): Environment {
    if (substitution.has(this.name)) {
      return other.leq(this.substitute(substitution), constraints, substitution);
    } else {
      ({ constraints, substitution } = other.leq(
        this.getConstraint(constraints),
        constraints,
        substitution,
      ));
      return new Environment(constraints, substitution.push(this.name, other));
    }
  }

  public leq(other: TauType, constraints: Constraints, substitution: Substitution): Environment {
    if (substitution.has(this.name)) {
      return this.substitute(substitution).leq(other, constraints, substitution);
    } else if (other instanceof VariableType) {
      if (other.name === this.name) {
        return new Environment(constraints, substitution);
      } else if (substitution.has(other.name)) {
        return this.leq(other.substitute(substitution), constraints, substitution);
      } else {
        ({ constraints, substitution } = this._intersectWithVariable(
          other,
          constraints,
          substitution,
        ));
        return new Environment(constraints, substitution);
      }
    } else {
      ({ constraints, substitution } = other.leq(
        this.getConstraint(constraints),
        constraints,
        substitution,
      ));
      return new Environment(constraints, substitution.push(this.name, other));
    }
  }
}

export class FieldSet {
  public constructor(private _fields: Context<TauType> = Context.create<TauType>()) {}

  public add(fields: { [name: string]: TauType }): FieldSet {
    this._fields = this._fields.pushAll(fields);
    return this;
  }

  public getFreeVariables(): Set<string> {
    return this._fields.reduce<Set<string>>(
      (variables, _name, type) => new Set<string>([...variables, ...type.getFreeVariables()]),
      new Set<string>(),
    );
  }

  public substitute(substitution: Substitution): FieldSet {
    return new FieldSet(this._fields.map((_name, type) => type.substitute(substitution)));
  }

  public getField(
    parent: TauType,
    name: string,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    if (this._fields.has(name)) {
      return this._fields.top(name).bindThis(parent, constraints, substitution);
    } else {
      throw new TypeError(`'${parent}' has no field named ${JSON.stringify(name)}`);
    }
  }

  public bind(
    parent: TauType,
    constraints: Constraints,
    substitution: Substitution,
  ): FieldBindingResults {
    const hash = this._fields.reduce<{ [name: string]: TauType }>((hash, name, type) => {
      ({
        type: hash[name],
        constraints,
        substitution,
      } = type.bindThis(parent, constraints, substitution));
      return hash;
    }, Object.create(null));
    return new FieldBindingResults(
      Context.create<TauType>(hash).map((_name, type) => type.substitute(substitution)),
      constraints,
      substitution,
    );
  }

  public intersect(
    other: FieldSet,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    const hash: { [name: string]: TauType } = Object.create(null);
    this._fields.forEach((name, type) => {
      if (other._fields.has(name)) {
        ({
          type: hash[name],
          constraints,
          substitution,
        } = type.intersect(other._fields.top(name), constraints, substitution));
      } else {
        hash[name] = type;
      }
    });
    other._fields.forEach((name, type) => {
      if (!this._fields.has(name)) {
        hash[name] = type;
      }
    });
    return new TypingResults(
      ObjectType.create(hash).substitute(substitution),
      constraints,
      substitution,
    );
  }

  public leq(
    parent: TauType,
    other: Context<TauType>,
    constraints: Constraints,
    substitution: Substitution,
  ): Environment {
    return other.reduce<Environment>(
      ({ constraints, substitution }, name, type) => {
        if (!this._fields.has(name)) {
          throw new TypeError(`'${parent}' doesn't have a field named ${JSON.stringify(name)}`);
        }
        let field: TauType;
        ({
          type: field,
          constraints,
          substitution,
        } = this._fields.top(name).bindThis(parent, constraints, substitution));
        return field.leq(type, constraints, substitution);
      },
      new Environment(constraints, substitution),
    );
  }
}

export class ObjectType extends TauType {
  public static readonly EMPTY = new ObjectType(new FieldSet());

  private constructor(private readonly _fields: FieldSet) {
    super();
  }

  public static create(fields: { [name: string]: TauType }): ObjectType {
    return new ObjectType(new FieldSet(Context.create(fields)));
  }

  public toString(): string {
    return `object`;
  }

  public getFreeVariables(): Set<string> {
    return this._fields.getFreeVariables();
  }

  public substitute(substitution: Substitution): TauType {
    return new ObjectType(this._fields.substitute(substitution));
  }

  public bindThis(
    _thisType: TauType,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    return new TypingResults(this, constraints, substitution);
  }

  public getField(
    name: string,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    return this._fields.getField(this, name, constraints, substitution);
  }

  public bindFields(constraints: Constraints, substitution: Substitution): FieldBindingResults {
    return this._fields.bind(this, constraints, substitution);
  }

  public intersect(
    other: TauType,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    if (other instanceof VariableType) {
      return other.intersect(this, constraints, substitution);
    } else if (other instanceof UndefinedType) {
      return new TypingResults(this, constraints, substitution);
    } else if (other instanceof NullType) {
      throw this._intersectionFailure(other);
    } else if (other instanceof ObjectType) {
      return this._fields.intersect(other._fields, constraints, substitution);
    } else {
      ({ constraints, substitution } = other.leq(this, constraints, substitution));
      return new TypingResults(this.substitute(substitution), constraints, substitution);
    }
  }

  public leq(other: TauType, constraints: Constraints, substitution: Substitution): Environment {
    if (other instanceof VariableType) {
      return other.geq(this, constraints, substitution);
    } else if (other instanceof UndefinedType) {
      return new Environment(constraints, substitution);
    } else if (other instanceof ObjectType) {
      let fields: Context<TauType>;
      ({ fields, constraints, substitution } = other.bindFields(constraints, substitution));
      return this._fields.leq(this, fields, constraints, substitution);
    } else {
      throw this._unificationFailure(other);
    }
  }
}

export class ListType extends TauType {
  public static readonly PROTOTYPE = new FieldSet();

  public constructor(public readonly inner: TauType) {
    super();
  }

  public toString(): string {
    return `(${this.inner})[]`;
  }

  public getFreeVariables(): Set<string> {
    return this.inner.getFreeVariables();
  }

  public substitute(substitution: Substitution): TauType {
    return new ListType(this.inner.substitute(substitution));
  }

  public bindThis(
    _thisType: TauType,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    return new TypingResults(this, constraints, substitution);
  }

  public getField(
    name: string,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    return ListType.PROTOTYPE.getField(this, name, constraints, substitution);
  }

  public intersect(
    other: TauType,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    if (other instanceof VariableType) {
      return other.intersect(this, constraints, substitution);
    } else if (other instanceof UndefinedType) {
      return new TypingResults(this, constraints, substitution);
    } else if (other instanceof ObjectType) {
      ({ constraints, substitution } = this.leq(other, constraints, substitution));
      return new TypingResults(this, constraints, substitution);
    } else if (other instanceof ListType) {
      let inner: TauType;
      ({
        type: inner,
        constraints,
        substitution,
      } = this.inner.intersect(other.inner, constraints, substitution));
      return new TypingResults(new ListType(inner), constraints, substitution);
    } else {
      throw this._intersectionFailure(other);
    }
  }

  public leq(other: TauType, constraints: Constraints, substitution: Substitution): Environment {
    if (other instanceof VariableType) {
      return other.geq(this, constraints, substitution);
    } else if (other instanceof UndefinedType) {
      return new TypingResults(this, constraints, substitution);
    } else if (other instanceof ObjectType) {
      let fields: Context<TauType>;
      ({ fields, constraints, substitution } = other.bindFields(constraints, substitution));
      return ListType.PROTOTYPE.leq(this, fields, constraints, substitution);
    } else if (other instanceof ListType) {
      return this.inner.leq(other.inner, constraints, substitution);
    } else {
      throw this._unificationFailure(other);
    }
  }
}

export abstract class IotaType extends TauType {
  public getFreeVariables(): Set<string> {
    return new Set<string>();
  }

  public instantiate(constraints: Constraints, substitution: Substitution): TypingResults {
    return new TypingResults(this, constraints, substitution);
  }

  public substitute(): IotaType {
    return this;
  }

  public bindThis(
    _thisType: TauType,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    return new TypingResults(this, constraints, substitution);
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

  public getField(name: string): TypingResults {
    throw this._fieldAccessFailure(name);
  }

  public intersect(
    other: TauType,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    if (other instanceof VariableType) {
      return other.intersect(this, constraints, substitution);
    } else {
      return new TypingResults(other, constraints, substitution);
    }
  }

  public leq(other: TauType, constraints: Constraints, substitution: Substitution): Environment {
    if (other instanceof VariableType) {
      return other.geq(this, constraints, substitution);
    } else if (other instanceof UndefinedType) {
      return new Environment(constraints, substitution);
    } else {
      throw this._unificationFailure(other);
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

  public getField(name: string): TypingResults {
    throw this._fieldAccessFailure(name);
  }

  public intersect(
    other: TauType,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    if (other instanceof VariableType) {
      return other.intersect(this, constraints, substitution);
    } else if (other instanceof UndefinedType || other instanceof NullType) {
      return new TypingResults(this, constraints, substitution);
    } else if (other instanceof UnknownType) {
      return new TypingResults(other, constraints, substitution);
    } else {
      throw this._intersectionFailure(other);
    }
  }

  public leq(other: TauType, constraints: Constraints, substitution: Substitution): Environment {
    if (other instanceof VariableType) {
      return other.geq(this, constraints, substitution);
    } else if (other instanceof UndefinedType || other instanceof NullType) {
      return new Environment(constraints, substitution);
    } else {
      throw this._unificationFailure(other);
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

  public getField(
    _name: string,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    return new TypingResults(UnknownType.INSTANCE, constraints, substitution);
  }

  public intersect(
    other: TauType,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    if (other instanceof VariableType) {
      return other.intersect(this, constraints, substitution);
    } else {
      ({ constraints, substitution } = this.leq(other, constraints, substitution));
      return new TypingResults(this, constraints, substitution);
    }
  }

  public leq(other: TauType, constraints: Constraints, substitution: Substitution): Environment {
    if (other instanceof VariableType) {
      return other.geq(this, constraints, substitution);
    } else if (other instanceof ObjectType) {
      let fields: Context<TauType>;
      ({ fields, constraints, substitution } = other.bindFields(constraints, substitution));
      return fields.reduce<Environment>(
        ({ constraints, substitution }, _name, type) =>
          UnknownType.INSTANCE.leq(type, constraints, substitution),
        new Environment(constraints, substitution),
      );
    } else if (other instanceof ListType) {
      return new ListType(UnknownType.INSTANCE).leq(other, constraints, substitution);
    } else if (other instanceof LambdaType) {
      return new LambdaType(UndefinedType.INSTANCE, UnknownType.INSTANCE).leq(
        other,
        constraints,
        substitution,
      );
    } else {
      return new Environment(constraints, substitution);
    }
  }
}

export class BooleanType extends IotaType {
  public static readonly PROTOTYPE = new FieldSet();
  public static readonly INSTANCE = new BooleanType();

  private constructor() {
    super();
  }

  public toString(): string {
    return 'boolean';
  }

  public getField(
    name: string,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    return BooleanType.PROTOTYPE.getField(this, name, constraints, substitution);
  }

  public intersect(
    other: TauType,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    if (other instanceof VariableType) {
      return other.intersect(this, constraints, substitution);
    } else if (other instanceof UndefinedType || other instanceof BooleanType) {
      return new TypingResults(this, constraints, substitution);
    } else if (other instanceof ObjectType) {
      ({ constraints, substitution } = this.leq(other, constraints, substitution));
      return new TypingResults(this, constraints, substitution);
    } else if (other instanceof UnknownType) {
      return new TypingResults(other, constraints, substitution);
    } else {
      throw this._intersectionFailure(other);
    }
  }

  public leq(other: TauType, constraints: Constraints, substitution: Substitution): Environment {
    if (other instanceof VariableType) {
      return other.geq(this, constraints, substitution);
    } else if (other instanceof UndefinedType || other instanceof BooleanType) {
      return new Environment(constraints, substitution);
    } else if (other instanceof ObjectType) {
      let fields: Context<TauType>;
      ({ fields, constraints, substitution } = other.bindFields(constraints, substitution));
      return BooleanType.PROTOTYPE.leq(this, fields, constraints, substitution);
    } else {
      throw this._unificationFailure(other);
    }
  }
}

export class ComplexType extends IotaType {
  public static readonly PROTOTYPE = new FieldSet();
  public static readonly INSTANCE = new ComplexType();

  private constructor() {
    super();
  }

  public toString(): string {
    return 'complex';
  }

  public getField(
    name: string,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    return ComplexType.PROTOTYPE.getField(this, name, constraints, substitution);
  }

  public intersect(
    other: TauType,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    if (other instanceof VariableType) {
      return other.intersect(this, constraints, substitution);
    } else if (other instanceof UndefinedType || other instanceof ComplexType) {
      return new TypingResults(this, constraints, substitution);
    } else if (other instanceof ObjectType) {
      ({ constraints, substitution } = this.leq(other, constraints, substitution));
      return new TypingResults(this, constraints, substitution);
    } else if (
      other instanceof RealType ||
      other instanceof RationalType ||
      other instanceof IntegerType ||
      other instanceof NaturalType ||
      other instanceof UnknownType
    ) {
      return new TypingResults(other, constraints, substitution);
    } else {
      throw this._intersectionFailure(other);
    }
  }

  public leq(other: TauType, constraints: Constraints, substitution: Substitution): Environment {
    if (other instanceof VariableType) {
      return other.geq(this, constraints, substitution);
    } else if (other instanceof UndefinedType || other instanceof ComplexType) {
      return new Environment(constraints, substitution);
    } else if (other instanceof ObjectType) {
      let fields: Context<TauType>;
      ({ fields, constraints, substitution } = other.bindFields(constraints, substitution));
      return ComplexType.PROTOTYPE.leq(this, fields, constraints, substitution);
    } else {
      throw this._unificationFailure(other);
    }
  }
}

export class RealType extends IotaType {
  public static readonly PROTOTYPE = new FieldSet();
  public static readonly INSTANCE = new RealType();

  private constructor() {
    super();
  }

  public toString(): string {
    return 'real';
  }

  public getField(
    name: string,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    return RealType.PROTOTYPE.getField(this, name, constraints, substitution);
  }

  public intersect(
    other: TauType,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    if (other instanceof VariableType) {
      return other.intersect(this, constraints, substitution);
    } else if (
      other instanceof UndefinedType ||
      other instanceof ComplexType ||
      other instanceof RealType
    ) {
      return new TypingResults(this, constraints, substitution);
    } else if (other instanceof ObjectType) {
      ({ constraints, substitution } = this.leq(other, constraints, substitution));
      return new TypingResults(this, constraints, substitution);
    } else if (
      other instanceof RationalType ||
      other instanceof IntegerType ||
      other instanceof NaturalType ||
      other instanceof UnknownType
    ) {
      return new TypingResults(other, constraints, substitution);
    } else {
      throw this._intersectionFailure(other);
    }
  }

  public leq(other: TauType, constraints: Constraints, substitution: Substitution): Environment {
    if (other instanceof VariableType) {
      return other.geq(this, constraints, substitution);
    } else if (
      other instanceof UndefinedType ||
      other instanceof ComplexType ||
      other instanceof RealType
    ) {
      return new Environment(constraints, substitution);
    } else if (other instanceof ObjectType) {
      let fields: Context<TauType>;
      ({ fields, constraints, substitution } = other.bindFields(constraints, substitution));
      return RealType.PROTOTYPE.leq(this, fields, constraints, substitution);
    } else {
      throw this._unificationFailure(other);
    }
  }
}

export class RationalType extends IotaType {
  public static readonly PROTOTYPE = new FieldSet();
  public static readonly INSTANCE = new RationalType();

  private constructor() {
    super();
  }

  public toString(): string {
    return 'rational';
  }

  public getField(
    name: string,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    return RationalType.PROTOTYPE.getField(this, name, constraints, substitution);
  }

  public intersect(
    other: TauType,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    if (other instanceof VariableType) {
      return other.intersect(this, constraints, substitution);
    } else if (
      other instanceof UndefinedType ||
      other instanceof ComplexType ||
      other instanceof RealType ||
      other instanceof RationalType
    ) {
      return new TypingResults(this, constraints, substitution);
    } else if (other instanceof ObjectType) {
      ({ constraints, substitution } = this.leq(other, constraints, substitution));
      return new TypingResults(this, constraints, substitution);
    } else if (
      other instanceof IntegerType ||
      other instanceof NaturalType ||
      other instanceof UnknownType
    ) {
      return new TypingResults(other, constraints, substitution);
    } else {
      throw this._intersectionFailure(other);
    }
  }

  public leq(other: TauType, constraints: Constraints, substitution: Substitution): Environment {
    if (other instanceof VariableType) {
      return other.geq(this, constraints, substitution);
    } else if (
      other instanceof UndefinedType ||
      other instanceof ComplexType ||
      other instanceof RealType ||
      other instanceof RationalType
    ) {
      return new Environment(constraints, substitution);
    } else if (other instanceof ObjectType) {
      let fields: Context<TauType>;
      ({ fields, constraints, substitution } = other.bindFields(constraints, substitution));
      return RationalType.PROTOTYPE.leq(this, fields, constraints, substitution);
    } else {
      throw this._unificationFailure(other);
    }
  }
}

export class IntegerType extends IotaType {
  public static readonly PROTOTYPE = new FieldSet();
  public static readonly INSTANCE = new IntegerType();

  private constructor() {
    super();
  }

  public toString(): string {
    return 'integer';
  }

  public getField(
    name: string,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    return IntegerType.PROTOTYPE.getField(this, name, constraints, substitution);
  }

  public intersect(
    other: TauType,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    if (other instanceof VariableType) {
      return other.intersect(this, constraints, substitution);
    } else if (
      other instanceof UndefinedType ||
      other instanceof ComplexType ||
      other instanceof RealType ||
      other instanceof RationalType ||
      other instanceof IntegerType
    ) {
      return new TypingResults(this, constraints, substitution);
    } else if (other instanceof ObjectType) {
      ({ constraints, substitution } = this.leq(other, constraints, substitution));
      return new TypingResults(this, constraints, substitution);
    } else if (other instanceof NaturalType || other instanceof UnknownType) {
      return new TypingResults(other, constraints, substitution);
    } else {
      throw this._intersectionFailure(other);
    }
  }

  public leq(other: TauType, constraints: Constraints, substitution: Substitution): Environment {
    if (other instanceof VariableType) {
      return other.geq(this, constraints, substitution);
    } else if (
      other instanceof UndefinedType ||
      other instanceof ComplexType ||
      other instanceof RealType ||
      other instanceof RationalType ||
      other instanceof IntegerType
    ) {
      return new Environment(constraints, substitution);
    } else if (other instanceof ObjectType) {
      let fields: Context<TauType>;
      ({ fields, constraints, substitution } = other.bindFields(constraints, substitution));
      return IntegerType.PROTOTYPE.leq(this, fields, constraints, substitution);
    } else {
      throw this._unificationFailure(other);
    }
  }
}

export class NaturalType extends IotaType {
  public static readonly PROTOTYPE = new FieldSet();
  public static readonly INSTANCE = new NaturalType();

  private constructor() {
    super();
  }

  public toString(): string {
    return 'natural';
  }

  public getField(
    name: string,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    return NaturalType.PROTOTYPE.getField(this, name, constraints, substitution);
  }

  public intersect(
    other: TauType,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    if (other instanceof VariableType) {
      return other.intersect(this, constraints, substitution);
    } else if (
      other instanceof UndefinedType ||
      other instanceof ComplexType ||
      other instanceof RealType ||
      other instanceof RationalType ||
      other instanceof IntegerType ||
      other instanceof NaturalType
    ) {
      return new TypingResults(this, constraints, substitution);
    } else if (other instanceof ObjectType) {
      ({ constraints, substitution } = this.leq(other, constraints, substitution));
      return new TypingResults(this, constraints, substitution);
    } else if (other instanceof UnknownType) {
      return new TypingResults(other, constraints, substitution);
    } else {
      throw this._intersectionFailure(other);
    }
  }

  public leq(other: TauType, constraints: Constraints, substitution: Substitution): Environment {
    if (other instanceof VariableType) {
      return other.geq(this, constraints, substitution);
    } else if (
      other instanceof UndefinedType ||
      other instanceof ComplexType ||
      other instanceof RealType ||
      other instanceof RationalType ||
      other instanceof IntegerType ||
      other instanceof NaturalType
    ) {
      return new Environment(constraints, substitution);
    } else if (other instanceof ObjectType) {
      let fields: Context<TauType>;
      ({ fields, constraints, substitution } = other.bindFields(constraints, substitution));
      return NaturalType.PROTOTYPE.leq(this, fields, constraints, substitution);
    } else {
      throw this._unificationFailure(other);
    }
  }
}

export class StringType extends IotaType {
  public static readonly PROTOTYPE = new FieldSet();
  public static readonly INSTANCE = new StringType();

  private constructor() {
    super();
  }

  public toString(): string {
    return 'string';
  }

  public getField(
    name: string,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    return StringType.PROTOTYPE.getField(this, name, constraints, substitution);
  }

  public intersect(
    other: TauType,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    if (other instanceof VariableType) {
      return other.intersect(this, constraints, substitution);
    } else if (other instanceof UndefinedType || other instanceof StringType) {
      return new TypingResults(this, constraints, substitution);
    } else if (other instanceof ObjectType) {
      ({ constraints, substitution } = this.leq(other, constraints, substitution));
      return new TypingResults(this, constraints, substitution);
    } else if (other instanceof UnknownType) {
      return new TypingResults(other, constraints, substitution);
    } else {
      throw this._intersectionFailure(other);
    }
  }

  public leq(other: TauType, constraints: Constraints, substitution: Substitution): Environment {
    if (other instanceof VariableType) {
      return other.geq(this, constraints, substitution);
    } else if (other instanceof UndefinedType || other instanceof StringType) {
      return new Environment(constraints, substitution);
    } else if (other instanceof ObjectType) {
      let fields: Context<TauType>;
      ({ fields, constraints, substitution } = other.bindFields(constraints, substitution));
      return StringType.PROTOTYPE.leq(this, fields, constraints, substitution);
    } else {
      throw this._unificationFailure(other);
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
    return `fn (${this.left}) => (${this.right})`;
  }

  public getFreeVariables(): Set<string> {
    return new Set<string>([...this.left.getFreeVariables(), ...this.right.getFreeVariables()]);
  }

  public substitute(substitution: Substitution): LambdaType {
    return new LambdaType(this.left.substitute(substitution), this.right.substitute(substitution));
  }

  public bindThis(
    thisType: TauType,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    const result = VariableType.getNew();
    ({ constraints, substitution } = this.substitute(substitution).leq(
      new LambdaType(thisType, result),
      constraints,
      substitution,
    ));
    return new TypingResults(result.substitute(substitution), constraints, substitution);
  }

  public getField(name: string): TypingResults {
    throw this._fieldAccessFailure(name);
  }

  public intersect(
    other: TauType,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    if (other instanceof VariableType) {
      return other.intersect(this, constraints, substitution);
    } else if (other instanceof UndefinedType) {
      return new TypingResults(this, constraints, substitution);
    } else if (other instanceof LambdaType) {
      let left: TauType;
      ({
        type: left,
        constraints,
        substitution,
      } = this.left.intersect(other.left, constraints, substitution));
      let right: TauType;
      ({
        type: right,
        constraints,
        substitution,
      } = this.right.intersect(other.right, constraints, substitution));
      return new TypingResults(
        new LambdaType(left, right).substitute(substitution),
        constraints,
        substitution,
      );
    } else if (other instanceof UnknownType) {
      ({ constraints, substitution } = other.leq(this, constraints, substitution));
      return new TypingResults(UnknownType.INSTANCE, constraints, substitution);
    } else {
      throw this._intersectionFailure(other);
    }
  }

  public leq(other: TauType, constraints: Constraints, substitution: Substitution): Environment {
    if (other instanceof VariableType) {
      return other.geq(this, constraints, substitution);
    } else if (other instanceof UndefinedType) {
      return new Environment(constraints, substitution);
    } else if (other instanceof LambdaType) {
      ({ constraints, substitution } = other.left.leq(this.left, constraints, substitution));
      return this.right.leq(other.right, constraints, substitution);
    } else {
      throw this._unificationFailure(other);
    }
  }
}
