import {
  BooleanType,
  ComplexType,
  FieldSet,
  IntegerType,
  LambdaType,
  NaturalType,
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

interface TypeConstructor<Type extends TauType> {
  PROTOTYPE: FieldSet;
  INSTANCE: Type;
}

interface ValueConstructor<Value extends ValueInterface> {
  PROTOTYPE: ValueContext;
  new (...args: never[]): Value;
}

class Prototype<Type extends TauType, Value extends ValueInterface> {
  private readonly _types: { [name: string]: TauType } = Object.create(null);
  private readonly _values: { [name: string]: Closure } = Object.create(null);

  public constructor(
    public readonly typeConstructor: TypeConstructor<Type>,
    public readonly valueConstructor: ValueConstructor<Value>,
  ) {}

  public method<Result extends TauType>(
    name: string,
    result: TypeConstructor<Result>,
    fn: (self: Value) => ValueInterface,
  ): Prototype<Type, Value> {
    this._types[name] = new LambdaType(this.typeConstructor.INSTANCE, result.INSTANCE);
    this._values[name] = Closure.wrap(fn);
    return this;
  }

  public close(): void {
    this.typeConstructor.PROTOTYPE.add(this._types);
    this.valueConstructor.PROTOTYPE = this.valueConstructor.PROTOTYPE.pushAll(this._values);
  }
}

new Prototype(BooleanType, BooleanValue)
  .method('#u:not', BooleanType, self => (self.value ? BooleanValue.FALSE : BooleanValue.TRUE))
  .method('str', StringType, self => new StringValue(self.value ? 'true' : 'false'))
  .close();

new Prototype(ComplexType, ComplexValue)
  .method('#u:-', ComplexType, self => new ComplexValue(-self.real, -self.imaginary))
  .method('str', StringType, self => {
    if (self.imaginary < 0) {
      return new StringValue(`${self.real}-${Math.abs(self.imaginary)}i`);
    } else {
      return new StringValue(`${self.real}+${Math.abs(self.imaginary)}i`);
    }
  })
  .method('real', RealType, self => new RealValue(self.real))
  .method('imaginary', RealType, self => new RealValue(self.imaginary))
  .method('abs', RealType, self => new RealValue(Math.hypot(self.real, self.imaginary)))
  .close();

new Prototype(RealType, RealValue)
  .method('#u:-', RealType, self => new RealValue(-self.value))
  .method('str', StringType, self => new StringValue('' + self.value))
  .method('real', RealType, self => self)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .method('imaginary', NaturalType, _self => NaturalValue.ZERO)
  .method('abs', RealType, self => new RealValue(Math.abs(self.value)))
  .method('ceil', IntegerType, self => new IntegerValue(Math.ceil(self.value)))
  .method('floor', IntegerType, self => new IntegerValue(Math.floor(self.value)))
  .method('round', IntegerType, self => new IntegerValue(Math.round(self.value)))
  .method('trunc', IntegerType, self => new IntegerValue(Math.trunc(self.value)))
  .method('sign', IntegerType, self => new IntegerValue(Math.sign(self.value)))
  .method('sqrt', RealType, self => new RealValue(Math.sqrt(self.value)))
  .close();

new Prototype(RationalType, RationalValue)
  .method('#u:-', RationalType, self => new RationalValue(-self.numerator, self.denominator))
  .method('str', StringType, self => new StringValue(`${self.numerator}/${self.denominator}`))
  .method('real', RationalType, self => self)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .method('imaginary', NaturalType, _self => NaturalValue.ZERO)
  .method(
    'abs',
    RationalType,
    self => new RationalValue(Math.abs(self.numerator), Math.abs(self.denominator)),
  )
  .method(
    'ceil',
    IntegerType,
    self => new IntegerValue(Math.ceil(self.numerator / self.denominator)),
  )
  .method(
    'floor',
    IntegerType,
    self => new IntegerValue(Math.floor(self.numerator / self.denominator)),
  )
  .method(
    'round',
    IntegerType,
    self => new IntegerValue(Math.round(self.numerator / self.denominator)),
  )
  .method(
    'trunc',
    IntegerType,
    self => new IntegerValue(Math.trunc(self.numerator / self.denominator)),
  )
  .method(
    'sign',
    IntegerType,
    self => new IntegerValue(Math.sign(self.numerator / self.denominator)),
  )
  .method('sqrt', RealType, self => new RealValue(Math.sqrt(self.numerator / self.denominator)))
  .close();

new Prototype(IntegerType, IntegerValue)
  .method('#u:-', IntegerType, self => new IntegerValue(-self.value))
  .method('#u:~', IntegerType, self => new IntegerValue(~self.value))
  .method('str', StringType, self => new StringValue('' + self.value))
  .method('real', IntegerType, self => self)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .method('imaginary', NaturalType, _self => NaturalValue.ZERO)
  .method('abs', NaturalType, self => new NaturalValue(Math.abs(self.value)))
  .method('ceil', IntegerType, self => self)
  .method('floor', IntegerType, self => self)
  .method('round', IntegerType, self => self)
  .method('trunc', IntegerType, self => self)
  .method('sign', IntegerType, self => new IntegerValue(Math.sign(self.value)))
  .method('sqrt', RealType, self => new RealValue(Math.sqrt(self.value)))
  .close();

new Prototype(NaturalType, NaturalValue)
  .method('#u:-', IntegerType, self => new IntegerValue(-self.value))
  .method('#u:~', IntegerType, self => new IntegerValue(~self.value))
  .method('str', StringType, self => new StringValue('' + self.value))
  .method('real', NaturalType, self => self)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .method('imaginary', NaturalType, _self => NaturalValue.ZERO)
  .method('abs', NaturalType, self => self)
  .method('ceil', NaturalType, self => self)
  .method('floor', NaturalType, self => self)
  .method('round', NaturalType, self => self)
  .method('trunc', NaturalType, self => self)
  .method('sign', IntegerType, self => new IntegerValue(Math.sign(self.value)))
  .method('sqrt', RealType, self => new RealValue(Math.sqrt(self.value)))
  .close();

new Prototype(StringType, StringValue)
  .method('str', StringType, self => self)
  .method('length', NaturalType, self => new NaturalValue(self.value.length))
  .method('reverse', StringType, self => new StringValue(self.value.split('').reverse().join('')))
  .close();
