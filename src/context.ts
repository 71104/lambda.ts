export interface ContextualInterface {
  toString(): string;
}

export class Context<Element extends ContextualInterface> {
  private readonly _frame: { [name: string]: Element };

  private constructor(prototype: { [name: string]: Element } | null) {
    this._frame = Object.create(prototype);
  }

  public static create<Element extends ContextualInterface>(
    hash: { [name: string]: Element } | null = null,
  ): Context<Element> {
    const context = new Context<Element>(null);
    if (hash) {
      for (const name in hash) {
        if (Object.prototype.hasOwnProperty.call(hash, name)) {
          context._frame[name] = hash[name];
        }
      }
    }
    return context;
  }

  public toString(): string {
    const strings: string[] = [];
    for (const name in this._frame) {
      strings.push(`${name}: ${this._frame[name].toString()}`);
    }
    return '{' + strings.join(', ') + '}';
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

  public map<Output extends ContextualInterface>(
    callback: (name: string, element: Element) => Output,
  ): Context<Output> {
    const frame = Object.create(null);
    for (const name in this._frame) {
      frame[name] = callback(name, this._frame[name]);
    }
    return new Context<Output>(frame);
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

  public push(name: string, element: Element): Context<Element> {
    const child = new Context<Element>(this._frame);
    child._frame[name] = element;
    return child;
  }

  public pushAll(hash: { [name: string]: Element }): Context<Element> {
    const child = new Context(this._frame);
    for (const name in hash) {
      if (Object.prototype.hasOwnProperty.call(hash, name)) {
        child._frame[name] = hash[name];
      }
    }
    return child;
  }

  public add(other: Context<Element>): Context<Element> {
    const child = new Context<Element>(this._frame);
    other.forEach((name, element) => {
      child._frame[name] = element;
    });
    return child;
  }

  public remove(...names: string[]): Context<Element> {
    const frame = Object.create(null);
    for (const name in this._frame) {
      if (!names.includes(name)) {
        frame[name] = this._frame[name];
      }
    }
    return Context.create<Element>(frame);
  }
}
