(function (root) {
  "use strict";

  // MD2 fija el algoritmo, los datos del escenario y el orden de generación.
  // Si cambia alguno de ellos, publicar otra versión de código para no reinterpretar
  // los expedientes compartidos y las partidas guardadas como un caso diferente.

  const MAP_IDS = new Set(["cafe", "dental", "lab"]);
  const DIFFICULTY_IDS = new Set(["muy_facil", "facil", "medio", "dificil", "experto"]);
  const UINT32_MAX = 0xFFFFFFFF;

  function normalizeId(value, allowed, kind) {
    if (typeof value !== "string") {
      throw new Error(`El identificador de ${kind} debe ser texto.`);
    }
    const id = value.toLowerCase();
    if (!allowed.has(id)) {
      throw new Error(`El identificador de ${kind} no está disponible.`);
    }
    return id;
  }

  function validateSeed(seed) {
    if (!Number.isInteger(seed) || seed < 0 || seed > UINT32_MAX) {
      throw new Error("La semilla debe ser un entero entre 0 y 4294967295.");
    }
    return seed >>> 0;
  }

  function createRandom(seed) {
    let state = validateSeed(seed);
    return function () {
      state = (state + 0x6D2B79F5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
    };
  }

  function newSeed() {
    const cryptoApi = root.crypto;
    if (!cryptoApi || typeof cryptoApi.getRandomValues !== "function") {
      throw new Error("Este navegador no ofrece un generador criptográfico seguro.");
    }
    return cryptoApi.getRandomValues(new Uint32Array(1))[0];
  }

  function checksum(text) {
    let value = 0;
    for (let i = 0; i < text.length; i += 1) {
      value ^= text.charCodeAt(i);
      for (let bit = 0; bit < 8; bit += 1) {
        value = (value & 0x80) ? ((value << 1) ^ 0x07) & 0xFF : (value << 1) & 0xFF;
      }
    }
    return value.toString(16).toUpperCase().padStart(2, "0");
  }

  function encode(mapId, diffId, seed) {
    const map = normalizeId(mapId, MAP_IDS, "mapa");
    const difficulty = normalizeId(diffId, DIFFICULTY_IDS, "dificultad");
    const seedHex = validateSeed(seed).toString(16).toUpperCase().padStart(8, "0");
    const payload = `MD2-${map.toUpperCase()}-${difficulty.toUpperCase()}-${seedHex}`;
    return `${payload}-${checksum(payload)}`;
  }

  function decode(code) {
    if (typeof code !== "string") {
      throw new Error("El código del caso debe ser texto.");
    }

    const parts = code.toUpperCase().split("-");
    if (/^MD\d+$/.test(parts[0]) && parts[0] !== "MD2") {
      throw new Error(`La versión ${parts[0]} del código no es compatible.`);
    }
    if (
      parts.length !== 5 ||
      parts[0] !== "MD2" ||
      !/^[A-Z][A-Z0-9_]*$/.test(parts[1] || "") ||
      !/^[A-Z][A-Z0-9_]*$/.test(parts[2] || "") ||
      !/^[0-9A-F]{8}$/.test(parts[3] || "") ||
      !/^[0-9A-F]{2}$/.test(parts[4] || "")
    ) {
      throw new Error("El código del caso no tiene un formato válido.");
    }

    const payload = parts.slice(0, 4).join("-");
    if (checksum(payload) !== parts[4]) {
      throw new Error("El código del caso tiene un checksum incorrecto; revisa si hay errores de escritura.");
    }

    const mapId = parts[1].toLowerCase();
    const diffId = parts[2].toLowerCase();
    if (!MAP_IDS.has(mapId)) {
      throw new Error(`El mapa «${mapId}» no está disponible en esta versión.`);
    }
    if (!DIFFICULTY_IDS.has(diffId)) {
      throw new Error(`La dificultad «${diffId}» no está disponible en esta versión.`);
    }

    return { mapId, diffId, seed: Number.parseInt(parts[3], 16) >>> 0 };
  }

  function stripFeatureEmoji(feature) {
    const text = String(feature == null ? "" : feature).trim();
    const emojiToken = /^(\S+)\s+([\s\S]*)$/u.exec(text);
    if (emojiToken && /^\p{Extended_Pictographic}/u.test(emojiToken[1])) {
      return emojiToken[2].trim();
    }
    return text;
  }

  function isPluralFeature(label) {
    return /^(?:los|las|unos|unas)\s/i.test(label);
  }

  function featureText(subject, feature, room) {
    const person = String(subject == null ? "" : subject).trim();
    const place = String(room == null ? "" : room).trim();
    const label = stripFeatureEmoji(feature);
    const normalizedLabel = label.toLocaleLowerCase("es");

    if (/^la\s+silla\b/i.test(normalizedLabel)) {
      return `${person} ocupaba la silla en ${place}.`;
    }

    if (/^(?:la\s+)?(?:camilla|cama)\b/i.test(normalizedLabel)) {
      return `${person} ocupaba ${label} en ${place}.`;
    }

    if (/^(?:el|la|los|las)\s+(?:port[aá]til(?:es)?|ordenador(?:es)?|computador(?:es)?|computadora(?:s)?|laptop(?:s)?|microscopio(?:s)?|escritorio(?:s)?|libro(?:s)?|apunte(?:s)?)\b/i.test(normalizedLabel)) {
      const article = /^(el|la|los|las)\s+(.+)$/i.exec(label);
      const complement = { el: "del", la: "de la", los: "de los", las: "de las" }[article[1].toLowerCase()];
      return `${person} estaba en el puesto ${complement} ${article[2]} en ${place}.`;
    }

    const verb = isPluralFeature(label) ? "encontraban" : "encontraba";
    return `${person} estaba en la casilla donde se ${verb} ${label} en ${place}.`;
  }

  const locationRule = "Cuando un objeto está en una casilla transitable, la persona y el objeto ocupan la misma casilla; «junto a» significa una casilla ortogonal/adyacente de la misma habitación, nunca en diagonal.";

  root.MurdoccaCases = { createRandom, newSeed, encode, decode, featureText, locationRule };
})(globalThis);
