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
        new LambdaType(thisType, field),
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
}

export class ObjectType extends TauType {
  private constructor(private readonly _fields: Context<TauType>) {
    super();
  }

  public static create(fields: { [name: string]: TauType }): ObjectType {
    return new ObjectType(Context.create(fields));
  }

  public toString(): string {
    return `{${this._fields.toArray((name, type) => `${name}: ${type}`).join(', ')}}`;
  }

  public getFreeVariables(): Set<string> {
    return this._fields.reduce<Set<string>>(
      (variables, _name, type) => new Set<string>([...variables, ...type.getFreeVariables()]),
      new Set<string>(),
    );
  }

  public substitute(substitution: Substitution): TauType {
    return new ObjectType(this._fields.map((_name, type) => type.substitute(substitution)));
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
    if (this._fields.has(name)) {
      return this._fields.top(name).bindThis(this, constraints, substitution);
    } else {
      throw this._fieldAccessFailure(name);
    }
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
      // TODO
    } else if (other instanceof UnknownType) {
      ({ constraints, substitution } = other.leq(this, constraints, substitution));
      return new TypingResults(this.substitute(substitution), constraints, substitution);
    } else {
      throw this._intersectionFailure(other);
    }
  }
}

export class Prototype {
  private _fields = Context.create<TauType>();

  public constructor() {}

  public getField(
    parent: IotaType,
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

  public intersect(
    parent: IotaType,
    other: ObjectType,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    // TODO
  }

  public leq(
    parent: IotaType,
    other: ObjectType,
    constraints: Constraints,
    substitution: Substitution,
  ): Environment {
    // TODO
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
}

export class BooleanType extends IotaType {
  public static readonly PROTOTYPE = new Prototype();
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
      return BooleanType.PROTOTYPE.intersect(this, other, constraints, substitution);
    } else if (other instanceof UnknownType) {
      return new TypingResults(other, constraints, substitution);
    } else {
      throw this._intersectionFailure(other);
    }
  }
}

export class ComplexType extends IotaType {
  public static readonly PROTOTYPE = new Prototype();
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
      return ComplexType.PROTOTYPE.intersect(this, other, constraints, substitution);
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
}

export class RealType extends IotaType {
  public static readonly PROTOTYPE = new Prototype();
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
      return RealType.PROTOTYPE.intersect(this, other, constraints, substitution);
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
}

export class RationalType extends IotaType {
  public static readonly PROTOTYPE = new Prototype();
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
      return RationalType.PROTOTYPE.intersect(this, other, constraints, substitution);
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
}

export class IntegerType extends IotaType {
  public static readonly PROTOTYPE = new Prototype();
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
      return IntegerType.PROTOTYPE.intersect(this, other, constraints, substitution);
    } else if (other instanceof NaturalType || other instanceof UnknownType) {
      return new TypingResults(other, constraints, substitution);
    } else {
      throw this._intersectionFailure(other);
    }
  }
}

export class NaturalType extends IotaType {
  public static readonly PROTOTYPE = new Prototype();
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
      return IntegerType.PROTOTYPE.intersect(this, other, constraints, substitution);
    } else if (other instanceof UnknownType) {
      return new TypingResults(other, constraints, substitution);
    } else {
      throw this._intersectionFailure(other);
    }
  }
}

export class StringType extends IotaType {
  public static readonly PROTOTYPE = new Prototype();
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
      return StringType.PROTOTYPE.intersect(this, other, constraints, substitution);
    } else if (other instanceof UnknownType) {
      return new TypingResults(other, constraints, substitution);
    } else {
      throw this._intersectionFailure(other);
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
}
