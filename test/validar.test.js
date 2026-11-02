import test from 'node:test';
import assert from 'node:assert/strict';
import { validarFiltros } from '../src/lib/validar.js';

const checkInFuturo = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
const checkOutFuturo = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
const base = { destino: 'Bariloche', huespedes: 2, checkIn: checkInFuturo, checkOut: checkOutFuturo };

test('acepta filtros válidos', () => {
  // Usa checkInFuturo/checkOutFuturo de `base`: con fechas fijas el test caducaba.
  const r = validarFiltros({ ...base, precioMax: 100, servicios: ['wifi'] });
  assert.equal(r.error, undefined);
  assert.equal(r.valor.destino, 'Bariloche');
});
test('rechaza destino vacío, largo o con caracteres raros', () => {
  assert.ok(validarFiltros({ destino: '' }).error);
  assert.ok(validarFiltros({ destino: 'x'.repeat(81) }).error);
  assert.ok(validarFiltros({ destino: 'Roma <script>' }).error);
});
test('rechaza huéspedes fuera de 1-20', () => {
  assert.ok(validarFiltros({ ...base, huespedes: 0 }).error);
  assert.ok(validarFiltros({ ...base, huespedes: 21 }).error);
  assert.ok(validarFiltros({ ...base, huespedes: 1.5 }).error);
});
test('rechaza precio no positivo', () => {
  assert.ok(validarFiltros({ ...base, precioMax: -5 }).error);
  assert.ok(validarFiltros({ ...base, precioMax: 'abc' }).error);
});
test('valida fechas', () => {
  assert.ok(validarFiltros({ destino: 'Bariloche', huespedes: 2 }).error);
  assert.ok(validarFiltros({ ...base, checkOut: undefined }).error);
  assert.ok(validarFiltros({ ...base, checkIn: '2026-12-05', checkOut: '2026-12-01' }).error);
  assert.ok(validarFiltros({ ...base, checkIn: 'mañana', checkOut: 'pasado' }).error);
  assert.ok(validarFiltros({ ...base, checkIn: '2026-02-31' }).error);
});
test('rechaza servicios desconocidos', () => {
  assert.ok(validarFiltros({ ...base, servicios: ['jacuzzi'] }).error);
});
