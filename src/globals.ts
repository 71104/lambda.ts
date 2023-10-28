import { EMPTY_TYPE_CONTEXT, LambdaType, VariableType } from './types.js';
import { Closure, EMPTY_VALUE_CONTEXT, ValueInterface } from './values.js';

export const GLOBAL_TYPE_CONTEXT = EMPTY_TYPE_CONTEXT.pushAll({
  pass: VariableType.newVar(x => new LambdaType(x, x)).close(),
});

export const GLOBAL_VALUE_CONTEXT = EMPTY_VALUE_CONTEXT.pushAll({
  pass: Closure.wrap((value: ValueInterface) => value),
});
