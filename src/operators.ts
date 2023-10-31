import { ApplicationNode, FieldNode, LambdaNode, VariableNode } from './ast.js';
import { InternalError } from './errors.js';
import {
  EMPTY_TYPE_CONTEXT,
  IOTA_TYPE_CONSTRUCTORS,
  IotaTypeName,
  Prototype,
  TypeContext,
  TypeScheme,
} from './types.js';
import {
  Closure,
  ComplexValue,
  EMPTY_VALUE_CONTEXT,
  IntegerValue,
  NaturalValue,
  RationalValue,
  RealValue,
  VALUE_CONSTRUCTORS,
  ValueContext,
  ValueInterface,
} from './values.js';

class Overload {
  public constructor(
    public readonly rhs: IotaTypeName,
    public readonly result: IotaTypeName,
    public readonly closure: Closure,
  ) {}
}

class Operator<LHS extends ValueInterface> {
  public readonly overloads: Overload[] = [];

  public constructor(
    public readonly name: string,
    public readonly lhs: IotaTypeName,
  ) {}

  public impl<RHS extends ValueInterface, Result extends ValueInterface>(
    rhs: IotaTypeName,
    result: IotaTypeName,
    fn: (lhs: LHS, rhs: RHS) => Result,
  ): Operator<LHS> {
    this.overloads.push(
      new Overload(
        rhs,
        result,
        Closure.wrap((lhs: ValueInterface, rhs: ValueInterface) => {
          fn(lhs as LHS, rhs as RHS);
        }),
      ),
    );
    return this;
  }
}

class OperandPrototype<LHS extends ValueInterface> {
  private readonly _operators: { [name: string]: Operator<LHS> } = Object.create(null);

  public constructor(public readonly lhs: IotaTypeName) {}

  public define(name: string, callback: (operator: Operator<LHS>) => void): OperandPrototype<LHS> {
    if (name in this._operators) {
      throw new InternalError(`operator '${name}' is already defined`);
    }
    callback((this._operators[name] = new Operator<LHS>(name, this.lhs)));
    return this;
  }

  public close(): void {
    const types: { [name: string]: TypeScheme } = Object.create(null);
    const values: { [name: string]: ValueInterface } = Object.create(null);

    for (const name in this._operators) {
      const term = new LambdaNode(
        'lhs',
        IOTA_TYPE_CONSTRUCTORS[this.lhs].INSTANCE,
        new LambdaNode(
          'rhs',
          null,
          new ApplicationNode(
            FieldNode.createRaw('rhs', `#b2:${this.lhs}:${name}`),
            new VariableNode('lhs'),
          ),
        ),
      );
      const { type } = term.getType(EMPTY_TYPE_CONTEXT);
      types[`#b1:${name}`] = type.close();
      values[`#b1:{name}`] = term.evaluate(EMPTY_VALUE_CONTEXT);
    }

    const OperandTypeConstructor = IOTA_TYPE_CONSTRUCTORS[this.lhs] as unknown as {
      PROTOTYPE: Prototype;
    };
    OperandTypeConstructor.PROTOTYPE = OperandTypeConstructor.PROTOTYPE.add(
      TypeContext.create<TypeScheme>(types),
    );

    const OperandValueConstructor = VALUE_CONSTRUCTORS[this.lhs] as unknown as {
      PROTOTYPE: ValueContext;
    };
    OperandValueConstructor.PROTOTYPE = OperandValueConstructor.PROTOTYPE.add(
      ValueContext.create<ValueInterface>(values),
    );
  }
}

new OperandPrototype<ComplexValue>('complex')
  .define('+', operator =>
    operator
      .impl(
        'complex',
        'complex',
        (lhs: ComplexValue, rhs: ComplexValue) =>
          new ComplexValue(lhs.real + rhs.real, lhs.imaginary + rhs.imaginary),
      )
      .impl(
        'real',
        'complex',
        (lhs: ComplexValue, rhs: RealValue) =>
          new ComplexValue(lhs.real + rhs.value, lhs.imaginary),
      )
      .impl(
        'rational',
        'complex',
        (lhs: ComplexValue, rhs: RationalValue) =>
          new ComplexValue(lhs.real + rhs.numerator / rhs.denominator, lhs.imaginary),
      )
      .impl(
        'integer',
        'complex',
        (lhs: ComplexValue, rhs: IntegerValue) =>
          new ComplexValue(lhs.real + rhs.value, lhs.imaginary),
      )
      .impl(
        'natural',
        'complex',
        (lhs: ComplexValue, rhs: NaturalValue) =>
          new ComplexValue(lhs.real + rhs.value, lhs.imaginary),
      ),
  )
  .define('-', operator =>
    operator
      .impl(
        'complex',
        'complex',
        (lhs: ComplexValue, rhs: ComplexValue) =>
          new ComplexValue(lhs.real - rhs.real, lhs.imaginary - rhs.imaginary),
      )
      .impl(
        'real',
        'complex',
        (lhs: ComplexValue, rhs: RealValue) =>
          new ComplexValue(lhs.real - rhs.value, lhs.imaginary),
      )
      .impl(
        'rational',
        'complex',
        (lhs: ComplexValue, rhs: RationalValue) =>
          new ComplexValue(lhs.real - rhs.numerator / rhs.denominator, lhs.imaginary),
      )
      .impl(
        'integer',
        'complex',
        (lhs: ComplexValue, rhs: IntegerValue) =>
          new ComplexValue(lhs.real - rhs.value, lhs.imaginary),
      )
      .impl(
        'natural',
        'complex',
        (lhs: ComplexValue, rhs: NaturalValue) =>
          new ComplexValue(lhs.real - rhs.value, lhs.imaginary),
      ),
  )
  .define('*', operator =>
    operator
      .impl(
        'complex',
        'complex',
        (lhs: ComplexValue, rhs: ComplexValue) =>
          new ComplexValue(
            lhs.real * rhs.real - lhs.imaginary * rhs.imaginary,
            lhs.real * rhs.imaginary + lhs.imaginary * rhs.real,
          ),
      )
      .impl(
        'real',
        'complex',
        (lhs: ComplexValue, rhs: RealValue) =>
          new ComplexValue(lhs.real * rhs.value, lhs.imaginary * rhs.value),
      )
      .impl(
        'rational',
        'complex',
        (lhs: ComplexValue, rhs: RationalValue) =>
          new ComplexValue(
            (lhs.real * rhs.numerator) / rhs.denominator,
            (lhs.imaginary * rhs.numerator) / rhs.denominator,
          ),
      )
      .impl(
        'integer',
        'complex',
        (lhs: ComplexValue, rhs: IntegerValue) =>
          new ComplexValue(lhs.real * rhs.value, lhs.imaginary * rhs.value),
      )
      .impl(
        'natural',
        'complex',
        (lhs: ComplexValue, rhs: NaturalValue) =>
          new ComplexValue(lhs.real * rhs.value, lhs.imaginary * rhs.value),
      ),
  )
  .close();
