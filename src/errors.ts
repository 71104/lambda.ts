export class NotImplementedError extends Error {}

export class InternalError extends Error {
  public constructor(message: string) {
    super(message);
  }
}

export class SyntaxError extends Error {
  public constructor(message: string) {
    super(message);
  }
}

export class TypeError extends Error {
  public constructor(message: string) {
    super(message);
  }
}

export class RuntimeError extends Error {
  public constructor(message: string) {
    super(message);
  }
}
