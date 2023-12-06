import { RuntimeError } from './errors.js';
import { LambdaType, ListType, NaturalType, StringType, TauType, VariableType } from './types.js';
import { Closure, ListValue, NaturalValue, StringValue, ValueInterface } from './values.js';

class ListPrototype {
  private readonly _inner = VariableType.getNew();
  private readonly _self = new ListType(this._inner);
  private readonly _types: { [name: string]: TauType } = Object.create(null);
  private readonly _values: { [name: string]: Closure } = Object.create(null);

  public constructor(fn: (inner: VariableType, prototype: ListPrototype) => ListPrototype) {
    fn(this._inner, this);
  }

  public method(
    name: string,
    result: TauType,
    fn: (self: ListValue) => ValueInterface,
  ): ListPrototype {
    this._types[name] = new LambdaType(this._self, result);
    this._values[name] = Closure.wrap(fn);
    return this;
  }

  public close(): void {
    ListType.PROTOTYPE.add(this._types);
    // @ts-expect-error
    ListValue.PROTOTYPE = ListValue.PROTOTYPE.pushAll(this._values);
  }
}

new ListPrototype((inner, prototype) =>
  prototype
    .method('str', StringType.INSTANCE, self => new StringValue(self.toString()))
    .method('length', NaturalType.INSTANCE, self => new NaturalValue(self.count))
    .method('head', inner, self => {
      for (const element of self.elements) {
        return element;
      }
      throw new RuntimeError(`empty list has no head`);
    })
    .method('tail', new ListType(inner), self => {
      if (self.count > 0) {
        return new ListValue(self.array, self.offset + 1, self.count - 1);
      } else {
        return self;
      }
    }),
).close();
