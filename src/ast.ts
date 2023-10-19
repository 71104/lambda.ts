import { RuntimeError } from './errors.js';
import { ValueContext, ValueInterface } from './values.js';

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
