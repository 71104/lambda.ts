#! /usr/bin/env node

import { start as replStart } from 'node:repl';

import { evaluate as lambda } from './lambda.js';

if (process.stdin.isTTY) {
  replStart({
    eval: (input, _context, _filename, callback) => {
      try {
        const [type, value] = lambda(input);
        callback(null, `${value.toString()}: ${type.toString()}`);
      } catch (e) {
        callback(e as Error, null);
      }
    },
  });
} else {
  process.stdin.setEncoding('ascii');

  let input = '';

  process.stdin
    .on('data', (text: string) => {
      input += text;
    })
    .on('end', () => {
      try {
        process.stdout.write(lambda(input) + '\n');
      } catch (e) {
        process.stderr.write(e + '\n');
      }
    });
}
