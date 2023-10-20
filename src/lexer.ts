export type Token =
  | 'arrow'
  | 'assign'
  | 'bracket-left'
  | 'bracket-right'
  | 'colon'
  | 'comma'
  | 'complex'
  | 'fat-arrow'
  | 'identifier'
  | 'keyword:boolean'
  | 'keyword:complex'
  | 'keyword:false'
  | 'keyword:fn'
  | 'keyword:in'
  | 'keyword:integer'
  | 'keyword:let'
  | 'keyword:natural'
  | 'keyword:null'
  | 'keyword:real'
  | 'keyword:scheme'
  | 'keyword:string'
  | 'keyword:true'
  | 'keyword:undefined'
  | 'natural'
  | 'real'
  | 'string'
  | 'end';

export type TokenExpectation = Token | 'identifier-or-keyword';

export class Lexer {
  private static readonly _PATTERNS: [Token, RegExp][] = [
    ['end', /^$/],

    // word-like
    ['keyword:undefined', /^undefined\b/],
    ['keyword:true', /^true\b/],
    ['keyword:string', /^string\b/],
    ['keyword:scheme', /^scheme\b/],
    ['keyword:real', /^real\b/],
    ['keyword:null', /^null\b/],
    ['keyword:natural', /^natural\b/],
    ['keyword:let', /^let\b/],
    ['keyword:integer', /^integer\b/],
    ['keyword:in', /^in\b/],
    ['keyword:fn', /^fn\b/],
    ['keyword:false', /^false\b/],
    ['keyword:complex', /^complex\b/],
    ['keyword:boolean', /^boolean\b/],
    ['identifier', /^[A-Za-z_][A-Za-z0-9_]*/],

    // strings and templates
    ['string', /^('[^']*(\\'[^']*)*'|"[^"]*(\\"[^"]*)*")/],

    // numbers
    ['complex', /^[0-9]+(\.[0-9]+)?i\b/],
    ['real', /^[0-9]+\.[0-9]+\b/],
    ['natural', /^[0-9]+\b/],

    // two-character symbols
    ['arrow', /^->/],
    ['fat-arrow', /^=>/],

    // single-character symbols
    ['assign', /^=/],
    ['bracket-left', /^\(/],
    ['bracket-right', /^\)/],
    ['colon', /^:/],
    ['comma', /^,/],
  ];

  public readonly _originalInput: string;
  private _input: string;

  private _token: Token;
  private _label: string = '';

  public constructor(input: string) {
    this._originalInput = input;
    this._input = input;
    this._token = this.next();
  }

  public get token(): Token {
    return this._token;
  }

  public get end(): boolean {
    return 'end' === this._token;
  }

  public get label(): string {
    return this._label;
  }

  private _match(pattern: RegExp): string | null {
    const result = pattern.exec(this._input);
    if (result) {
      this._input = this._input.substring(result[0].length);
      return result[0];
    } else {
      return null;
    }
  }

  private _cropInput(): string {
    if (this._input.length > 16) {
      return this._input.substring(0, 16) + '...';
    } else {
      return this._input;
    }
  }

  public next(): Token {
    if (this._match(/^\s+/)) {
      return this.next();
    }
    for (const [token, pattern] of Lexer._PATTERNS) {
      const match = this._match(pattern);
      if (match !== null) {
        this._token = token;
        this._label = match;
        return token;
      }
    }
    throw new SyntaxError(`unrecognized token: ${JSON.stringify(this._cropInput())}`);
  }

  public step(): string {
    const label = this._label;
    this.next();
    return label;
  }

  public skip(expected: TokenExpectation, label?: string): Token {
    if ('identifier-or-keyword' === expected) {
      if ('identifier' !== this._token && !this._token.startsWith('keyword:')) {
        throw new SyntaxError(`identifier or keyword expected but '${this._token}' found`);
      } else {
        return this.next();
      }
    } else if (expected !== this._token) {
      throw new SyntaxError(`'${expected}' expected but '${this._token}' found`);
    } else if (label && label !== this._label) {
      throw new SyntaxError(`'${label}' expected but '${this._label}' found`);
    } else {
      return this.next();
    }
  }

  public expect(expected: TokenExpectation, label?: string): string {
    if ('identifier-or-keyword' === expected) {
      if ('identifier' !== this._token && !this._token.startsWith('keyword:')) {
        throw new SyntaxError(`identifier or keyword expected but '${this._token}' found`);
      } else {
        return this.step();
      }
    } else if (expected !== this._token) {
      throw new SyntaxError(`'${expected}' expected but '${this._token}' found`);
    } else if (label && label !== this._label) {
      throw new SyntaxError(`'${label}' expected but '${this._label}' found`);
    } else {
      return this.step();
    }
  }
}
