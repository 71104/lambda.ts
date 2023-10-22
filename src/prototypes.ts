import {
  BooleanType,
  ComplexType,
  IntegerType,
  IotaType,
  LambdaType,
  NaturalType,
  ObjectType,
  RationalType,
  RealType,
  StringType,
  TauType,
} from './types.js';
import {
  BooleanValue,
  Closure,
  ComplexValue,
  IntegerValue,
  NaturalValue,
  RationalValue,
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
  TypeConstructor: { INSTANCE: IotaType; PROTOTYPE: ObjectType },
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
  TypeConstructor.PROTOTYPE = TypeConstructor.PROTOTYPE.extend(types, TypeConstructor.INSTANCE);
  ValueConstructor.PROTOTYPE = ValueConstructor.PROTOTYPE.add(
    ValueContext.create<ValueInterface>(values),
  );
}

function method0<Arg0 extends ValueInterface>(
  arg0: { INSTANCE: TauType },
  result: { INSTANCE: TauType },
  fn: (arg0: Arg0) => ValueInterface,
): TypedTerm {
  return new TypedTerm(new LambdaType(arg0.INSTANCE, result.INSTANCE), Closure.wrap(fn));
}

function method1<Arg0 extends ValueInterface, Arg1 extends ValueInterface>(
  arg0: { INSTANCE: TauType },
  arg1: { INSTANCE: TauType },
  result: { INSTANCE: TauType },
  fn: (arg0: Arg0, arg1: Arg1) => ValueInterface,
): TypedTerm {
  return new TypedTerm(
    new LambdaType(arg0.INSTANCE, new LambdaType(arg1.INSTANCE, result.INSTANCE)),
    Closure.wrap(fn),
  );
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

definePrototype(RealType, RealValue, {
  str: method0(RealType, StringType, (value: RealValue) => new StringValue(value.toString())),
  real: method0(RealType, RealType, (value: RealValue) => new RealValue(value.value)),
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  imaginary: method0(RealType, RealType, (_value: RealValue) => RealValue.ZERO),
  abs: method0(RealType, RealType, (value: RealValue) => new RealValue(Math.abs(value.value))),
  ceil: method0(
    RealType,
    IntegerType,
    (value: RealValue) => new IntegerValue(Math.ceil(value.value)),
  ),
  floor: method0(
    RealType,
    IntegerType,
    (value: RealValue) => new IntegerValue(Math.floor(value.value)),
  ),
  round: method0(
    RealType,
    IntegerType,
    (value: RealValue) => new IntegerValue(Math.round(value.value)),
  ),
  trunc: method0(
    RealType,
    IntegerType,
    (value: RealValue) => new IntegerValue(Math.trunc(value.value)),
  ),
  sign: method0(
    RealType,
    IntegerType,
    (value: RealValue) => new IntegerValue(Math.sign(value.value)),
  ),
  sqrt: method0(RealType, RealType, (value: RealValue) => new RealValue(Math.sqrt(value.value))),
  cbrt: method0(RealType, RealType, (value: RealValue) => new RealValue(Math.cbrt(value.value))),
  exp: method0(RealType, RealType, (value: RealValue) => new RealValue(Math.exp(value.value))),
  log: method0(RealType, RealType, (value: RealValue) => new RealValue(Math.log(value.value))),
  log10: method0(RealType, RealType, (value: RealValue) => new RealValue(Math.log10(value.value))),
  log2: method0(RealType, RealType, (value: RealValue) => new RealValue(Math.log2(value.value))),
  sin: method0(RealType, RealType, (value: RealValue) => new RealValue(Math.sin(value.value))),
  cos: method0(RealType, RealType, (value: RealValue) => new RealValue(Math.cos(value.value))),
  tan: method0(RealType, RealType, (value: RealValue) => new RealValue(Math.tan(value.value))),
  asin: method0(RealType, RealType, (value: RealValue) => new RealValue(Math.asin(value.value))),
  acos: method0(RealType, RealType, (value: RealValue) => new RealValue(Math.acos(value.value))),
  atan: method0(RealType, RealType, (value: RealValue) => new RealValue(Math.atan(value.value))),
  sinh: method0(RealType, RealType, (value: RealValue) => new RealValue(Math.sinh(value.value))),
  cosh: method0(RealType, RealType, (value: RealValue) => new RealValue(Math.cosh(value.value))),
  tanh: method0(RealType, RealType, (value: RealValue) => new RealValue(Math.tanh(value.value))),
  asinh: method0(RealType, RealType, (value: RealValue) => new RealValue(Math.asinh(value.value))),
  acosh: method0(RealType, RealType, (value: RealValue) => new RealValue(Math.acosh(value.value))),
  atanh: method0(RealType, RealType, (value: RealValue) => new RealValue(Math.atanh(value.value))),
});

definePrototype(RationalType, RationalValue, {
  str: method0(
    RationalType,
    StringType,
    (value: RationalValue) => new StringValue(value.toString()),
  ),
  real: method0(
    RationalType,
    RealType,
    (value: RationalValue) => new RealValue(value.numerator / value.denominator),
  ),
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  imaginary: method0(RationalType, RealType, (_value: RationalValue) => RealValue.ZERO),
  abs: method0(
    RationalType,
    RealType,
    (value: RationalValue) => new RealValue(Math.abs(value.numerator / value.denominator)),
  ),
  ceil: method0(
    IntegerType,
    RealType,
    (value: RationalValue) => new IntegerValue(Math.ceil(value.numerator / value.denominator)),
  ),
  floor: method0(
    IntegerType,
    RealType,
    (value: RationalValue) => new IntegerValue(Math.floor(value.numerator / value.denominator)),
  ),
  round: method0(
    IntegerType,
    RealType,
    (value: RationalValue) => new IntegerValue(Math.round(value.numerator / value.denominator)),
  ),
  trunc: method0(
    IntegerType,
    RealType,
    (value: RationalValue) => new IntegerValue(Math.trunc(value.numerator / value.denominator)),
  ),
  sign: method0(
    IntegerType,
    RealType,
    (value: RationalValue) => new IntegerValue(Math.sign(value.numerator / value.denominator)),
  ),
  sqrt: method0(
    RationalType,
    RealType,
    (value: RationalValue) => new RealValue(Math.sqrt(value.numerator / value.denominator)),
  ),
  cbrt: method0(
    RationalType,
    RealType,
    (value: RationalValue) => new RealValue(Math.cbrt(value.numerator / value.denominator)),
  ),
  exp: method0(
    RationalType,
    RealType,
    (value: RationalValue) => new RealValue(Math.exp(value.numerator / value.denominator)),
  ),
  log: method0(
    RationalType,
    RealType,
    (value: RationalValue) => new RealValue(Math.log(value.numerator / value.denominator)),
  ),
  log10: method0(
    RationalType,
    RealType,
    (value: RationalValue) => new RealValue(Math.log10(value.numerator / value.denominator)),
  ),
  log2: method0(
    RationalType,
    RealType,
    (value: RationalValue) => new RealValue(Math.log2(value.numerator / value.denominator)),
  ),
  sin: method0(
    RationalType,
    RealType,
    (value: RationalValue) => new RealValue(Math.sin(value.numerator / value.denominator)),
  ),
  cos: method0(
    RationalType,
    RealType,
    (value: RationalValue) => new RealValue(Math.cos(value.numerator / value.denominator)),
  ),
  tan: method0(
    RationalType,
    RealType,
    (value: RationalValue) => new RealValue(Math.tan(value.numerator / value.denominator)),
  ),
  asin: method0(
    RationalType,
    RealType,
    (value: RationalValue) => new RealValue(Math.asin(value.numerator / value.denominator)),
  ),
  acos: method0(
    RationalType,
    RealType,
    (value: RationalValue) => new RealValue(Math.acos(value.numerator / value.denominator)),
  ),
  atan: method0(
    RationalType,
    RealType,
    (value: RationalValue) => new RealValue(Math.atan(value.numerator / value.denominator)),
  ),
  sinh: method0(
    RationalType,
    RealType,
    (value: RationalValue) => new RealValue(Math.sinh(value.numerator / value.denominator)),
  ),
  cosh: method0(
    RationalType,
    RealType,
    (value: RationalValue) => new RealValue(Math.cosh(value.numerator / value.denominator)),
  ),
  tanh: method0(
    RationalType,
    RealType,
    (value: RationalValue) => new RealValue(Math.tanh(value.numerator / value.denominator)),
  ),
  asinh: method0(
    RationalType,
    RealType,
    (value: RationalValue) => new RealValue(Math.asinh(value.numerator / value.denominator)),
  ),
  acosh: method0(
    RationalType,
    RealType,
    (value: RationalValue) => new RealValue(Math.acosh(value.numerator / value.denominator)),
  ),
  atanh: method0(
    RationalType,
    RealType,
    (value: RationalValue) => new RealValue(Math.atanh(value.numerator / value.denominator)),
  ),
});

definePrototype(IntegerType, IntegerValue, {
  str: method0(IntegerType, StringType, (value: IntegerValue) => new StringValue(value.toString())),
  real: method0(IntegerType, IntegerType, (value: IntegerValue) => value),
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  imaginary: method0(IntegerType, RealType, (_value: IntegerValue) => RealValue.ZERO),
  abs: method0(
    IntegerType,
    IntegerType,
    (value: IntegerValue) => new IntegerValue(Math.abs(value.value)),
  ),
  ceil: method0(IntegerType, IntegerType, (value: IntegerValue) => value),
  floor: method0(IntegerType, IntegerType, (value: IntegerValue) => value),
  round: method0(IntegerType, IntegerType, (value: IntegerValue) => value),
  trunc: method0(IntegerType, IntegerType, (value: IntegerValue) => value),
  sign: method0(
    IntegerType,
    IntegerType,
    (value: IntegerValue) => new IntegerValue(Math.sign(value.value)),
  ),
  sqrt: method0(
    IntegerType,
    RealType,
    (value: IntegerValue) => new RealValue(Math.sqrt(value.value)),
  ),
  cbrt: method0(
    IntegerType,
    RealType,
    (value: IntegerValue) => new RealValue(Math.cbrt(value.value)),
  ),
  exp: method0(
    IntegerType,
    RealType,
    (value: IntegerValue) => new RealValue(Math.exp(value.value)),
  ),
  log: method0(
    IntegerType,
    RealType,
    (value: IntegerValue) => new RealValue(Math.log(value.value)),
  ),
  log10: method0(
    IntegerType,
    RealType,
    (value: IntegerValue) => new RealValue(Math.log10(value.value)),
  ),
  log2: method0(
    IntegerType,
    RealType,
    (value: IntegerValue) => new RealValue(Math.log2(value.value)),
  ),
  sin: method0(
    IntegerType,
    RealType,
    (value: IntegerValue) => new RealValue(Math.sin(value.value)),
  ),
  cos: method0(
    IntegerType,
    RealType,
    (value: IntegerValue) => new RealValue(Math.cos(value.value)),
  ),
  tan: method0(
    IntegerType,
    RealType,
    (value: IntegerValue) => new RealValue(Math.tan(value.value)),
  ),
  asin: method0(
    IntegerType,
    RealType,
    (value: IntegerValue) => new RealValue(Math.asin(value.value)),
  ),
  acos: method0(
    IntegerType,
    RealType,
    (value: IntegerValue) => new RealValue(Math.acos(value.value)),
  ),
  atan: method0(
    IntegerType,
    RealType,
    (value: IntegerValue) => new RealValue(Math.atan(value.value)),
  ),
  sinh: method0(
    IntegerType,
    RealType,
    (value: IntegerValue) => new RealValue(Math.sinh(value.value)),
  ),
  cosh: method0(
    IntegerType,
    RealType,
    (value: IntegerValue) => new RealValue(Math.cosh(value.value)),
  ),
  tanh: method0(
    IntegerType,
    RealType,
    (value: IntegerValue) => new RealValue(Math.tanh(value.value)),
  ),
  asinh: method0(
    IntegerType,
    RealType,
    (value: IntegerValue) => new RealValue(Math.asinh(value.value)),
  ),
  acosh: method0(
    IntegerType,
    RealType,
    (value: IntegerValue) => new RealValue(Math.acosh(value.value)),
  ),
  atanh: method0(
    IntegerType,
    RealType,
    (value: IntegerValue) => new RealValue(Math.atanh(value.value)),
  ),
});

definePrototype(NaturalType, NaturalValue, {
  str: method0(NaturalType, StringType, (value: NaturalValue) => new StringValue(value.toString())),
  real: method0(NaturalType, NaturalType, (value: NaturalValue) => value),
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  imaginary: method0(NaturalType, RealType, (_value: NaturalValue) => RealValue.ZERO),
  abs: method0(NaturalType, NaturalType, (value: NaturalValue) => value),
  ceil: method0(NaturalType, NaturalType, (value: NaturalValue) => value),
  floor: method0(NaturalType, NaturalType, (value: NaturalValue) => value),
  round: method0(NaturalType, NaturalType, (value: NaturalValue) => value),
  trunc: method0(NaturalType, NaturalType, (value: NaturalValue) => value),
  sign: method0(
    NaturalType,
    IntegerType,
    (value: NaturalValue) => new IntegerValue(Math.sign(value.value)),
  ),
  sqrt: method0(
    NaturalType,
    RealType,
    (value: NaturalValue) => new RealValue(Math.sqrt(value.value)),
  ),
  cbrt: method0(
    NaturalType,
    RealType,
    (value: NaturalValue) => new RealValue(Math.cbrt(value.value)),
  ),
  exp: method0(
    NaturalType,
    RealType,
    (value: NaturalValue) => new RealValue(Math.exp(value.value)),
  ),
  log: method0(
    NaturalType,
    RealType,
    (value: NaturalValue) => new RealValue(Math.log(value.value)),
  ),
  log10: method0(
    NaturalType,
    RealType,
    (value: NaturalValue) => new RealValue(Math.log10(value.value)),
  ),
  log2: method0(
    NaturalType,
    RealType,
    (value: NaturalValue) => new RealValue(Math.log2(value.value)),
  ),
  sin: method0(
    NaturalType,
    RealType,
    (value: NaturalValue) => new RealValue(Math.sin(value.value)),
  ),
  cos: method0(
    NaturalType,
    RealType,
    (value: NaturalValue) => new RealValue(Math.cos(value.value)),
  ),
  tan: method0(
    NaturalType,
    RealType,
    (value: NaturalValue) => new RealValue(Math.tan(value.value)),
  ),
  asin: method0(
    NaturalType,
    RealType,
    (value: NaturalValue) => new RealValue(Math.asin(value.value)),
  ),
  acos: method0(
    NaturalType,
    RealType,
    (value: NaturalValue) => new RealValue(Math.acos(value.value)),
  ),
  atan: method0(
    NaturalType,
    RealType,
    (value: NaturalValue) => new RealValue(Math.atan(value.value)),
  ),
  sinh: method0(
    NaturalType,
    RealType,
    (value: NaturalValue) => new RealValue(Math.sinh(value.value)),
  ),
  cosh: method0(
    NaturalType,
    RealType,
    (value: NaturalValue) => new RealValue(Math.cosh(value.value)),
  ),
  tanh: method0(
    NaturalType,
    RealType,
    (value: NaturalValue) => new RealValue(Math.tanh(value.value)),
  ),
  asinh: method0(
    NaturalType,
    RealType,
    (value: NaturalValue) => new RealValue(Math.asinh(value.value)),
  ),
  acosh: method0(
    NaturalType,
    RealType,
    (value: NaturalValue) => new RealValue(Math.acosh(value.value)),
  ),
  atanh: method0(
    NaturalType,
    RealType,
    (value: NaturalValue) => new RealValue(Math.atanh(value.value)),
  ),
});

definePrototype(StringType, StringValue, {
  length: method0(
    StringType,
    NaturalType,
    (value: StringValue) => new NaturalValue(value.value.length),
  ),
  str: method0(StringType, StringType, (value: StringValue) => value),
  startsWith: method1(
    StringType,
    StringType,
    BooleanType,
    (value: StringValue, prefix: StringValue) =>
      new BooleanValue(value.value.startsWith(prefix.value)),
  ),
  endsWith: method1(
    StringType,
    StringType,
    BooleanType,
    (value: StringValue, prefix: StringValue) =>
      new BooleanValue(value.value.endsWith(prefix.value)),
  ),
  trim: method0(
    StringType,
    StringType,
    (value: StringValue) => new StringValue(value.value.trim()),
  ),
  trimStart: method0(
    StringType,
    StringType,
    (value: StringValue) => new StringValue(value.value.trimStart()),
  ),
  trimEnd: method0(
    StringType,
    StringType,
    (value: StringValue) => new StringValue(value.value.trimEnd()),
  ),
  reverse: method0(
    StringType,
    StringType,
    (value: StringValue) => new StringValue(value.value.split('').reverse().join('')),
  ),
});
