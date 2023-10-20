import { RuntimeError, TypeError } from './errors.js';
import {
  EMPTY_SUBSTITUTION,
  IotaType,
  LambdaType,
  Substitution,
  TauType,
  TypeContext,
  TypeScheme,
  UnknownType,
  VariableType,
} from './types.js';
import { Closure, EMPTY_VALUE_CONTEXT, ValueContext, ValueInterface } from './values.js';

export class TypeResults {
  public constructor(
    public readonly substitution: Substitution,
    public readonly type: TauType,
  ) {}
}

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
    if (!context.has(this.name)) {
      return new TypeResults(EMPTY_SUBSTITUTION, UnknownType.INSTANCE);
    }
    const scheme = context.top(this.name);
    const hash = Object.create(null);
    scheme.names.forEach(name => (hash[name] = VariableType.getNew()));
    return new TypeResults(
      EMPTY_SUBSTITUTION,
      scheme.type.substitute(Substitution.create<TauType>(hash)),
    );
  }

  public evaluate(context: ValueContext): ValueInterface {
    if (context.has(this.name)) {
      return context.top(this.name);
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
  private static readonly _VAR = new VariableType('#');
  private static readonly _TYPE = new LambdaType(
    new LambdaType(FixNode._VAR, FixNode._VAR),
    FixNode._VAR,
  );
  private static readonly _TYPE_RESULTS = {
    substitution: EMPTY_SUBSTITUTION,
    type: FixNode._TYPE,
  };
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
    return FixNode._TYPE_RESULTS;
  }

  public evaluate(): Closure {
    return FixNode._VALUE;
  }
}
