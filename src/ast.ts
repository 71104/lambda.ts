import { RuntimeError } from './errors.js';
import {
  Constraints,
  IotaType,
  LambdaType,
  ObjectType,
  Substitution,
  TauType,
  TypeContext,
  TypeInterface,
  TypingResults,
  VariableType,
} from './types.js';
import {
  Closure,
  EMPTY_VALUE_CONTEXT,
  ObjectValue,
  ValueContext,
  ValueInterface,
} from './values.js';

export interface NodeInterface {
  /**
   * Returns the set of free variables, i.e. variables that this subtree is using but are
   * declared elsewhere.
   */
  getFreeVariables(): Set<string>;

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
    } else {
      throw new RuntimeError(`undefined variable ${JSON.stringify(name)}`);
    }
  }
}

export class FieldNode implements NodeInterface {
  private constructor(
    private readonly _operandName: string,
    public readonly name: string,
  ) {}

  public static create(name: string): LambdaNode {
    return new LambdaNode('$1', null, new FieldNode('$1', name));
  }

  public static createUnaryOperator(name: string): LambdaNode {
    return new LambdaNode('$1', null, new FieldNode('$1', `#u:${name}`));
  }

  public static createBinaryOperator(name: string): LambdaNode {
    return new LambdaNode('$1', null, new FieldNode('$1', `#b1:${name}`));
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
    context = context.map((_name, type) => type.substitute(substitution));
    return this.rest.getType(
      context.push(this.name, expression.close(context)),
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
