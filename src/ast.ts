import { InternalError, RuntimeError } from './errors.js';
import {
  BooleanType,
  Constraints,
  Environment,
  IotaType,
  LambdaType,
  ListType,
  ObjectType,
  StringType,
  Substitution,
  TauType,
  TupleType,
  TypeContext,
  TypeInterface,
  TypingResults,
  UnknownType,
  VariableType,
} from './types.js';
import {
  Closure,
  EMPTY_VALUE_CONTEXT,
  ListValue,
  ObjectValue,
  StringValue,
  TupleValue,
  ValueContext,
  ValueInterface,
  unmarshal,
} from './values.js';

export interface NodeInterface {
  /**
   * Returns the set of free variables, i.e. variables that this subtree is using but are
   * declared elsewhere.
   */
  getFreeVariables(): Set<string>;

  /**
   * Calculates the principal type of this term (as per Hindley-Milner-Damas) and returns it in a
   * `TypingResults` object along with constraints requirements and type variable substitution.
   *
   * @param context The context in which the term is typed.
   * @param constraints Pre-existing constraint requirements on type variables.
   * @param substitution Pre-existing type variable substitution.
   */
  getType(
    context: TypeContext,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults;

  /**
   * Evaluates a Lambda program and returns the result.
   *
   * @param context The value context, mapping variable names to values.
   */
  evaluate(context: ValueContext): ValueInterface;
}

export class LiteralNode implements NodeInterface {
  public constructor(
    public readonly value: ValueInterface,
    public readonly type: IotaType,
  ) {}

  public getFreeVariables(): Set<string> {
    return new Set<string>();
  }

  public getType(
    _context: TypeContext,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    return new TypingResults(this.type, constraints, substitution);
  }

  public evaluate(): ValueInterface {
    return this.value;
  }
}

export class TemplateStringLiteral implements NodeInterface {
  public constructor(public readonly pieces: NodeInterface[]) {}

  public getFreeVariables(): Set<string> {
    return this.pieces.reduce(
      (variables, piece) => new Set<string>([...variables, ...piece.getFreeVariables()]),
      new Set<string>(),
    );
  }

  public getType(
    context: TypeContext,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    const stringifiable = ObjectType.create({ str: StringType.INSTANCE });
    ({ constraints, substitution } = this.pieces.reduce<Environment>(
      ({ constraints, substitution }, piece) => {
        let type: TauType;
        ({ type, constraints, substitution } = piece.getType(context, constraints, substitution));
        ({ constraints, substitution } = type.leq(stringifiable, constraints, substitution));
        return new Environment(constraints, substitution);
      },
      new Environment(constraints, substitution),
    ));
    return new TypingResults(StringType.INSTANCE, constraints, substitution);
  }

  public evaluate(context: ValueContext): StringValue {
    const strings = this.pieces.map(piece => piece.evaluate(context).getField('str'));
    return new StringValue(strings.map(string => string.cast(StringValue).value).join(''));
  }
}

export class ObjectFieldNode {
  public constructor(
    public readonly name: string,
    public readonly value: NodeInterface,
  ) {}
}

export class ObjectLiteralNode implements NodeInterface {
  public constructor(public readonly fields: ObjectFieldNode[]) {}

  public getFreeVariables(): Set<string> {
    return this.fields.reduce<Set<string>>(
      (variables, { value }) => new Set<string>([...variables, ...value.getFreeVariables()]),
      new Set<string>(),
    );
  }

  public getType(
    context: TypeContext,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    const hash = this.fields.reduce<{ [name: string]: TauType }>((hash, { name, value }) => {
      ({
        type: hash[name],
        constraints,
        substitution,
      } = value.getType(context, constraints, substitution));
      return hash;
    }, Object.create(null));
    return new TypingResults(
      ObjectType.create(hash).substitute(substitution),
      constraints,
      substitution,
    );
  }

  public evaluate(context: ValueContext): ValueInterface {
    const hash: { [name: string]: ValueInterface } = Object.create(null);
    for (const { name, value } of this.fields) {
      hash[name] = value.evaluate(context);
    }
    return new ObjectValue(ValueContext.create(hash));
  }
}

export class ListLiteralNode implements NodeInterface {
  public constructor(public readonly elements: NodeInterface[]) {}

  public getFreeVariables(): Set<string> {
    return this.elements.reduce(
      (variables, element) => new Set<string>([...variables, ...element.getFreeVariables()]),
      new Set<string>(),
    );
  }

  public getType(
    context: TypeContext,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    const inner = this.elements.reduce<TauType>((result, element) => {
      let type: TauType;
      ({ type, constraints, substitution } = element.getType(context, constraints, substitution));
      ({
        type: result,
        constraints,
        substitution,
      } = TauType.max(result, type, constraints, substitution));
      return result;
    }, UnknownType.INSTANCE);
    return new TypingResults(
      new ListType(inner.substitute(substitution)),
      constraints,
      substitution,
    );
  }

  public evaluate(context: ValueContext): ValueInterface {
    const elements = this.elements.map(element => element.evaluate(context));
    return new ListValue(elements, 0, elements.length);
  }
}

export class TupleLiteralNode implements NodeInterface {
  public constructor(public readonly elements: NodeInterface[]) {}

  public getFreeVariables(): Set<string> {
    return this.elements.reduce(
      (variables, element) => new Set<string>([...variables, ...element.getFreeVariables()]),
      new Set<string>(),
    );
  }

  public getType(
    context: TypeContext,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    const elements = this.elements.map(element => {
      let type: TauType;
      ({ type, constraints, substitution } = element.getType(context, constraints, substitution));
      return type;
    });
    return new TypingResults(
      new TupleType(elements).substitute(substitution),
      constraints,
      substitution,
    );
  }

  public evaluate(context: ValueContext): ValueInterface {
    return new TupleValue(this.elements.map(element => element.evaluate(context)));
  }
}

export class VariableNode implements NodeInterface {
  public constructor(public readonly name: string) {}

  public getFreeVariables(): Set<string> {
    return new Set<string>(this.name);
  }

  public getType(
    context: TypeContext,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    if (context.has(this.name)) {
      return context.top(this.name).instantiate(constraints, substitution);
    } else {
      return new TypingResults(VariableType.getNew(), constraints, substitution);
    }
  }

  public evaluate(context: ValueContext): ValueInterface {
    if (context.has(this.name)) {
      return context.top(this.name);
    }
    const global = globalThis as { [name: string]: unknown };
    if (this.name in global) {
      try {
        return unmarshal(global[this.name]);
      } catch {
        throw new RuntimeError(`unknown variable ${JSON.stringify(this.name)}`);
      }
    } else {
      throw new RuntimeError(`unknown variable ${JSON.stringify(this.name)}`);
    }
  }
}

export class FieldNode implements NodeInterface {
  private constructor(
    private readonly _operandName: string,
    public readonly name: string,
  ) {}

  public static create(name: string): LambdaNode {
    return new LambdaNode(
      '$1',
      ObjectType.create({ [name]: VariableType.getNew() }),
      new FieldNode('$1', name),
    );
  }

  public static createUnaryOperator(name: string): LambdaNode {
    return FieldNode.create(`#u:${name}`);
  }

  public static createBinaryOperator(name: string): LambdaNode {
    return FieldNode.create(`#b1:${name}`);
  }

  public getFreeVariables(): Set<string> {
    return new Set<string>([this._operandName]);
  }

  public getType(
    context: TypeContext,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    if (context.has(this._operandName)) {
      let operand: TauType;
      ({
        type: operand,
        constraints,
        substitution,
      } = context.top(this._operandName).instantiate(constraints, substitution));
      return operand.getField(this.name, constraints, substitution);
    } else {
      throw new TypeError(`field container missing from context`);
    }
  }

  public evaluate(context: ValueContext): ValueInterface {
    if (context.has(this._operandName)) {
      return context.top(this._operandName).getField(this.name);
    } else {
      throw new RuntimeError('field container missing from context');
    }
  }
}

export class LambdaNode implements NodeInterface {
  public constructor(
    public readonly name: string,
    public readonly type: TypeInterface | null,
    public readonly body: NodeInterface,
  ) {}

  public getFreeVariables(): Set<string> {
    const variables = this.body.getFreeVariables();
    variables.delete(this.name);
    return variables;
  }

  public getType(
    context: TypeContext,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    const argument = VariableType.getNew();
    if (this.type) {
      let type: TauType;
      ({ type, constraints, substitution } = this.type.instantiate(constraints, substitution));
      constraints = constraints.push(argument.name, type);
    }
    let type: TauType;
    ({ type, constraints, substitution } = this.body.getType(
      context.push(this.name, argument),
      constraints,
      substitution,
    ));
    return new TypingResults(
      new LambdaType(argument, type).substitute(substitution),
      constraints,
      substitution,
    );
  }

  public evaluate(context: ValueContext): Closure {
    return new Closure(context, this.name, this.body);
  }
}

export class NativeNode implements NodeInterface {
  // eslint-disable-next-line @typescript-eslint/ban-types
  public constructor(public readonly fn: Function) {}

  public getFreeVariables(): Set<string> {
    return new Set<string>(['this', 'arguments']);
  }

  public getType(
    _context: TypeContext,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    return new TypingResults(UnknownType.INSTANCE, constraints, substitution);
  }

  public evaluate(context: ValueContext): ValueInterface {
    if (!context.has('this') || !context.has('arguments')) {
      throw new InternalError(
        'native functions must be invoked with `this` and the list of arguments',
      );
    }
    return unmarshal(
      this.fn.apply(context.top('this').marshal(), context.top('arguments').marshal()),
    );
  }
}

export class SemiNativeNode implements NodeInterface {
  private readonly _arity: number;

  private *_args(): Generator<string, void> {
    for (let i = 1; i <= this._arity; i++) {
      yield '$' + i;
    }
  }

  public constructor(
    public readonly type: TauType,
    public readonly fn: (...args: ValueInterface[]) => ValueInterface,
  ) {
    this._arity = fn.length;
  }

  public getFreeVariables(): Set<string> {
    return new Set<string>(this._args());
  }

  public getType(
    _context: TypeContext,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    return new TypingResults(this.type, constraints, substitution);
  }

  public evaluate(context: ValueContext): ValueInterface {
    const args = [...this._args()];
    args.forEach(name => {
      if (!context.has(name)) {
        throw new InternalError('incorrect number of arguments received');
      }
    });
    return this.fn.apply(
      null,
      args.map(name => context.top(name)),
    );
  }
}

export class ApplicationNode implements NodeInterface {
  public constructor(
    public readonly left: NodeInterface,
    public readonly right: NodeInterface,
  ) {}

  public getFreeVariables(): Set<string> {
    return new Set<string>([...this.left.getFreeVariables(), ...this.right.getFreeVariables()]);
  }

  public getType(
    context: TypeContext,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    let left: TauType;
    ({
      type: left,
      constraints,
      substitution,
    } = this.left.getType(context, constraints, substitution));
    let right: TauType;
    ({
      type: right,
      constraints,
      substitution,
    } = this.right.getType(context, constraints, substitution));
    const result = VariableType.getNew();
    ({ constraints, substitution } = left
      .substitute(substitution)
      .leq(new LambdaType(right, result), constraints, substitution));
    return new TypingResults(result.substitute(substitution), constraints, substitution);
  }

  public evaluate(context: ValueContext): ValueInterface {
    const left = this.left.evaluate(context);
    if (left instanceof Closure) {
      return left.apply(this.right.evaluate(context));
    } else {
      throw new RuntimeError(`left-hand side of application must be a closure`);
    }
  }
}

export class LetNode implements NodeInterface {
  public constructor(
    public readonly name: string,
    public readonly type: TauType | null,
    public readonly expression: NodeInterface,
    public readonly rest: NodeInterface,
  ) {}

  public getFreeVariables(): Set<string> {
    const variables = this.rest.getFreeVariables();
    variables.delete(this.name);
    return variables;
  }

  public getType(
    context: TypeContext,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    let expression: TauType;
    ({
      type: expression,
      constraints,
      substitution,
    } = this.expression.getType(context, constraints, substitution));
    if (this.type) {
      ({ constraints, substitution } = expression.leq(this.type, constraints, substitution));
      expression = this.type.substitute(substitution);
    }
    context = context.map((_name, type) => type.substitute(substitution));
    return this.rest.getType(
      context.push(this.name, expression.close(context, constraints)),
      constraints,
      substitution,
    );
  }

  public evaluate(context: ValueContext): ValueInterface {
    const value = this.expression.evaluate(context);
    return this.rest.evaluate(context.push(this.name, value));
  }
}

export class FixNode implements NodeInterface {
  private static readonly _VALUE = new Closure(
    EMPTY_VALUE_CONTEXT,
    'f',
    new ApplicationNode(
      new LambdaNode(
        'x',
        null,
        new ApplicationNode(
          new VariableNode('f'),
          new LambdaNode(
            'v',
            null,
            new ApplicationNode(
              new ApplicationNode(new VariableNode('x'), new VariableNode('x')),
              new VariableNode('v'),
            ),
          ),
        ),
      ),
      new LambdaNode(
        'x',
        null,
        new ApplicationNode(
          new VariableNode('f'),
          new LambdaNode(
            'v',
            null,
            new ApplicationNode(
              new ApplicationNode(new VariableNode('x'), new VariableNode('x')),
              new VariableNode('v'),
            ),
          ),
        ),
      ),
    ),
  );

  public static readonly INSTANCE = new FixNode();

  private constructor() {}

  public getFreeVariables(): Set<string> {
    return new Set<string>();
  }

  public getType(
    _context: TypeContext,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    const variable = VariableType.getNew();
    return new TypingResults(
      new LambdaType(new LambdaType(variable, variable), variable),
      constraints,
      substitution,
    );
  }

  public evaluate(): Closure {
    return FixNode._VALUE;
  }
}

export class IfNode implements NodeInterface {
  public constructor(
    public readonly condition: NodeInterface,
    public readonly thenExpression: NodeInterface,
    public readonly elseExpression: NodeInterface,
  ) {}

  public getFreeVariables(): Set<string> {
    return new Set<string>([
      ...this.condition.getFreeVariables(),
      ...this.thenExpression.getFreeVariables(),
      ...this.elseExpression.getFreeVariables(),
    ]);
  }

  public getType(
    context: TypeContext,
    constraints: Constraints,
    substitution: Substitution,
  ): TypingResults {
    let condition: TauType;
    ({
      type: condition,
      constraints,
      substitution,
    } = this.condition.getType(context, constraints, substitution));
    ({ constraints, substitution } = condition.leq(
      BooleanType.INSTANCE,
      constraints,
      substitution,
    ));
    let thenExpression: TauType;
    ({
      type: thenExpression,
      constraints,
      substitution,
    } = this.thenExpression.getType(context, constraints, substitution));
    let elseExpression: TauType;
    ({
      type: elseExpression,
      constraints,
      substitution,
    } = this.elseExpression.getType(context, constraints, substitution));
    return TauType.max(thenExpression, elseExpression, constraints, substitution);
  }

  public evaluate(context: ValueContext): ValueInterface {
    const condition = this.condition.evaluate(context);
    if (condition.marshal()) {
      return this.thenExpression.evaluate(context);
    } else {
      return this.elseExpression.evaluate(context);
    }
  }
}
