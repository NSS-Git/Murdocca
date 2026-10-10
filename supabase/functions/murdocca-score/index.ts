import "../../../case-tools.js";
import "../../../deduction-tools.js";
import "../../../puzzle-tools.js";
import { createClient } from "npm:@supabase/supabase-js@2.117.3";

type Cell = { r: number; c: number };
type GeneratedCase = {
  diff: { id: string };
  suspects: string[];
  solution: Record<string, Cell>;
  victim: { name: string };
  victimCell: Cell;
  size: number;
};
type RuntimeGlobals = typeof globalThis & {
  MurdoccaCases: {
    decode(code: string): { mapId: string; diffId: string; seed: number };
    encode(mapId: string, diffId: string, seed: number): string;
  };
  MurdoccaPuzzle: {
    generateCase(code: string): GeneratedCase | null;
  };
};
type Action = "start" | "reveal" | "assist" | "complete";

const runtime = globalThis as RuntimeGlobals;
const MAX_BODY_BYTES = 32 * 1024;
const HOSTED_ORIGINS = new Set(["https://nss-git.github.io"]);
const CORS_HEADERS = {
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
};

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function originIsAllowed(origin: string): boolean {
  if (HOSTED_ORIGINS.has(origin)) return true;
  try {
    const url = new URL(origin);
    return url.origin === origin &&
      (url.protocol === "http:" || url.protocol === "https:") &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

function response(
  request: Request,
  status: number,
  payload: Record<string, unknown>,
): Response {
  const headers = new Headers(CORS_HEADERS);
  const origin = request.headers.get("origin");
  if (origin && originIsAllowed(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(payload), { status, headers });
}

async function readRequestBody(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    throw new HttpError(413, "request_too_large", "La solicitud supera el tamaño permitido.");
  }

  const reader = request.body?.getReader();
  if (!reader) {
    throw new HttpError(400, "invalid_json", "El cuerpo JSON de la solicitud está vacío.");
  }
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new HttpError(413, "request_too_large", "La solicitud supera el tamaño permitido.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      concatenate(chunks, byteLength),
    );
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "invalid_json", "El cuerpo de la solicitud debe ser JSON válido.");
  }
}

function concatenate(chunks: Uint8Array[], byteLength: number): Uint8Array {
  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function validateBody(value: unknown): {
  action: Action;
  caseCode: string;
  placements?: unknown;
  hintsUsed: boolean;
} {
  if (!isRecord(value)) {
    throw new HttpError(400, "invalid_body", "La solicitud debe ser un objeto JSON.");
  }

  const action = value.action;
  if (action !== "start" && action !== "reveal" && action !== "assist" && action !== "complete") {
    throw new HttpError(400, "invalid_action", "La acción debe ser start, reveal, assist o complete.");
  }
  const requiredKeys = action === "complete"
    ? ["action", "caseCode", "placements"]
    : ["action", "caseCode"];
  const allowedKeys = [...requiredKeys, "hintsUsed"];
  const suppliedKeys = Object.keys(value);
  if (
    requiredKeys.some((key) => !suppliedKeys.includes(key)) ||
    suppliedKeys.some((key) => !allowedKeys.includes(key))
  ) {
    throw new HttpError(400, "invalid_body", "La solicitud contiene campos inesperados o incompletos.");
  }
  if (value.hintsUsed !== undefined && typeof value.hintsUsed !== "boolean") {
    throw new HttpError(400, "invalid_hints_used", "hintsUsed debe ser un valor booleano.");
  }
  if (typeof value.caseCode !== "string" || value.caseCode.length > 64) {
    throw new HttpError(400, "invalid_case_code", "El código del caso debe ser texto MD4 válido.");
  }

  return {
    action,
    caseCode: value.caseCode,
    ...(action === "complete" ? { placements: value.placements } : {}),
    hintsUsed: value.hintsUsed === true,
  };
}

function canonicalCaseCode(input: string): { code: string; diffId: string } {
  try {
    const spec = runtime.MurdoccaCases.decode(input);
    const code = runtime.MurdoccaCases.encode(spec.mapId, spec.diffId, spec.seed);
    return { code, diffId: spec.diffId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "El código del caso no es válido.";
    throw new HttpError(400, "invalid_case_code", message);
  }
}

function checkCell<T>(cell: T, size: number): cell is T & Cell {
  if (!isRecord(cell)) return false;
  return Number.isInteger(cell.r) && Number.isInteger(cell.c) &&
    (cell.r as number) >= 0 && (cell.r as number) < size &&
    (cell.c as number) >= 0 && (cell.c as number) < size;
}

function getGeneratedTruth(caseCode: string, expectedDiffId: string): { truth: Map<string, Cell>; size: number } {
  let puzzle: GeneratedCase | null;
  try {
    puzzle = runtime.MurdoccaPuzzle.generateCase(caseCode);
  } catch (error) {
    console.error("murdocca-score case regeneration failed", error);
    throw new HttpError(500, "case_generation_failed", "No se pudo regenerar el expediente en el servidor.");
  }
  if (
    !puzzle || !Number.isInteger(puzzle.size) || puzzle.size < 1 ||
    !puzzle.diff || puzzle.diff.id !== expectedDiffId || !Array.isArray(puzzle.suspects) ||
    !isRecord(puzzle.solution) || !isRecord(puzzle.victim) ||
    typeof puzzle.victim.name !== "string" || !checkCell(puzzle.victimCell, puzzle.size)
  ) {
    throw new HttpError(500, "case_generation_failed", "El generador del servidor devolvió un expediente inválido.");
  }

  const truth = new Map<string, Cell>();
  const solutionNames = Object.keys(puzzle.solution);
  if (
    solutionNames.length !== puzzle.suspects.length ||
    new Set(puzzle.suspects).size !== puzzle.suspects.length
  ) {
    throw new HttpError(500, "case_generation_failed", "El generador del servidor devolvió personas inconsistentes.");
  }
  for (const name of puzzle.suspects) {
    const cell = puzzle.solution[name];
    if (
      typeof name !== "string" || !name || !checkCell(cell, puzzle.size) ||
      !Object.hasOwn(puzzle.solution, name)
    ) {
      throw new HttpError(500, "case_generation_failed", "El generador del servidor devolvió una solución inválida.");
    }
    truth.set(name, { r: cell.r, c: cell.c });
  }
  if (truth.has(puzzle.victim.name)) {
    throw new HttpError(500, "case_generation_failed", "La víctima no puede repetirse entre los sospechosos.");
  }
  truth.set(puzzle.victim.name, { r: puzzle.victimCell.r, c: puzzle.victimCell.c });
  return { truth, size: puzzle.size };
}

function validatePlacements(value: unknown, truth: Map<string, Cell>, size: number): void {
  if (!Array.isArray(value) || value.length !== truth.size) {
    throw new HttpError(422, "invalid_placements", "Debes colocar una vez a cada persona del expediente.");
  }

  const received = new Map<string, Cell>();
  for (const item of value) {
    if (
      !isRecord(item) ||
      Object.keys(item).length !== 3 ||
      !Object.hasOwn(item, "name") || !Object.hasOwn(item, "r") || !Object.hasOwn(item, "c") ||
      typeof item.name !== "string" || !checkCell(item, size) ||
      received.has(item.name)
    ) {
      throw new HttpError(422, "invalid_placements", "Las colocaciones deben indicar personas y casillas válidas, sin repetir.");
    }
    received.set(item.name, { r: item.r, c: item.c });
  }

  if (received.size !== truth.size) {
    throw new HttpError(422, "incorrect_solution", "La colocación no corresponde a la solución del expediente.");
  }
  for (const [name, expected] of truth) {
    const actual = received.get(name);
    if (!actual || actual.r !== expected.r || actual.c !== expected.c) {
      throw new HttpError(422, "incorrect_solution", "La colocación no corresponde a la solución del expediente.");
    }
  }
}

function bearerToken(request: Request): string {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  if (!match) {
    throw new HttpError(401, "authentication_required", "Inicia sesión para registrar el expediente.");
  }
  return match[1];
}

async function handleRequest(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  if (origin && !originIsAllowed(origin)) {
    return response(request, 403, {
      error: "Este origen no está autorizado para usar el servicio.",
      code: "origin_not_allowed",
    });
  }
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: new Headers({ ...CORS_HEADERS, ...(origin ? { "Access-Control-Allow-Origin": origin } : {}) }),
    });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceRoleKey) {
    console.error("murdocca-score is missing required Supabase environment variables");
    return response(request, 500, {
      error: "El servicio de puntuación no está configurado.",
      code: "server_configuration_error",
    });
  }

  const token = bearerToken(request);
  const authClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) {
    return response(request, 401, {
      error: "La sesión no es válida o ha caducado. Inicia sesión de nuevo.",
      code: "invalid_session",
    });
  }
  if (request.method !== "POST") {
    return response(request, 405, { error: "Usa POST para enviar una acción.", code: "method_not_allowed" });
  }

  const body = validateBody(await readRequestBody(request));
  const { code: canonicalCode, diffId } = canonicalCaseCode(body.caseCode);
  if (body.action === "complete") {
    const { truth, size } = getGeneratedTruth(canonicalCode, diffId);
    validatePlacements(body.placements, truth, size);
  }

  const { data, error } = await createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  }).rpc("murdocca_score_transition", {
    p_user_id: authData.user.id,
    p_case_code: canonicalCode,
    p_action: body.action,
    p_hints_used: body.hintsUsed,
  });

  if (error) {
    if (error.code === "P0002") {
      return response(request, 404, { error: "Primero debes iniciar este expediente con esta cuenta.", code: "case_not_started" });
    }
    if (error.code === "22023") {
      return response(request, 400, { error: "La acción o el código del expediente no es válido.", code: "invalid_score_request" });
    }
    console.error("murdocca-score database transition failed", error.code, error.message);
    return response(request, 500, { error: "No se pudo registrar la acción del expediente.", code: "score_transition_failed" });
  }
  if (!isRecord(data) || typeof data.status !== "string") {
    console.error("murdocca-score database transition returned an invalid response");
    return response(request, 500, { error: "El servicio de puntuación devolvió una respuesta inválida.", code: "invalid_score_response" });
  }
  return response(request, 200, data);
}

Deno.serve(async (request: Request): Promise<Response> => {
  try {
    return await handleRequest(request);
  } catch (error) {
    if (error instanceof HttpError) {
      return response(request, error.status, { error: error.message, code: error.code });
    }
    console.error("murdocca-score request failed", error);
    return response(request, 500, {
      error: "Ha ocurrido un error inesperado al procesar el expediente.",
      code: "internal_error",
    });
  }
});
