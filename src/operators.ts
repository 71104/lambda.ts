import { BooleanType, IntegerType, LambdaType, NaturalType, VariableType } from './types.js';

function newVar<Result>(fn: (variable: VariableType) => Result): Result {
  return fn(VariableType.getNew());
}

BooleanType.PROTOTYPE.add({
  '#u:not': new LambdaType(BooleanType.INSTANCE, BooleanType.INSTANCE),
});

NaturalType.PROTOTYPE.add({
  '#u:-': new LambdaType(NaturalType.INSTANCE, IntegerType.INSTANCE),
  '#u:~': new LambdaType(NaturalType.INSTANCE, IntegerType.INSTANCE),
  '#b1:+': new LambdaType(
    NaturalType.INSTANCE,
    newVar(rhs => newVar(result => new LambdaType(rhs, result))),
  ),
});
