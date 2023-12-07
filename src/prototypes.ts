import { InternalError, RuntimeError } from './errors.js';
import {
  BooleanType,
  ComplexType,
  FieldSet,
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
  TypeInterface,
  TypeScheme,
  UndefinedType,
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

interface TypeConstructor<Type extends TauType> {
  PROTOTYPE: FieldSet;
  INSTANCE: Type;
}

interface ValueConstructor<Value extends ValueInterface> {
  PROTOTYPE: ValueContext;
  new (...args: never[]): Value;
}

// Not an exhaustive list, only the ones we use in the prototypes.
const IOTA_TYPES: { [name: string]: IotaType } = {
  b: BooleanType.INSTANCE,
  c: ComplexType.INSTANCE,
  r: RealType.INSTANCE,
  t: RationalType.INSTANCE,
  i: IntegerType.INSTANCE,
  n: NaturalType.INSTANCE,
  s: StringType.INSTANCE,
};

class Prototype<Value extends ValueInterface> {
  private readonly _types: { [name: string]: TypeInterface } = Object.create(null);
  private readonly _values: { [name: string]: Closure } = Object.create(null);

  protected constructor(
    private readonly _prototype: FieldSet,
    private readonly _selfType: TauType,
    public readonly valueConstructor: ValueConstructor<Value>,
  ) {}

  public static createForIotaType<Type extends TauType, Value extends ValueInterface>(
    typeConstructor: TypeConstructor<Type>,
    valueConstructor: ValueConstructor<Value>,
  ): Prototype<Value> {
    return new Prototype<Value>(
      typeConstructor.PROTOTYPE,
      typeConstructor.INSTANCE,
      valueConstructor,
    );
  }

  public methodRawIncludingSelf(
    name: string,
    type: TypeInterface,
    fn: (self: Value, ...args: ValueInterface[]) => ValueInterface,
  ): Prototype<Value> {
    this._types[name] = type;
    this._values[name] = Closure.wrap(fn);
    return this;
  }

  public methodRaw(
    name: string,
    type: TauType,
    fn: (self: Value, ...args: ValueInterface[]) => ValueInterface,
  ): Prototype<Value> {
    return this.methodRawIncludingSelf(name, new LambdaType(this._selfType, type), fn);
  }

  public method(
    name: string,
    signature: string,
    fn: (self: Value, ...args: ValueInterface[]) => ValueInterface,
  ): Prototype<Value> {
    const match = signature.match(/^([bcrtins]*)\.([bcrtins])$/);
    if (!match) {
      throw new InternalError(`invalid method signature: ${JSON.stringify(signature)}`);
    }
    const [, args, result] = match;
    if (fn.length != args.length + 1) {
      const got = fn.length;
      const want = args.length + 1;
      throw new InternalError(
        `invalid method implementation: has ${got} arguments including 'this', the type signature expects ${want}`,
      );
    }
    let type: TauType = IOTA_TYPES[result];
    for (const arg of args.split('').reverse()) {
      type = new LambdaType(IOTA_TYPES[arg], type);
    }
    return this.methodRaw(name, type, fn);
  }

  public close(): void {
    this._prototype.add(this._types);
    this.valueConstructor.PROTOTYPE = this.valueConstructor.PROTOTYPE.pushAll(this._values);
  }
}

Prototype.createForIotaType(BooleanType, BooleanValue)
  .method('#u:not', '.b', self => (self.value ? BooleanValue.FALSE : BooleanValue.TRUE))
  .method('str', '.s', self => new StringValue(self.value ? 'true' : 'false'))
  .close();

Prototype.createForIotaType(ComplexType, ComplexValue)
  .method('#u:-', '.c', self => new ComplexValue(-self.real, -self.imaginary))
  .method('str', '.s', self => {
    if (self.imaginary < 0) {
      return new StringValue(`${self.real}-${Math.abs(self.imaginary)}i`);
    } else {
      return new StringValue(`${self.real}+${Math.abs(self.imaginary)}i`);
    }
  })
  .method('real', '.r', self => new RealValue(self.real))
  .method('imaginary', '.r', self => new RealValue(self.imaginary))
  .method('abs', '.r', self => new RealValue(Math.hypot(self.real, self.imaginary)))
  .close();

Prototype.createForIotaType(RealType, RealValue)
  .method('#u:-', '.r', self => new RealValue(-self.value))
  .method('str', '.s', self => new StringValue('' + self.value))
  .method('real', '.r', self => self)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .method('imaginary', '.n', _self => NaturalValue.ZERO)
  .method('abs', '.r', self => new RealValue(Math.abs(self.value)))
  .method('ceil', '.i', self => new IntegerValue(Math.ceil(self.value)))
  .method('floor', '.i', self => new IntegerValue(Math.floor(self.value)))
  .method('round', '.i', self => new IntegerValue(Math.round(self.value)))
  .method('trunc', '.i', self => new IntegerValue(Math.trunc(self.value)))
  .method('sign', '.i', self => new IntegerValue(Math.sign(self.value)))
  .method('sqrt', '.r', self => new RealValue(Math.sqrt(self.value)))
  .close();

Prototype.createForIotaType(RationalType, RationalValue)
  .method('#u:-', '.t', self => new RationalValue(-self.numerator, self.denominator))
  .method('str', '.s', self => new StringValue(self.toString()))
  .method('real', '.t', self => self)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .method('imaginary', '.n', _self => NaturalValue.ZERO)
  .method(
    'abs',
    '.t',
    self => new RationalValue(Math.abs(self.numerator), Math.abs(self.denominator)),
  )
  .method('ceil', '.i', self => new IntegerValue(Math.ceil(self.numerator / self.denominator)))
  .method('floor', '.i', self => new IntegerValue(Math.floor(self.numerator / self.denominator)))
  .method('round', '.i', self => new IntegerValue(Math.round(self.numerator / self.denominator)))
  .method('trunc', '.i', self => new IntegerValue(Math.trunc(self.numerator / self.denominator)))
  .method('sign', '.i', self => new IntegerValue(Math.sign(self.numerator / self.denominator)))
  .method('sqrt', '.r', self => new RealValue(Math.sqrt(self.numerator / self.denominator)))
  .close();

Prototype.createForIotaType(IntegerType, IntegerValue)
  .method('#u:-', '.i', self => new IntegerValue(-self.value))
  .method('#u:~', '.i', self => new IntegerValue(~self.value))
  .methodRawIncludingSelf(
    '#b1:+',
    new TypeScheme(
      'result',
      UndefinedType.INSTANCE,
      new TypeScheme(
        'rhs',
        ObjectType.create({
          '#b2:integer:+': new LambdaType(
            ObjectType.EMPTY,
            new LambdaType(IntegerType.INSTANCE, new VariableType('result')),
          ),
        }),
        new LambdaType(
          IntegerType.INSTANCE,
          new LambdaType(new VariableType('rhs'), new VariableType('result')),
        ),
      ),
    ),
    (self, rhs) => rhs.getField('#b2:integer:+').cast(Closure).apply(self),
  )
  .methodRaw(
    '#b2:integer:+',
    new LambdaType(IntegerType.INSTANCE, IntegerType.INSTANCE),
    (self, lhs) => new IntegerValue(lhs.cast(IntegerValue).value + self.value),
  )
  .methodRaw(
    '#b2:natural:+',
    new LambdaType(NaturalType.INSTANCE, IntegerType.INSTANCE),
    (self, lhs) => new IntegerValue(lhs.cast(NaturalValue).value + self.value),
  )
  .method('str', '.s', self => new StringValue('' + self.value))
  .method('real', '.i', self => self)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .method('imaginary', '.n', _self => NaturalValue.ZERO)
  .method('abs', '.n', self => new NaturalValue(Math.abs(self.value)))
  .method('ceil', '.i', self => self)
  .method('floor', '.i', self => self)
  .method('round', '.i', self => self)
  .method('trunc', '.i', self => self)
  .method('sign', '.i', self => new IntegerValue(Math.sign(self.value)))
  .method('sqrt', '.r', self => new RealValue(Math.sqrt(self.value)))
  .close();

Prototype.createForIotaType(NaturalType, NaturalValue)
  .method('#u:-', '.i', self => new IntegerValue(-self.value))
  .method('#u:~', '.i', self => new IntegerValue(~self.value))
  .methodRawIncludingSelf(
    '#b1:+',
    new TypeScheme(
      'result',
      UndefinedType.INSTANCE,
      new TypeScheme(
        'rhs',
        ObjectType.create({
          '#b2:natural:+': new LambdaType(
            ObjectType.EMPTY,
            new LambdaType(NaturalType.INSTANCE, new VariableType('result')),
          ),
        }),
        new LambdaType(
          NaturalType.INSTANCE,
          new LambdaType(new VariableType('rhs'), new VariableType('result')),
        ),
      ),
    ),
    (self, rhs) => rhs.getField('#b2:natural:+').cast(Closure).apply(self),
  )
  .methodRaw(
    '#b2:integer:+',
    new LambdaType(IntegerType.INSTANCE, IntegerType.INSTANCE),
    (self, lhs) => new IntegerValue(lhs.cast(IntegerValue).value + self.value),
  )
  .methodRaw(
    '#b2:natural:+',
    new LambdaType(NaturalType.INSTANCE, NaturalType.INSTANCE),
    (self, lhs) => new NaturalValue(lhs.cast(NaturalValue).value + self.value),
  )
  .method('str', '.s', self => new StringValue('' + self.value))
  .method('real', '.n', self => self)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .method('imaginary', '.n', _self => NaturalValue.ZERO)
  .method('abs', '.n', self => self)
  .method('ceil', '.n', self => self)
  .method('floor', '.n', self => self)
  .method('round', '.n', self => self)
  .method('trunc', '.n', self => self)
  .method('sign', '.i', self => new IntegerValue(Math.sign(self.value)))
  .method('sqrt', '.r', self => new RealValue(Math.sqrt(self.value)))
  .close();

Prototype.createForIotaType(StringType, StringValue)
  .method('str', '.s', self => self)
  .method('length', '.n', self => new NaturalValue(self.value.length))
  .method(
    'startsWith',
    's.b',
    (self, prefix) => new BooleanValue(self.value.startsWith(prefix.marshal() as string)),
  )
  .method(
    'endsWith',
    's.b',
    (self, suffix) => new BooleanValue(self.value.endsWith(suffix.marshal() as string)),
  )
  .method(
    'slice',
    'nn.s',
    (self, start, end) =>
      new StringValue(self.value.slice(start.marshal() as number, end.marshal() as number)),
  )
  .method(
    'substring',
    'nn.s',
    (self, start, end) =>
      new StringValue(self.value.substring(start.marshal() as number, end.marshal() as number)),
  )
  .methodRaw(
    'split',
    new LambdaType(StringType.INSTANCE, new ListType(StringType.INSTANCE)),
    (self, separator) =>
      new ListValue(
        self.value.split(separator.marshal() as string).map(element => new StringValue(element)),
      ),
  )
  .method(
    'includes',
    's.b',
    (self, substring) => new BooleanValue(self.value.includes(substring.marshal() as string)),
  )
  .method('toLowerCase', '.s', self => new StringValue(self.value.toLowerCase()))
  .method('toUpperCase', '.s', self => new StringValue(self.value.toUpperCase()))
  .method('reverse', '.s', self => new StringValue(self.value.split('').reverse().join('')))
  .close();

class ListPrototype extends Prototype<ListValue> {
  private readonly _inner: VariableType;

  public constructor(fn: (inner: VariableType, prototype: ListPrototype) => Prototype<ListValue>) {
    const inner = VariableType.getNew();
    super(ListType.PROTOTYPE, new ListType(inner), ListValue);
    this._inner = inner;
    fn(this._inner, this);
  }
}

new ListPrototype((inner, prototype: ListPrototype) =>
  prototype
    .method('str', '.s', self => new StringValue(self.toString()))
    .method('length', '.n', self => new NaturalValue(self.count))
    .methodRaw('head', inner, self => {
      for (const element of self.elements) {
        return element;
      }
      throw new RuntimeError(`empty list has no head`);
    })
    .methodRaw('tail', new ListType(inner), self => {
      if (self.count > 0) {
        return new ListValue(self.array, self.offset + 1, self.count - 1);
      } else {
        return self;
      }
    })
    .methodRawIncludingSelf(
      'join',
      new LambdaType(
        new ListType(
          ObjectType.create({
            str: new LambdaType(ObjectType.EMPTY, StringType.INSTANCE),
          }),
        ),
        new LambdaType(StringType.INSTANCE, StringType.INSTANCE),
      ),
      (self, separator) =>
        new StringValue(
          [...self.elements]
            .map(element => element.getField('str').marshal())
            .join(separator.marshal() as string),
        ),
    ),
).close();
