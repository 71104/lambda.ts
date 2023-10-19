import { RuntimeError } from './errors.js';
import { Closure, ValueContext, ValueInterface } from './values.js';

export interface NodeInterface {
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
  public constructor(public readonly value: ValueInterface) {}

  public evaluate(): ValueInterface {
    return this.value;
  }
}

export class VariableNode implements NodeInterface {
  public constructor(public readonly name: string) {}

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
    public readonly body: NodeInterface,
  ) {}

  public evaluate(context: ValueContext): Closure {
    return new Closure(context, this.name, this.body);
  }
}

export class ApplicationNode implements NodeInterface {
  public constructor(
    public readonly left: NodeInterface,
    public readonly right: NodeInterface,
  ) {}

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
    public readonly expression: NodeInterface,
    public readonly rest: NodeInterface,
  ) {}

  public evaluate(context: ValueContext): ValueInterface {
    return this.rest.evaluate(context.push(this.name, this.expression.evaluate(context)));
  }
}
