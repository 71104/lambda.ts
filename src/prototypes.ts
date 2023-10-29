import { LambdaNode, SemiNativeNode } from './ast.js';
import { RuntimeError } from './errors.js';
import {
  BooleanType,
  ComplexType,
  EMPTY_TYPE_CONTEXT,
  IOTA_TYPE_CONSTRUCTORS,
  IntegerType,
  IotaType,
  IotaTypeName,
  LambdaType,
  ListType,
  NaturalType,
  Prototype,
  RationalType,
  RealType,
  StringType,
  TauType,
  TypeContext,
  TypeScheme,
  VariableType,
} from './types.js';
import {
  BooleanValue,
  Closure,
  ComplexValue,
  EMPTY_VALUE_CONTEXT,
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
    public readonly type: TypeScheme,
    public readonly value: ValueInterface,
  ) {}
}

function definePrototype(
  TypeConstructor: { INSTANCE: IotaType; PROTOTYPE: Prototype },
  ValueConstructor: { PROTOTYPE: ValueContext },
  terms: { [name: string]: TypedTerm },
): void {
  const types: { [name: string]: TypeScheme } = Object.create(null);
  const values: { [name: string]: ValueInterface } = Object.create(null);
  for (const name in terms) {
    if (Object.prototype.hasOwnProperty.call(terms, name)) {
      types[name] = terms[name].type;
      values[name] = terms[name].value;
    }
  }
  TypeConstructor.PROTOTYPE = new Prototype(TypeContext.create<TypeScheme>(types));
  ValueConstructor.PROTOTYPE = ValueConstructor.PROTOTYPE.add(
    ValueContext.create<ValueInterface>(values),
  );
}

function defineUnboundPrototype(
  TypeConstructor: { PROTOTYPE: Prototype },
  ValueConstructor: { PROTOTYPE: ValueContext },
  terms: { [name: string]: TypedTerm },
): void {
  const types: { [name: string]: TypeScheme } = Object.create(null);
  const values: { [name: string]: ValueInterface } = Object.create(null);
  for (const name in terms) {
    if (Object.prototype.hasOwnProperty.call(terms, name)) {
      types[name] = terms[name].type;
      values[name] = terms[name].value;
    }
  }
  TypeConstructor.PROTOTYPE = new Prototype(TypeContext.create<TypeScheme>(types));
  ValueConstructor.PROTOTYPE = ValueConstructor.PROTOTYPE.add(
    ValueContext.create<ValueInterface>(values),
  );
}

function method0<Arg0 extends ValueInterface>(
  arg0: IotaTypeName,
  result: IotaTypeName,
  fn: (arg0: Arg0) => ValueInterface,
): TypedTerm {
  return new TypedTerm(
    new LambdaType(
      IOTA_TYPE_CONSTRUCTORS[arg0].INSTANCE,
      IOTA_TYPE_CONSTRUCTORS[result].INSTANCE,
    ).close(),
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
      IOTA_TYPE_CONSTRUCTORS[arg0].INSTANCE,
      new LambdaType(
        IOTA_TYPE_CONSTRUCTORS[arg1].INSTANCE,
        IOTA_TYPE_CONSTRUCTORS[result].INSTANCE,
      ),
    ).close(),
    Closure.wrap(fn),
  );
}

interface SemiTypedTerm0<Arg0 extends ValueInterface> {
  result: TauType;
  value: (arg0: Arg0) => ValueInterface;
}

function newVar<Result>(fn: (variable: VariableType) => Result): Result {
  return fn(VariableType.getNew());
}

function getVar0<Arg0 extends ValueInterface>(
  fn: (inner: VariableType, list: ListType) => SemiTypedTerm0<Arg0>,
): TypedTerm {
  const inner = VariableType.getNew();
  const list = new ListType(inner);
  const { result, value } = fn(inner, list);
  return new TypedTerm(new LambdaType(list, result).close(), Closure.wrap(value));
}

function listMethod0(result: IotaTypeName, fn: (list: ListValue) => ValueInterface): TypedTerm {
  return new TypedTerm(
    new LambdaType(
      new ListType(VariableType.getNew()),
      IOTA_TYPE_CONSTRUCTORS[result].INSTANCE,
    ).close(),
    Closure.wrap(fn),
  );
}

function listMethod1<Arg1 extends ValueInterface>(
  arg1: IotaTypeName,
  result: IotaTypeName,
  fn: (list: ListValue, arg1: Arg1) => ValueInterface,
): TypedTerm {
  return new TypedTerm(
    new LambdaType(
      new ListType(VariableType.getNew()),
      new LambdaType(
        IOTA_TYPE_CONSTRUCTORS[arg1].INSTANCE,
        IOTA_TYPE_CONSTRUCTORS[result].INSTANCE,
      ),
    ).close(),
    Closure.wrap(fn),
  );
}

function listMethod(ast: LambdaNode): TypedTerm {
  const { substitution, type } = ast.getType(EMPTY_TYPE_CONTEXT);
  return new TypedTerm(type.substitute(substitution).close(), ast.evaluate(EMPTY_VALUE_CONTEXT));
}

defineUnboundPrototype(ListType, ListValue, {
  length: listMethod0('natural', (value: ListValue) => new NaturalValue(value.count)),
  empty: listMethod0('boolean', (value: ListValue) => new BooleanValue(!value.count)),
  str: listMethod0('string', (value: ListValue) => new StringValue(value.toString())),
  join: listMethod1(
    'string',
    'string',
    (value: ListValue, separator: ValueInterface) =>
      // TODO: use the `.str` field rather than the native `toString()` method.
      new StringValue(
        [...value.elements()]
          .map(element => element.toString())
          .join(separator.cast(StringValue).value),
      ),
  ),
  head: getVar0(inner => ({
    result: inner,
    value: (list: ListValue) => {
      if (list.count > 0) {
        return list.array[list.offset];
      } else {
        throw new RuntimeError('');
      }
    },
  })),
  tail: getVar0((_inner, list) => ({
    result: list,
    value: (list: ListValue) => {
      if (list.count > 0) {
        return new ListValue(list.array, list.offset + 1, list.count - 1);
      } else {
        return new ListValue(list.array, list.offset, 0);
      }
    },
  })),
  map: newVar(input =>
    listMethod(
      new LambdaNode(
        '$1', // list
        new ListType(input),
        newVar(
          output =>
            new LambdaNode(
              '$2', // callback
              new LambdaType(input, output),
              new SemiNativeNode(
                new ListType(output),
                (list: ValueInterface, callback: ValueInterface) => {
                  const closure = callback.cast(Closure);
                  const elements = [...list.cast(ListValue).elements()].map(element =>
                    closure.apply(element),
                  );
                  return new ListValue(elements, 0, elements.length);
                },
              ),
            ),
        ),
      ),
    ),
  ),
  filter: newVar(element =>
    listMethod(
      new LambdaNode(
        '$1', // list
        new ListType(element),
        new LambdaNode(
          '$2', // callback
          new LambdaType(element, BooleanType.INSTANCE),
          new SemiNativeNode(
            new ListType(element),
            (list: ValueInterface, callback: ValueInterface) => {
              const closure = callback.cast(Closure);
              const elements = [...list.cast(ListValue).elements()].filter(
                element => closure.apply(element).cast(BooleanValue).value,
              );
              return new ListValue(elements, 0, elements.length);
            },
          ),
        ),
      ),
    ),
  ),
  every: newVar(element =>
    listMethod(
      new LambdaNode(
        '$1', // list
        new ListType(element),
        new LambdaNode(
          '$2', // callback
          new LambdaType(element, BooleanType.INSTANCE),
          new SemiNativeNode(
            BooleanType.INSTANCE,
            (list: ValueInterface, callback: ValueInterface) => {
              const closure = callback.cast(Closure);
              const result = [...list.cast(ListValue).elements()].every(
                element => closure.apply(element).cast(BooleanValue).value,
              );
              return result ? BooleanValue.TRUE : BooleanValue.FALSE;
            },
          ),
        ),
      ),
    ),
  ),
  some: newVar(element =>
    listMethod(
      new LambdaNode(
        '$1', // list
        new ListType(element),
        new LambdaNode(
          '$2', // callback
          new LambdaType(element, BooleanType.INSTANCE),
          new SemiNativeNode(
            BooleanType.INSTANCE,
            (list: ValueInterface, callback: ValueInterface) => {
              const closure = callback.cast(Closure);
              const result = [...list.cast(ListValue).elements()].some(
                element => closure.apply(element).cast(BooleanValue).value,
              );
              return result ? BooleanValue.TRUE : BooleanValue.FALSE;
            },
          ),
        ),
      ),
    ),
  ),
  // TODO
});

definePrototype(BooleanType, BooleanValue, {
  '#u:not': method0('boolean', 'boolean', (value: BooleanValue) => {
    if (value.value) {
      return BooleanValue.FALSE;
    } else {
      return BooleanValue.TRUE;
    }
  }),
  str: method0('boolean', 'string', (value: BooleanValue) => new StringValue(value.toString())),
});

definePrototype(ComplexType, ComplexValue, {
  '#u:-': method0(
    'complex',
    'complex',
    (value: ComplexValue) => new ComplexValue(-value.real, -value.imaginary),
  ),
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
  '#u:-': method0('real', 'real', (value: RealValue) => new RealValue(-value.value)),
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
  '#u:-': method0(
    'rational',
    'rational',
    (value: RationalValue) => new RationalValue(-value.numerator, value.denominator),
  ),
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
  numerator: method0(
    'rational',
    'integer',
    (value: RationalValue) => new IntegerValue(value.numerator),
  ),
  denominator: method0(
    'rational',
    'integer',
    (value: RationalValue) => new IntegerValue(value.denominator),
  ),
});

definePrototype(IntegerType, IntegerValue, {
  '#u:-': method0('integer', 'integer', (value: IntegerValue) => new IntegerValue(-value.value)),
  '#u:~': method0('integer', 'integer', (value: IntegerValue) => new IntegerValue(~value.value)),
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
  numerator: method0('rational', 'integer', (value: IntegerValue) => value),
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  denominator: method0('rational', 'natural', (_value: IntegerValue) => NaturalValue.ONE),
});

definePrototype(NaturalType, NaturalValue, {
  '#u:-': method0('natural', 'integer', (value: NaturalValue) => new IntegerValue(-value.value)),
  '#u:~': method0('natural', 'integer', (value: NaturalValue) => new IntegerValue(~value.value)),
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
  numerator: method0('rational', 'natural', (value: NaturalValue) => value),
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  denominator: method0('rational', 'natural', (_value: NaturalValue) => NaturalValue.ONE),
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
    (value: StringValue, prefix: ValueInterface) =>
      new BooleanValue(value.value.startsWith(prefix.cast(StringValue).value)),
  ),
  endsWith: method1(
    'string',
    'string',
    'boolean',
    (value: StringValue, prefix: ValueInterface) =>
      new BooleanValue(value.value.endsWith(prefix.cast(StringValue).value)),
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
