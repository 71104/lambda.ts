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
      if (type.constraint instanceof UndefinedType) {
        variables.push(type.name);
      } else {
        variables.push(`${type.name}: ${type.constraint}`);
      }
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

  /**
   * FOR INTERNAL USE ONLY. Constructs a `TypeError` resulting from trying to access a field this
   * type doesn't have.
   *
   * @param name The name of the accessed field.
   * @returns The constructed TypeError.
   */
  public fieldAccessFailure(name: string): TypeError {
    if (name.startsWith('#u:')) {
      return new TypeError(`'${this}' doesn't have the unary '${name.substring(3)}' operator`);
    } else if (name.startsWith('#b1:')) {
      const operator = name.substring(4);
      return new TypeError(
        `'${this}' cannot appear as the left-hand side of the binary '${operator}' operator`,
      );
    } else {
      const match = name.match(/^#b2:([a-z]+):(.+)$/);
      if (match) {
        const [, lhs, operator] = match;
        return new TypeError(
          `'${this}' cannot appear as the right-hand side of the binary '${operator}' operator when the left-hand side is '${lhs}'`,
        );
      } else {
        return new TypeError(`'${this}' has no field named ${JSON.stringify(name)}`);
      }
    }
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

  public leqSimple(other: TauType): boolean {
    return null !== this.leqNoThrow(other, EMPTY_TYPE_CONSTRAINTS, EMPTY_TYPE_SUBSTITUTION);
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

  public close(context: TypeContext, constraints: Constraints): TypeInterface {
    const freeVariables = new Set<string>(
      context.reduce<string[]>(
        (variables, _name, type) => [...variables, ...type.getFreeVariables()],
        [],
      ),
    );
    let type: TypeInterface = this;
    for (const name of this.getFreeVariables()) {
      if (!freeVariables.has(name)) {
        type = new TypeScheme(name, constraints.topDef(name, UndefinedType.INSTANCE), type);
      }
    }
    return type;
  }

  public closeAll(constraints: Constraints): TypeInterface {
    return [...this.getFreeVariables()].reduce<TypeInterface>(
      (type, name) => new TypeScheme(name, constraints.topDef(name, UndefinedType.INSTANCE), type),
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
      let type: TauType;
      ({ type, constraints, substitution } = other.intersect(
        this.getConstraint(constraints),
        constraints,
        substitution,
      ));
      return new Environment(constraints, substitution.push(this.name, type));
    }
  }
}

export class FieldSet {
  public constructor(private _fields: TypeContext = EMPTY_TYPE_CONTEXT) {}

  public add(fields: { [name: string]: TypeInterface }): FieldSet {
    this._fields = this._fields.pushAll(fields);
    return this;
  }

  public getFreeVariables(): Set<string> {
    return new Set<string>(
      this._fields.reduce<string[]>(
        (variables, _name, type) => [...variables, ...type.getFreeVariables()],
        [],
      ),
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
    if (!this._fields.has(name)) {
      throw new TypeError(`'${parent}' has no field named ${JSON.stringify(name)}`);
    }
    let type: TauType;
    ({ type, constraints, substitution } = this._fields
      .top(name)
      .instantiate(constraints, substitution));
    return type.bindThis(parent, constraints, substitution);
  }

  public bind(
    parent: TauType,
    constraints: Constraints,
    substitution: Substitution,
  ): FieldBindingResults {
    const hash = this._fields.reduce<{ [name: string]: TauType }>((hash, name) => {
      ({
        type: hash[name],
        constraints,
        substitution,
      } = this.getField(parent, name, constraints, substitution));
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
      ({
        type: hash[name],
        constraints,
        substitution,
      } = type.instantiate(constraints, substitution));
      if (other._fields.has(name)) {
        let otherField: TauType;
        ({
          type: otherField,
          constraints,
          substitution,
        } = other._fields.top(name).instantiate(constraints, substitution));
        ({
          type: hash[name],
          constraints,
          substitution,
        } = hash[name].intersect(otherField, constraints, substitution));
      }
      // TODO: what variables do we need to close?
    });
    other._fields.forEach((name, type) => {
      if (!this._fields.has(name)) {
        ({
          type: hash[name],
          constraints,
          substitution,
        } = type.instantiate(constraints, substitution));
      }
    });
    return new TypingResults(
      ObjectType.create(hash).substitute(substitution),
      constraints,
      substitution,
    );
  }

  public union(
    other: FieldSet,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    const hash = this._fields.reduce<{ [name: string]: TauType }>((hash, name, type) => {
      if (other._fields.has(name)) {
        let thisField: TauType;
        ({
          type: thisField,
          constraints,
          substitution,
        } = type.instantiate(constraints, substitution));
        let otherField: TauType;
        ({
          type: otherField,
          constraints,
          substitution,
        } = other._fields.top(name).instantiate(constraints, substitution));
        // TODO: what variables do we need to close?
        hash[name] = UnionType.create([thisField, otherField]);
      }
      return hash;
    }, Object.create(null));
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
          throw parent.fieldAccessFailure(name);
        }
        let field: TauType;
        ({
          type: field,
          constraints,
          substitution,
        } = this.getField(parent, name, constraints, substitution));
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

  public static create(fields: { [name: string]: TypeInterface }): ObjectType {
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
    } else if (other instanceof UnionType) {
      return other.intersect(this, constraints, substitution);
    } else if (other instanceof ObjectType) {
      return this._fields.intersect(other._fields, constraints, substitution);
    } else {
      ({ constraints, substitution } = other.leq(this, constraints, substitution));
      return new TypingResults(other.substitute(substitution), constraints, substitution);
    }
  }

  public leq(other: TauType, constraints: Constraints, substitution: Substitution): Environment {
    if (other instanceof VariableType) {
      return other.geq(this, constraints, substitution);
    } else if (other instanceof UndefinedType) {
      return new Environment(constraints, substitution);
    } else if (other instanceof UnionType) {
      return other.geq(this, constraints, substitution);
    } else if (other instanceof ObjectType) {
      let fields: Context<TauType>;
      ({ fields, constraints, substitution } = other.bindFields(constraints, substitution));
      return this._fields.leq(this, fields, constraints, substitution);
    } else {
      throw this._unificationFailure(other);
    }
  }

  public union(
    other: ObjectType,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    return this._fields.union(other._fields, constraints, substitution);
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
    } else if (other instanceof UnionType) {
      return other.intersect(this, constraints, substitution);
    } else if (other instanceof ObjectType) {
      ({ constraints, substitution } = this.leq(other, constraints, substitution));
      return new TypingResults(this.substitute(substitution), constraints, substitution);
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
    } else if (other instanceof UnionType) {
      return other.geq(this, constraints, substitution);
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

export class TupleType extends TauType {
  public static readonly PROTOTYPE = new FieldSet();

  public constructor(public readonly elements: TauType[]) {
    super();
  }

  public toString(): string {
    return `(${this.elements.map(element => element.toString())})`;
  }

  public getFreeVariables(): Set<string> {
    return new Set<string>(
      this.elements.reduce<string[]>(
        (variables, element) => [...variables, ...element.getFreeVariables()],
        [],
      ),
    );
  }

  public substitute(substitution: Substitution): TupleType {
    return new TupleType(this.elements.map(element => element.substitute(substitution)));
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
    return TupleType.PROTOTYPE.getField(this, name, constraints, substitution);
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
    } else if (other instanceof UnionType) {
      return other.intersect(this, constraints, substitution);
    } else if (other instanceof ObjectType) {
      ({ constraints, substitution } = this.leq(other, constraints, substitution));
      return new TypingResults(this.substitute(substitution), constraints, substitution);
    } else if (other instanceof TupleType) {
      if (other.elements.length !== this.elements.length) {
        throw new TypeError(`cannot intersect '${this}' and '${other}': different arities`);
      }
      const elements = this.elements.map((element, index) => {
        let type: TauType;
        ({ type, constraints, substitution } = element.intersect(
          other.elements[index],
          constraints,
          substitution,
        ));
        return type;
      });
      return new TypingResults(
        new TupleType(elements).substitute(substitution),
        constraints,
        substitution,
      );
    } else {
      throw this._intersectionFailure(other);
    }
  }

  public leq(other: TauType, constraints: Constraints, substitution: Substitution): Environment {
    if (other instanceof VariableType) {
      return other.geq(this, constraints, substitution);
    } else if (other instanceof UndefinedType) {
      return new TypingResults(this, constraints, substitution);
    } else if (other instanceof UnionType) {
      return other.geq(this, constraints, substitution);
    } else if (other instanceof ObjectType) {
      let fields: Context<TauType>;
      ({ fields, constraints, substitution } = other.bindFields(constraints, substitution));
      return TupleType.PROTOTYPE.leq(this, fields, constraints, substitution);
    } else if (other instanceof TupleType) {
      if (other.elements.length !== this.elements.length) {
        throw new TypeError(`cannot unify '${this}' and '${other}': different arities`);
      } else {
        return this.elements.reduce<Environment>(
          ({ constraints, substitution }, element, index) =>
            element.leq(other.elements[index], constraints, substitution),
          new Environment(constraints, substitution),
        );
      }
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
    throw this.fieldAccessFailure(name);
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
    } else if (other instanceof UnionType) {
      return other.geq(this, constraints, substitution);
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
    throw this.fieldAccessFailure(name);
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
    } else if (other instanceof UnionType) {
      return other.intersect(this, constraints, substitution);
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
    } else if (other instanceof UnionType) {
      return other.geq(this, constraints, substitution);
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
    } else if (other instanceof UnionType) {
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
    } else if (other instanceof UnionType) {
      return other.intersect(this, constraints, substitution);
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
    } else if (other instanceof UnionType) {
      return other.geq(this, constraints, substitution);
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
    } else if (other instanceof UnionType) {
      return other.intersect(this, constraints, substitution);
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
    } else if (other instanceof UnionType) {
      return other.geq(this, constraints, substitution);
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
    } else if (other instanceof UnionType) {
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
    } else if (other instanceof UnionType) {
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
    } else if (other instanceof UnionType) {
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
    } else if (other instanceof UnionType) {
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
    } else if (other instanceof UnionType) {
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
    } else if (other instanceof UnionType) {
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
    } else if (other instanceof UnionType) {
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
    } else if (other instanceof UnionType) {
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
    } else if (other instanceof UnionType) {
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
    } else if (other instanceof UnionType) {
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
    throw this.fieldAccessFailure(name);
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
    } else if (other instanceof UnionType) {
      return other.intersect(this, constraints, substitution);
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
    } else if (other instanceof UnionType) {
      return other.geq(this, constraints, substitution);
    } else if (other instanceof LambdaType) {
      ({ constraints, substitution } = other.left.leq(this.left, constraints, substitution));
      return this.right.leq(other.right, constraints, substitution);
    } else {
      throw this._unificationFailure(other);
    }
  }
}

export class UnionType extends TauType {
  private constructor(public readonly types: TauType[]) {
    super();
  }

  public static create(types: TauType[]): TauType {
    if (types.length < 1) {
      throw new TypeError(`union types must have at least 1 subtype`);
    }
    const flattened: TauType[] = [];
    types.forEach(type => {
      if (type instanceof UnionType) {
        flattened.push(...type.types);
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
    // TODO: merge objects using `ObjectType.union()`.
    const optimized: TauType[] = [];
    for (let i = 0; i < flattened.length; i++) {
      if (!removed[i]) {
        optimized.push(flattened[i]);
      }
    }
    if (optimized.length > 1) {
      return new UnionType(optimized);
    } else if (optimized.length > 0) {
      return optimized[0];
    } else {
      throw new TypeError(
        `cannot find union across the following types: ${types
          .map(type => `'${type}'`)
          .join(', ')}`,
      );
    }
  }

  public toString(): string {
    return this.types.map(type => `(${type.toString()})`).join('|');
  }

  public getFreeVariables(): Set<string> {
    return new Set<string>(
      this.types.reduce<string[]>(
        (variables, type) => [...variables, ...type.getFreeVariables()],
        [],
      ),
    );
  }

  public substitute(substitution: Substitution): TauType {
    return UnionType.create(this.types.map(type => type.substitute(substitution)));
  }

  public bindThis(
    thisType: TauType,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    const result = UnionType.create(
      this.types.map(type => {
        ({ type, constraints, substitution } = type.bindThis(thisType, constraints, substitution));
        return type;
      }),
    );
    return new TypingResults(result.substitute(substitution), constraints, substitution);
  }

  public getField(
    name: string,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    const result = UnionType.create(
      this.types.map(type => {
        ({ type, constraints, substitution } = type.getField(name, constraints, substitution));
        return type;
      }),
    );
    return new TypingResults(result.substitute(substitution), constraints, substitution);
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
    } else {
      const result = UnionType.create(
        this.types.map(type => {
          ({ type, constraints, substitution } = type.intersect(other, constraints, substitution));
          return type;
        }),
      );
      return new TypingResults(result.substitute(substitution), constraints, substitution);
    }
  }

  public leq(other: TauType, constraints: Constraints, substitution: Substitution): Environment {
    if (other instanceof VariableType) {
      return other.geq(this, constraints, substitution);
    } else if (other instanceof UndefinedType) {
      return new Environment(constraints, substitution);
    } else {
      ({ constraints, substitution } = this.types.reduce<Environment>(
        ({ constraints, substitution }, type) => type.leq(other, constraints, substitution),
        new Environment(constraints, substitution),
      ));
      return new TypingResults(this.substitute(substitution), constraints, substitution);
    }
  }

  public geq(other: TauType, constraints: Constraints, substitution: Substitution): Environment {
    const environments = this.types
      .map(type => other.leqNoThrow(type, constraints, substitution))
      .filter(environment => environment !== null);
    if (environments.length > 1) {
      throw new TypeError(`ambiguous unification between '${other}' and '${this}'`);
    } else if (environments.length > 0) {
      return environments[0]!;
    } else {
      throw this._unificationFailure(other);
    }
  }
}
