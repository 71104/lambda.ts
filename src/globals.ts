import { EMPTY_TYPE_CONTEXT, LambdaType, TypeScheme, VariableType } from './types.js';
import { Closure, EMPTY_VALUE_CONTEXT, ValueInterface } from './values.js';

export const GLOBAL_TYPE_CONTEXT = EMPTY_TYPE_CONTEXT.pushAll({
  pass: new TypeScheme(['x'], new LambdaType(new VariableType('x'), new VariableType('x'))),
});

export const GLOBAL_VALUE_CONTEXT = EMPTY_VALUE_CONTEXT.pushAll({
  pass: Closure.wrap((value: ValueInterface) => value),
});
