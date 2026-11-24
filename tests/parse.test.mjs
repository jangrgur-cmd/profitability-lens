// Tests for src/shared/parse.js: typed amounts in Croatian and English formats.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAmount } from "../src/shared/parse.js";

const value = (input) => parseAmount(input).value;
const isError = (input) => parseAmount(input).error !== null;

test("Croatian and English formats with both separators: the last one is decimal", () => {
  assert.equal(value("1.234.567,89"), 1234567.89);
  assert.equal(value("1,234,567.89"), 1234567.89);
  assert.equal(value("1,234.5"), 1234.5);
  assert.equal(value("12.500,00"), 12500);
});

test("spaces and non-breaking spaces are thousands separators", () => {
  assert.equal(value("1 234 567"), 1234567);
  assert.equal(value("1 234 567"), 1234567);
  assert.equal(value("1 234,5"), 1234.5);
  assert.equal(value("1 234,567"), 1234.567, "after space grouping a lone comma is decimal");
});

test("a lone separator followed by exactly three digits is a thousands separator", () => {
  assert.equal(value("1.234"), 1234);
  assert.equal(value("1,234"), 1234);
  assert.equal(value("999.000"), 999000);
});

test("otherwise a lone separator is the decimal separator", () => {
  assert.equal(value("1,5"), 1.5);
  assert.equal(value("12.50"), 12.5);
  assert.equal(value("0,125"), 0.125, "a group cannot start with 0, so this is a decimal");
  assert.equal(value(".5"), 0.5);
  assert.equal(value("1234.567"), 1234.567, "four digits before it cannot be a first thousands group");
});

test("a separator repeated several times is a thousands separator", () => {
  assert.equal(value("1.234.567"), 1234567);
  assert.equal(value("1,234,567"), 1234567);
});

test("accounting brackets and minus signs make a number negative", () => {
  assert.equal(value("(12.500)"), -12500);
  assert.equal(value("-500"), -500);
  assert.equal(value("−1.000,5"), -1000.5, "typographic minus");
  assert.equal(value("+42"), 42);
  assert.ok(Object.is(value("-0"), 0), "no negative zero");
});

test("currency symbols and codes are ignored", () => {
  assert.equal(value("€ 1.000"), 1000);
  assert.equal(value("1.000 EUR"), 1000);
  assert.equal(value("-500 kn"), -500);
  assert.equal(value("$1,234.50"), 1234.5);
  assert.equal(value("(€12.500)"), -12500);
});

test("blank input means 'not given', not an error", () => {
  for (const input of ["", "   ", null, undefined]) {
    assert.deepEqual(parseAmount(input), { value: null, error: null });
  }
});

test("numbers pass through; non-finite numbers are errors", () => {
  assert.equal(value(1234.5), 1234.5);
  assert.ok(isError(Number.NaN));
  assert.ok(isError(Number.POSITIVE_INFINITY));
});

test("invalid input returns an error and no value", () => {
  for (const input of ["abc", "1.2.3", "12 34", "1.000,000.5", "1,2,3", "1e5", "(−5)", "5 apples"]) {
    const result = parseAmount(input);
    assert.equal(result.value, null, input);
    assert.match(result.error, /Not a number/, input);
  }
});
