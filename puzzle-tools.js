(function (root) {
  "use strict";
  let caseRandom = Math.random;
    const SUSPECTS = ["Clara", "Nono", "Gema", "María", "Victoria", "Inma", "Raquel", "Alicia", "Cris", "Mario", "Jose", "Mocca"];
    const SUSPECT_CODES = {
      "Gema": "GE", "María": "MA", "Victoria": "VI", "Nono": "NO", "Inma": "IN",
      "Raquel": "RA", "Alicia": "AL", "Cris": "CR", "Mario": "MR", "Jose": "JO", "Clara": "CL", "Mocca": "MO"
    };
    const SUSPECT_COLORS = {
      "Clara": "#5c7a8a",
      "Gema": "#9e4934",
      "María": "#315f47",
      "Victoria": "#d4a03b",
      "Nono": "#6c3057",
      "Inma": "#317775",
      "Raquel": "#d7b899",
      "Alicia": "#184478",
      "Cris": "#bd5b3d",
      "Mario": "#d29a43",
      "Jose": "#bf928d",
      "Mocca": "#3c5c5c"
    };
    function nextVictim() {
      const name = SUSPECTS[rnd(SUSPECTS.length)];
      const female = ["Clara", "Gema", "María", "Victoria", "Inma", "Raquel", "Alicia", "Mocca"].includes(name);
      return { name, emoji: name === "Mocca" ? "🐾" : "†", found: female ? "hallada" : "hallado", pronoun: female ? "ella" : "él" };
    }

    const MAPS = [
      {
        id: "cafe", emoji: "🚂", name: "CAF",
        desc: "",
        rooms: [
          { name: "la sala de juntas", obstacles: ["🚇 la maqueta del tranvía de Granada", "🎄 el arbol de navidad", "🖥️ el proyector"], features: ["🪑 la silla", "🗺️ el mapa del Cairo", "🗺️ el mapa de Marruecos"] },
          { name: "el departamento de diseño", obstacles: ["🗺️ los planos de Reichshoffen", "👧🏽 la niña mala", "🗄️ el archivador"], features: ["📋 el despido de maite", "🪑 la silla", "💻 el portátil"] },
          { name: "la sala de maquetas", obstacles: ["🚇 la maqueta del tranvía de Reichshoffen", "📦 las piezas"], features: ["🗺️ el mapa del Cairo", "🗺️ el mapa de Marruecos"] },
          { name: "la mazmorra de Pedro el informático", obstacles: ["👨🏻 Pedro el informático"], features: ["🔋 las pilas robadas", "💻 el portátil", "💼 la mochila"] },
          { name: "la recepción", obstacles: ["👩🏻 Maite", "🗄️ el archivador"], features: ["🪑 la silla", "💻 el portátil"] },
          { name: "la cafetería", obstacles: ["🥤 la máquina de café", "🧽 un trapo sucio de las limpiadoras"], features: ["☕ el café del Vander", "🥪 el sándwich"] },
          { name: "el baño", obstacles: ["🧽 un trapo sucio de las limpiadoras"], features: ["🚽 el retrete sin agua", "🧼 el lavabo"] }
        ]
      },
      {
        id: "dental", emoji: "🦷", name: "Moradent",
        desc: "",
        rooms: [
          { name: "la sala de espera", obstacles: ["🛕 un buddha", "🗄️ el archivador"], features: ["🪑 la silla", "🖼️ el póster de Gongo", "🗒 los post-its del hada"] },
          { name: "la consulta", obstacles: ["☢️ la máquina de rayos X"], features: ["🛏️ la camilla", "🗒 los post-its del hada"] },
          { name: "el baño", obstacles: ["📦 la caja de mascarillas"], features: ["🚽 el retrete", "🧼 el lavabo"] },
          { name: "el salon de Gema", obstacles: ["🔱 un cuerno de ciervo", "🎃 la manta de stranger things"], features: ["🖥️ la tele", "🛋 el sofá", "🗒 los post-its del hada"] },
          { name: "el laboratorio", obstacles: ["✂ las tijeras (de D.C)", "☢️ la máquina de rayos X"], features: ["🔬 el microscopio del señor Moles", "🦯 el látigo del señor Moles", "🗒 los post-its del hada"] },
          { name: "el almacén", obstacles: ["📦 la caja de kemphor", "🗄️ el archivador"], features: ["🗒 los post-its del hada"] },
          { name: "el recibidor", obstacles: ["🛕 un buddha"], features: ["🗒 los post-its del hada", "🪑 la silla", "📞 el teléfono de citas"] }
        ]
      },
      {
        id: "lab", emoji: "🧪", name: "Laboratorio de edafología",
        desc: "",
        rooms: [
          { name: "la sala de muestras", obstacles: ["🦽 la barbie negra"], features: ["🧪 las muestras", "🔬 el microscopio", "🗒 los post-its del hada"] },
          { name: "la cámara frigorífica", obstacles: ["🧊 el congelador"], features: ["🥼 la bata", "🗒 los post-its del hada"] },
          { name: "la sala de análisis", obstacles: ["🦕 Stifen"], features: ["🚿 la pileta", "🔬 el microscopio", "🗒 los post-its del hada"] },
          { name: "la oficina de María", obstacles: ["👱🏻‍♀️ Ana", "📚 los libros del National Geographic"], features: ["💻 el escritorio", "📋 los apuntes", "🗒 los post-its del hada"] },
          { name: "el almacén", obstacles: ["🧯 el extintor", "🌱 el poto"], features: ["👽 el smiski", "📷 la polaroid", "🗒 los post-its del hada"] },
          { name: "la sala de incubación", obstacles: ["🥚 la incubadora"], features: ["🌀 la centrifugadora", "🗒 los post-its del hada"] }
        ]
      }
    ];

    // Referencia: https://murdoku.com/play/ (Muy fácil, Fácil, Medio, Difícil, Experto).
    // Adaptación procedural, no una reproducción de sus casos ni de su calibración:
    // size = n + 1 reserva un eje para la víctima; Experto utiliza todo el reparto.
    const DIFFICULTIES = [
      { id: "muy_facil", name: "Muy fácil", n: 4, size: 5, types: ["exact", "room", "feature", "beside", "row_only", "col_only"], maxExact: 1, minimize: false, relational: false },
      { id: "facil", name: "Fácil", n: 5, size: 6, types: ["room", "feature", "beside", "row_only", "col_only", "half"], maxExact: 0, minimize: false, relational: false },
      { id: "medio", name: "Medio", n: 7, size: 8, types: ["room", "feature", "beside", "compareRow", "compareCol", "row_only", "col_only", "half"], maxExact: 0, minimize: true, relational: true },
      { id: "dificil", name: "Difícil", n: 9, size: 10, types: ["compareRow", "compareCol", "beside", "room", "feature", "half"], maxExact: 0, minimize: true, relational: true },
      { id: "experto", name: "Experto", n: 11, size: 12, types: ["compareRow", "compareCol", "beside", "room", "feature"], maxExact: 0, minimize: true, relational: true }
    ];

    const ROOM_STOPWORDS = new Set(['de', 'del', 'la', 'los', 'las', 'y', 'en', 'a', 'al', 'el']);
    function computeRoomCode(name) {
      const clean = name.replace(/\s*\(.*\)\s*$/, '');
      const words = clean.split(/\s+/).filter(w => !ROOM_STOPWORDS.has(w.toLowerCase()));
      let code = words.map(w => w[0].toUpperCase()).join('').slice(0, 3);
      if (code.length < 2) code = clean.replace(/\s+/g, '').slice(0, 3).toUpperCase();
      return code;
    }

    function shuffle(arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(caseRandom() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; }
    function rnd(n) { return Math.floor(caseRandom() * n); }
    function buildRooms(size, roomNames) {
      const targetCount = roomNames.length;
      const roomGrid = Array.from({ length: size }, () => Array(size).fill(-1));
      const roomsData = Array.from({ length: targetCount }, () => ({ cells: [], r0: size, r1: 0, c0: size, c1: 0 }));

      // 1. Colocar las "semillas" iniciales de cada área en posiciones aleatorias
      let seeds = [];
      let attempts = 0;
      while (seeds.length < targetCount && attempts < 500) {
        attempts++;
        const r = rnd(size), c = rnd(size);
        if (!seeds.some(s => s.r === r && s.c === c)) {
          seeds.push({ r, c, id: seeds.length });
        }
      }

      // Si por tamaño del tablero no caben todas las semillas distintas, rellenamos las que falten
      while (seeds.length < targetCount) {
        for (let r = 0; r < size; r++) {
          for (let c = 0; c < size; c++) {
            if (seeds.length < targetCount && !seeds.some(s => s.r === r && s.c === c)) {
              seeds.push({ r, c, id: seeds.length });
            }
          }
        }
      }

      // Registrar semillas en la retícula
      seeds.forEach(s => {
        roomGrid[s.r][s.c] = s.id;
        roomsData[s.id].cells.push([s.r, s.c]);
        updateBounds(roomsData[s.id], s.r, s.c);
      });

      function updateBounds(room, r, c) {
        if (r < room.r0) room.r0 = r;
        if (r + 1 > room.r1) room.r1 = r + 1;
        if (c < room.c0) room.c0 = c;
        if (c + 1 > room.c1) room.c1 = c + 1;
      }

      // 2. Crecimiento orgánico celda a celda (tipo Voronoi aleatorio)
      let changed = true;
      while (changed) {
        changed = false;
        // Barajamos el orden de las salas en cada ciclo para que el crecimiento sea caótico y no simétrico
        const currentRooms = shuffle([...Array(targetCount).keys()]);

        for (const id of currentRooms) {
          const room = roomsData[id];
          const frontiers = [];

          // Buscar celdas libres adyacentes a las actuales de esta sala
          room.cells.forEach(([r, c]) => {
            const neighbors = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
            neighbors.forEach(([nr, nc]) => {
              if (nr >= 0 && nr < size && nc >= 0 && nc < size && roomGrid[nr][nc] === -1) {
                frontiers.push([nr, nc]);
              }
            });
          });

          // Expandir aleatoriamente algunas de las celdas fronterizas
          shuffle(frontiers).forEach(([nr, nc]) => {
            // Doble comprobación por si otra sala la ocupó en este mismo microciclo
            if (roomGrid[nr][nc] === -1) {
              // Añadimos un factor de aleatoriedad alta para que no crezcan de forma uniforme
              if (caseRandom() < 0.75) {
                roomGrid[nr][nc] = id;
                room.cells.push([nr, nc]);
                updateBounds(room, nr, nc);
                changed = true;
              }
            }
          });
        }
      }

      // 3. Rellenar cualquier hueco huérfano que haya podido quedar suelto
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (roomGrid[r][c] === -1) {
            // Asignarlo a la sala vecina más cercana o a la 0 por defecto
            roomGrid[r][c] = 0;
            roomsData[0].cells.push([r, c]);
            updateBounds(roomsData[0], r, c);
          }
        }
      }

      // 4. Preparar nombres y rectángulos delimitadores finales para las etiquetas
      const roomList = [];
      const roomRects = roomsData.map((room, idx) => {
        const baseName = roomNames[idx % roomNames.length];
        const suffix = idx >= roomNames.length ? ` (${Math.floor(idx / roomNames.length) + 1})` : '';
        roomList.push(baseName + suffix);

        // Devolvemos los límites máximos (bounding box) de cada sala orgánica para colocar su etiqueta
        return { r0: room.r0, r1: room.r1, c0: room.c0, c1: room.c1 };
      });

      return { roomGrid, roomList, roomRects };
    }
    // Función auxiliar para identificar si un objeto es común y puede repetirse hasta 3 veces
    function isCommonItem(name) {
      if (!name) return false;
      const clean = name.toLowerCase();
      return clean.includes("silla") ||
        clean.includes("post-it") ||
        clean.includes("portátil") ||
        clean.includes("portatil") ||
        clean.includes("caja") ||
        clean.includes("café") ||
        clean.includes("sándwich") ||
        clean.includes("bata") ||
        clean.includes("muestra") ||
        clean.includes("pila") ||
        clean.includes("pieza");
    }

    function tryGenerate(mapDef, diff) {
      const size = diff.size;
      const N = diff.n;
      const victim = nextVictim();
      const suspects = shuffle(SUSPECTS.filter(name => name !== victim.name)).slice(0, N);

      // Víctima y culpable comparten sala: como máximo hay N salas ocupadas.
      const caseRooms = mapDef.rooms.length > N ? shuffle(mapDef.rooms).slice(0, N) : mapDef.rooms;
      const roomNames = caseRooms.map(r => typeof r === 'string' ? r : r.name);
      const { roomGrid, roomList, roomRects } = buildRooms(size, roomNames);

      // Auxiliares para consultar objetos/rasgos de la sala según la casilla
      const getRoomObj = (rIdx) => caseRooms[rIdx];
      const getRoomObsList = (rIdx) => {
        const room = getRoomObj(rIdx);
        return (room && room.obstacles) ? room.obstacles : (mapDef.obstacles || []);
      };
      const getRoomFeatList = (rIdx) => {
        const room = getRoomObj(rIdx);
        return (room && room.features) ? room.features : (mapDef.features || []);
      };

      // Listas de objetos únicos obligatorios (con sus emojis exactos)
      const GUARANTEED_OBS = ["👧🏽 la niña mala", "👩🏻 Maite", "🛎️ mostrador de recepción", "✂ tijeras (de D.C)", "🦽 barbie negra", "🦕 Stifen", "👱🏻‍♀️ Ana", "🎃 manta de stranger things", "✂ las tijeras (de D.C)"];
      const GUARANTEED_FEAT = ["📋 despido de maite", "🖼️ póster de Gongo", "🔬 microscopio del señor Moles", "📷 la polaroid", "👽 el smiski", "🦯 el látigo del señor Moles"];

      // Solo se colocan objetos de las habitaciones presentes en este expediente.
      const allMapObstacles = [...new Set(caseRooms.flatMap(r => typeof r === 'object' && r.obstacles ? r.obstacles : (mapDef.obstacles || [])))];
      const allMapFeatures = [...new Set(caseRooms.flatMap(r => typeof r === 'object' && r.features ? r.features : (mapDef.features || [])))];

      const usedUniqueObs = new Set();
      const usedUniqueFeat = new Set();
      const obsCounts = {};
      const featCounts = {};

      // --- 1. OBSTÁCULOS ---
      const obstacle = Array.from({ length: size }, () => Array(size).fill(null));
      const totalCells = size * size;
      const obstacleCount = Math.floor(totalCells * 0.15);
      let placedObs = 0;

      // A) Colocar obstáculos obligatorios (GUARANTEED_OBS) prioritariamente en su sala
      const mapGuaranteedObs = allMapObstacles.filter(o => GUARANTEED_OBS.includes(o));

      for (const obs of mapGuaranteedObs) {
        let placed = false;
        let localGuard = 0;
        while (!placed && localGuard < 1000) {
          localGuard++;
          const r = rnd(size), c = rnd(size);
          if (!obstacle[r][c]) {
            const allowedObs = getRoomObsList(roomGrid[r][c]);
            if (allowedObs.includes(obs) || localGuard > 500) { // Fallback si no hay hueco en su sala
              obstacle[r][c] = obs;
              usedUniqueObs.add(obs);
              obsCounts[obs] = (obsCounts[obs] || 0) + 1;
              placed = true;
              placedObs++;
            }
          }
        }
      }

      // B) Rellenar la densidad de obstáculos restante (Comunes: máx 3 | Únicos: máx 1)
      let guardObs = 0;
      while (placedObs < obstacleCount && guardObs < 5000) {
        guardObs++;
        const r = rnd(size), c = rnd(size);
        if (!obstacle[r][c]) {
          const roomObs = getRoomObsList(roomGrid[r][c]);
          const candidates = roomObs.filter(o => {
            if (isCommonItem(o)) {
              return (obsCounts[o] || 0) < 3;
            } else {
              return !usedUniqueObs.has(o);
            }
          });

          if (candidates.length > 0) {
            const candidate = candidates[rnd(candidates.length)];
            obstacle[r][c] = candidate;
            obsCounts[candidate] = (obsCounts[candidate] || 0) + 1;
            if (!isCommonItem(candidate)) {
              usedUniqueObs.add(candidate);
            }
            placedObs++;
          }
        }
      }

      // --- 2. RASGOS (FEATURES) ---
      const feature = Array.from({ length: size }, () => Array(size).fill(null));
      const freeCells = [];
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (!obstacle[r][c]) freeCells.push([r, c]);
        }
      }

      const featCount = Math.floor(freeCells.length * 0.18);
      const shuffledFree = shuffle(freeCells);
      let placedFeat = 0;

      // A) Colocar rasgos obligatorios (GUARANTEED_FEAT)
      const mapGuaranteedFeat = allMapFeatures.filter(f => GUARANTEED_FEAT.includes(f));

      for (const feat of mapGuaranteedFeat) {
        let placed = false;
        for (let i = 0; i < shuffledFree.length; i++) {
          const [r, c] = shuffledFree[i];
          if (!feature[r][c]) {
            const allowedFeat = getRoomFeatList(roomGrid[r][c]);
            if (allowedFeat.includes(feat)) {
              feature[r][c] = feat;
              usedUniqueFeat.add(feat);
              featCounts[feat] = (featCounts[feat] || 0) + 1;
              placed = true;
              placedFeat++;
              break;
            }
          }
        }
        // Fallback si no cupo en su habitación
        if (!placed && placedFeat < shuffledFree.length) {
          for (let i = 0; i < shuffledFree.length; i++) {
            const [r, c] = shuffledFree[i];
            if (!feature[r][c]) {
              feature[r][c] = feat;
              usedUniqueFeat.add(feat);
              featCounts[feat] = (featCounts[feat] || 0) + 1;
              placedFeat++;
              break;
            }
          }
        }
      }

      // B) Rellenar rasgos restantes (Comunes: máx 3 | Únicos: máx 1)
      let freeIdx = 0;
      while (placedFeat < featCount && freeIdx < shuffledFree.length) {
        const [r, c] = shuffledFree[freeIdx];
        freeIdx++;
        if (feature[r][c]) continue;

        const roomFeats = getRoomFeatList(roomGrid[r][c]);
        const candidates = roomFeats.filter(f => {
          if (isCommonItem(f)) {
            return (featCounts[f] || 0) < 3;
          } else {
            return !usedUniqueFeat.has(f);
          }
        });

        if (candidates.length > 0) {
          const candidate = candidates[rnd(candidates.length)];
          feature[r][c] = candidate;
          featCounts[candidate] = (featCounts[candidate] || 0) + 1;
          if (!isCommonItem(candidate)) {
            usedUniqueFeat.add(candidate);
          }
          placedFeat++;
        }
      }

      // --- 3. ASIGNACIÓN ÚNICA DE PERSONAJES (NUNCA EN EL MISMO EJE X E Y) ---
      const rowsAvail = shuffle([...Array(size).keys()]);
      const colsAvail = shuffle([...Array(size).keys()]);
      const solution = {}; // suspect -> {r,c}
      const usedRows = new Set(), usedCols = new Set();
      const roomCounts = Array(roomList.length).fill(0);
      let occupiedRooms = 0, assignmentNodes = 0;

      function backtrack(i) {
        if (++assignmentNodes > 20000) return false;
        const remaining = suspects.length - i;
        if (roomList.length - occupiedRooms > remaining) return false;
        if (!remaining) {
          const r = rowsAvail.find(row => !usedRows.has(row));
          const c = colsAvail.find(col => !usedCols.has(col));
          return !obstacle[r][c] && roomCounts[roomGrid[r][c]] === 1;
        }
        // Una sala sin casillas compatibles no podrá recibir ningún personaje.
        for (let room = 0; room < roomCounts.length; room++) {
          if (roomCounts[room]) continue;
          let possible = false;
          for (const r of rowsAvail) {
            if (usedRows.has(r)) continue;
            if (colsAvail.some(c => !usedCols.has(c) && !obstacle[r][c] && roomGrid[r][c] === room)) {
              possible = true;
              break;
            }
          }
          if (!possible) return false;
        }
        const s = suspects[i];
        const rowsShuffled = shuffle(rowsAvail.filter(r => !usedRows.has(r)));
        for (const r of rowsShuffled) {
          const colsShuffled = shuffle(colsAvail.filter(c => !usedCols.has(c)));
          for (const c of colsShuffled) {
            if (obstacle[r][c]) continue;
            const room = roomGrid[r][c];
            if (remaining === roomList.length - occupiedRooms && roomCounts[room]) continue;
            if (roomCounts[room]++ === 0) occupiedRooms++;
            usedRows.add(r); usedCols.add(c);
            solution[s] = { r, c };
            if (backtrack(i + 1)) return true;
            usedRows.delete(r); usedCols.delete(c); delete solution[s];
            if (--roomCounts[room] === 0) occupiedRooms--;
            if (assignmentNodes > 20000) return false;
          }
        }
        return false;
      }
      if (!backtrack(0)) return null;

      // La víctima obtiene la única fila y columna sin ocupar por sospechosos
      const unusedRow = [...Array(size).keys()].find(r => !usedRows.has(r));
      const unusedCol = [...Array(size).keys()].find(c => !usedCols.has(c));
      if (unusedRow === undefined || unusedCol === undefined) return null;
      if (obstacle[unusedRow][unusedCol]) return null; // La víctima no puede aparecer sobre un obstáculo

      const victimCell = { r: unusedRow, c: unusedCol };
      const victimRoom = roomGrid[victimCell.r][victimCell.c];

      // Filtrar sospechosos en la misma sala que la víctima
      const sharing = suspects.filter(s => roomGrid[solution[s].r][solution[s].c] === victimRoom);

      // REGLA: Debe haber EXACTAMENTE 1 sospechoso a solas con la víctima en esa área
      if (sharing.length !== 1) return null;

      const killer = sharing[0];

      return { mapDef, diff, size, suspects, victim, roomGrid, roomList, roomRects, obstacle, feature, solution, victimCell, victimRoom, killer };
    }

    function generatePuzzle(mapDef, diff) {
      for (let attempt = 0; attempt < 400; attempt++) {
        const p = tryGenerate(mapDef, diff);
        if (p) {
          p.clues = generateClues(p, diff);
          if (!p.clues) continue;
          // El mismo motor que da ayudas debe demostrar la solución completa.
          const proof = MurdoccaDeduction.analyze(p);
          const positions = { ...p.solution, [p.victim.name]: p.victimCell };
          if (proof.proofComplete && Object.entries(positions).every(([name, cell]) =>
            proof.domains[name]?.length === 1 &&
            proof.domains[name][0][0] === cell.r && proof.domains[name][0][1] === cell.c)) return p;
        }
      }
      return null;
    }

    /* ---------- CLUES ---------- */
    function generateClues(p, diff) {
      const { suspects, solution, feature, roomGrid, roomList, size } = p;
      const pool = [];

      suspects.forEach(s => {
        const cell = solution[s];
        const f = feature[cell.r][cell.c];
        const room = roomGrid[cell.r][cell.c];

        // --- A. RASGOS / OBJETOS (FEATURE) ---
        // Los objetos únicos también sirven de referencia, igual que los repetidos.
        if (f) {
          pool.push({
            type: 'feature',
            subject: s,
            text: MurdoccaCases.featureText(s, f, roomList[room]),
            apply: (dom) => {
              dom[s] = dom[s].filter(([r, c]) => feature[r][c] === f && roomGrid[r][c] === room);
            }
          });
        }

        // --- B. SALA LIMPIA ---
        pool.push({
          type: 'room',
          subject: s,
          text: `${s} estuvo en ${roomList[room]}.`,
          apply: (dom) => {
            dom[s] = dom[s].filter(([r, c]) => roomGrid[r][c] === room);
          }
        });

        // --- C. FILA O COLUMNA ÚNICA ---
        pool.push({
          type: 'row_only',
          subject: s,
          text: `${s} estuvo en la fila ${cell.r + 1}.`,
          apply: (dom) => {
            dom[s] = dom[s].filter(([r, c]) => r === cell.r);
          }
        });

        pool.push({
          type: 'col_only',
          subject: s,
          text: `${s} estuvo en la columna ${cell.c + 1}.`,
          apply: (dom) => {
            dom[s] = dom[s].filter(([r, c]) => c === cell.c);
          }
        });

        // --- D. MITAD DEL MAPA (NORTE/SUR, OESTE/ESTE) ---
        const mid = Math.floor(size / 2);
        const isNorth = cell.r < mid;
        pool.push({
          type: 'half',
          subject: s,
          text: `${s} estuvo en la zona ${isNorth ? 'norte' : 'sur'} (filas ${isNorth ? `1–${mid}` : `${mid + 1}–${size}`}).`,
          apply: (dom) => {
            dom[s] = dom[s].filter(([r, c]) => isNorth ? r < mid : r >= mid);
          }
        });

        const isWest = cell.c < mid;
        pool.push({
          type: 'half',
          subject: s,
          text: `${s} estuvo en la zona ${isWest ? 'oeste' : 'este'} (columnas ${isWest ? `1–${mid}` : `${mid + 1}–${size}`}).`,
          apply: (dom) => {
            dom[s] = dom[s].filter(([r, c]) => isWest ? c < mid : c >= mid);
          }
        });

        // --- E. OBSTÁCULOS ADYACENTES (BESIDE) ---
        const neighbors = [[cell.r - 1, cell.c], [cell.r + 1, cell.c], [cell.r, cell.c - 1], [cell.r, cell.c + 1]];
        neighbors.forEach(([nr, nc]) => {
          if (nr < 0 || nc < 0 || nr >= size || nc >= size) return;
          if (roomGrid[nr][nc] !== room) return;

          const obs = p.obstacle[nr][nc];
          if (!obs) return;

          const cleanObs = obs.replace(/^\S+\s/, '');
          const objectReference = cleanObs.startsWith('el ') ? `al ${cleanObs.slice(3)}` : `a ${cleanObs}`;
          const besideText = `${s} estaba junto ${objectReference} en ${roomList[room]}.`;

          pool.push({
            type: 'beside',
            subject: s,
            text: besideText,
            apply: (dom) => {
              dom[s] = dom[s].filter(([r, c]) => {
                if (roomGrid[r][c] !== room) return false;
                // La pista nombra un objeto, no una de sus copias concretas.
                return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].some(([ar, ac]) =>
                  ar >= 0 && ac >= 0 && ar < size && ac < size &&
                  roomGrid[ar][ac] === room && p.obstacle[ar][ac] === obs
                );
              });
            }
          });
        });
      });

      // --- COMPARACIONES RELATIVAS ---
      for (let i = 0; i < suspects.length; i++) {
        for (let j = i + 1; j < suspects.length; j++) {
          const A = suspects[i], B = suspects[j], ca = solution[A], cb = solution[B];
          const [north, south] = ca.r < cb.r ? [A, B] : [B, A];
          pool.push({
            type: 'compareRow', subjects: [north, south], text: `${north} estuvo en una fila más al norte que ${south}.`, apply: (dom) => {
              const maxSouth = Math.max(...dom[south].map(x => x[0]));
              const minNorth = Math.min(...dom[north].map(x => x[0]));
              dom[north] = dom[north].filter(x => x[0] < maxSouth);
              dom[south] = dom[south].filter(x => x[0] > minNorth);
            }
          });
          const [west, east] = ca.c < cb.c ? [A, B] : [B, A];
          pool.push({
            type: 'compareCol', subjects: [west, east], text: `${west} estuvo más al oeste que ${east}.`, apply: (dom) => {
              const maxEast = Math.max(...dom[east].map(x => x[1]));
              const minWest = Math.min(...dom[west].map(x => x[1]));
              dom[west] = dom[west].filter(x => x[1] < maxEast);
              dom[east] = dom[east].filter(x => x[1] > minWest);
            }
          });
        }
      }

      // --- PISTA EXACTA DIRECTA ---
      suspects.forEach(s => {
        const cell = solution[s];
        pool.push({
          type: 'exact', subject: s, text: `${s} estuvo en la fila ${cell.r + 1}, columna ${cell.c + 1}.`, apply: (dom) => {
            dom[s] = dom[s].filter(([r, c]) => r === cell.r && c === cell.c);
          }
        });
      });

      const PRIORITY = { feature: 6, beside: 6, room: 5, exact: 4, row_only: 3, col_only: 3, half: 2, compareRow: 1, compareCol: 1 };
      // Primero el escenario; las relaciones completan la deducción, no lo sustituyen.
      const ordered = shuffle(pool.filter(cl => diff.types.includes(cl.type)));
      ordered.sort((a, b) => PRIORITY[b.type] - PRIORITY[a.type]);

      // Cada caso conserva referencias a objetos para al menos un tercio del reparto
      // (redondeado hacia arriba), una sala y, desde Medio, una relación entre personas.
      // La minimización respeta esta mezcla para no volver a casos solo de direcciones.
      const minObjectSubjects = Math.ceil(suspects.length / 3);
      function hasSceneClues(clues) {
        const objectSubjects = new Set();
        let hasRoom = false, hasRelation = false;
        for (const cl of clues) {
          if (cl.type === 'feature' || cl.type === 'beside') objectSubjects.add(cl.subject);
          if (cl.type === 'room') hasRoom = true;
          if (cl.type === 'compareRow' || cl.type === 'compareCol') hasRelation = true;
        }
        return objectSubjects.size >= minObjectSubjects && hasRoom && (!diff.relational || hasRelation);
      }

      const allCells = [];
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (!p.obstacle[r][c]) allCells.push([r, c]);

      // Una pista del escenario restringe a todos los sospechosos, sin nombrar a ninguno.
      const occupied = new Set(suspects.map(s => solution[s].r * size + solution[s].c));
      const generalOptions = [];
      for (const [r, c] of allCells) {
        const f = feature[r][c], room = roomGrid[r][c];
        if (!f) continue;
        const cells = allCells.filter(([sr, sc]) => feature[sr][sc] === f && roomGrid[sr][sc] === room);
        const text = `Ningún sospechoso ocupaba una casilla con ${f.replace(/^\S+\s/, '')} en ${roomList[room]}.`;
        if (cells.every(([sr, sc]) => !occupied.has(sr * size + sc)) &&
            !generalOptions.some(option => option.text === text)) generalOptions.push({ text, cells });
      }
      if (!generalOptions.length) {
        for (const [r, c] of allCells) {
          if (!occupied.has(r * size + c)) {
            generalOptions.push({ text: `Ningún sospechoso estaba en la fila ${r + 1}, columna ${c + 1}.`, cells: [[r, c]] });
          }
        }
      }
      const generalOption = generalOptions[rnd(generalOptions.length)];
      const excluded = new Set(generalOption.cells.map(([r, c]) => r * size + c));
      const generalClue = {
        type: 'general',
        text: generalOption.text,
        apply(dom) {
          for (const s of suspects) dom[s] = dom[s].filter(([r, c]) => !excluded.has(r * size + c));
        }
      };

      function propagate(dom, activeClues) {
        let changed = true, guard = 0;
        while (changed && guard < 50) {
          changed = false; guard++;
          activeClues.forEach(cl => {
            const before = suspects.map(s => dom[s].length).join(',');
            cl.apply(dom);
            const after = suspects.map(s => dom[s].length).join(',');
            if (before !== after) changed = true;
          });

          suspects.forEach(s => {
            if (dom[s].length === 1) {
              const [r, c] = dom[s][0];
              suspects.forEach(t => {
                if (t === s) return;
                const before = dom[t].length;
                dom[t] = dom[t].filter(([r2, c2]) => !(r2 === r || c2 === c));
                if (dom[t].length !== before) changed = true;
              });
            }
          });
        }
      }

      function countSolutions(dom, activeClues, limit) {
        let count = 0, nodes = 0;
        function rec(current) {
          // Un chequeo inconcluso conserva pistas; nunca se acepta como solución única.
          if (++nodes > 500) { count = limit; return; }
          propagate(current, activeClues);
          if (suspects.some(s => current[s].length === 0)) return;
          const unresolved = suspects.filter(s => current[s].length > 1);
          if (!unresolved.length) {
            // También cuentan las reglas de la víctima y del asesino, no solo los ejes.
            const usedR = new Set(), usedC = new Set();
            for (const s of suspects) {
              const [r, c] = current[s][0];
              if (usedR.has(r) || usedC.has(c)) return;
              usedR.add(r); usedC.add(c);
            }
            const r = Array.from({ length: size }, (_, i) => i).find(i => !usedR.has(i));
            const c = Array.from({ length: size }, (_, i) => i).find(i => !usedC.has(i));
            if (p.obstacle[r][c]) return;
            const victimRoom = roomGrid[r][c];
            const occupiedRooms = new Set(suspects.map(s => {
              const [sr, sc] = current[s][0];
              return roomGrid[sr][sc];
            }));
            if (occupiedRooms.size !== roomList.length) return;
            if (suspects.filter(s => {
              const [sr, sc] = current[s][0];
              return roomGrid[sr][sc] === victimRoom;
            }).length === 1) count++;
            return;
          }
          const s = unresolved.reduce((a, b) => current[a].length <= current[b].length ? a : b);
          for (const cell of current[s]) {
            const next = {};
            suspects.forEach(t => next[t] = t === s ? [cell] : current[t].slice());
            rec(next);
            if (count >= limit) return;
          }
        }
        rec(dom);
        return count;
      }

      let domain = {};
      suspects.forEach(s => domain[s] = [...allCells]);

      const chosen = [generalClue];
      propagate(domain, chosen);
      let solved = false;

      // Solo Muy fácil admite una coordenada completa explícita.
      const maxExactPosReveals = diff.maxExact;
      let exactPosReveals = 0;
      const suspectRowsGiven = new Set();
      const suspectColsGiven = new Set();

      for (const clue of ordered) {
        let revealsExact = false;

        if (clue.type === 'exact') {
          revealsExact = true;
        } else if (clue.type === 'row_only' && suspectColsGiven.has(clue.subject)) {
          revealsExact = true;
        } else if (clue.type === 'col_only' && suspectRowsGiven.has(clue.subject)) {
          revealsExact = true;
        }

        // No permitir que dos pistas de ejes revelen una coordenada completa.
        if (revealsExact && exactPosReveals >= maxExactPosReveals) {
          continue;
        }

        chosen.push(clue);

        if (clue.type === 'exact') {
          exactPosReveals++;
        } else if (clue.type === 'row_only') {
          if (suspectColsGiven.has(clue.subject)) exactPosReveals++;
          suspectRowsGiven.add(clue.subject);
        } else if (clue.type === 'col_only') {
          if (suspectRowsGiven.has(clue.subject)) exactPosReveals++;
          suspectColsGiven.add(clue.subject);
        }

        propagate(domain, chosen);
        if (!hasSceneClues(chosen)) continue;
        // Los niveles iniciales deben resolverse por descarte, sin explorar alternativas.
        const direct = suspects.every(s => domain[s].length === 1);
        const narrow = suspects.reduce((sum, s) => sum + domain[s].length, 0) <= suspects.length + 16;
        if ((!diff.relational && direct) || (diff.relational && narrow && countSolutions(domain, chosen, 2) === 1)) {
          solved = true;
          break;
        }
      }
      if (!solved) return null;

      // Minimización para descartar pistas redundantes
      function domainsFromClues(clueList) {
        const dom = {}; suspects.forEach(s => dom[s] = [...allCells]);
        propagate(dom, clueList);
        return dom;
      }
      let working = [...chosen];
      for (let i = working.length - 1; diff.minimize && i >= 0; i--) {
        if (working[i].type === 'general') continue;
        const candidate = working.slice(0, i).concat(working.slice(i + 1));
        if (!hasSceneClues(candidate)) continue;
        const dom = domainsFromClues(candidate);
        if (countSolutions(dom, candidate, 2) === 1) { working = candidate; }
      }
      return shuffle(working);
    }

    function generateCase(code) {
      const spec = MurdoccaCases.decode(code);
      const map = MAPS.find(m => m.id === spec.mapId);
      const diff = DIFFICULTIES.find(d => d.id === spec.diffId);
      if (!map || !diff) throw new Error('El código pertenece a un escenario o nivel desconocido.');
      caseRandom = MurdoccaCases.createRandom(spec.seed);
      try {
        const p = generatePuzzle(map, diff);
        if (!p) throw new Error('No se pudo generar este expediente.');
        p.roomCodes = p.roomList.map(computeRoomCode);
        return p;
      } finally {
        caseRandom = Math.random;
      }
    }

  root.MurdoccaPuzzle = { SUSPECTS, SUSPECT_CODES, SUSPECT_COLORS, MAPS, DIFFICULTIES, generateCase };
})(globalThis);
