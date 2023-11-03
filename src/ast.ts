import { Context } from './context.js';
import { InternalError, RuntimeError } from './errors.js';
import {
  BooleanType,
  EMPTY_SUBSTITUTION,
  IotaType,
  LambdaType,
  ListType,
  ObjectType,
  StringType,
  TauType,
  TypeContext,
  TypeResults,
  TypeScheme,
  UndefinedType,
  UnknownType,
  VariableType,
} from './types.js';
import {
  Closure,
  EMPTY_VALUE_CONTEXT,
  ListValue,
  StringValue,
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
   * Type-checks a Lambda program and returns its type.
   *
   * @param context The type context, mapping variable names to Lambda types.
   */
  getType(context: TypeContext): TypeResults;

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

  public getType(): TypeResults {
    return new TypeResults(EMPTY_SUBSTITUTION, this.type);
  }

  public evaluate(): ValueInterface {
    return this.value;
  }
}

export class TemplateStringLiteral implements NodeInterface {
  public constructor(public readonly pieces: NodeInterface[]) {}

  public getFreeVariables(): Set<string> {
    const sets = this.pieces.map(piece => [...piece.getFreeVariables()]);
    return new Set<string>(sets.flat());
  }

  public getType(context: TypeContext): TypeResults {
    let substitution = EMPTY_SUBSTITUTION;
    for (const piece of this.pieces) {
      context = context.map((_, scheme) => scheme.substitute(substitution));
      const results = piece.getType(context);
      substitution = results.type.leqOrThrow(
        StringType.INSTANCE,
        substitution.add(results.substitution),
      );
    }
    return new TypeResults(substitution, StringType.INSTANCE);
  }

  public evaluate(context: ValueContext): StringValue {
    const strings = this.pieces.map(piece => piece.evaluate(context).cast(StringValue));
    return new StringValue(strings.join(''));
  }
}

export class ListLiteralNode implements NodeInterface {
  public constructor(public readonly elements: NodeInterface[]) {}

  public getFreeVariables(): Set<string> {
    const sets = this.elements.map(element => [...element.getFreeVariables()]);
    return new Set<string>(sets.flat());
  }

  public getType(context: TypeContext): TypeResults {
    if (this.elements.length < 1) {
      return new TypeResults(EMPTY_SUBSTITUTION, new ListType(UndefinedType.INSTANCE));
    }
    let { substitution, type } = this.elements[0].getType(context);
    for (let i = 1; i < this.elements.length; i++) {
      context = context.map((_, scheme) => scheme.substitute(substitution));
      let results = this.elements[i].getType(context);
      substitution = substitution.add(results.substitution);
      results = results.type.max(type, substitution);
      substitution = results.substitution;
      type = results.type;
    }
    return new TypeResults(substitution, new ListType(type.substitute(substitution)));
  }

  public evaluate(context: ValueContext): ValueInterface {
    const elements = this.elements.map(element => element.evaluate(context));
    return new ListValue(elements, 0, elements.length);
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
    const parameter = this.type || new VariableType();
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

  public constructor(
    public readonly type: TauType,
    public readonly fn: (...args: ValueInterface[]) => ValueInterface,
  ) {
    this._arity = fn.length;
  }

  public getFreeVariables(): Set<string> {
    return new Set<string>(this._args());
  }

  public getType(): TypeResults {
    return new TypeResults(EMPTY_SUBSTITUTION, this.type);
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
    const lambda = new LambdaType(right.type, new VariableType());
    const substitution = left.type.leqOrThrow(lambda, right.substitution);
    return new TypeResults(
      left.substitution.add(right.substitution).add(substitution),
      lambda.right.substitute(substitution),
    );
  }

  public evaluate(context: ValueContext): ValueInterface {
    return this.left.evaluate(context).cast(Closure).apply(this.right.evaluate(context));
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
    let substitution = expression.substitution;
    if (this.type) {
      substitution = expression.type.leqOrThrow(this.type.instantiate(), substitution);
    }
    context = context.map((_, scheme) => scheme.substitute(substitution));
    const rest = this.rest.getType(context.push(this.name, expression.type.close(context)));
    return new TypeResults(substitution.add(rest.substitution), rest.type);
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
    const variable = new VariableType();
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
  private readonly _operandName: string;
  public readonly name: string;

  private constructor(operandName: string, fieldName: string) {
    this._operandName = operandName;
    this.name = fieldName;
  }

  public static createRaw(operand: string, name: string): NodeInterface {
    return new FieldNode(operand, name);
  }

  public static create(name: string): NodeInterface {
    return new LambdaNode('$1', null, new FieldNode('$1', name));
  }

  public static createUnaryOperator(name: string): NodeInterface {
    return new LambdaNode('$1', null, new FieldNode('$1', '#u:' + name));
  }

  public static createBinaryOperator(name: string): NodeInterface {
    return new LambdaNode(
      '$1',
      null,
      new LambdaNode(
        '$2',
        null,
        new ApplicationNode(new FieldNode('$1', '#b1:' + name), new VariableNode('$2')),
      ),
    );
  }

  public getFreeVariables(): Set<string> {
    return new Set<string>([this._operandName]);
  }

  public getType(context: TypeContext): TypeResults {
    if (!context.has(this._operandName)) {
      throw new TypeError('field container missing from context');
    }
    const operand = context.top(this._operandName).instantiate();
    const field = new VariableType();
    const substitution = operand.leqOrThrow(
      ObjectType.create(
        Context.create<TauType>({
          [this.name]: new LambdaType(ObjectType.EMPTY, field),
        }),
      ),
      EMPTY_SUBSTITUTION,
    );
    return new TypeResults(substitution, field.substitute(substitution));
  }

  public evaluate(context: ValueContext): ValueInterface {
    if (context.has(this._operandName)) {
      return context.top(this._operandName).getField(this.name);
    } else {
      throw new InternalError('field container missing from context');
    }
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
    let substitution = condition.type.leqOrThrow(BooleanType.INSTANCE, condition.substitution);
    context = context.map((_, scheme) => scheme.substitute(substitution));
    const thenExpression = this.thenExpression.getType(context);
    substitution = substitution.add(thenExpression.substitution);
    context = context.map((_, scheme) => scheme.substitute(substitution));
    const elseExpression = this.elseExpression.getType(context);
    substitution = substitution.add(elseExpression.substitution);
    return thenExpression.type.max(elseExpression.type, substitution);
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
