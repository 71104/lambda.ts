import { expect } from 'chai';

import { evaluate } from '../dist/lambda.js';
import { IntegerType, ListType, NaturalType, RealType } from '../dist/types.js';
import { ListValue, NaturalValue, RealValue } from '../dist/values.js';

describe('List', function () {
  it('length', function () {
    const [type, value] = evaluate('[1, 2, 4, 8].length');
    expect(type).to.be.an.instanceof(NaturalType);
    expect(value).to.be.an.instanceof(NaturalValue);
    expect(value.value).to.equal(4);
  });

  it('head', function () {
    const [type, value] = evaluate('[3.14, 42].head');
    expect(type).to.be.an.instanceof(RealType);
    expect(value).to.be.an.instanceof(RealValue);
    expect(value.value).to.be.within(3.139, 3.141);
  });

  it('tail', function () {
    const [type, value] = evaluate('[-12, 34, 56].tail');
    expect(type).to.be.an.instanceof(ListType);
    expect(type.inner).to.be.an.instanceof(IntegerType);
    expect(value).to.be.an.instanceof(ListValue);
    expect(value.count).to.equal(2);
    const elements = [...value.elements];
    expect(elements[0]).to.be.an.instanceof(NaturalValue);
    expect(elements[0].value).to.equal(34);
    expect(elements[1]).to.be.an.instanceof(NaturalValue);
    expect(elements[1].value).to.equal(56);
  });

  // TODO
});
