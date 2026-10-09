const test = require('node:test');
const assert = require('node:assert/strict');
const { problemasDeContrasena } = require('../src/utils/password');

test('acepta una contraseña que cumple todo', () => {
  assert.deepEqual(problemasDeContrasena('Playa-Granada-2026!', 'turista@correo.com'), []);
});

test('rechaza menos de 12 caracteres', () => {
  assert.ok(problemasDeContrasena('Ab1!cdef').some((p) => p.includes('12 caracteres')));
});

test('exige mayúscula, número y símbolo', () => {
  assert.ok(problemasDeContrasena('sinmayuscula-123!').some((p) => p.includes('mayúscula')));
  assert.ok(problemasDeContrasena('SinNumeroAqui-!!!').some((p) => p.includes('número')));
  assert.ok(problemasDeContrasena('SinSimbolo123456').some((p) => p.includes('símbolo')));
});

test('los espacios no cuentan como símbolo', () => {
  assert.ok(problemasDeContrasena('Con espacios 123456').some((p) => p.includes('símbolo')));
});

test('rechaza contraseñas típicas y las que contienen el correo', () => {
  assert.ok(problemasDeContrasena('Password-12345!').some((p) => p.includes('común')));
  assert.ok(problemasDeContrasena('Maria.Lopez-2026!', 'maria.lopez@correo.com').some((p) => p.includes('correo')));
});

test('rechaza más de 72 bytes (límite de bcrypt)', () => {
  assert.ok(problemasDeContrasena('Aa1!' + 'x'.repeat(70)).some((p) => p.includes('larga')));
});

test('tolera entradas que no son texto', () => {
  assert.deepEqual(problemasDeContrasena(undefined), ['La contraseña es obligatoria']);
  assert.deepEqual(problemasDeContrasena({ $gt: '' }), ['La contraseña es obligatoria']);
});
