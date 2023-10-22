import { ComplexType, LambdaType, ObjectType, RealType, StringType, TauType } from './types.js';
import {
  Closure,
  ComplexValue,
  RealValue,
  StringValue,
  ValueContext,
  ValueInterface,
} from './values.js';

class TypedTerm {
  public constructor(
    public readonly type: TauType,
    public readonly value: ValueInterface,
  ) {}
}

function definePrototype(
  TypeConstructor: { PROTOTYPE: ObjectType },
  ValueConstructor: { PROTOTYPE: ValueContext },
  terms: { [name: string]: TypedTerm },
): void {
  const types: { [name: string]: TauType } = Object.create(null);
  const values: { [name: string]: ValueInterface } = Object.create(null);
  for (const name in terms) {
    if (Object.prototype.hasOwnProperty.call(terms, name)) {
      types[name] = terms[name].type;
      values[name] = terms[name].value;
    }
  }
  TypeConstructor.PROTOTYPE = TypeConstructor.PROTOTYPE.extend(types);
  ValueConstructor.PROTOTYPE = ValueConstructor.PROTOTYPE.add(
    ValueContext.create<ValueInterface>(values),
  );
}

function method0<Value extends ValueInterface>(
  value: { INSTANCE: TauType },
  result: { INSTANCE: TauType },
  fn: (value: Value) => ValueInterface,
): TypedTerm {
  return {
    type: new LambdaType(value.INSTANCE, result.INSTANCE),
    value: Closure.wrap(fn),
  };
}

definePrototype(ComplexType, ComplexValue, {
  str: method0(ComplexType, StringType, (value: ComplexValue) => new StringValue(value.toString())),
  real: method0(ComplexType, RealType, (value: ComplexValue) => new RealValue(value.real)),
  imaginary: method0(
    ComplexType,
    RealType,
    (value: ComplexValue) => new RealValue(value.imaginary),
  ),
  abs: method0(
    ComplexType,
    RealType,
    (value: ComplexValue) => new RealValue(Math.hypot(value.real, value.imaginary)),
  ),
});
