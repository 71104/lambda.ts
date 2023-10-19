import { Context } from './context.js';

export interface ValueInterface {
  toString(): string;
}

export type ValueContext = Context<ValueInterface>;
export const ValueContext = Context<ValueInterface>;

export const EMPTY_VALUE_CONTEXT = ValueContext.create<ValueInterface>();
