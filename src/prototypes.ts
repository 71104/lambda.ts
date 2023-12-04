import { BooleanType, FieldSet, LambdaType, NaturalType, StringType, TauType } from './types.js';
import {
  BooleanValue,
  Closure,
  NaturalValue,
  StringValue,
  ValueContext,
  ValueInterface,
} from './values.js';

interface TypeConstructor<Type extends TauType> {
  PROTOTYPE: FieldSet;
  INSTANCE: Type;
}

interface ValueConstructor {
  PROTOTYPE: ValueContext;
}

class Prototype<Type extends TauType> {
  private readonly _types: { [name: string]: TauType } = Object.create(null);
  private readonly _values: { [name: string]: Closure } = Object.create(null);

  public constructor(
    public readonly typeConstructor: TypeConstructor<Type>,
    public readonly valueConstructor: ValueConstructor,
  ) {}

  public method(
    name: string,
    result: TypeConstructor<Type>,
    fn: (self: ValueInterface) => ValueInterface,
  ): Prototype<Type> {
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
  .method(
    'str',
    StringType,
    self => new StringValue(self.cast(BooleanValue).value ? 'true' : 'false'),
  )
  .close();

new Prototype(NaturalType, NaturalValue)
  .method('str', StringType, self => new StringValue('' + self.cast(NaturalValue).value))
  .close();

new Prototype(StringType, StringValue)
  .method('str', StringType, self => self.cast(StringValue))
  .close();
