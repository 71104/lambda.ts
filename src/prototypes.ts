import { BooleanType, LambdaType, NaturalType, StringType } from './types.js';

BooleanType.PROTOTYPE.add({
  str: new LambdaType(BooleanType.INSTANCE, StringType.INSTANCE),
});

NaturalType.PROTOTYPE.add({
  str: new LambdaType(NaturalType.INSTANCE, StringType.INSTANCE),
});

StringType.PROTOTYPE.add({
  str: new LambdaType(StringType.INSTANCE, StringType.INSTANCE),
});
