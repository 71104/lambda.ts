import { ApplicationNode, FieldNode, LambdaNode, SemiNativeNode, VariableNode } from './ast.js';
import {
  EMPTY_TYPE_CONTEXT,
  IOTA_TYPE_CONSTRUCTORS,
  IotaTypeName,
  Prototype,
  TypeContext,
  TypeScheme,
} from './types.js';
import {
  BooleanValue,
  ComplexValue,
  EMPTY_VALUE_CONTEXT,
  IntegerValue,
  NaturalValue,
  RationalValue,
  RealValue,
  StringValue,
  VALUE_CONSTRUCTORS,
  ValueContext,
  ValueInterface,
} from './values.js';

class Overload {
  public constructor(
    public readonly lhs: IotaTypeName,
    public readonly rhs: IotaTypeName,
    public readonly result: IotaTypeName,
    public readonly impl: (lhs: ValueInterface, rhs: ValueInterface) => ValueInterface,
  ) {}
}

type TypeHash = { [name: string]: TypeScheme };
type ValueHash = { [name: string]: ValueInterface };

class PrototypeData {
  public readonly types: TypeHash = Object.create(null);
  public readonly values: ValueHash = Object.create(null);
}

class Operator {
  private readonly _overloadsByLhs = new Map<IotaTypeName, Overload>();
  private readonly _overloadsByRhs = new Map<IotaTypeName, Overload[]>();
  private readonly _prototypes = new Map<IotaTypeName, PrototypeData>();

  public constructor(public readonly name: string) {}

  public impl<
    LHS extends ValueInterface,
    RHS extends ValueInterface,
    Result extends ValueInterface,
  >(
    lhs: IotaTypeName,
    rhs: IotaTypeName,
    result: IotaTypeName,
    fn: (lhs: LHS, rhs: RHS) => Result,
  ): Operator {
    const overload = new Overload(lhs, rhs, result, (rhs: ValueInterface, lhs: ValueInterface) =>
      fn(lhs as LHS, rhs as RHS),
    );
    this._overloadsByLhs.set(lhs, overload);
    if (!this._overloadsByRhs.has(rhs)) {
      this._overloadsByRhs.set(rhs, []);
    }
    this._overloadsByRhs.get(rhs)!.push(overload);
    return this;
  }

  private _getPrototypeData(type: IotaTypeName): PrototypeData {
    if (!this._prototypes.has(type)) {
      this._prototypes.set(type, new PrototypeData());
    }
    return this._prototypes.get(type)!;
  }

  public close(): void {
    for (const [lhs] of this._overloadsByLhs) {
      const term = new LambdaNode(
        'lhs',
        IOTA_TYPE_CONSTRUCTORS[lhs].INSTANCE,
        new LambdaNode(
          'rhs',
          null,
          new ApplicationNode(
            FieldNode.createRaw('rhs', `#b2:${lhs}:${this.name}`),
            new VariableNode('lhs'),
          ),
        ),
      );
      const prototype = this._getPrototypeData(lhs);
      const name = `#b1:${this.name}`;
      const { type } = term.getType(EMPTY_TYPE_CONTEXT);
      prototype.types[name] = type.close();
      prototype.values[name] = term.evaluate(EMPTY_VALUE_CONTEXT);
    }

    for (const [rhs, overloads] of this._overloadsByRhs) {
      const prototype = this._getPrototypeData(rhs);
      for (const overload of overloads) {
        const term = new LambdaNode(
          '$1', // rhs
          IOTA_TYPE_CONSTRUCTORS[rhs].INSTANCE,
          new LambdaNode(
            '$2', // lhs
            IOTA_TYPE_CONSTRUCTORS[overload.lhs].INSTANCE,
            new SemiNativeNode(IOTA_TYPE_CONSTRUCTORS[overload.result].INSTANCE, overload.impl),
          ),
        );
        const { type } = term.getType(EMPTY_TYPE_CONTEXT);
        const name = `#b2:${overload.lhs}:${this.name}`;
        prototype.types[name] = type.close();
        prototype.values[name] = term.evaluate(EMPTY_VALUE_CONTEXT);
      }
    }

    for (const [type, { types, values }] of this._prototypes) {
      const TypeConstructor = IOTA_TYPE_CONSTRUCTORS[type] as unknown as {
        PROTOTYPE: Prototype;
      };
      TypeConstructor.PROTOTYPE = TypeConstructor.PROTOTYPE.add(TypeContext.create(types));
      const ValueConstructor = VALUE_CONSTRUCTORS[type] as unknown as {
        PROTOTYPE: ValueContext;
      };
      ValueConstructor.PROTOTYPE = ValueConstructor.PROTOTYPE.add(ValueContext.create(values));
    }
  }
}

class ComparisonOperator {
  private readonly _operator: Operator;

  public constructor(public readonly name: string) {
    this._operator = new Operator(name);
  }

  public impl<LHS extends ValueInterface, RHS extends ValueInterface>(
    lhs: IotaTypeName,
    rhs: IotaTypeName,
    fn: (lhs: LHS, rhs: RHS) => boolean,
  ): ComparisonOperator {
    this._operator.impl<LHS, RHS, BooleanValue>(lhs, rhs, 'boolean', (lhs: LHS, rhs: RHS) =>
      fn(lhs, rhs) ? BooleanValue.TRUE : BooleanValue.FALSE,
    );
    return this;
  }

  public close(): void {
    this._operator.close();
  }
}

new ComparisonOperator('==')
  .impl('string', 'string', (lhs: StringValue, rhs: StringValue) => lhs.value === rhs.value)
  .impl(
    'complex',
    'complex',
    (lhs: ComplexValue, rhs: ComplexValue) =>
      lhs.real === rhs.real && lhs.imaginary === rhs.imaginary,
  )
  .impl(
    'complex',
    'real',
    (lhs: ComplexValue, rhs: RealValue) => lhs.real === rhs.value && lhs.imaginary === 0,
  )
  .impl(
    'complex',
    'rational',
    (lhs: ComplexValue, rhs: RationalValue) =>
      lhs.real * rhs.denominator === rhs.numerator && lhs.imaginary === 0,
  )
  .impl(
    'complex',
    'integer',
    (lhs: ComplexValue, rhs: IntegerValue) => lhs.real === rhs.value && lhs.imaginary === 0,
  )
  .impl(
    'complex',
    'natural',
    (lhs: ComplexValue, rhs: NaturalValue) => lhs.real === rhs.value && lhs.imaginary === 0,
  )
  .impl(
    'real',
    'complex',
    (lhs: RealValue, rhs: ComplexValue) => lhs.value === rhs.real && rhs.imaginary === 0,
  )
  .impl('real', 'real', (lhs: RealValue, rhs: RealValue) => lhs.value === rhs.value)
  .impl(
    'real',
    'rational',
    (lhs: RealValue, rhs: RationalValue) => lhs.value * rhs.denominator === rhs.numerator,
  )
  .impl('real', 'integer', (lhs: RealValue, rhs: IntegerValue) => lhs.value === rhs.value)
  .impl('real', 'natural', (lhs: RealValue, rhs: NaturalValue) => lhs.value === rhs.value)
  .impl(
    'rational',
    'complex',
    (lhs: RationalValue, rhs: ComplexValue) =>
      lhs.numerator === lhs.denominator * rhs.real && rhs.imaginary === 0,
  )
  .impl(
    'rational',
    'real',
    (lhs: RationalValue, rhs: RealValue) => lhs.numerator === lhs.denominator * rhs.value,
  )
  .impl(
    'rational',
    'rational',
    (lhs: RationalValue, rhs: RationalValue) =>
      lhs.numerator * rhs.denominator === lhs.denominator * rhs.numerator,
  )
  .impl(
    'rational',
    'integer',
    (lhs: RationalValue, rhs: IntegerValue) => lhs.numerator === lhs.denominator * rhs.value,
  )
  .impl(
    'rational',
    'natural',
    (lhs: RationalValue, rhs: NaturalValue) => lhs.numerator === lhs.denominator * rhs.value,
  )
  .impl(
    'integer',
    'complex',
    (lhs: IntegerValue, rhs: ComplexValue) => lhs.value === rhs.real && rhs.imaginary === 0,
  )
  .impl('integer', 'real', (lhs: IntegerValue, rhs: RealValue) => lhs.value === rhs.value)
  .impl(
    'integer',
    'rational',
    (lhs: IntegerValue, rhs: RationalValue) => lhs.value * rhs.denominator === rhs.numerator,
  )
  .impl('integer', 'integer', (lhs: IntegerValue, rhs: IntegerValue) => lhs.value === rhs.value)
  .impl('integer', 'natural', (lhs: IntegerValue, rhs: NaturalValue) => lhs.value === rhs.value)
  .impl(
    'natural',
    'complex',
    (lhs: NaturalValue, rhs: ComplexValue) => lhs.value === rhs.real && rhs.imaginary === 0,
  )
  .impl('natural', 'real', (lhs: NaturalValue, rhs: RealValue) => lhs.value === rhs.value)
  .impl(
    'natural',
    'rational',
    (lhs: NaturalValue, rhs: RationalValue) => lhs.value * rhs.denominator === rhs.numerator,
  )
  .impl('natural', 'integer', (lhs: NaturalValue, rhs: IntegerValue) => lhs.value === rhs.value)
  .impl('natural', 'natural', (lhs: NaturalValue, rhs: NaturalValue) => lhs.value === rhs.value)
  .impl('boolean', 'boolean', (lhs: BooleanValue, rhs: BooleanValue) => lhs.value === rhs.value)
  .close();

new ComparisonOperator('!=')
  .impl('string', 'string', (lhs: StringValue, rhs: StringValue) => lhs.value !== rhs.value)
  .impl(
    'complex',
    'complex',
    (lhs: ComplexValue, rhs: ComplexValue) =>
      lhs.real !== rhs.real || lhs.imaginary !== rhs.imaginary,
  )
  .impl(
    'complex',
    'real',
    (lhs: ComplexValue, rhs: RealValue) => lhs.real !== rhs.value || lhs.imaginary !== 0,
  )
  .impl(
    'complex',
    'rational',
    (lhs: ComplexValue, rhs: RationalValue) =>
      lhs.real * rhs.denominator !== rhs.numerator || lhs.imaginary !== 0,
  )
  .impl(
    'complex',
    'integer',
    (lhs: ComplexValue, rhs: IntegerValue) => lhs.real !== rhs.value || lhs.imaginary !== 0,
  )
  .impl(
    'complex',
    'natural',
    (lhs: ComplexValue, rhs: NaturalValue) => lhs.real !== rhs.value || lhs.imaginary !== 0,
  )
  .impl(
    'real',
    'complex',
    (lhs: RealValue, rhs: ComplexValue) => lhs.value !== rhs.real || rhs.imaginary !== 0,
  )
  .impl('real', 'real', (lhs: RealValue, rhs: RealValue) => lhs.value !== rhs.value)
  .impl(
    'real',
    'rational',
    (lhs: RealValue, rhs: RationalValue) => lhs.value * rhs.denominator !== rhs.numerator,
  )
  .impl('real', 'integer', (lhs: RealValue, rhs: IntegerValue) => lhs.value !== rhs.value)
  .impl('real', 'natural', (lhs: RealValue, rhs: NaturalValue) => lhs.value !== rhs.value)
  .impl(
    'rational',
    'complex',
    (lhs: RationalValue, rhs: ComplexValue) =>
      lhs.numerator !== lhs.denominator * rhs.real || rhs.imaginary !== 0,
  )
  .impl(
    'rational',
    'real',
    (lhs: RationalValue, rhs: RealValue) => lhs.numerator !== lhs.denominator * rhs.value,
  )
  .impl(
    'rational',
    'rational',
    (lhs: RationalValue, rhs: RationalValue) =>
      lhs.numerator * rhs.denominator !== lhs.denominator * rhs.numerator,
  )
  .impl(
    'rational',
    'integer',
    (lhs: RationalValue, rhs: IntegerValue) => lhs.numerator !== lhs.denominator * rhs.value,
  )
  .impl(
    'rational',
    'natural',
    (lhs: RationalValue, rhs: NaturalValue) => lhs.numerator !== lhs.denominator * rhs.value,
  )
  .impl(
    'integer',
    'complex',
    (lhs: IntegerValue, rhs: ComplexValue) => lhs.value !== rhs.real || rhs.imaginary !== 0,
  )
  .impl('integer', 'real', (lhs: IntegerValue, rhs: RealValue) => lhs.value !== rhs.value)
  .impl(
    'integer',
    'rational',
    (lhs: IntegerValue, rhs: RationalValue) => lhs.value * rhs.denominator !== rhs.numerator,
  )
  .impl('integer', 'integer', (lhs: IntegerValue, rhs: IntegerValue) => lhs.value !== rhs.value)
  .impl('integer', 'natural', (lhs: IntegerValue, rhs: NaturalValue) => lhs.value !== rhs.value)
  .impl(
    'natural',
    'complex',
    (lhs: NaturalValue, rhs: ComplexValue) => lhs.value !== rhs.real || rhs.imaginary !== 0,
  )
  .impl('natural', 'real', (lhs: NaturalValue, rhs: RealValue) => lhs.value !== rhs.value)
  .impl(
    'natural',
    'rational',
    (lhs: NaturalValue, rhs: RationalValue) => lhs.value * rhs.denominator !== rhs.numerator,
  )
  .impl('natural', 'integer', (lhs: NaturalValue, rhs: IntegerValue) => lhs.value !== rhs.value)
  .impl('natural', 'natural', (lhs: NaturalValue, rhs: NaturalValue) => lhs.value !== rhs.value)
  .impl('boolean', 'boolean', (lhs: BooleanValue, rhs: BooleanValue) => lhs.value !== rhs.value)
  .close();

new Operator('+')
  .impl(
    'string',
    'string',
    'string',
    (lhs: StringValue, rhs: StringValue) => new StringValue(lhs.value + rhs.value),
  )
  .impl(
    'complex',
    'complex',
    'complex',
    (lhs: ComplexValue, rhs: ComplexValue) =>
      new ComplexValue(lhs.real + rhs.real, lhs.imaginary + rhs.imaginary),
  )
  .impl(
    'complex',
    'real',
    'complex',
    (lhs: ComplexValue, rhs: RealValue) => new ComplexValue(lhs.real + rhs.value, lhs.imaginary),
  )
  .impl(
    'complex',
    'rational',
    'complex',
    (lhs: ComplexValue, rhs: RationalValue) =>
      new ComplexValue(lhs.real + rhs.numerator / rhs.denominator, lhs.imaginary),
  )
  .impl(
    'complex',
    'integer',
    'complex',
    (lhs: ComplexValue, rhs: IntegerValue) => new ComplexValue(lhs.real + rhs.value, lhs.imaginary),
  )
  .impl(
    'complex',
    'natural',
    'complex',
    (lhs: ComplexValue, rhs: NaturalValue) => new ComplexValue(lhs.real + rhs.value, lhs.imaginary),
  )
  .impl(
    'real',
    'complex',
    'complex',
    (lhs: RealValue, rhs: ComplexValue) => new ComplexValue(lhs.value + rhs.real, rhs.imaginary),
  )
  .impl(
    'real',
    'real',
    'real',
    (lhs: RealValue, rhs: RealValue) => new RealValue(lhs.value + rhs.value),
  )
  .impl(
    'real',
    'rational',
    'real',
    (lhs: RealValue, rhs: RationalValue) =>
      new RealValue(lhs.value + rhs.numerator / rhs.denominator),
  )
  .impl(
    'real',
    'integer',
    'real',
    (lhs: RealValue, rhs: IntegerValue) => new RealValue(lhs.value + rhs.value),
  )
  .impl(
    'real',
    'natural',
    'real',
    (lhs: RealValue, rhs: NaturalValue) => new RealValue(lhs.value + rhs.value),
  )
  .impl(
    'rational',
    'complex',
    'complex',
    (lhs: RationalValue, rhs: ComplexValue) =>
      new ComplexValue(lhs.numerator / lhs.denominator + rhs.real, rhs.imaginary),
  )
  .impl(
    'rational',
    'real',
    'real',
    (lhs: RationalValue, rhs: RealValue) =>
      new RealValue(lhs.numerator / lhs.denominator + rhs.value),
  )
  .impl(
    'rational',
    'rational',
    'rational',
    (lhs: RationalValue, rhs: RationalValue) =>
      new RationalValue(
        lhs.numerator * rhs.denominator + rhs.numerator * lhs.denominator,
        lhs.denominator * rhs.denominator,
      ),
  )
  .impl(
    'rational',
    'integer',
    'rational',
    (lhs: RationalValue, rhs: IntegerValue) =>
      new RationalValue(lhs.numerator + rhs.value * lhs.denominator, lhs.denominator),
  )
  .impl(
    'rational',
    'natural',
    'rational',
    (lhs: RationalValue, rhs: NaturalValue) =>
      new RationalValue(lhs.numerator + rhs.value * lhs.denominator, lhs.denominator),
  )
  .impl(
    'integer',
    'complex',
    'complex',
    (lhs: IntegerValue, rhs: ComplexValue) => new ComplexValue(lhs.value + rhs.real, rhs.imaginary),
  )
  .impl(
    'integer',
    'real',
    'real',
    (lhs: IntegerValue, rhs: RealValue) => new RealValue(lhs.value + rhs.value),
  )
  .impl(
    'integer',
    'rational',
    'rational',
    (lhs: IntegerValue, rhs: RationalValue) =>
      new RationalValue(lhs.value * rhs.denominator + rhs.numerator, rhs.denominator),
  )
  .impl(
    'integer',
    'integer',
    'integer',
    (lhs: IntegerValue, rhs: IntegerValue) => new IntegerValue(lhs.value + rhs.value),
  )
  .impl(
    'integer',
    'natural',
    'integer',
    (lhs: IntegerValue, rhs: NaturalValue) => new IntegerValue(lhs.value + rhs.value),
  )
  .impl(
    'natural',
    'complex',
    'complex',
    (lhs: NaturalValue, rhs: ComplexValue) => new ComplexValue(lhs.value + rhs.real, rhs.imaginary),
  )
  .impl(
    'natural',
    'real',
    'real',
    (lhs: NaturalValue, rhs: RealValue) => new RealValue(lhs.value + rhs.value),
  )
  .impl(
    'natural',
    'rational',
    'rational',
    (lhs: NaturalValue, rhs: RationalValue) =>
      new RationalValue(lhs.value * rhs.denominator + rhs.numerator, rhs.denominator),
  )
  .impl(
    'natural',
    'integer',
    'integer',
    (lhs: NaturalValue, rhs: IntegerValue) => new IntegerValue(lhs.value + rhs.value),
  )
  .impl(
    'natural',
    'natural',
    'natural',
    (lhs: NaturalValue, rhs: NaturalValue) => new NaturalValue(lhs.value + rhs.value),
  )
  .close();

new Operator('-')
  .impl(
    'complex',
    'complex',
    'complex',
    (lhs: ComplexValue, rhs: ComplexValue) =>
      new ComplexValue(lhs.real - rhs.real, lhs.imaginary - rhs.imaginary),
  )
  .impl(
    'complex',
    'real',
    'complex',
    (lhs: ComplexValue, rhs: RealValue) => new ComplexValue(lhs.real - rhs.value, lhs.imaginary),
  )
  .impl(
    'complex',
    'rational',
    'complex',
    (lhs: ComplexValue, rhs: RationalValue) =>
      new ComplexValue(lhs.real - rhs.numerator / rhs.denominator, lhs.imaginary),
  )
  .impl(
    'complex',
    'integer',
    'complex',
    (lhs: ComplexValue, rhs: IntegerValue) => new ComplexValue(lhs.real - rhs.value, lhs.imaginary),
  )
  .impl(
    'complex',
    'natural',
    'complex',
    (lhs: ComplexValue, rhs: NaturalValue) => new ComplexValue(lhs.real - rhs.value, lhs.imaginary),
  )
  .impl(
    'real',
    'complex',
    'complex',
    (lhs: RealValue, rhs: ComplexValue) => new ComplexValue(lhs.value - rhs.real, -rhs.imaginary),
  )
  .impl(
    'real',
    'real',
    'real',
    (lhs: RealValue, rhs: RealValue) => new RealValue(lhs.value - rhs.value),
  )
  .impl(
    'real',
    'rational',
    'real',
    (lhs: RealValue, rhs: RationalValue) =>
      new RealValue(lhs.value - rhs.numerator / rhs.denominator),
  )
  .impl(
    'real',
    'integer',
    'real',
    (lhs: RealValue, rhs: IntegerValue) => new RealValue(lhs.value - rhs.value),
  )
  .impl(
    'real',
    'natural',
    'real',
    (lhs: RealValue, rhs: NaturalValue) => new RealValue(lhs.value - rhs.value),
  )
  .impl(
    'rational',
    'complex',
    'complex',
    (lhs: RationalValue, rhs: ComplexValue) =>
      new ComplexValue(lhs.numerator / lhs.denominator - rhs.real, -rhs.imaginary),
  )
  .impl(
    'rational',
    'real',
    'real',
    (lhs: RationalValue, rhs: RealValue) =>
      new RealValue(lhs.numerator / lhs.denominator - rhs.value),
  )
  .impl(
    'rational',
    'rational',
    'rational',
    (lhs: RationalValue, rhs: RationalValue) =>
      new RationalValue(
        lhs.numerator * rhs.denominator - rhs.numerator * lhs.denominator,
        lhs.denominator * rhs.denominator,
      ),
  )
  .impl(
    'rational',
    'integer',
    'rational',
    (lhs: RationalValue, rhs: IntegerValue) =>
      new RationalValue(lhs.numerator - rhs.value * lhs.denominator, lhs.denominator),
  )
  .impl(
    'rational',
    'natural',
    'rational',
    (lhs: RationalValue, rhs: NaturalValue) =>
      new RationalValue(lhs.numerator - rhs.value * lhs.denominator, lhs.denominator),
  )
  .impl(
    'integer',
    'complex',
    'complex',
    (lhs: IntegerValue, rhs: ComplexValue) =>
      new ComplexValue(lhs.value - rhs.real, -rhs.imaginary),
  )
  .impl(
    'integer',
    'real',
    'real',
    (lhs: IntegerValue, rhs: RealValue) => new RealValue(lhs.value - rhs.value),
  )
  .impl(
    'integer',
    'rational',
    'rational',
    (lhs: IntegerValue, rhs: RationalValue) =>
      new RationalValue(lhs.value * rhs.denominator - rhs.numerator, rhs.denominator),
  )
  .impl(
    'integer',
    'integer',
    'integer',
    (lhs: IntegerValue, rhs: IntegerValue) => new IntegerValue(lhs.value - rhs.value),
  )
  .impl(
    'integer',
    'natural',
    'integer',
    (lhs: IntegerValue, rhs: NaturalValue) => new IntegerValue(lhs.value - rhs.value),
  )
  .impl(
    'natural',
    'complex',
    'complex',
    (lhs: NaturalValue, rhs: ComplexValue) =>
      new ComplexValue(lhs.value - rhs.real, -rhs.imaginary),
  )
  .impl(
    'natural',
    'real',
    'real',
    (lhs: NaturalValue, rhs: RealValue) => new RealValue(lhs.value - rhs.value),
  )
  .impl(
    'natural',
    'rational',
    'rational',
    (lhs: NaturalValue, rhs: RationalValue) =>
      new RationalValue(lhs.value * rhs.denominator - rhs.numerator, rhs.denominator),
  )
  .impl(
    'natural',
    'integer',
    'integer',
    (lhs: NaturalValue, rhs: IntegerValue) => new IntegerValue(lhs.value - rhs.value),
  )
  .impl(
    'natural',
    'natural',
    'integer',
    (lhs: NaturalValue, rhs: NaturalValue) => new IntegerValue(lhs.value - rhs.value),
  )
  .close();

new Operator('*')
  .impl(
    'complex',
    'complex',
    'complex',
    (lhs: ComplexValue, rhs: ComplexValue) =>
      new ComplexValue(
        lhs.real * rhs.real - lhs.imaginary * rhs.imaginary,
        lhs.real * rhs.imaginary + lhs.imaginary * rhs.real,
      ),
  )
  .impl(
    'complex',
    'real',
    'complex',
    (lhs: ComplexValue, rhs: RealValue) =>
      new ComplexValue(lhs.real * rhs.value, lhs.imaginary * rhs.value),
  )
  .impl(
    'complex',
    'rational',
    'complex',
    (lhs: ComplexValue, rhs: RationalValue) =>
      new ComplexValue(
        (lhs.real * rhs.numerator) / rhs.denominator,
        (lhs.imaginary * rhs.numerator) / rhs.denominator,
      ),
  )
  .impl(
    'complex',
    'integer',
    'complex',
    (lhs: ComplexValue, rhs: IntegerValue) =>
      new ComplexValue(lhs.real * rhs.value, lhs.imaginary * rhs.value),
  )
  .impl(
    'complex',
    'natural',
    'complex',
    (lhs: ComplexValue, rhs: NaturalValue) =>
      new ComplexValue(lhs.real * rhs.value, lhs.imaginary * rhs.value),
  )
  .impl(
    'real',
    'complex',
    'complex',
    (lhs: RealValue, rhs: ComplexValue) =>
      new ComplexValue(lhs.value * rhs.real, lhs.value * rhs.imaginary),
  )
  .impl(
    'real',
    'real',
    'real',
    (lhs: RealValue, rhs: RealValue) => new RealValue(lhs.value * rhs.value),
  )
  .impl(
    'real',
    'rational',
    'real',
    (lhs: RealValue, rhs: RationalValue) =>
      new RealValue((lhs.value * rhs.numerator) / rhs.denominator),
  )
  .impl(
    'real',
    'integer',
    'real',
    (lhs: RealValue, rhs: IntegerValue) => new RealValue(lhs.value * rhs.value),
  )
  .impl(
    'real',
    'natural',
    'real',
    (lhs: RealValue, rhs: NaturalValue) => new RealValue(lhs.value * rhs.value),
  )
  .impl(
    'rational',
    'complex',
    'complex',
    (lhs: RationalValue, rhs: ComplexValue) =>
      new ComplexValue((lhs.numerator / lhs.denominator) * rhs.real, rhs.imaginary),
  )
  .impl(
    'rational',
    'real',
    'real',
    (lhs: RationalValue, rhs: RealValue) =>
      new RealValue((lhs.numerator * rhs.value) / lhs.denominator),
  )
  .impl(
    'rational',
    'rational',
    'rational',
    (lhs: RationalValue, rhs: RationalValue) =>
      new RationalValue(lhs.numerator * rhs.numerator, lhs.denominator * rhs.denominator),
  )
  .impl(
    'rational',
    'integer',
    'rational',
    (lhs: RationalValue, rhs: IntegerValue) =>
      new RationalValue(lhs.numerator * rhs.value, lhs.denominator),
  )
  .impl(
    'rational',
    'natural',
    'rational',
    (lhs: RationalValue, rhs: NaturalValue) =>
      new RationalValue(lhs.numerator * rhs.value, lhs.denominator),
  )
  .impl(
    'integer',
    'complex',
    'complex',
    (lhs: IntegerValue, rhs: ComplexValue) => new ComplexValue(lhs.value * rhs.real, rhs.imaginary),
  )
  .impl(
    'integer',
    'real',
    'real',
    (lhs: IntegerValue, rhs: RealValue) => new RealValue(lhs.value * rhs.value),
  )
  .impl(
    'integer',
    'rational',
    'rational',
    (lhs: IntegerValue, rhs: RationalValue) =>
      new RationalValue(lhs.value * rhs.numerator, rhs.denominator),
  )
  .impl(
    'integer',
    'integer',
    'integer',
    (lhs: IntegerValue, rhs: IntegerValue) => new IntegerValue(lhs.value * rhs.value),
  )
  .impl(
    'integer',
    'natural',
    'integer',
    (lhs: IntegerValue, rhs: NaturalValue) => new IntegerValue(lhs.value * rhs.value),
  )
  .impl(
    'natural',
    'complex',
    'complex',
    (lhs: NaturalValue, rhs: ComplexValue) => new ComplexValue(lhs.value * rhs.real, rhs.imaginary),
  )
  .impl(
    'natural',
    'real',
    'real',
    (lhs: NaturalValue, rhs: RealValue) => new RealValue(lhs.value * rhs.value),
  )
  .impl(
    'natural',
    'rational',
    'rational',
    (lhs: NaturalValue, rhs: RationalValue) =>
      new RationalValue(lhs.value * rhs.numerator, rhs.denominator),
  )
  .impl(
    'natural',
    'integer',
    'integer',
    (lhs: NaturalValue, rhs: IntegerValue) => new IntegerValue(lhs.value * rhs.value),
  )
  .impl(
    'natural',
    'natural',
    'natural',
    (lhs: NaturalValue, rhs: NaturalValue) => new NaturalValue(lhs.value * rhs.value),
  )
  .close();
