const test = require('node:test');
const assert = require('node:assert/strict');
require('./deduction-tools.js');

function smallCase() {
  const p = {
    size: 3,
    suspects: ['Clara', 'Jose'],
    victim: { name: 'Mocca' },
    obstacle: Array.from({ length: 3 }, () => Array(3).fill(null)),
    roomGrid: [[0, 0, 1], [2, 2, 1], [0, 0, 0]],
    roomList: ['la sala de juntas', 'el baño', 'la recepción'],
    clues: [
      { subject: 'Clara', type: 'exact', text: 'Clara estuvo en la fila 1, columna 1.',
        apply(dom) { dom.Clara = dom.Clara.filter(([r, c]) => r === 0 && c === 0); } },
      { subject: 'Jose', type: 'exact', text: 'Jose estuvo en la fila 2, columna 2.',
        apply(dom) { dom.Jose = dom.Jose.filter(([r, c]) => r === 1 && c === 1); } }
    ]
  };
  for (const key of ['solution', 'killer', 'victimCell']) {
    Object.defineProperty(p, key, { get() { throw new Error('No consultar respuestas ocultas'); } });
  }
  return p;
}

test('la persona inocente puede estar fuera de la sala de la víctima', () => {
  const p = smallCase();
  const result = MurdoccaDeduction.analyze(p);
  assert.equal(result.status, 'ok');
  assert.equal(result.proofComplete, true);
  assert.deepEqual(result.domains, { Clara: [[0, 0]], Jose: [[1, 1]], Mocca: [[2, 2]] });
});

test('una posición fijada que contradice una pista no produce una ayuda falsa', () => {
  const result = MurdoccaDeduction.analyze(smallCase(), [['2,1', 'Jose']]);
  assert.equal(result.status, 'contradiction');
  assert.equal(result.proofComplete, true);
  assert.equal(result.hint, null);
});

test('un tablero completo solo se acepta si respeta las pistas y la víctima', () => {
  const result = MurdoccaDeduction.analyze(smallCase(), [
    ['0,0', 'Clara'], ['1,1', 'Jose'], ['2,2', 'Mocca']
  ]);
  assert.equal(result.status, 'complete');
  assert.equal(result.hint, null);
  assert.deepEqual(result.domains.Mocca, [[2, 2]]);
});

test('un bloqueo sobre un obstáculo se rechaza antes de deducir', () => {
  const p = smallCase();
  p.obstacle[2][0] = 'un armario';
  const result = MurdoccaDeduction.analyze(p, [['2,0', 'Mocca']]);
  assert.equal(result.status, 'contradiction');
});
