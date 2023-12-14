import { RuntimeError } from './errors.js';
import {
  Constraints,
  Substitution,
  TauType,
  TupleType,
  TypeContext,
  VariableType,
} from './types.js';
import { TupleValue, ValueContext, ValueInterface } from './values.js';

export class DeconstructionResults {
  public constructor(
    public readonly context: TypeContext,
    public readonly constraints: Constraints,
    public readonly substitution: Substitution,
  ) {}
}

export interface PatternInterface {
  toString(): string;

  getBoundNames(): Set<string>;

  deconstructType(
    context: TypeContext,
    value: TauType,
    constraints: Constraints,
    substitution: Substitution,
  ): DeconstructionResults;

  deconstructValue(context: ValueContext, value: ValueInterface): ValueContext;
}

export class NamePattern implements PatternInterface {
  public constructor(public readonly name: string) {}

  public toString(): string {
    return '' + this.name;
  }

  public getBoundNames(): Set<string> {
    return new Set<string>([this.name]);
  }

  public deconstructType(
    context: TypeContext,
    value: TauType,
    constraints: Constraints,
    substitution: Substitution,
  ): DeconstructionResults {
    return new DeconstructionResults(
      context.push(this.name, value.close(context, constraints, substitution)),
      constraints,
      substitution,
    );
  }

  public deconstructValue(context: ValueContext, value: ValueInterface): ValueContext {
    return context.push(this.name, value);
  }
}

export class ObjectFieldPattern {
  public constructor(
    public readonly name: string,
    public readonly pattern: PatternInterface | null,
  ) {}
}

export class ObjectPattern implements PatternInterface {
  public constructor(public readonly fields: ObjectFieldPattern[]) {
    const names = new Set<string>();
    for (const { name } of fields) {
      if (names.has(name)) {
        throw new SyntaxError(
          `duplicate name ${JSON.stringify(name)} in object deconstruction pattern`,
        );
      } else {
        names.add(name);
      }
    }
  }

  public toString(): string {
    return `{${this.fields
      .map(({ name, pattern }) => {
        if (pattern) {
          return `${name}: ${pattern.toString()}`;
        } else {
          return name;
        }
      })
      .join(', ')}}`;
  }

  public getBoundNames(): Set<string> {
    let names = new Set<string>();
    for (const { name, pattern } of this.fields) {
      if (pattern) {
        names = new Set<string>([...names, name, ...pattern.getBoundNames()]);
      } else {
        names.add(name);
      }
    }
    return names;
  }

  public deconstructType(
    context: TypeContext,
    value: TauType,
    constraints: Constraints,
    substitution: Substitution,
  ): DeconstructionResults {
    for (const { name, pattern } of this.fields) {
      let field: TauType;
      ({
        type: field,
        constraints,
        substitution,
      } = value.getField(name, constraints, substitution));
      ({ context, constraints, substitution } = (pattern || new NamePattern(name)).deconstructType(
        context,
        field,
        constraints,
        substitution,
      ));
    }
    return new DeconstructionResults(context, constraints, substitution);
  }

  public deconstructValue(context: ValueContext, value: ValueInterface): ValueContext {
    for (const { name, pattern } of this.fields) {
      if (pattern) {
        context = pattern.deconstructValue(context, value.getField(name));
      } else {
        context = context.push(name, value.getField(name));
      }
    }
    return context;
  }
}

export class TuplePattern implements PatternInterface {
  public constructor(public readonly elements: (PatternInterface | null)[]) {}

  public toString(): string {
    return `(${this.elements.map(pattern => (pattern ? pattern.toString() : '') + ',').join(' ')})`;
  }

  public getBoundNames(): Set<string> {
    return this.elements.reduce<Set<string>>((names, pattern) => {
      if (pattern) {
        return new Set<string>([...names, ...pattern.getBoundNames()]);
      } else {
        return names;
      }
    }, new Set<string>());
  }

  public deconstructType(
    context: TypeContext,
    value: TauType,
    constraints: Constraints,
    substitution: Substitution,
  ): DeconstructionResults {
    let tuple = new TupleType(this.elements.map(() => VariableType.getNew()));
    ({ constraints, substitution } = value.leq(tuple, constraints, substitution));
    tuple = tuple.substitute(substitution);
    for (let i = 0; i < this.elements.length; i++) {
      const pattern = this.elements[i];
      if (pattern) {
        ({ context, constraints, substitution } = pattern.deconstructType(
          context,
          tuple.elements[i],
          constraints,
          substitution,
        ));
      }
    }
    return new DeconstructionResults(context, constraints, substitution);
  }

  public deconstructValue(context: ValueContext, value: ValueInterface): ValueContext {
    const tuple = value.cast(TupleValue);
    if (tuple.elements.length !== this.elements.length) {
      throw new RuntimeError(
        `wrong number of elements in tuple deconstruction: got ${tuple.elements.length}, expected ${this.elements.length}`,
      );
    }
    for (let i = 0; i < this.elements.length; i++) {
      const pattern = this.elements[i];
      if (pattern) {
        context = pattern.deconstructValue(context, tuple.elements[i]);
      }
    }
    return context;
  }
}
