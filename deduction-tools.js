(function () {
  'use strict';

  const MAX_SIZE = 12;
  const MAX_SEARCH_NODES = 20000;

  function cellText(id, size) {
    return `fila ${Math.floor(id / size) + 1}, columna ${(id % size) + 1}`;
  }

  function cellPairs(ids, size) {
    return ids.map(id => [Math.floor(id / size), id % size]);
  }

  function makeStep(steps, subject, clue, reason, before, after, size) {
    const afterSet = new Set(after);
    const removed = before.filter(id => !afterSet.has(id));
    if (!removed.length) return;
    steps.push({
      subject,
      clue,
      reason,
      before: before.length,
      after: after.length,
      removed: cellPairs(removed, size),
      remaining: cellPairs(after, size)
    });
  }

  function invalidStep(reason, subject = 'Tablero') {
    return [{
      subject,
      clue: 'Validación del tablero y los bloqueos',
      reason,
      before: 0,
      after: 0,
      removed: [],
      remaining: []
    }];
  }

  function prepare(p) {
    if (!p || !Array.isArray(p.suspects) || !Number.isInteger(p.size) ||
        p.size < 1 || p.size > MAX_SIZE) {
      return { error: 'El tablero o la lista de sospechosos no tiene un formato válido.' };
    }

    const size = p.size;
    const suspects = p.suspects.slice();
    const victimName = p.victim && typeof p.victim.name === 'string' && p.victim.name;
    if (!victimName) return { error: 'El caso debe identificar a su víctima.' };
    const names = suspects.concat(victimName);
    if (size !== names.length || suspects.some(name => typeof name !== 'string' || !name) ||
        new Set(names).size !== names.length) {
      return { error: 'El tamaño del tablero y los nombres de las personas deben ser coherentes y únicos.' };
    }
    if (!Array.isArray(p.obstacle) || !Array.isArray(p.roomGrid) ||
        p.obstacle.length !== size || p.roomGrid.length !== size ||
        p.obstacle.some(row => !Array.isArray(row) || row.length !== size) ||
        p.roomGrid.some(row => !Array.isArray(row) || row.length !== size)) {
      return { error: 'El tablero necesita cuadrículas de obstáculos y salas completas.' };
    }
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (p.roomGrid[r][c] === null || p.roomGrid[r][c] === undefined) {
          return { error: 'Cada casilla debe pertenecer a una sala.' };
        }
      }
    }
    const clues = p.clues === undefined ? [] : p.clues;
    if (!Array.isArray(clues) || clues.some(clue => !clue || typeof clue.apply !== 'function')) {
      return { error: 'Todas las pistas deben incluir una regla aplicable.' };
    }

    const cells = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!p.obstacle[r][c]) cells.push(r * size + c);
      }
    }
    if (!cells.length) return { error: 'No hay casillas transitables.' };
    const rooms = [...new Set(p.roomGrid.flat())];
    return { p, size, suspects, victimName, names, clues, cells, rooms };
  }

  function parseLocks(locks, context) {
    const { p, size, names, victimName } = context;
    const byName = new Map();
    const byCell = new Map();
    let iterator;
    try {
      if (locks == null) locks = [];
      iterator = locks[Symbol.iterator]();
    } catch (_) {
      return { error: 'Los bloqueos deben ser un iterable de pares ["fila,columna", nombre].' };
    }

    for (let count = 0; ; count++) {
      let item;
      try {
        item = iterator.next();
      } catch (_) {
        return { error: 'No se pudieron leer los bloqueos.' };
      }
      if (item.done) break;
      if (count >= names.length) return { error: 'Hay bloqueos duplicados o más de uno por persona.' };
      const pair = item.value;
      if (!Array.isArray(pair) || pair.length < 2 || typeof pair[0] !== 'string' ||
          typeof pair[1] !== 'string') {
        return { error: 'Cada bloqueo debe tener la forma ["fila,columna", nombre].' };
      }
      const match = /^(\d+),(\d+)$/.exec(pair[0]);
      if (!match) return { error: `La coordenada bloqueada «${pair[0]}» no es válida.` };
      const r = Number(match[1]), c = Number(match[2]);
      if (!Number.isSafeInteger(r) || !Number.isSafeInteger(c) || r < 0 || c < 0 || r >= size || c >= size) {
        return { error: `La coordenada ${pair[0]} está fuera del tablero.` };
      }
      const name = pair[1];
      if (!names.includes(name)) return { error: `«${name}» no es un sospechoso ni la víctima (${victimName}).`, subject: name };
      const id = r * size + c;
      if (p.obstacle[r][c]) return { error: `${name} está bloqueado en ${cellText(id, size)}, que contiene un obstáculo.`, subject: name };
      if (byName.has(name) || byCell.has(id)) {
        return { error: `El bloqueo de ${name} en ${cellText(id, size)} está duplicado o entra en conflicto con otro bloqueo.`, subject: name };
      }
      byName.set(name, id);
      byCell.set(id, name);
    }
    return { byName };
  }

  // Devuelve los arcos de un all-different que pertenecen a alguna asignación perfecta.
  // El tablero tiene tantas personas como filas/columnas, así que basta detectar
  // las aristas que están en el matching o en un ciclo alternante.
  function supportedAxis(domains, size, axis) {
    const n = domains.length;
    const matchValue = Array(size).fill(-1);
    const matchPerson = Array(n).fill(-1);

    function augment(person, seen) {
      for (const id of domains[person]) {
        const value = axis === 'row' ? Math.floor(id / size) : id % size;
        if (seen[value]) continue;
        seen[value] = true;
        if (matchValue[value] === -1 || augment(matchValue[value], seen)) {
          matchValue[value] = person;
          matchPerson[person] = value;
          return true;
        }
      }
      return false;
    }

    for (let person = 0; person < n; person++) {
      if (!augment(person, Array(size).fill(false))) return null;
    }

    const nodeCount = n + size;
    const graph = Array.from({ length: nodeCount }, () => []);
    for (let person = 0; person < n; person++) {
      for (const id of domains[person]) {
        const value = axis === 'row' ? Math.floor(id / size) : id % size;
        const valueNode = n + value;
        if (matchPerson[person] === value) graph[valueNode].push(person);
        else graph[person].push(valueNode);
      }
    }

    const index = Array(nodeCount).fill(-1);
    const low = Array(nodeCount).fill(-1);
    const component = Array(nodeCount).fill(-1);
    const stack = [];
    const onStack = Array(nodeCount).fill(false);
    let nextIndex = 0;
    let componentId = 0;
    function visit(node) {
      index[node] = low[node] = nextIndex++;
      stack.push(node);
      onStack[node] = true;
      for (const neighbor of graph[node]) {
        if (index[neighbor] === -1) {
          visit(neighbor);
          low[node] = Math.min(low[node], low[neighbor]);
        } else if (onStack[neighbor]) {
          low[node] = Math.min(low[node], index[neighbor]);
        }
      }
      if (low[node] === index[node]) {
        let member;
        do {
          member = stack.pop();
          onStack[member] = false;
          component[member] = componentId;
        } while (member !== node);
        componentId++;
      }
    }
    for (let node = 0; node < nodeCount; node++) {
      if (index[node] === -1) visit(node);
    }

    return domains.map((domain, person) => {
      const supported = new Set();
      for (const id of domain) {
        const value = axis === 'row' ? Math.floor(id / size) : id % size;
        if (matchPerson[person] === value || component[person] === component[n + value]) supported.add(value);
      }
      return supported;
    });
  }

  function cloneDomains(domains) {
    return domains.map(domain => domain.slice());
  }


  function solve(context, locks) {
    const { p, size, suspects, victimName, names, clues, cells, rooms } = context;
    const steps = [];
    const domains = names.map(() => cells.slice());
    const personIndex = new Map(names.map((name, index) => [name, index]));
    const suspectCount = suspects.length;
    const lockInfo = parseLocks(locks, context);
    if (lockInfo.error) {
      const reason = lockInfo.error;
      const failed = invalidStep(reason, lockInfo.subject || 'Bloqueos');
      return { status: 'contradiction', steps: failed, domains: Object.fromEntries(names.map(name => [name, cellPairs(cells, size)])), hint: null, proofComplete: true, reason };
    }
    const lockedNames = lockInfo.byName;

    for (const [name, id] of lockedNames) {
      const index = personIndex.get(name);
      const before = domains[index].slice();
      domains[index] = before.includes(id) ? [id] : [];
      makeStep(steps, name, 'Bloqueo del usuario', `El bloqueo fija a ${name} en ${cellText(id, size)}.`, before, domains[index], size);
    }

    let recordConflicts = true;
    function conflict(reason, subject = 'Regla del tablero', clue = 'Reglas del tablero') {
      if (recordConflicts) {
        steps.push({ subject, clue, reason, before: 0, after: 0, removed: [], remaining: [] });
      }
      return reason;
    }

    function propagate(current, record) {
      const maxRounds = names.length * cells.length + 2;
      let changed = true;
      let round = 0;
      while (changed && round++ < maxRounds) {
        changed = false;
        for (const clue of clues) {
          const before = current.slice();
          const clueDomains = {};
          for (let i = 0; i < suspectCount; i++) {
            clueDomains[suspects[i]] = current[i].map(id => [Math.floor(id / size), id % size]);
          }
          try {
            clue.apply(clueDomains);
          } catch (_) {
            return { error: conflict(`No se pudo aplicar la pista «${String(clue.text || clue.type || 'sin texto')}».`, 'Pistas', String(clue.text || 'Pista')) };
          }
          for (let i = 0; i < suspectCount; i++) {
            const raw = clueDomains[suspects[i]];
            const allowed = new Set();
            if (Array.isArray(raw)) {
              for (const cell of raw) {
                if (!Array.isArray(cell) || cell.length < 2 || !Number.isInteger(cell[0]) || !Number.isInteger(cell[1])) continue;
                const [r, c] = cell;
                if (r >= 0 && c >= 0 && r < size && c < size && !p.obstacle[r][c]) allowed.add(r * size + c);
              }
            }
            current[i] = before[i].filter(id => allowed.has(id));
            if (current[i].length !== before[i].length) {
              changed = true;
              if (record) {
                const text = typeof clue.text === 'string' ? clue.text : 'Pista del caso';
                makeStep(steps, suspects[i], text, `La casilla no satisface la condición de la pista «${text}».`, before[i], current[i], size);
              }
            }
            if (!current[i].length) {
              return { error: conflict(`Las pistas dejan a ${suspects[i]} sin ninguna casilla posible.`, suspects[i], typeof clue.text === 'string' ? clue.text : 'Pista del caso') };
            }
          }
        }

        for (const axis of ['row', 'col']) {
          const supported = supportedAxis(current, size, axis);
          if (!supported) {
            const label = axis === 'row' ? 'filas' : 'columnas';
            return { error: conflict(`No existe una asignación de ${label} distintos para todas las personas; los bloqueos y las pistas son incompatibles.`, 'Regla del tablero', `Unicidad de ${label}`) };
          }
          for (let i = 0; i < current.length; i++) {
            const before = current[i].slice();
            const supportedValues = supported[i];
            current[i] = before.filter(id => supportedValues.has(axis === 'row' ? Math.floor(id / size) : id % size));
            if (current[i].length !== before.length) {
              changed = true;
              if (record) {
                const axisName = axis === 'row' ? 'fila' : 'columna';
                const reason = `No hay una asignación de ${axis === 'row' ? 'filas' : 'columnas'} distintas para todas las personas si ${names[i]} ocupa esa ${axisName}.`;
                makeStep(steps, names[i], `Regla de ${axis === 'row' ? 'filas' : 'columnas'} únicas`, reason, before, current[i], size);
              }
            }
            if (!current[i].length) {
              return { error: conflict(`${names[i]} no conserva ninguna posición compatible con la regla de ${axis === 'row' ? 'filas' : 'columnas'} únicas.`, names[i], `Regla de ${axis === 'row' ? 'filas' : 'columnas'} únicas`) };
            }
          }
        }

        const victimIndex = personIndex.get(victimName);
        for (let i = 0; i < current.length; i++) {
          const before = current[i].slice();
          current[i] = before.filter(id => {
            const targetRoom = p.roomGrid[Math.floor(id / size)][id % size];
            if (i === victimIndex) {
              let forced = 0, possible = 0;
              for (let suspectIndex = 0; suspectIndex < suspectCount; suspectIndex++) {
                let hasInside = false, hasOutside = false;
                for (const suspectId of current[suspectIndex]) {
                  const room = p.roomGrid[Math.floor(suspectId / size)][suspectId % size];
                  if (room === targetRoom) hasInside = true;
                  else hasOutside = true;
                }
                if (hasInside && !hasOutside) forced++;
                if (hasInside) possible++;
              }
              return forced <= 1 && possible >= 1;
            }
            // A suspect may be innocent: their cell need not share the victim's room.
            // Keep it if any possible victim room can contain exactly one suspect,
            // counting this candidate as inside or outside that particular room.
            const victimRooms = new Set(current[victimIndex].map(victimId =>
              p.roomGrid[Math.floor(victimId / size)][victimId % size]));
            for (const victimRoom of victimRooms) {
              let forced = targetRoom === victimRoom ? 1 : 0;
              let possible = forced;
              for (let suspectIndex = 0; suspectIndex < suspectCount; suspectIndex++) {
                if (suspectIndex === i) continue;
                let inside = false, outside = false;
                for (const suspectId of current[suspectIndex]) {
                  if (p.roomGrid[Math.floor(suspectId / size)][suspectId % size] === victimRoom) inside = true;
                  else outside = true;
                }
                if (inside) possible++;
                if (inside && !outside) forced++;
              }
              if (forced <= 1 && possible >= 1) return true;
            }
            return false;
          });
          if (current[i].length !== before.length) {
            changed = true;
            if (record) {
              makeStep(steps, names[i], 'Regla de la sala de la víctima',
                `La casilla no permite que exactamente un sospechoso comparta la sala de la víctima.`,
                before, current[i], size);
            }
          }
          if (!current[i].length) {
            return { error: conflict(`${names[i]} no tiene una posición compatible con la regla de que exactamente un sospechoso comparta la sala de la víctima.`, names[i], 'Regla de la sala de la víctima') };
          }
        }

        // La víctima comparte sala con un sospechoso: toda sala necesita uno.
        for (const room of rooms) {
          let candidate = -1, possible = 0;
          for (let i = 0; i < suspectCount; i++) {
            if (current[i].some(id => p.roomGrid[Math.floor(id / size)][id % size] === room)) {
              candidate = i;
              possible++;
            }
          }
          const roomLabel = Array.isArray(p.roomList) && p.roomList[room] ? p.roomList[room] : `la sala ${String(room)}`;
          if (!possible) {
            return { error: conflict(`Ningún sospechoso puede ocupar ${roomLabel}; ninguna habitación debe quedar vacía.`, 'Habitaciones', 'Habitaciones ocupadas') };
          }
          if (possible === 1) {
            const before = current[candidate];
            current[candidate] = before.filter(id => p.roomGrid[Math.floor(id / size)][id % size] === room);
            if (current[candidate].length !== before.length) {
              changed = true;
              if (record) makeStep(steps, names[candidate], 'Habitaciones ocupadas',
                `${names[candidate]} es el único sospechoso que puede ocupar ${roomLabel}; esa habitación no puede quedar vacía.`,
                before, current[candidate], size);
            }
          }
        }
      }
      if (changed) {
        return { error: conflict('La propagación alcanzó su límite seguro sin estabilizar los dominios.', 'Motor de deducción') };
      }
      return { error: null };
    }

    function completeAssignment(current) {
      const assigned = current.map(domain => domain[0]);
      const usedRows = new Set(), usedCols = new Set();
      for (const id of assigned) {
        const r = Math.floor(id / size), c = id % size;
        if (p.obstacle[r][c] || usedRows.has(r) || usedCols.has(c)) return false;
        usedRows.add(r); usedCols.add(c);
      }
      let sameRoom = 0;
      const victimId = assigned[personIndex.get(victimName)];
      const victimRoom = p.roomGrid[Math.floor(victimId / size)][victimId % size];
      for (let i = 0; i < suspectCount; i++) {
        const id = assigned[i];
        if (p.roomGrid[Math.floor(id / size)][id % size] === victimRoom) sameRoom++;
      }
      if (sameRoom !== 1) return false;
      const occupiedRooms = new Set(assigned.map(id => p.roomGrid[Math.floor(id / size)][id % size]));
      if (rooms.some(room => !occupiedRooms.has(room))) return false;
      const clueDomains = {};
      for (let i = 0; i < suspectCount; i++) {
        clueDomains[suspects[i]] = [[Math.floor(assigned[i] / size), assigned[i] % size]];
      }
      for (const clue of clues) {
        try {
          clue.apply(clueDomains);
        } catch (_) {
          return false;
        }
        for (let i = 0; i < suspectCount; i++) {
          const cellsForPerson = clueDomains[suspects[i]];
          if (!Array.isArray(cellsForPerson) || !cellsForPerson.some(cell =>
            Array.isArray(cell) && cell[0] === Math.floor(assigned[i] / size) && cell[1] === assigned[i] % size)) return false;
        }
      }
      return true;
    }

    const initialPropagation = propagate(domains, true);
    if (initialPropagation.error) {
      return {
        status: 'contradiction', steps, domains: Object.fromEntries(names.map((name, i) => [name, cellPairs(domains[i], size)])),
        hint: null, proofComplete: true, reason: initialPropagation.error
      };
    }

    const rootDomains = cloneDomains(domains);
    const allNamesLocked = lockedNames.size === names.length;
    let nodes = 0;
    let searchComplete = true;
    let solutionCount = 0;
    let uniqueAssignment = null;
    const supportedSolutions = names.map(() => new Set());

    function search(current) {
      if (nodes >= MAX_SEARCH_NODES) {
        searchComplete = false;
        return;
      }
      nodes++;
      const propagation = propagate(current, false);
      if (propagation.error) return;
      let branch = -1;
      let bestLength = Infinity;
      for (let i = 0; i < current.length; i++) {
        if (current[i].length > 1 && current[i].length < bestLength) {
          branch = i;
          bestLength = current[i].length;
        }
      }
      if (branch === -1) {
        if (!completeAssignment(current)) return;
        solutionCount++;
        const assignment = current.map(domain => domain[0]);
        if (solutionCount === 1) uniqueAssignment = assignment;
        for (let i = 0; i < assignment.length; i++) supportedSolutions[i].add(assignment[i]);
        return;
      }
      const options = current[branch].slice();
      for (const id of options) {
        if (!searchComplete) return;
        const next = cloneDomains(current);
        next[branch] = [id];
        search(next);
      }
    }

    if (allNamesLocked) {
      if (completeAssignment(domains)) {
        solutionCount = 1;
        uniqueAssignment = domains.map(domain => domain[0]);
        uniqueAssignment.forEach((id, i) => supportedSolutions[i].add(id));
      }
    } else {
      recordConflicts = false;
      search(cloneDomains(rootDomains));
      recordConflicts = true;
    }

    if (searchComplete && solutionCount === 0) {
      const reason = conflict('La búsqueda exhaustiva no encuentra ninguna colocación que satisfaga a la vez todas las pistas, las filas y columnas únicas y la regla de la sala de la víctima.', 'Reglas del tablero', 'Comprobación exhaustiva');
      return {
        status: 'contradiction', steps, domains: Object.fromEntries(names.map((name, i) => [name, cellPairs(rootDomains[i], size)])),
        hint: null, proofComplete: true, reason
      };
    }

    let finalDomains = cloneDomains(rootDomains);
    if (searchComplete && solutionCount > 0) {
      finalDomains = names.map((_, i) => rootDomains[i].filter(id => supportedSolutions[i].has(id)));
      for (let i = 0; i < names.length; i++) {
        makeStep(steps, names[i], 'Comprobación exhaustiva de alternativas',
          `Al probar cada casilla descartada para ${names[i]}, todas las continuaciones compatibles terminan en contradicción.`,
          rootDomains[i], finalDomains[i], size);
      }
    }

    const domainsObject = Object.fromEntries(names.map((name, i) => [name, cellPairs(finalDomains[i], size)]));
    const status = allNamesLocked ? 'complete' : 'ok';
    const hint = buildHint({ names, suspects, victimName, size, p, rootDomains, finalDomains, steps, lockedNames, searchComplete, solutionCount });
    return { status, steps, domains: domainsObject, hint, proofComplete: searchComplete, searchNodes: nodes };
  }

  function buildHint(state) {
    const { names, suspects, victimName, size, p, rootDomains, finalDomains, steps, lockedNames, searchComplete } = state;
    const unlocked = names.map((name, i) => ({ name, i })).filter(({ name }) => !lockedNames.has(name));
    if (!unlocked.length) return null;

    function subjectStep(name) {
      for (let j = steps.length - 1; j >= 0; j--) {
        if (steps[j].subject === name && steps[j].removed.length) return steps[j];
      }
      return null;
    }

    let choices = unlocked.filter(({ i }) => finalDomains[i].length === 1);
    if (!choices.length) choices = unlocked.filter(({ i }) => finalDomains[i].length < rootDomains[i].length);
    if (!choices.length) choices = unlocked;
    choices.sort((a, b) => finalDomains[a.i].length - finalDomains[b.i].length || a.i - b.i);
    const selected = choices[0];
    const { name, i } = selected;
    const step = subjectStep(name);
    let excluded = null;
    let exclusionReason = '';

    if (step && step.removed.length) {
      const candidate = step.removed[0];
      excluded = candidate;
      exclusionReason = step.reason;
    } else {
      const free = new Set(rootDomains[i]);
      const supported = new Set(finalDomains[i]);
      for (const id of free) {
        if (!supported.has(id)) {
          excluded = [Math.floor(id / size), id % size];
          exclusionReason = `Al comprobar todas las continuaciones compatibles con las pistas y reglas, ninguna admite a ${name} en ${cellText(id, size)}.`;
          break;
        }
      }
    }

    let focus;
    if (step && step.clue && step.clue !== 'Comprobación exhaustiva de alternativas' && step.clue !== 'Regla de filas únicas') {
      focus = `Vuelve a leer la pista «${step.clue}» y comprueba cómo encaja con las reglas de filas, columnas y salas.`;
    } else {
      focus = `Compara las pistas de ${name} con las reglas de filas, columnas y la sala de la víctima.`;
    }

    let exclusion;
    if (excluded) {
      const [r, c] = excluded;
      exclusion = `${name} no puede estar en la fila ${r + 1}, columna ${c + 1}: ${exclusionReason}`;
    } else {
      // Obstáculos son parte de las reglas del tablero, no anotaciones del jugador.
      let obstacleCell = null;
      for (let r = 0; r < size && !obstacleCell; r++) {
        for (let c = 0; c < size; c++) {
          if (p.obstacle[r][c]) { obstacleCell = [r, c]; break; }
        }
      }
      if (obstacleCell) {
        exclusion = `${name} no puede estar en la fila ${obstacleCell[0] + 1}, columna ${obstacleCell[1] + 1}: esa casilla contiene un obstáculo.`;
      } else {
        exclusion = `${name} no puede ocupar una casilla que ya está asignada a otra persona, porque cada fila y columna son únicas.`;
      }
    }

    let deduction;
    if (finalDomains[i].length === 1) {
      const id = finalDomains[i][0];
      const why = searchComplete && state.solutionCount === 1
        ? 'las demás alternativas llevan a contradicción al comprobar todas las reglas'
        : step ? step.reason : 'las reglas del tablero eliminan las demás alternativas';
      deduction = `${name} queda en la ${cellText(id, size)}: ${why}.`;
    } else if (excluded) {
      const [r, c] = excluded;
      deduction = `Una conclusión segura es que ${name} no ocupa la fila ${r + 1}, columna ${c + 1}: ${exclusionReason}`;
    } else {
      deduction = exclusion;
    }

    return { subject: name, focus, exclusion, deduction };
  }

  function analyze(p, locks = []) {
    const context = prepare(p);
    if (context.error) {
      return { status: 'contradiction', steps: invalidStep(context.error), domains: {}, hint: null, proofComplete: true, reason: context.error };
    }
    return solve(context, locks);
  }

  function explain(p) {
    const result = analyze(p, []);
    if (result.status === 'contradiction') {
      const reason = result.reason || (result.steps.length ? result.steps[result.steps.length - 1].reason : 'Las reglas son incompatibles.');
      return [`Las pistas y las reglas del tablero son incompatibles: ${reason}`];
    }
    const lines = [];
    for (const step of result.steps) {
      if (step.clue === 'Bloqueo del usuario') continue;
      if (!step.removed.length) continue;
      const sample = step.removed.slice(0, 3).map(([r, c]) => `fila ${r + 1}, columna ${c + 1}`).join('; ');
      const remaining = step.remaining.length === 1
        ? ` Solo queda la fila ${step.remaining[0][0] + 1}, columna ${step.remaining[0][1] + 1}.`
        : '';
      const reason = step.reason.startsWith('La casilla no satisface la condición de la pista')
        ? 'Las demás casillas no cumplen esa pista.'
        : step.reason;
      const clueLabel = step.clue === 'Comprobación exhaustiva de alternativas' || step.clue === 'Regla de filas únicas'
        ? ''
        : `«${step.clue}». `;
      lines.push(`${step.subject}: ${clueLabel}Quedan ${step.after} de las ${step.before} posibilidades anteriores. ${reason} Se descarta${step.removed.length > 1 ? 'n' : ''}, por ejemplo: ${sample}.${remaining}`);
    }

    if (!result.proofComplete) {
      lines.push('La búsqueda alcanzó su límite de trabajo antes de revisar todas las alternativas; por eso esta explicación no afirma que haya una solución única.');
      return lines;
    }

    const context = prepare(p);
    if (context.error) return lines;
    const { size, suspects, victimName } = context;
    const positions = new Map();
    for (const name of context.names) {
      const domain = result.domains[name];
      if (!Array.isArray(domain) || domain.length !== 1) {
        lines.push('Las reglas conservan más de una colocación posible, así que no se puede concluir un culpable único.');
        return lines;
      }
      positions.set(name, domain[0]);
    }

    if (result.searchNodes > 1) {
      lines.push('La comprobación exhaustiva revisó las combinaciones restantes que respetan las pistas y las reglas; las alternativas distintas de las que siguen terminan en contradicción.');
    }
    const usedRows = new Set(), usedCols = new Set();
    for (const name of suspects) {
      const [r, c] = positions.get(name);
      usedRows.add(r); usedCols.add(c);
      lines.push(`${name} queda en la fila ${r + 1}, columna ${c + 1}.`);
    }

    const freeRows = Array.from({ length: size }, (_, i) => i).filter(row => !usedRows.has(row));
    const freeCols = Array.from({ length: size }, (_, i) => i).filter(col => !usedCols.has(col));
    if (freeRows.length !== 1 || freeCols.length !== 1) {
      lines.push('No queda exactamente una fila y una columna libres; no se puede derivar aquí la posición de la víctima.');
      return lines;
    }
    const victimCell = [freeRows[0], freeCols[0]];
    const victimRoom = p.roomGrid[victimCell[0]][victimCell[1]];
    const roomName = Array.isArray(p.roomList) ? p.roomList[victimRoom] : null;
    const roomLabel = typeof roomName === 'string' && roomName ? roomName : `la sala ${String(victimRoom)}`;
    lines.push(`Como hay una persona por fila y columna, la única fila libre (${freeRows[0] + 1}) y la única columna libre (${freeCols[0] + 1}) fijan a ${victimName} en su intersección, ${cellText(victimCell[0] * size + victimCell[1], size)}.`);
    lines.push('Ninguna habitación queda vacía: la colocación final incluye al menos un personaje en cada sala.');

    const together = suspects.filter(name => {
      const [r, c] = positions.get(name);
      return p.roomGrid[r][c] === victimRoom;
    });
    if (together.length === 1) {
      lines.push(`${victimName} está en ${roomLabel}; la regla exige exactamente un sospechoso en esa sala. La única persona que comparte esa sala con la víctima es ${together[0]}; por tanto, ${together[0]} es culpable.`);
    } else {
      lines.push(`La regla de la sala de la víctima no identifica un sospechoso único en ${roomLabel}; no se puede concluir un culpable único.`);
    }
    return lines;
  }

  globalThis.MurdoccaDeduction = { analyze, explain };
})();
