import { expect } from 'chai';

import { Lexer } from '../dist/lexer.js';

describe('Lexer', function () {
  it('initial state', function () {
    const lexer = new Lexer(' -> foo');
    expect(lexer.token).to.equal('arrow');
    expect(lexer.end).to.equal(false);
    expect(lexer.label).to.equal('->');
  });

  // TODO
});
