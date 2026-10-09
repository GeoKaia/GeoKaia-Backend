const test = require('node:test');
const assert = require('node:assert/strict');

// Las rutas se cargan sin conectar a ninguna base (el pool de pg es perezoso).
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://x:x@127.0.0.1:1/x';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prueba';
const router = require('../src/routes/lugares.routes');

const rutas = router.stack
  .filter((capa) => capa.route)
  .flatMap((capa) => Object.keys(capa.route.methods).map((m) => `${m.toUpperCase()} ${capa.route.path}`));

test('el admin NO puede editar ni borrar lugares ajenos', () => {
  assert.ok(!rutas.includes('PATCH /admin/:id'), 'PATCH /admin/:id no debe existir');
  assert.ok(!rutas.includes('DELETE /admin/:id'), 'DELETE /admin/:id no debe existir');
});

test('el admin conserva lectura y aprobar/rechazar', () => {
  assert.ok(rutas.includes('GET /admin/pendientes'));
  assert.ok(rutas.includes('GET /admin/todos'));
  assert.ok(rutas.includes('PATCH /admin/:id/estado'));
});

test('cada negocio sigue administrando su propio lugar', () => {
  assert.ok(rutas.includes('PATCH /mi-lugar'));
  assert.ok(rutas.includes('DELETE /mi-lugar'));
});
