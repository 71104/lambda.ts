export interface ContextualInterface {
  toString(): string;
}

export class Context<Element extends ContextualInterface> {
  private constructor(private readonly _frame: { [name: string]: Element }) {}

  public static create<Element extends ContextualInterface>(
    hash: { [name: string]: Element } | null = null,
  ): Context<Element> {
    const frame = Object.create(null);
    if (hash) {
      for (const name in hash) {
        if (Object.prototype.hasOwnProperty.call(hash, name)) {
          frame[name] = hash[name];
        }
      }
    }
    return new Context<Element>(frame);
  }

  public toString(): string {
    const strings: string[] = [];
    for (const name in this._frame) {
      strings.push(`${name}: ${this._frame[name].toString()}`);
    }
    return `{${strings.join(', ')}}`;
  }

  public get size(): number {
    let size = 0;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const _name in this._frame) {
      size++;
    }
    return size;
  }

  public isEmpty(): boolean {
    for (const _ in this._frame) {
      return false;
    }
    return true;
  }

  public has(name: string): boolean {
    return name in this._frame;
  }

  public top(name: string): Element {
    return this._frame[name];
  }

  public topDef(name: string, fallback: Element): Element {
    if (name in this._frame) {
      return this._frame[name];
    } else {
      return fallback;
    }
  }

  public forEach(callback: (name: string, element: Element) => void): void {
    for (const name in this._frame) {
      callback(name, this._frame[name]);
    }
  }

  public every(predicate: (name: string, element: Element) => boolean): boolean {
    for (const name in this._frame) {
      if (!predicate(name, this._frame[name])) {
        return false;
      }
    }
    return true;
  }

  public some(predicate: (name: string, element: Element) => boolean): boolean {
    for (const name in this._frame) {
      if (predicate(name, this._frame[name])) {
        return true;
      }
    }
    return false;
  }

  public filter(predicate: (name: string, element: Element) => boolean): Context<Element> {
    const hash: { [name: string]: Element } = Object.create(null);
    for (const name in this._frame) {
      if (predicate(name, this._frame[name])) {
        hash[name] = this._frame[name];
      }
    }
    return new Context<Element>(hash);
  }

  public map<Out extends ContextualInterface>(
    fn: (name: string, element: Element) => Out,
  ): Context<Out> {
    const hash: { [name: string]: Out } = Object.create(null);
    for (const name in this._frame) {
      hash[name] = fn(name, this._frame[name]);
    }
    return new Context<Out>(hash);
  }

  public reduce<Accumulator>(
    fn: (accumulator: Accumulator, name: string, element: Element) => Accumulator,
    accumulator: Accumulator,
  ): Accumulator {
    for (const name in this._frame) {
      accumulator = fn(accumulator, name, this._frame[name]);
    }
    return accumulator;
  }

  public toArray<Out>(fn: (name: string, element: Element) => Out): Out[] {
    const array: Out[] = [];
    for (const name in this._frame) {
      array.push(fn(name, this._frame[name]));
    }
    return array;
  }

  public push(name: string, element: Element): Context<Element> {
    const frame = Object.create(this._frame);
    frame[name] = element;
    return new Context<Element>(frame);
  }

  public pushAll(hash: { [name: string]: Element }): Context<Element> {
    const frame = Object.create(this._frame);
    for (const name in hash) {
      if (Object.prototype.hasOwnProperty.call(hash, name)) {
        frame[name] = hash[name];
      }
    }
    return new Context<Element>(frame);
  }

  public add(other: Context<Element>): Context<Element> {
    const frame = Object.create(this._frame);
    other.forEach((name, element) => {
      frame[name] = element;
    });
    return new Context<Element>(frame);
  }

  public subtract<Other extends ContextualInterface>(other: Context<Other>): Context<Element> {
    return this.filter(name => !other.has(name));
  }

  public remove(...names: string[]): Context<Element> {
    const frame = Object.create(null);
    for (const name in this._frame) {
      if (!names.includes(name)) {
        frame[name] = this._frame[name];
      }
    }
    return new Context<Element>(frame);
  }
}
