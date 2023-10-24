import { Context } from './context.js';
import { RuntimeError } from './errors.js';
import {
  BooleanType,
  ComplexType,
  IntegerType,
  IotaType,
  LambdaType,
  ListType,
  NaturalType,
  ObjectType,
  RationalType,
  RealType,
  StringType,
  TauType,
  VariableType,
} from './types.js';
import {
  BooleanValue,
  Closure,
  ComplexValue,
  IntegerValue,
  ListValue,
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

function defineUnboundPrototype(
  TypeConstructor: { PROTOTYPE: Context<TauType> },
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
  TypeConstructor.PROTOTYPE = Context.create<TauType>(types);
  ValueConstructor.PROTOTYPE = ValueConstructor.PROTOTYPE.add(
    ValueContext.create<ValueInterface>(values),
  );
}

type IotaTypeName = 'boolean' | 'complex' | 'real' | 'rational' | 'integer' | 'natural' | 'string';

interface IotaTypeConstructor {
  INSTANCE: IotaType;
}

const typeConstructors: { [name in IotaTypeName]: IotaTypeConstructor } = {
  boolean: BooleanType,
  complex: ComplexType,
  real: RealType,
  rational: RationalType,
  integer: IntegerType,
  natural: NaturalType,
  string: StringType,
};

function method0<Arg0 extends ValueInterface>(
  arg0: IotaTypeName,
  result: IotaTypeName,
  fn: (arg0: Arg0) => ValueInterface,
): TypedTerm {
  return new TypedTerm(
    new LambdaType(typeConstructors[arg0].INSTANCE, typeConstructors[result].INSTANCE),
    Closure.wrap(fn),
  );
}

function method1<Arg0 extends ValueInterface, Arg1 extends ValueInterface>(
  arg0: IotaTypeName,
  arg1: IotaTypeName,
  result: IotaTypeName,
  fn: (arg0: Arg0, arg1: Arg1) => ValueInterface,
): TypedTerm {
  return new TypedTerm(
    new LambdaType(
      typeConstructors[arg0].INSTANCE,
      new LambdaType(typeConstructors[arg1].INSTANCE, typeConstructors[result].INSTANCE),
    ),
    Closure.wrap(fn),
  );
}

interface SemiTypedTerm0<Arg0 extends ValueInterface> {
  result: TauType;
  value: (arg0: Arg0) => ValueInterface;
}

function getVar0<Arg0 extends ValueInterface>(
  callback: (inner: VariableType, list: ListType) => SemiTypedTerm0<Arg0>,
): TypedTerm {
  const inner = VariableType.getNew();
  const list = new ListType(inner);
  const { result, value } = callback(inner, list);
  return new TypedTerm(new LambdaType(list, result), Closure.wrap(value));
}

function listMethod0<Arg0 extends ValueInterface>(
  result: IotaTypeName,
  fn: (arg0: Arg0) => ValueInterface,
): TypedTerm {
  return new TypedTerm(
    new LambdaType(new ListType(VariableType.getNew()), typeConstructors[result].INSTANCE),
    Closure.wrap(fn),
  );
}

defineUnboundPrototype(ListType, ListValue, {
  length: listMethod0('natural', (value: ListValue) => new NaturalValue(value.count)),
  empty: listMethod0('boolean', (value: ListValue) => new BooleanValue(!value.count)),
  head: getVar0(inner => ({
    result: inner,
    value: (list: ListValue) => {
      if (list.count > 0) {
        return list.elements[list.offset];
      } else {
        throw new RuntimeError('');
      }
    },
  })),
  tail: getVar0((_inner, list) => ({
    result: list,
    value: (list: ListValue) => {
      if (list.count > 0) {
        return new ListValue(list.elements, list.offset + 1, list.count - 1);
      } else {
        return new ListValue(list.elements, list.offset, 0);
      }
    },
  })),
  // TODO
});

definePrototype(BooleanType, BooleanValue, {
  str: method0('boolean', 'string', (value: BooleanValue) => new StringValue(value.toString())),
});

definePrototype(ComplexType, ComplexValue, {
  str: method0('complex', 'string', (value: ComplexValue) => new StringValue(value.toString())),
  real: method0('complex', 'real', (value: ComplexValue) => new RealValue(value.real)),
  imaginary: method0('complex', 'real', (value: ComplexValue) => new RealValue(value.imaginary)),
  abs: method0(
    'complex',
    'real',
    (value: ComplexValue) => new RealValue(Math.hypot(value.real, value.imaginary)),
  ),
});

definePrototype(RealType, RealValue, {
  str: method0('real', 'string', (value: RealValue) => new StringValue(value.toString())),
  real: method0('real', 'real', (value: RealValue) => new RealValue(value.value)),
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  imaginary: method0('real', 'real', (_value: RealValue) => RealValue.ZERO),
  abs: method0('real', 'real', (value: RealValue) => new RealValue(Math.abs(value.value))),
  ceil: method0('real', 'integer', (value: RealValue) => new IntegerValue(Math.ceil(value.value))),
  floor: method0(
    'real',
    'integer',
    (value: RealValue) => new IntegerValue(Math.floor(value.value)),
  ),
  round: method0(
    'real',
    'integer',
    (value: RealValue) => new IntegerValue(Math.round(value.value)),
  ),
  trunc: method0(
    'real',
    'integer',
    (value: RealValue) => new IntegerValue(Math.trunc(value.value)),
  ),
  sign: method0('real', 'integer', (value: RealValue) => new IntegerValue(Math.sign(value.value))),
  sqrt: method0('real', 'real', (value: RealValue) => new RealValue(Math.sqrt(value.value))),
  cbrt: method0('real', 'real', (value: RealValue) => new RealValue(Math.cbrt(value.value))),
  exp: method0('real', 'real', (value: RealValue) => new RealValue(Math.exp(value.value))),
  log: method0('real', 'real', (value: RealValue) => new RealValue(Math.log(value.value))),
  log10: method0('real', 'real', (value: RealValue) => new RealValue(Math.log10(value.value))),
  log2: method0('real', 'real', (value: RealValue) => new RealValue(Math.log2(value.value))),
  sin: method0('real', 'real', (value: RealValue) => new RealValue(Math.sin(value.value))),
  cos: method0('real', 'real', (value: RealValue) => new RealValue(Math.cos(value.value))),
  tan: method0('real', 'real', (value: RealValue) => new RealValue(Math.tan(value.value))),
  asin: method0('real', 'real', (value: RealValue) => new RealValue(Math.asin(value.value))),
  acos: method0('real', 'real', (value: RealValue) => new RealValue(Math.acos(value.value))),
  atan: method0('real', 'real', (value: RealValue) => new RealValue(Math.atan(value.value))),
  sinh: method0('real', 'real', (value: RealValue) => new RealValue(Math.sinh(value.value))),
  cosh: method0('real', 'real', (value: RealValue) => new RealValue(Math.cosh(value.value))),
  tanh: method0('real', 'real', (value: RealValue) => new RealValue(Math.tanh(value.value))),
  asinh: method0('real', 'real', (value: RealValue) => new RealValue(Math.asinh(value.value))),
  acosh: method0('real', 'real', (value: RealValue) => new RealValue(Math.acosh(value.value))),
  atanh: method0('real', 'real', (value: RealValue) => new RealValue(Math.atanh(value.value))),
});

definePrototype(RationalType, RationalValue, {
  str: method0('rational', 'string', (value: RationalValue) => new StringValue(value.toString())),
  real: method0(
    'rational',
    'real',
    (value: RationalValue) => new RealValue(value.numerator / value.denominator),
  ),
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  imaginary: method0('rational', 'real', (_value: RationalValue) => RealValue.ZERO),
  abs: method0(
    'rational',
    'real',
    (value: RationalValue) => new RealValue(Math.abs(value.numerator / value.denominator)),
  ),
  ceil: method0(
    'rational',
    'integer',
    (value: RationalValue) => new IntegerValue(Math.ceil(value.numerator / value.denominator)),
  ),
  floor: method0(
    'rational',
    'integer',
    (value: RationalValue) => new IntegerValue(Math.floor(value.numerator / value.denominator)),
  ),
  round: method0(
    'rational',
    'integer',
    (value: RationalValue) => new IntegerValue(Math.round(value.numerator / value.denominator)),
  ),
  trunc: method0(
    'rational',
    'integer',
    (value: RationalValue) => new IntegerValue(Math.trunc(value.numerator / value.denominator)),
  ),
  sign: method0(
    'rational',
    'integer',
    (value: RationalValue) => new IntegerValue(Math.sign(value.numerator / value.denominator)),
  ),
  sqrt: method0(
    'rational',
    'real',
    (value: RationalValue) => new RealValue(Math.sqrt(value.numerator / value.denominator)),
  ),
  cbrt: method0(
    'rational',
    'real',
    (value: RationalValue) => new RealValue(Math.cbrt(value.numerator / value.denominator)),
  ),
  exp: method0(
    'rational',
    'real',
    (value: RationalValue) => new RealValue(Math.exp(value.numerator / value.denominator)),
  ),
  log: method0(
    'rational',
    'real',
    (value: RationalValue) => new RealValue(Math.log(value.numerator / value.denominator)),
  ),
  log10: method0(
    'rational',
    'real',
    (value: RationalValue) => new RealValue(Math.log10(value.numerator / value.denominator)),
  ),
  log2: method0(
    'rational',
    'real',
    (value: RationalValue) => new RealValue(Math.log2(value.numerator / value.denominator)),
  ),
  sin: method0(
    'rational',
    'real',
    (value: RationalValue) => new RealValue(Math.sin(value.numerator / value.denominator)),
  ),
  cos: method0(
    'rational',
    'real',
    (value: RationalValue) => new RealValue(Math.cos(value.numerator / value.denominator)),
  ),
  tan: method0(
    'rational',
    'real',
    (value: RationalValue) => new RealValue(Math.tan(value.numerator / value.denominator)),
  ),
  asin: method0(
    'rational',
    'real',
    (value: RationalValue) => new RealValue(Math.asin(value.numerator / value.denominator)),
  ),
  acos: method0(
    'rational',
    'real',
    (value: RationalValue) => new RealValue(Math.acos(value.numerator / value.denominator)),
  ),
  atan: method0(
    'rational',
    'real',
    (value: RationalValue) => new RealValue(Math.atan(value.numerator / value.denominator)),
  ),
  sinh: method0(
    'rational',
    'real',
    (value: RationalValue) => new RealValue(Math.sinh(value.numerator / value.denominator)),
  ),
  cosh: method0(
    'rational',
    'real',
    (value: RationalValue) => new RealValue(Math.cosh(value.numerator / value.denominator)),
  ),
  tanh: method0(
    'rational',
    'real',
    (value: RationalValue) => new RealValue(Math.tanh(value.numerator / value.denominator)),
  ),
  asinh: method0(
    'rational',
    'real',
    (value: RationalValue) => new RealValue(Math.asinh(value.numerator / value.denominator)),
  ),
  acosh: method0(
    'rational',
    'real',
    (value: RationalValue) => new RealValue(Math.acosh(value.numerator / value.denominator)),
  ),
  atanh: method0(
    'rational',
    'real',
    (value: RationalValue) => new RealValue(Math.atanh(value.numerator / value.denominator)),
  ),
});

definePrototype(IntegerType, IntegerValue, {
  str: method0('integer', 'string', (value: IntegerValue) => new StringValue(value.toString())),
  real: method0('integer', 'integer', (value: IntegerValue) => value),
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  imaginary: method0('integer', 'real', (_value: IntegerValue) => RealValue.ZERO),
  abs: method0(
    'integer',
    'integer',
    (value: IntegerValue) => new IntegerValue(Math.abs(value.value)),
  ),
  ceil: method0('integer', 'integer', (value: IntegerValue) => value),
  floor: method0('integer', 'integer', (value: IntegerValue) => value),
  round: method0('integer', 'integer', (value: IntegerValue) => value),
  trunc: method0('integer', 'integer', (value: IntegerValue) => value),
  sign: method0(
    'integer',
    'integer',
    (value: IntegerValue) => new IntegerValue(Math.sign(value.value)),
  ),
  sqrt: method0('integer', 'real', (value: IntegerValue) => new RealValue(Math.sqrt(value.value))),
  cbrt: method0('integer', 'real', (value: IntegerValue) => new RealValue(Math.cbrt(value.value))),
  exp: method0('integer', 'real', (value: IntegerValue) => new RealValue(Math.exp(value.value))),
  log: method0('integer', 'real', (value: IntegerValue) => new RealValue(Math.log(value.value))),
  log10: method0(
    'integer',
    'real',
    (value: IntegerValue) => new RealValue(Math.log10(value.value)),
  ),
  log2: method0('integer', 'real', (value: IntegerValue) => new RealValue(Math.log2(value.value))),
  sin: method0('integer', 'real', (value: IntegerValue) => new RealValue(Math.sin(value.value))),
  cos: method0('integer', 'real', (value: IntegerValue) => new RealValue(Math.cos(value.value))),
  tan: method0('integer', 'real', (value: IntegerValue) => new RealValue(Math.tan(value.value))),
  asin: method0('integer', 'real', (value: IntegerValue) => new RealValue(Math.asin(value.value))),
  acos: method0('integer', 'real', (value: IntegerValue) => new RealValue(Math.acos(value.value))),
  atan: method0('integer', 'real', (value: IntegerValue) => new RealValue(Math.atan(value.value))),
  sinh: method0('integer', 'real', (value: IntegerValue) => new RealValue(Math.sinh(value.value))),
  cosh: method0('integer', 'real', (value: IntegerValue) => new RealValue(Math.cosh(value.value))),
  tanh: method0('integer', 'real', (value: IntegerValue) => new RealValue(Math.tanh(value.value))),
  asinh: method0(
    'integer',
    'real',
    (value: IntegerValue) => new RealValue(Math.asinh(value.value)),
  ),
  acosh: method0(
    'integer',
    'real',
    (value: IntegerValue) => new RealValue(Math.acosh(value.value)),
  ),
  atanh: method0(
    'integer',
    'real',
    (value: IntegerValue) => new RealValue(Math.atanh(value.value)),
  ),
});

definePrototype(NaturalType, NaturalValue, {
  str: method0('natural', 'string', (value: NaturalValue) => new StringValue(value.toString())),
  real: method0('natural', 'natural', (value: NaturalValue) => value),
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  imaginary: method0('natural', 'real', (_value: NaturalValue) => RealValue.ZERO),
  abs: method0('natural', 'natural', (value: NaturalValue) => value),
  ceil: method0('natural', 'natural', (value: NaturalValue) => value),
  floor: method0('natural', 'natural', (value: NaturalValue) => value),
  round: method0('natural', 'natural', (value: NaturalValue) => value),
  trunc: method0('natural', 'natural', (value: NaturalValue) => value),
  sign: method0(
    'natural',
    'integer',
    (value: NaturalValue) => new IntegerValue(Math.sign(value.value)),
  ),
  sqrt: method0('natural', 'real', (value: NaturalValue) => new RealValue(Math.sqrt(value.value))),
  cbrt: method0('natural', 'real', (value: NaturalValue) => new RealValue(Math.cbrt(value.value))),
  exp: method0('natural', 'real', (value: NaturalValue) => new RealValue(Math.exp(value.value))),
  log: method0('natural', 'real', (value: NaturalValue) => new RealValue(Math.log(value.value))),
  log10: method0(
    'natural',
    'real',
    (value: NaturalValue) => new RealValue(Math.log10(value.value)),
  ),
  log2: method0('natural', 'real', (value: NaturalValue) => new RealValue(Math.log2(value.value))),
  sin: method0('natural', 'real', (value: NaturalValue) => new RealValue(Math.sin(value.value))),
  cos: method0('natural', 'real', (value: NaturalValue) => new RealValue(Math.cos(value.value))),
  tan: method0('natural', 'real', (value: NaturalValue) => new RealValue(Math.tan(value.value))),
  asin: method0('natural', 'real', (value: NaturalValue) => new RealValue(Math.asin(value.value))),
  acos: method0('natural', 'real', (value: NaturalValue) => new RealValue(Math.acos(value.value))),
  atan: method0('natural', 'real', (value: NaturalValue) => new RealValue(Math.atan(value.value))),
  sinh: method0('natural', 'real', (value: NaturalValue) => new RealValue(Math.sinh(value.value))),
  cosh: method0('natural', 'real', (value: NaturalValue) => new RealValue(Math.cosh(value.value))),
  tanh: method0('natural', 'real', (value: NaturalValue) => new RealValue(Math.tanh(value.value))),
  asinh: method0(
    'natural',
    'real',
    (value: NaturalValue) => new RealValue(Math.asinh(value.value)),
  ),
  acosh: method0(
    'natural',
    'real',
    (value: NaturalValue) => new RealValue(Math.acosh(value.value)),
  ),
  atanh: method0(
    'natural',
    'real',
    (value: NaturalValue) => new RealValue(Math.atanh(value.value)),
  ),
});

definePrototype(StringType, StringValue, {
  length: method0(
    'string',
    'natural',
    (value: StringValue) => new NaturalValue(value.value.length),
  ),
  str: method0('string', 'string', (value: StringValue) => value),
  startsWith: method1(
    'string',
    'string',
    'boolean',
    (value: StringValue, prefix: StringValue) =>
      new BooleanValue(value.value.startsWith(prefix.value)),
  ),
  endsWith: method1(
    'string',
    'string',
    'boolean',
    (value: StringValue, prefix: StringValue) =>
      new BooleanValue(value.value.endsWith(prefix.value)),
  ),
  trim: method0('string', 'string', (value: StringValue) => new StringValue(value.value.trim())),
  trimStart: method0(
    'string',
    'string',
    (value: StringValue) => new StringValue(value.value.trimStart()),
  ),
  trimEnd: method0(
    'string',
    'string',
    (value: StringValue) => new StringValue(value.value.trimEnd()),
  ),
  reverse: method0(
    'string',
    'string',
    (value: StringValue) => new StringValue(value.value.split('').reverse().join('')),
  ),
});
