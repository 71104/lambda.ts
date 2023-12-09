export type Token =
  | 'arrow'
  | 'assign'
  | 'bracket-left'
  | 'bracket-right'
  | 'colon'
  | 'comma'
  | 'complex'
  | 'curly-left'
  | 'curly-right'
  | 'dollar'
  | 'equals'
  | 'fat-arrow'
  | 'field'
  | 'identifier'
  | 'keyword:boolean'
  | 'keyword:complex'
  | 'keyword:else'
  | 'keyword:false'
  | 'keyword:fix'
  | 'keyword:fn'
  | 'keyword:if'
  | 'keyword:in'
  | 'keyword:integer'
  | 'keyword:let'
  | 'keyword:natural'
  | 'keyword:not'
  | 'keyword:null'
  | 'keyword:real'
  | 'keyword:scheme'
  | 'keyword:string'
  | 'keyword:then'
  | 'keyword:true'
  | 'keyword:undefined'
  | 'keyword:unknown'
  | 'less-than'
  | 'minus'
  | 'natural'
  | 'not-equals'
  | 'pipe'
  | 'plus'
  | 'power'
  | 'real'
  | 'slash'
  | 'string'
  | 'square-left'
  | 'square-right'
  | 'template'
  | 'template-begin'
  | 'template-end'
  | 'template-middle'
  | 'tilde'
  | 'times'
  | 'end';

export type TokenExpectation = Token | 'identifier-or-keyword';

export class Lexer {
  private static readonly _PATTERNS: [Token, RegExp][] = [
    ['end', /^$/],

    // word-like
    ['keyword:unknown', /^unknown\b/],
    ['keyword:undefined', /^undefined\b/],
    ['keyword:true', /^true\b/],
    ['keyword:then', /^then\b/],
    ['keyword:string', /^string\b/],
    ['keyword:scheme', /^scheme\b/],
    ['keyword:real', /^real\b/],
    ['keyword:null', /^null\b/],
    ['keyword:not', /^not\b/],
    ['keyword:natural', /^natural\b/],
    ['keyword:let', /^let\b/],
    ['keyword:integer', /^integer\b/],
    ['keyword:in', /^in\b/],
    ['keyword:if', /^if\b/],
    ['keyword:fn', /^fn\b/],
    ['keyword:fix', /^fix\b/],
    ['keyword:false', /^false\b/],
    ['keyword:else', /^else\b/],
    ['keyword:complex', /^complex\b/],
    ['keyword:boolean', /^boolean\b/],
    ['identifier', /^[A-Za-z_][A-Za-z0-9_]*/],

    // field
    ['field', /^\.[A-Za-z_][A-Za-z0-9_]*/],

    // strings and templates
    ['string', /^('[^']*(\\'[^']*)*'|"[^"]*(\\"[^"]*)*")/],
    ['template-begin', /^`[^`]*(\\`[^`]*)*\$\{/],
    ['template-middle', /^\}[^`]*(\\`[^`]*)*\$\{/],
    ['template-end', /^\}[^`]*(\\`[^`]*)*`/],
    ['template', /^`[^`]*(\\`[^`]*)*`/],

    // numbers
    ['complex', /^[0-9]+(\.[0-9]+)?i\b/],
    ['real', /^[0-9]+\.[0-9]+\b/],
    ['natural', /^[0-9]+\b/],

    // two-character symbols
    ['arrow', /^->/],
    ['equals', /^==/],
    ['fat-arrow', /^=>/],
    ['not-equals', /^!=/],
    ['power', /^\*\*/],

    // single-character symbols
    ['assign', /^=/],
    ['bracket-left', /^\(/],
    ['bracket-right', /^\)/],
    ['colon', /^:/],
    ['comma', /^,/],
    ['curly-left', /^\{/],
    ['curly-right', /^\}/],
    ['dollar', /^\$/],
    ['less-than', /^</],
    ['minus', /^-/],
    ['pipe', /^\|/],
    ['plus', /^\+/],
    ['slash', /^\//],
    ['square-left', /^\[/],
    ['square-right', /^\]/],
    ['tilde', /^~/],
    ['times', /^\*/],
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
