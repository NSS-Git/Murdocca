const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = vm.createContext({});
for (const file of ['case-tools.js', 'deduction-tools.js']) {
  vm.runInContext(fs.readFileSync(`${__dirname}/${file}`, 'utf8'), context);
}
const html = fs.readFileSync(`${__dirname}/index.html`, 'utf8');
function section(start, end) {
  const from = html.indexOf(start);
  const to = html.indexOf(end, from);
  assert.ok(from >= 0 && to > from, 'No se encontró el generador del juego');
  return html.slice(from, to);
}
vm.runInContext(
  section('const SUSPECTS =', 'const ROOM_COLORS =') +
  'let caseRandom;\n' + section('function shuffle(arr)', '/* =========================================================================\n       GAME START / RENDER') +
  '\nglobalThis.generate = (map, diff, seed) => { caseRandom = MurdoccaCases.createRandom(seed); return generatePuzzle(MAPS.find(m => m.id === map), DIFFICULTIES.find(d => d.id === diff)); };' +
  '\nglobalThis.characters = SUSPECTS;', context);

function checkCase(p) {
  assert.ok(p, 'La generación debe producir un caso');
  assert.equal(p.suspects.includes(p.victim.name), false);
  assert.ok(p.suspects.includes(p.killer));
  assert.equal(p.size, p.diff.size, 'La regla no debe aumentar el tablero');
  assert.equal(p.suspects.length, p.diff.n, 'La regla no debe aumentar el reparto');
  const occupiedRooms = new Set(Object.values(p.solution).map(({ r, c }) => p.roomGrid[r][c]));
  occupiedRooms.add(p.roomGrid[p.victimCell.r][p.victimCell.c]);
  assert.deepEqual([...occupiedRooms].sort(), Array.from(p.roomList, (_, i) => i).sort(), 'No puede quedar ninguna habitación vacía');
  const general = p.clues.filter(clue => clue.type === 'general');
  assert.equal(general.length, 1, 'Cada expediente debe incluir exactamente una pista general');
  assert.equal(general[0].subject, undefined);
  assert.equal(general[0].subjects, undefined);
  const allCells = [];
  for (let r = 0; r < p.size; r++) for (let c = 0; c < p.size; c++) {
    if (!p.obstacle[r][c]) allCells.push([r, c]);
  }
  const generalDomains = Object.fromEntries(p.suspects.map(name => [name, allCells.slice()]));
  general[0].apply(generalDomains);
  for (const name of p.suspects) {
    assert.ok(generalDomains[name].length < allCells.length, 'La pista general debe descartar casillas para todos');
    assert.ok(generalDomains[name].some(([r, c]) => r === p.solution[name].r && c === p.solution[name].c));
  }
  const truth = Object.fromEntries(p.suspects.map(name => [name, [[p.solution[name].r, p.solution[name].c]]]));
  for (const clue of p.clues) {
    const domains = structuredClone(truth);
    clue.apply(domains);
    assert.deepEqual(domains, truth, `La pista contradice el caso: ${clue.text}`);
  }
  const proof = context.MurdoccaDeduction.analyze(p);
  assert.equal(proof.proofComplete, true);
  for (const [name, cell] of Object.entries({ ...p.solution, [p.victim.name]: p.victimCell })) {
    assert.equal(JSON.stringify(proof.domains[name]), JSON.stringify([[cell.r, cell.c]]), `${name}: solución ambigua o incompatible`);
  }
  const together = p.suspects.filter(name => p.roomGrid[p.solution[name].r][p.solution[name].c] === p.victimRoom);
  assert.equal(JSON.stringify(together), JSON.stringify([p.killer]));
}

test('los tres mapas y cinco niveles producen pistas compatibles y una solución única', () => {
  for (const map of ['cafe', 'dental', 'lab']) {
    for (const diff of ['muy_facil', 'facil', 'medio', 'dificil', 'experto']) {
      for (const seed of [1, 42]) checkCase(context.generate(map, diff, seed));
    }
  }
});

test('todos los personajes pueden ser víctimas y culpables, incluida Mocca', () => {
  const victims = new Set(), killers = new Set();
  for (let seed = 0; seed < 120; seed++) {
    const p = context.generate('cafe', 'muy_facil', seed);
    checkCase(p);
    victims.add(p.victim.name);
    killers.add(p.killer);
  }
  assert.deepEqual([...victims].sort(), Array.from(context.characters).sort());
  assert.deepEqual([...killers].sort(), Array.from(context.characters).sort());
});

test('un código reproduce el caso y rechaza la versión anterior sin reinterpretarla', () => {
  const cases = context.MurdoccaCases;
  const code = cases.encode('cafe', 'medio', 42);
  const spec = cases.decode(code);
  const first = context.generate(spec.mapId, spec.diffId, spec.seed);
  const second = context.generate(spec.mapId, spec.diffId, spec.seed);
  const visible = p => JSON.stringify({ victim: p.victim, suspects: p.suspects, solution: p.solution, victimCell: p.victimCell, clues: p.clues.map(c => c.text), rooms: p.roomGrid, obstacle: p.obstacle, feature: p.feature });
  assert.equal(visible(first), visible(second));
  for (const version of ['MD1', 'MD2', 'MD3']) {
    assert.throws(() => cases.decode(code.replace('MD4-', `${version}-`)), /no es compatible/);
  }
});
