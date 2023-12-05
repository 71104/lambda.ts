import { LambdaType, NaturalType, VariableType } from './types.js';

function newVar<Result>(fn: (variable: VariableType) => Result): Result {
  return fn(VariableType.getNew());
}

NaturalType.PROTOTYPE.add({
  '#b1:+': new LambdaType(
    NaturalType.INSTANCE,
    newVar(rhs => newVar(result => new LambdaType(rhs, result))),
  ),
});
