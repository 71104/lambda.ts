import { Context } from './context.js';
import { InternalError, RuntimeError, TypeError } from './errors.js';
import {
  BooleanType,
  EMPTY_SUBSTITUTION,
  IotaType,
  LambdaType,
  ObjectType,
  TauType,
  TypeContext,
  TypeResults,
  TypeScheme,
  UnknownType,
  VariableType,
} from './types.js';
import { Closure, EMPTY_VALUE_CONTEXT, ValueContext, ValueInterface, unmarshal } from './values.js';

export interface NodeInterface {
  /**
   * Returns the set of free variables, i.e. variables that this subtree is using but are
   * declared elsewhere.
   */
  getFreeVariables(): Set<string>;

  /**
   * Type-checks a Lambda program and returns its type.
   *
   * If the program uses any Lambda operators (whether they're unary or binary) this algorithm will
   * modify the AST by storing the selected overload in each respective node.
   *
   * @param context The type context, mapping variable names to Lambda types.
   */
  getType(context: TypeContext): TypeResults;

  /**
   * Evaluates a Lambda program and returns the result.
   *
   * If the program uses any Lambda operators (whether they're unary or binary) this algorithm
   * requires that operator overload resolution has been performed, so you must always invoke
   * `getType` before `evaluate`.
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

  public getType(): TypeResults {
    return new TypeResults(EMPTY_SUBSTITUTION, this.type);
  }

  public evaluate(): ValueInterface {
    return this.value;
  }
}

export class VariableNode implements NodeInterface {
  public constructor(public readonly name: string) {}

  public getFreeVariables(): Set<string> {
    return new Set<string>(this.name);
  }

  public getType(context: TypeContext): TypeResults {
    if (context.has(this.name)) {
      return new TypeResults(EMPTY_SUBSTITUTION, context.top(this.name).instantiate());
    } else {
      return new TypeResults(EMPTY_SUBSTITUTION, UnknownType.INSTANCE);
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

export class LambdaNode implements NodeInterface {
  public constructor(
    public readonly name: string,
    public readonly type: TauType | null,
    public readonly body: NodeInterface,
  ) {}

  public getFreeVariables(): Set<string> {
    const variables = this.body.getFreeVariables();
    variables.delete(this.name);
    return variables;
  }

  public getType(context: TypeContext): TypeResults {
    const parameter = this.type || VariableType.getNew();
    const { substitution, type } = this.body.getType(
      context.push(this.name, new TypeScheme([], parameter)),
    );
    return new TypeResults(substitution, new LambdaType(parameter, type).substitute(substitution));
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

  public getType(): TypeResults {
    return new TypeResults(EMPTY_SUBSTITUTION, UnknownType.INSTANCE);
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

  public constructor(public readonly fn: (...args: ValueInterface[]) => ValueInterface) {
    this._arity = fn.length;
  }

  public getFreeVariables(): Set<string> {
    return new Set<string>(this._args());
  }

  public getType(): TypeResults {
    return new TypeResults(EMPTY_SUBSTITUTION, UnknownType.INSTANCE);
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

  public getType(context: TypeContext): TypeResults {
    const left = this.left.getType(context);
    const right = this.right.getType(
      context.map((_, scheme) => scheme.substitute(left.substitution)),
    );
    const lambda = new LambdaType(right.type, VariableType.getNew());
    const substitution = left.type.leq(lambda, right.substitution);
    if (substitution) {
      return new TypeResults(
        left.substitution.add(right.substitution).add(substitution),
        lambda.right.substitute(substitution),
      );
    } else {
      throw new TypeError(`cannot unify ${left.type} and ${lambda}`);
    }
  }

  public evaluate(context: ValueContext): ValueInterface {
    const left = this.left.evaluate(context);
    if (left instanceof Closure) {
      return left.apply(this.right.evaluate(context));
    } else {
      throw new RuntimeError('cannot apply a non-closure value');
    }
  }
}

export class LetNode implements NodeInterface {
  public constructor(
    public readonly name: string,
    public readonly type: TypeScheme | null,
    public readonly expression: NodeInterface,
    public readonly rest: NodeInterface,
  ) {}

  public getFreeVariables(): Set<string> {
    const variables = this.rest.getFreeVariables();
    variables.delete(this.name);
    return variables;
  }

  public getType(context: TypeContext): TypeResults {
    const expression = this.expression.getType(context);
    // TODO: check expression type against type constraints.
    context = context.map((_, type) => type.substitute(expression.substitution));
    const rest = this.rest.getType(context.push(this.name, expression.type.close(context)));
    return new TypeResults(expression.substitution.add(rest.substitution), rest.type);
  }

  public evaluate(context: ValueContext): ValueInterface {
    return this.rest.evaluate(context.push(this.name, this.expression.evaluate(context)));
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

  public getType(): TypeResults {
    const variable = VariableType.getNew();
    return new TypeResults(
      EMPTY_SUBSTITUTION,
      new LambdaType(new LambdaType(variable, variable), variable),
    );
  }

  public evaluate(): Closure {
    return FixNode._VALUE;
  }
}

export class FieldNode implements NodeInterface {
  public constructor(public readonly name: string) {}

  public getFreeVariables(): Set<string> {
    return new Set<string>();
  }

  public getType(): TypeResults {
    const field = VariableType.getNew();
    const method = new LambdaType(ObjectType.EMPTY, field);
    const operand = ObjectType.create(Context.create<TauType>().push(this.name, method));
    return new TypeResults(EMPTY_SUBSTITUTION, new LambdaType(operand, field));
  }

  public evaluate(): ValueInterface {
    return Closure.wrap((value: ValueInterface) => value.getField(this.name));
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

  public getType(context: TypeContext): TypeResults {
    const condition = this.condition.getType(context);
    const maybeSubstitution = condition.type.leq(BooleanType.INSTANCE, condition.substitution);
    if (!maybeSubstitution) {
      throw new TypeError(`cannot unify '${condition.type.toString()}' and 'boolean'`);
    }
    let substitution = maybeSubstitution;
    context = context.map((_name, field) => field.substitute(substitution));
    const thenExpression = this.thenExpression.getType(context);
    substitution = substitution.add(thenExpression.substitution);
    context = context.map((_name, field) => field.substitute(substitution));
    const elseExpression = this.elseExpression.getType(context);
    substitution = substitution.add(elseExpression.substitution);
    const elseSubstitution = elseExpression.type.leq(thenExpression.type, substitution);
    const thenSubstitution = thenExpression.type.leq(elseExpression.type, substitution);
    if (elseSubstitution) {
      return new TypeResults(elseSubstitution, thenExpression.type.substitute(elseSubstitution));
    } else if (thenSubstitution) {
      return new TypeResults(thenSubstitution, elseExpression.type.substitute(thenSubstitution));
    } else {
      throw new TypeError(
        `cannot unify '${thenExpression.type.toString()}' and '${elseExpression.type.toString()}'`,
      );
    }
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
