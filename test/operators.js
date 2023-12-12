import { expect } from 'chai';

import { evaluate } from '../dist/lambda.js';
import { IntegerType, NaturalType } from '../dist/types.js';
import { IntegerValue, NaturalValue } from '../dist/values.js';

describe('Operators', function () {
  it('i+i', function () {
    const [type, value] = evaluate('-2 + -3');
    expect(type).to.be.an.instanceof(IntegerType);
    expect(value).to.be.an.instanceof(IntegerValue);
    expect(value.value).to.equal(-5);
  });

  it('i+n', function () {
    const [type, value] = evaluate('-2 + 3');
    expect(type).to.be.an.instanceof(IntegerType);
    expect(value).to.be.an.instanceof(IntegerValue);
    expect(value.value).to.equal(1);
  });

  it('n+i', function () {
    const [type, value] = evaluate('2 + -3');
    expect(type).to.be.an.instanceof(IntegerType);
    expect(value).to.be.an.instanceof(IntegerValue);
    expect(value.value).to.equal(-1);
  });

  it('n+n', function () {
    const [type, value] = evaluate('2 + 3');
    expect(type).to.be.an.instanceof(NaturalType);
    expect(value).to.be.an.instanceof(NaturalValue);
    expect(value.value).to.equal(5);
  });

  // TODO
});
