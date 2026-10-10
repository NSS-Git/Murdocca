(function (root) {
  "use strict";

  const SUPABASE_URL = "https://ovwlwwoaoxexzunqdhme.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92d2x3d29hb3hleHp1bnFkaG1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2MzkyNjYsImV4cCI6MjEwNzIxNTI2Nn0.76EbURxjPnyiSDIARn8ipP7JvxmT_ZJg4IvKWCl051c";
  const SCORE_URL = `${SUPABASE_URL}/functions/v1/murdocca-score`;
  const STORAGE_KEY = "murdocca.account.case-ownership.v1";
  const MAX_SAVED_CASES = 80;

  let client = null;
  let user = null;
  let userId = null;
  let authReady = false;
  let authProblem = "";
  let guestChosen = false;
  let gateOpen = true;
  let gateView = "welcome";
  let identityEpoch = 0;
  let activeRun = null;
  let rankingRequest = 0;
  let savedCases = readSavedCases();
  let ui = null;
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });

  const api = {
    ready,
    beginCase,
    revealCase,
    assistCase,
    completeCase
  };
  root.MurdoccaAccount = api;

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function makeButton(text, className, action) {
    const button = make("button", className || "mc-button", text);
    button.type = "button";
    if (action) button.addEventListener("click", action);
    return button;
  }

  function buildFormField({ id, label, type, autocomplete, minLength, maxLength }) {
    const wrap = make("div", "mc-field");
    const caption = make("label", "", label);
    caption.htmlFor = id;
    const input = make("input", "");
    input.id = id;
    input.name = id;
    input.type = type;
    input.required = true;
    input.autocomplete = autocomplete;
    if (minLength) input.minLength = minLength;
    if (maxLength) input.maxLength = maxLength;
    wrap.append(caption, input);
    return { wrap, input };
  }

  function buildUi() {
    const host = document.getElementById("accountRoot");
    if (!host) return null;
    host.replaceChildren();
    host.classList.add("mc-account-root");

    const bar = make("section", "mc-accountbar");
    bar.setAttribute("aria-label", "Cuenta y puntuación");
    const identity = make("div", "mc-account-identity");
    const name = make("strong", "mc-account-name", "Comprobando sesión…");
    const details = make("span", "mc-account-details", "");
    identity.append(name, details);
    const controls = make("div", "mc-account-controls");
    const enter = makeButton("Entrar o crear cuenta", "mc-button mc-button-secondary", () => showGate("welcome"));
    enter.hidden = true;
    const ranking = makeButton("Ver ranking", "mc-button", () => { void openRanking(); });
    ranking.hidden = true;
    const signOut = makeButton("Cerrar sesión", "mc-button mc-button-secondary", () => { void signOutAccount(); });
    signOut.hidden = true;
    controls.append(enter, ranking, signOut);
    bar.append(identity, controls);

    const status = make("p", "mc-account-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.hidden = true;
    const ownTotals = make("p", "mc-own-totals");
    ownTotals.hidden = true;
    const retry = makeButton("Reintentar el envío de esta solución", "mc-button mc-retry-button", () => { void retryPendingSolve(); });
    retry.hidden = true;

    const overlay = make("div", "mc-overlay mc-gate-overlay");
    overlay.hidden = true;
    const gate = make("section", "mc-panel mc-gate-panel");
    gate.setAttribute("role", "dialog");
    gate.setAttribute("aria-modal", "true");
    gate.setAttribute("aria-labelledby", "mc-gate-title");
    const title = make("h2", "mc-panel-title", "Elige cómo jugar");
    title.tabIndex = -1;
    title.id = "mc-gate-title";
    const gateMessage = make("p", "mc-feedback");
    gateMessage.setAttribute("role", "status");
    gateMessage.setAttribute("aria-live", "polite");
    const googleChoice = makeButton("Continuar con Google", "mc-button mc-google-choice", () => { void signInWithGoogle(); });

    const welcome = make("div", "mc-gate-view");
    const welcomeCopy = make("p", "mc-panel-copy", "Puedes entrar con tu cuenta para guardar puntos y consultar la clasificación, crear una cuenta nueva o jugar como invitado.");
    const guestCopy = make("p", "mc-guest-note", "Como invitado puedes jugar con normalidad, pero esta partida no suma puntos ni aparece en el ranking.");
    const loginChoice = makeButton("Iniciar sesión", "mc-button", () => showGate("login"));
    const signupChoice = makeButton("Crear cuenta", "mc-button mc-button-secondary", () => showGate("signup"));
    const guestChoice = makeButton("Continuar como invitado", "mc-button mc-button-quiet", chooseGuest);
    welcome.append(welcomeCopy, guestCopy, loginChoice, signupChoice, guestChoice);

    const loginView = make("div", "mc-gate-view");
    loginView.hidden = true;
    const loginForm = make("form", "mc-auth-form");
    loginForm.noValidate = false;
    const loginEmail = buildFormField({ id: "mc-login-email", label: "Correo electrónico", type: "email", autocomplete: "username" });
    const loginPassword = buildFormField({ id: "mc-login-password", label: "Contraseña", type: "password", autocomplete: "current-password", minLength: 6 });
    const loginSubmit = make("button", "mc-button", "Entrar");
    loginSubmit.type = "submit";
    const loginBack = makeButton("Volver", "mc-button mc-button-quiet", () => showGate("welcome"));
    const loginSignup = makeButton("Crear una cuenta", "mc-link-button", () => showGate("signup"));
    loginForm.append(loginEmail.wrap, loginPassword.wrap, loginSubmit, loginBack, loginSignup);
    loginView.append(loginForm);

    const signupView = make("div", "mc-gate-view");
    signupView.hidden = true;
    const signupForm = make("form", "mc-auth-form");
    const signupName = buildFormField({ id: "mc-signup-name", label: "Nombre para mostrar", type: "text", autocomplete: "nickname", maxLength: 50 });
    const signupEmail = buildFormField({ id: "mc-signup-email", label: "Correo electrónico", type: "email", autocomplete: "email" });
    const signupPassword = buildFormField({ id: "mc-signup-password", label: "Contraseña (mínimo 6 caracteres)", type: "password", autocomplete: "new-password", minLength: 6 });
    const signupConfirm = buildFormField({ id: "mc-signup-confirm", label: "Confirmar contraseña", type: "password", autocomplete: "new-password", minLength: 6 });
    const signupSubmit = make("button", "mc-button", "Crear cuenta");
    signupSubmit.type = "submit";
    const signupBack = makeButton("Volver", "mc-button mc-button-quiet", () => showGate("welcome"));
    const signupLogin = makeButton("Ya tengo una cuenta", "mc-link-button", () => showGate("login"));
    signupForm.append(signupName.wrap, signupEmail.wrap, signupPassword.wrap, signupConfirm.wrap, signupSubmit, signupBack, signupLogin);
    signupView.append(signupForm);

    gate.append(title, gateMessage, googleChoice, welcome, loginView, signupView);
    overlay.append(gate);

    const rankingOverlay = make("div", "mc-overlay mc-ranking-overlay");
    rankingOverlay.hidden = true;
    const rankingPanel = make("section", "mc-panel mc-ranking-panel");
    rankingPanel.setAttribute("role", "dialog");
    rankingPanel.setAttribute("aria-modal", "true");
    rankingPanel.setAttribute("aria-labelledby", "mc-ranking-title");
    const rankingTitle = make("h2", "mc-panel-title", "Clasificación de detectives");
    rankingTitle.tabIndex = -1;
    rankingTitle.id = "mc-ranking-title";
    const rankingDescription = make("p", "mc-panel-copy", "La clasificación la devuelve el servidor. No se muestran direcciones de correo.");
    const rankingStatus = make("p", "mc-feedback");
    rankingStatus.setAttribute("role", "status");
    rankingStatus.setAttribute("aria-live", "polite");
    const totals = make("p", "mc-ranking-totals");
    totals.hidden = true;
    const tableWrap = make("div", "mc-table-wrap");
    const table = make("table", "mc-ranking-table");
    table.setAttribute("aria-label", "Ranking de puntos");
    const thead = make("thead", "");
    const headerRow = make("tr", "");
    ["Puesto", "Detective", "Puntos", "Casos"].forEach(label => headerRow.appendChild(make("th", "", label)));
    thead.appendChild(headerRow);
    const tbody = make("tbody", "");
    table.append(thead, tbody);
    tableWrap.appendChild(table);
    const rankingControls = make("div", "mc-ranking-controls");
    const refreshRanking = makeButton("Actualizar", "mc-button mc-button-secondary", () => { void loadRanking(); });
    const closeRanking = makeButton("Cerrar", "mc-button", closeRankingPanel);
    rankingControls.append(refreshRanking, closeRanking);
    rankingPanel.append(rankingTitle, rankingDescription, rankingStatus, totals, tableWrap, rankingControls);
    rankingOverlay.append(rankingPanel);

    const gameAccount = makeButton("Cuenta", "icon-btn", () => userId ? openRanking() : showGate("welcome"));
    gameAccount.setAttribute("aria-label", "Cuenta y ranking");
    document.querySelector(".game-topbar").appendChild(gameAccount);
    const gameStatus = make("p", "mc-account-status");
    gameStatus.setAttribute("role", "status");
    gameStatus.setAttribute("aria-live", "polite");
    gameStatus.hidden = true;
    const gameRetry = makeButton("Reintentar el envío de esta solución", "mc-button mc-retry-button", () => { void retryPendingSolve(); });
    gameRetry.hidden = true;
    const gameAccountInfo = make("div", "mc-game-account");
    gameAccountInfo.append(gameStatus, gameRetry);
    document.querySelector(".case-actions").after(gameAccountInfo);

    host.append(bar, status, ownTotals, retry, overlay, rankingOverlay);
    ui = {
      host, bar, name, details, enter, ranking, signOut, status, ownTotals, retry,
      statusNodes: [status, gameStatus], gameRetry,
      overlay, gate, gateTitle: title, gateMessage, googleChoice, welcome, loginView, signupView,
      loginForm, loginEmail: loginEmail.input, loginPassword: loginPassword.input, loginSubmit,
      signupForm, signupName: signupName.input, signupEmail: signupEmail.input,
      signupPassword: signupPassword.input, signupConfirm: signupConfirm.input, signupSubmit,
      rankingOverlay, rankingPanel, rankingStatus, rankingTotals: totals, rankingTbody: tbody,
      rankingRefresh: refreshRanking, rankingClose: closeRanking
    };

    loginForm.addEventListener("submit", event => {
      event.preventDefault();
      void signIn(loginEmail.input.value.trim(), loginPassword.input.value);
    });
    signupForm.addEventListener("submit", event => {
      event.preventDefault();
      void signUp(signupName.input.value.trim(), signupEmail.input.value.trim(), signupPassword.input.value, signupConfirm.input.value);
    });
    overlay.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        event.preventDefault();
        return;
      }
      trapDialogFocus(gate, event);
    });
    rankingOverlay.addEventListener("click", event => {
      if (event.target === rankingOverlay) closeRankingPanel();
    });
    rankingOverlay.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        closeRankingPanel();
        return;
      }
      trapDialogFocus(rankingPanel, event);
    });
    return ui;
  }
  function trapDialogFocus(dialog, event) {
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialog.querySelectorAll("button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])"))
      .filter(element => !element.hidden && !element.closest("[hidden]"));
    if (!focusable.length) {
      event.preventDefault();
      dialog.querySelector("h2")?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const activeIndex = focusable.indexOf(document.activeElement);
    if (activeIndex < 0) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && activeIndex === 0) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && activeIndex === focusable.length - 1) {
      event.preventDefault();
      first.focus();
    }
  }


  function updateUi() {
    if (!ui) return;
    if (user && userId) {
      const displayName = currentDisplayName();
      ui.name.textContent = `Detective ${displayName}`;
      ui.details.textContent = "Cuenta autenticada · los puntos solo se confirman en el servidor.";
      ui.enter.hidden = true;
      ui.ranking.hidden = false;
      ui.signOut.hidden = false;
    } else if (guestChosen) {
      ui.name.textContent = "Modo invitado";
      ui.details.textContent = "Esta partida no suma puntos ni aparece en el ranking.";
      ui.enter.hidden = false;
      ui.ranking.hidden = true;
      ui.signOut.hidden = true;
    } else if (!authReady) {
      ui.name.textContent = "Comprobando sesión…";
      ui.details.textContent = "";
      ui.enter.hidden = true;
      ui.ranking.hidden = true;
      ui.signOut.hidden = true;
    } else {
      ui.name.textContent = "Sin iniciar sesión";
      ui.details.textContent = "Elige una cuenta o continúa como invitado.";
      ui.enter.hidden = true;
      ui.ranking.hidden = true;
      ui.signOut.hidden = true;
    }
    ui.overlay.hidden = !gateOpen;
    ui.rankingOverlay.hidden = !ui.rankingOverlay.dataset.open;
    const modalOpen = gateOpen || !ui.rankingOverlay.hidden;
    for (const sibling of ui.host.parentElement.children) {
      if (sibling !== ui.host) sibling.inert = modalOpen;
    }
    document.getElementById("modalRoot").inert = modalOpen;
    const canRetry = !!(activeRun && activeRun.pendingSolve && activeRun.ownerId && activeRun.ownerId === userId && !activeRun.revealed);
    ui.retry.hidden = !canRetry;
    ui.gameRetry.hidden = !canRetry;
    ui.retry.disabled = ui.gameRetry.disabled = !!(activeRun && activeRun.retrying);
  }

  function setStatus(message, kind) {
    if (!ui) return;
    for (const status of ui.statusNodes) {
      status.textContent = message || "";
      status.hidden = !message;
      status.dataset.kind = kind || "info";
    }
    if (gateOpen && message) {
      ui.gateMessage.textContent = message;
      ui.gateMessage.dataset.kind = kind || "info";
    }
  }

  function setGateFeedback(message, kind) {
    if (!ui) return;
    ui.gateMessage.textContent = message || "";
    ui.gateMessage.dataset.kind = kind || "info";
  }

  function showGate(view) {
    if (!ui || userId) return;
    gateView = view || "welcome";
    gateOpen = true;
    ui.welcome.hidden = gateView !== "welcome";
    ui.loginView.hidden = gateView !== "login";
    ui.signupView.hidden = gateView !== "signup";
    ui.gateTitle.textContent = gateView === "login" ? "Iniciar sesión" : gateView === "signup" ? "Crear una cuenta" : "Elige cómo jugar";
    setGateFeedback(authProblem || "", authProblem ? "error" : "info");
    updateUi();
    if (gateView === "login") queueMicrotask(() => ui && ui.loginEmail.focus());
    if (gateView === "signup") queueMicrotask(() => ui && ui.signupName.focus());
    if (gateView === "welcome") queueMicrotask(() => ui && ui.overlay.querySelector("button:not([hidden])")?.focus());
  }

  function chooseGuest() {
    guestChosen = true;
    gateOpen = false;
    authProblem = "";
    setStatus("Modo invitado: puedes jugar con normalidad, pero tus casos no suman puntos. Si inicias sesión durante este caso, tendrás que abrir un caso nuevo para que pueda puntuar.", "info");
    updateUi();
  }

  function closeRankingPanel() {
    if (!ui) return;
    ui.rankingOverlay.dataset.open = "";
    ui.rankingOverlay.hidden = true;
    updateUi();
    if (ui.ranking) ui.ranking.focus();
  }

  function openRanking() {
    if (!userId || !client || !ui) {
      setStatus("El ranking está disponible solo con una cuenta autenticada. Inicia sesión para consultarlo.", "error");
      return;
    }
    ui.rankingOverlay.dataset.open = "true";
    ui.rankingOverlay.hidden = false;
    ui.rankingStatus.textContent = "";
    ui.rankingTbody.replaceChildren();
    ui.rankingTotals.hidden = true;
    updateUi();
    ui.rankingPanel.querySelector(".mc-panel-title").focus?.();
    void loadRanking();
  }

  function readSavedCases() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
    } catch {
      return {};
    }
  }

  function persistSavedCases() {
    try {
      const entries = Object.entries(savedCases);
      if (entries.length > MAX_SAVED_CASES) {
        for (const [code] of entries.slice(0, entries.length - MAX_SAVED_CASES)) delete savedCases[code];
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedCases));
      return true;
    } catch {
      return false;
    }
  }

  function canonicalCode(code) {
    const spec = root.MurdoccaCases.decode(code);
    return root.MurdoccaCases.encode(spec.mapId, spec.diffId, spec.seed);
  }

  function sanitizePlacements(placements) {
    if (!Array.isArray(placements)) return [];
    return placements.map(placement => ({
      name: placement && placement.name,
      r: placement && placement.r,
      c: placement && placement.c
    }));
  }

  function normalizeStoredRecord(record) {
    if (!record || typeof record !== "object" || record.version !== 1) return null;
    const ownerId = typeof record.ownerId === "string" && record.ownerId ? record.ownerId : null;
    const pending = record.pendingSolve && typeof record.pendingSolve === "object" ? record.pendingSolve : null;
    const placements = pending && Array.isArray(pending.placements) ? sanitizePlacements(pending.placements) : null;
    return {
      version: 1,
      ownerId,
      status: ["playing", "revealed", "solved"].includes(record.status) ? record.status : "playing",
      revealed: record.revealed === true || record.status === "revealed",
      hintsUsed: record.hintsUsed === true,
      eligible: record.eligible === true,
      pendingSolve: placements && ownerId && pending.ownerId === ownerId ? { ownerId, placements } : null
    };
  }

  function saveRun(run) {
    savedCases[run.code] = {
      version: 1,
      ownerId: run.ownerId,
      status: run.status,
      revealed: run.revealed,
      hintsUsed: run.hintsUsed,
      eligible: run.serverEligible === true,
      pendingSolve: run.pendingSolve ? {
        ownerId: run.pendingSolve.ownerId,
        placements: run.pendingSolve.placements
      } : null
    };
    persistSavedCases();
  }

  function abortRunRequests(run) {
    if (!run) return;
    run.active = false;
    for (const controller of run.controllers) controller.abort();
    run.controllers.clear();
  }

  function setIdentity(nextSession, eventName) {
    const nextUser = nextSession && nextSession.user ? nextSession.user : null;
    const nextId = nextUser && typeof nextUser.id === "string" ? nextUser.id : null;
    const previousId = userId;
    const wasInitial = !authReady || (eventName === "INITIAL_SESSION" && !activeRun && !guestChosen);
    user = nextUser;
    userId = nextId;

    if (!wasInitial && nextId !== previousId) {
      identityEpoch++;
      rankingRequest++;
      if (ui) {
        ui.rankingOverlay.dataset.open = "";
        ui.rankingOverlay.hidden = true;
        ui.ownTotals.textContent = "";
        ui.ownTotals.hidden = true;
      }
      const priorRun = activeRun;
      if (priorRun) {
        const wasGuestCase = priorRun.ownerId === null && previousId === null && nextId !== null;
        abortRunRequests(priorRun);
        activeRun = null;
        if (wasGuestCase) {
          setStatus("Esta partida empezó como invitado y no sumará puntos aunque hayas iniciado sesión. Abre un caso nuevo para competir.", "warning");
        } else if (priorRun.status === "playing" && nextId !== null) {
          setStatus("Cambiaste de cuenta durante una partida. El caso anterior no se enviará a esta cuenta; abre un caso nuevo.", "warning");
        }
      }
      if (!nextId) {
        guestChosen = true;
        gateOpen = false;
      } else {
        guestChosen = false;
        gateOpen = false;
        authProblem = "";
      }
    } else if (nextId) {
      guestChosen = false;
      gateOpen = false;
    }

    authReady = true;
    if (!userId && !guestChosen) gateOpen = true;
    updateUi();
    if (!userId && authProblem) setStatus(authProblem, "error");
  }

  function currentDisplayName() {
    const metadata = user && user.user_metadata;
    const value = metadata && [metadata.display_name, metadata.full_name, metadata.name]
      .find(name => typeof name === "string" && name.trim());
    return value ? value.trim() : "Detective";
  }

  function authErrorMessage(error, operation) {
    const message = String(error && (error.message || error.error_description || error.code) || "").toLowerCase();
    if (!client) return "No se ha cargado Supabase Auth. Comprueba que el SDK oficial supabase-js se cargue antes de account-tools.js; mientras tanto puedes continuar como invitado.";
    if (error && error.code === "google_disabled") {
      return "Google todavía no está habilitado en Supabase. Activa el proveedor Google y configura su cliente OAuth para poder entrar o crear una cuenta.";
    }
    if (/email_not_confirmed|email not confirmed|confirm your email/.test(message)) {
      return "Tu correo aún no está confirmado. Abre el enlace que te enviamos (revisa también spam) y después vuelve a iniciar sesión.";
    }
    if (/invalid login credentials|invalid_credentials/.test(message)) {
      return "Correo o contraseña incorrectos. Revísalos o crea una cuenta si todavía no tienes una.";
    }
    if (/already registered|user already exists|already been registered/.test(message)) {
      return "Ya existe una cuenta con ese correo. Inicia sesión en lugar de crear otra.";
    }
    if (/weak password|password should be at least|password is too short/.test(message)) {
      return "La contraseña es demasiado corta. Usa al menos 6 caracteres y vuelve a intentarlo.";
    }
    if (/rate limit|too many requests/.test(message)) {
      return "Se han realizado demasiados intentos. Espera un poco antes de volver a probar.";
    }
    if (/fetch|network|failed to|offline|load failed/.test(message)) {
      return "No se pudo conectar con Supabase. Comprueba tu conexión y vuelve a intentarlo; también puedes jugar como invitado.";
    }
    return operation === "signup"
      ? "No se pudo crear la cuenta. Comprueba los datos y la conexión; puedes intentarlo de nuevo o jugar como invitado."
      : operation === "restore"
        ? "No se pudo comprobar la sesión. Puedes jugar como invitado o iniciar sesión de nuevo cuando haya conexión."
        : "No se pudo iniciar sesión. Comprueba el correo y la conexión, y vuelve a intentarlo.";
  }

  async function signInWithGoogle() {
    if (!client) {
      setGateFeedback(authErrorMessage(null, "google"), "error");
      return;
    }
    ui.googleChoice.disabled = true;
    setGateFeedback("Conectando con Google…", "info");
    try {
      const settingsResponse = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
        headers: { apikey: SUPABASE_ANON_KEY }
      });
      if (!settingsResponse.ok) throw new Error(`HTTP ${settingsResponse.status}`);
      const settings = await settingsResponse.json();
      if (settings.external && settings.external.google === false) throw { code: "google_disabled" };
      const redirectTo = new URL(root.location.href);
      redirectTo.search = "";
      redirectTo.hash = "";
      const { data, error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: redirectTo.href, skipBrowserRedirect: true }
      });
      if (error) throw error;
      if (!data || !data.url) throw new Error("Supabase no devolvió la URL de Google.");
      root.location.assign(data.url);
    } catch (error) {
      setGateFeedback(authErrorMessage(error, "google"), "error");
    } finally {
      ui.googleChoice.disabled = false;
    }
  }

  async function signIn(email, password) {
    authProblem = "";
    setGateFeedback("", "info");
    if (!client) {
      authProblem = authErrorMessage(null, "login");
      setGateFeedback(authProblem, "error");
      return;
    }
    ui.loginSubmit.disabled = true;
    try {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (data && data.session) setIdentity(data.session, "SIGNED_IN");
      if (data && data.user && !data.session) {
        setGateFeedback("La sesión aún no está disponible. Si acabas de crear la cuenta, confirma primero el correo electrónico y vuelve a entrar.", "warning");
      }
    } catch (error) {
      authProblem = authErrorMessage(error, "login");
      setGateFeedback(authProblem, "error");
    } finally {
      ui.loginSubmit.disabled = false;
    }
  }

  async function signUp(displayName, email, password, confirmation) {
    const cleanName = displayName.trim();
    if (!cleanName) {
      setGateFeedback("Escribe el nombre que se mostrará en la clasificación.", "error");
      ui.signupName.focus();
      return;
    }
    if (password !== confirmation) {
      setGateFeedback("Las contraseñas no coinciden. Revísalas antes de continuar.", "error");
      ui.signupConfirm.focus();
      return;
    }
    authProblem = "";
    setGateFeedback("", "info");
    if (!client) {
      authProblem = authErrorMessage(null, "signup");
      setGateFeedback(authProblem, "error");
      return;
    }
    ui.signupSubmit.disabled = true;
    try {
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: { data: { display_name: cleanName } }
      });
      if (error) throw error;
      if (data && data.session) {
        setIdentity(data.session, "SIGNED_IN");
        setStatus("Cuenta creada. Ya has iniciado sesión; confirma el correo si Supabase te lo solicita.", "success");
      } else {
        showGate("login");
        setGateFeedback("Cuenta creada. Confirma tu correo con el enlace que te enviamos (revisa spam) y luego inicia sesión. Si acabas de confirmar, vuelve a entrar aquí.", "success");
      }
    } catch (error) {
      authProblem = authErrorMessage(error, "signup");
      setGateFeedback(authProblem, "error");
    } finally {
      ui.signupSubmit.disabled = false;
    }
  }

  async function signOutAccount() {
    if (!client || !userId) return;
    const oldId = userId;
    setStatus("Cerrando sesión…", "info");
    try {
      const { error } = await client.auth.signOut();
      if (error) throw error;
      if (userId === oldId) setIdentity(null, "SIGNED_OUT");
      guestChosen = true;
      gateOpen = false;
      setStatus("Sesión cerrada. Sigues jugando como invitado; este caso no sumará puntos.", "info");
      updateUi();
    } catch (error) {
      setStatus(`No se pudo cerrar sesión. ${authErrorMessage(error, "login")}`, "error");
    }
  }

  function readServerError(payload) {
    if (!payload || typeof payload !== "object") return "";
    const value = payload.error || payload.message || payload.details;
    return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 280) : "";
  }

  function scoreErrorMessage(error, action) {
    if (error && error.kind === "identity") return "La cuenta cambió antes de enviar el resultado. Este caso no se ha enviado a otra cuenta.";
    if (error && error.kind === "session") return "Tu sesión ha caducado. Inicia sesión de nuevo; no se ha enviado ningún punto.";
    if (error && error.name === "AbortError") return "La solicitud se canceló al cambiar de cuenta. No se ha enviado una puntuación desde la sesión nueva.";
    if (!client) return "No se pudo usar el servicio de puntuación porque falta Supabase Auth. Puedes seguir jugando; no se ha registrado ningún punto.";
    if (error && error.httpStatus === 404 && error.serverCode === "NOT_FOUND") {
      return "Falta desplegar la función «murdocca-score» en Supabase. No se han registrado puntos; despliega la función y reintenta el envío guardado.";
    }
    if (error && error.httpStatus === 404) return "El servicio de puntuación o la clasificación todavía no están desplegados/configurados. No se ha registrado ningún punto; inténtalo más tarde.";
    if (error && (error.httpStatus === 401 || error.httpStatus === 403)) return "La sesión no está autorizada o ha caducado. Inicia sesión otra vez; no se ha confirmado ningún punto.";
    if (error && error.httpStatus === 409) return "El servidor rechazó este resultado por el estado actual del expediente. No se han añadido puntos.";
    const message = String(error && (error.message || error) || "").toLowerCase();
    if (/fetch|network|failed to fetch|load failed|offline/.test(message)) return "No se pudo conectar con el servicio de puntuación. Comprueba internet y reintenta manualmente; no se inventará ningún resultado.";
    if (action === "leaderboard" && /murdocca_leaderboard|schema cache|could not find.*function|pgrst202/.test(message)) {
      return "La función del ranking todavía no está desplegada o configurada. No se han perdido tus puntos; inténtalo más tarde.";
    }
    const detail = error && error.serverMessage;
    if (detail) return `El servidor rechazó la solicitud: ${detail}. No se han añadido puntos.`;
    if (action === "leaderboard") return "No se pudo cargar el ranking. Comprueba la conexión o vuelve a intentarlo cuando el servicio esté disponible.";
    return "No se pudo confirmar la puntuación. Tu solución queda guardada para que puedas reintentarla manualmente; no se han añadido puntos todavía.";
  }

  function isRunOwnerCurrent(run) {
    return !!(run && run.active && activeRun === run && run.ownerId && userId === run.ownerId && run.identityEpoch === identityEpoch);
  }

  async function scoreFetch(run, body, controller) {
    if (!client || !isRunOwnerCurrent(run)) throw { kind: "identity" };
    const { data, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    const freshSession = data && data.session;
    if (!isRunOwnerCurrent(run)) throw { kind: "identity" };
    if (!freshSession || !freshSession.user || freshSession.user.id !== run.ownerId) throw { kind: "session" };
    const response = await fetch(SCORE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${freshSession.access_token}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }
    if (!response.ok) {
      const failure = new Error(`HTTP ${response.status}`);
      failure.httpStatus = response.status;
      failure.serverMessage = readServerError(payload);
      failure.serverCode = payload && payload.code;
      throw failure;
    }
    if (!payload || typeof payload !== "object") throw new Error("El servicio devolvió una respuesta no válida.");
    return payload;
  }

  function validateStartResult(result) {
    return !!(result && ["playing", "revealed", "solved"].includes(result.status) && typeof result.eligible === "boolean" && typeof result.hintsUsed === "boolean" && Number.isFinite(result.points));
  }

  function validateRevealResult(result) {
    return !!(result && ["playing", "revealed", "solved"].includes(result.status) && typeof result.eligible === "boolean" && typeof result.hintsUsed === "boolean" && Number.isFinite(result.points));
  }

  function validateCompleteResult(result) {
    return !!(result && ["solved", "revealed"].includes(result.status) && typeof result.awarded === "boolean" && typeof result.hintsUsed === "boolean" && Number.isFinite(result.points) && Number.isFinite(result.totalPoints) && Number.isFinite(result.solvedCases));
  }

  function enqueue(run, operation) {
    const result = run.queue.then(operation).catch(error => {
      if (isRunOwnerCurrent(run)) {
        saveRun(run);
        updateUi();
        const message = run.revealed
          ? "La solución revelada queda excluida de puntos, pero no se pudo confirmar la operación con el servidor."
          : run.pendingSolve
            ? "No se pudo confirmar la puntuación. La solución capturada está guardada para reintentar manualmente."
            : "No se pudo iniciar el registro de puntos. El juego sigue disponible y no se ha añadido ninguna puntuación.";
        setStatus(`${message} ${scoreErrorMessage(error, run.revealed ? "reveal" : "complete")}`, "error");
      }
      return { ok: false, error };
    });
    run.queue = result;
    return result;
  }


  async function postStart(run) {
    if (!isRunOwnerCurrent(run)) return { skipped: true };
    const controller = new AbortController();
    run.controllers.add(controller);
    try {
      const result = await scoreFetch(run, { action: "start", caseCode: run.code, hintsUsed: run.hintsUsed }, controller);
      if (!validateStartResult(result)) throw new Error("La respuesta de inicio no coincide con el contrato de puntuación.");
      if (activeRun === run && run.active && run.identityEpoch === identityEpoch) {
        run.startReceived = true;
        if (result.hintsUsed) run.hintsUsed = true;
        run.serverEligible = run.revealed || run.hintsUsed ? false : result.eligible;
        if (!run.revealed) {
          if (result.status === "revealed") {
            run.revealed = true;
            run.status = "revealed";
            run.pendingSolve = null;
            run.serverEligible = false;
          } else if (result.status === "solved") {
            run.status = "solved";
            run.serverEligible = false;
          }
          saveRun(run);
          updateUi();
          if (run.status === "revealed") setStatus("El servidor indica que este expediente fue revelado. No puede puntuar.", "warning");
          else if (run.status === "solved") setStatus("Este expediente ya figura como resuelto en el servidor y no volverá a otorgar puntos.", "info");
          else if (!result.eligible) setStatus(run.hintsUsed ? "Este expediente usó «Pista» y no suma puntos, aunque reinicies el tablero." : "El servidor indica que este caso no es elegible para puntuar. Puedes seguir jugando.", "warning");
          else setStatus(`Expediente registrado con tu cuenta: resolverlo sin usar «Pista» ni revelar la solución otorga ${result.points} puntos.`, "info");
        }
      }
      return { ok: true, result };
    } catch (error) {
      if (isRunOwnerCurrent(run)) setStatus(scoreErrorMessage(error, "start"), "error");
      return { ok: false, error };
    } finally {
      run.controllers.delete(controller);
    }
  }

  async function postReveal(run) {
    if (!isRunOwnerCurrent(run)) return { skipped: true };
    const controller = new AbortController();
    run.controllers.add(controller);
    try {
      const result = await scoreFetch(run, { action: "reveal", caseCode: run.code }, controller);
      if (!validateRevealResult(result)) throw new Error("La respuesta de revelación no coincide con el contrato de puntuación.");
      if (activeRun === run && run.active && run.identityEpoch === identityEpoch) {
        run.serverEligible = false;
        saveRun(run);
        updateUi();
        setStatus("Solución revelada: este caso queda excluido de los puntos.", "info");
      }
      return { ok: true, result };
    } catch (error) {
      if (isRunOwnerCurrent(run)) setStatus(`La solución se reveló localmente, pero el servidor no pudo registrar la revelación. El caso seguirá excluido de puntos en esta sesión. ${scoreErrorMessage(error, "reveal")}`, "error");
      return { ok: false, error };
    } finally {
      run.controllers.delete(controller);
    }
  }

  async function ensureStartForSolve(run) {
    if (run.revealed) return { ok: false };
    if (run.startReceived) return { ok: true };
    return postStart(run);
  }

  async function postComplete(run, pendingSolve) {
    if (!isRunOwnerCurrent(run) || run.revealed || !pendingSolve || pendingSolve.ownerId !== run.ownerId) return { skipped: true };
    const controller = new AbortController();
    run.controllers.add(controller);
    run.completeController = controller;
    try {
      const result = await scoreFetch(run, {
        action: "complete",
        caseCode: run.code,
        placements: pendingSolve.placements,
        hintsUsed: run.hintsUsed
      }, controller);
      if (!validateCompleteResult(result)) throw new Error("La respuesta de finalización no coincide con el contrato de puntuación.");
      if (activeRun === run && run.active && run.identityEpoch === identityEpoch && userId === pendingSolve.ownerId && !run.revealed) {
        if (result.hintsUsed) run.hintsUsed = true;
        if (result.status === "revealed") {
          run.revealed = true;
          run.serverEligible = false;
          run.pendingSolve = null;
          run.status = "revealed";
          setStatus("El servidor confirmó que este expediente fue revelado; no se conceden puntos.", "warning");
        } else {
          run.status = "solved";
          run.pendingSolve = null;
          run.serverEligible = false;
          setStatus(result.awarded
            ? `Solución confirmada por el servidor: ${result.points} puntos añadidos.`
            : run.hintsUsed
              ? "Expediente resuelto con ayudas: no se han añadido puntos."
              : "El expediente ya se había contabilizado; no se han añadido puntos nuevos.", result.awarded ? "success" : "info");
          ui.ownTotals.textContent = `Tus totales: ${safeCount(result.totalPoints)} puntos · ${safeCount(result.solvedCases)} casos resueltos.`;
          ui.ownTotals.hidden = false;
        }
        saveRun(run);
        updateUi();
        void loadRanking();
      }
      return { ok: true, result };
    } catch (error) {
      if (isRunOwnerCurrent(run) && !run.revealed) {
        saveRun(run);
        updateUi();
        setStatus(scoreErrorMessage(error, "complete"), "error");
      }
      return { ok: false, error };
    } finally {
      run.controllers.delete(controller);
      if (run.completeController === controller) run.completeController = null;
    }
  }

  async function beginCase(code, gameStatus, options) {
    await ready;
    try {
      const canonical = canonicalCode(code);
      const status = ["playing", "revealed", "solved"].includes(gameStatus) ? gameStatus : "playing";
      const restored = !!(options && options.restored);
      if (activeRun) abortRunRequests(activeRun);
      const stored = normalizeStoredRecord(savedCases[canonical]);
      const previous = restored ? stored : null;
      const ownerId = restored ? previous && previous.ownerId : userId;
      const run = {
        code: canonical,
        ownerId: ownerId || null,
        identityEpoch,
        active: true,
        status: status,
        revealed: status === "revealed" || !!(stored && stored.ownerId === ownerId && stored.revealed),
        hintsUsed: !!(options && options.hintsUsed) || !!(stored && stored.ownerId === ownerId && stored.hintsUsed),
        serverEligible: previous ? previous.eligible : null,
        startReceived: false,
        pendingSolve: null,
        controllers: new Set(),
        completeController: null,
        queue: Promise.resolve()
      };
      if (restored && previous && previous.pendingSolve && previous.ownerId === run.ownerId && !run.revealed) {
        run.pendingSolve = { ownerId: previous.pendingSolve.ownerId, placements: previous.pendingSolve.placements };
      }
      if (status === "solved") {
        run.status = "solved";
        if (!run.pendingSolve) run.serverEligible = false;
      }
      if (run.revealed) {
        run.status = "revealed";
        run.serverEligible = false;
        run.pendingSolve = null;
      }
      if (restored && !previous) {
        // A saved case without an ownership record is conservatively unranked.
        run.ownerId = null;
        run.serverEligible = false;
        run.revealed = status === "revealed";
        if (run.revealed) run.status = "revealed";
      }
      activeRun = run;
      saveRun(run);
      updateUi();

      if (run.pendingSolve && run.ownerId && run.ownerId === userId && !run.revealed) {
        setStatus("Hay una solución capturada que no llegó a confirmarse. Usa «Reintentar el envío» para volver a enviar exactamente esa solución.", "warning");
        return;
      }
      if (!run.ownerId || run.ownerId !== userId) {
        if (restored && previous && previous.ownerId === null && userId) {
          setStatus("Este caso se guardó como invitado y no puede puntuar, aunque hayas iniciado sesión. Abre un caso nuevo para competir.", "warning");
        } else if (restored && previous && previous.ownerId && previous.ownerId !== userId) {
          setStatus("Este caso pertenece a otra sesión y no se enviará a la cuenta actual. Abre un caso nuevo para competir.", "warning");
        } else if (guestChosen || !userId) {
          setStatus("Modo invitado: puedes jugar con normalidad, pero este caso no suma puntos.", "info");
        }
        return;
      }
      if (run.revealed || status === "solved") {
        if (run.revealed) setStatus("Este expediente está revelado y no puede puntuar.", "info");
        return;
      }
      run.queue = enqueue(run, () => postStart(run));
      await run.queue;
    } catch (error) {
      setStatus(`No se pudo preparar la puntuación de este caso. El juego sigue disponible. ${error && error.message ? error.message : ""}`, "error");
    }
  }

  async function revealCase(code) {
    await ready;
    let canonical;
    try { canonical = canonicalCode(code); } catch { return; }
    const run = activeRun;
    if (!run || run.code !== canonical || !run.active) return;
    run.revealed = true;
    run.status = "revealed";
    run.serverEligible = false;
    run.pendingSolve = null;
    if (run.completeController) run.completeController.abort();
    saveRun(run);
    updateUi();
    if (!run.ownerId || run.ownerId !== userId) {
      setStatus("Solución revelada. Este caso no suma puntos.", "info");
      return;
    }
    run.queue = enqueue(run, async () => {
      if (!run.startReceived) {
        const started = await postStart(run);
        if (!started.ok) return started;
      }
      return postReveal(run);
    });
    await run.queue;
  }

  async function assistCase(code) {
    await ready;
    let canonical;
    try { canonical = canonicalCode(code); } catch { return; }
    const run = activeRun;
    if (!run || run.code !== canonical || !run.active || run.status !== "playing") return;
    if (run.hintsUsed) return;
    run.hintsUsed = true;
    run.serverEligible = false;
    saveRun(run);
    setStatus("Has usado «Pista»: este expediente no suma puntos aunque reinicies el tablero.", "info");
    if (!isRunOwnerCurrent(run)) return;
    run.queue = enqueue(run, async () => {
      if (!isRunOwnerCurrent(run)) return { skipped: true };
      const controller = new AbortController();
      run.controllers.add(controller);
      try {
        const result = await scoreFetch(run, { action: "assist", caseCode: run.code, hintsUsed: true }, controller);
        if (!validateStartResult(result) || result.eligible) throw new Error("La respuesta de ayuda no coincide con el contrato de puntuación.");
        return { ok: true, result };
      } finally {
        run.controllers.delete(controller);
      }
    });
    await run.queue;
  }

  async function completeCase(code, placements) {
    await ready;
    let canonical;
    try { canonical = canonicalCode(code); } catch (error) {
      setStatus("No se pudo identificar este caso para puntuar. La partida sigue disponible.", "error");
      return;
    }
    const run = activeRun;
    if (!run || run.code !== canonical || !run.active) return;
    if (run.revealed || run.status === "revealed") {
      setStatus("Este caso fue revelado y no puede puntuar.", "warning");
      return;
    }
    if (!run.ownerId || run.ownerId !== userId) {
      setStatus(run.ownerId
        ? "Esta partida no pertenece a la sesión actual y no se enviará a una cuenta distinta. Abre un caso nuevo para competir."
        : "Modo invitado: has resuelto el expediente, pero no suma puntos ni aparece en el ranking.",
        run.ownerId ? "warning" : "info");
      return;
    }
    if (run.pendingSolve && run.status === "solved") {
      setStatus("Este resultado ya está pendiente de reintento. Usa el botón de reintento para enviar la misma solución.", "warning");
      updateUi();
      return;
    }
    run.status = "solved";
    run.pendingSolve = { ownerId: run.ownerId, placements: sanitizePlacements(placements) };
    saveRun(run);
    updateUi();
    setStatus("Enviando la solución al servidor…", "info");
    run.queue = enqueue(run, async () => {
      if (!isRunOwnerCurrent(run) || run.revealed) return { skipped: true };
      const started = await ensureStartForSolve(run);
      if (!isRunOwnerCurrent(run) || run.revealed) return { skipped: true };
      if (!started.ok) {
        saveRun(run);
        updateUi();
        setStatus(`No se pudo enviar la solución. ${scoreErrorMessage(started.error, "start")} La solución capturada sigue guardada para reintentar.`, "error");
        return { skipped: true };
      }
      const captured = run.pendingSolve;
      return postComplete(run, captured);
    });
    await run.queue;
  }

  async function retryPendingSolve() {
    const run = activeRun;
    if (!run || !run.pendingSolve || !run.ownerId || run.ownerId !== userId || run.revealed || !run.active) return;
    if (run.retrying) return;
    run.retrying = true;
    updateUi();
    setStatus("Reintentando la solución capturada…", "info");
    run.queue = enqueue(run, async () => {
      if (!isRunOwnerCurrent(run) || run.revealed || !run.pendingSolve || run.pendingSolve.ownerId !== userId) return { skipped: true };
      const started = await ensureStartForSolve(run);
      if (!isRunOwnerCurrent(run) || run.revealed || !run.pendingSolve) return { skipped: true };
      if (!started.ok) {
        saveRun(run);
        setStatus(`No se pudo enviar la solución. ${scoreErrorMessage(started.error, "start")} La solución capturada sigue guardada para reintentar.`, "error");
        updateUi();
        return { skipped: true };
      }
      return postComplete(run, run.pendingSolve);
    });
    await run.queue;
    run.retrying = false;
    updateUi();
  }

  async function loadRanking() {
    if (!client || !userId || !ui) return;
    const requestedUser = userId;
    const requestedEpoch = identityEpoch;
    const requestNumber = ++rankingRequest;
    ui.rankingStatus.textContent = "Consultando la clasificación…";
    ui.rankingStatus.dataset.kind = "info";
    ui.rankingRefresh.disabled = true;
    ui.rankingTbody.replaceChildren();
    ui.rankingTotals.hidden = true;
    try {
      const [leaderboardResult, ownProfile] = await Promise.all([
        client.rpc("murdocca_leaderboard", {}),
        fetchOwnProfile(requestedUser)
      ]);
      const { data, error } = leaderboardResult;
      if (error) throw error;
      if (requestNumber !== rankingRequest || requestedUser !== userId || requestedEpoch !== identityEpoch) return;
      if (!Array.isArray(data)) throw new Error("El servidor devolvió un ranking no válido.");
      renderRankingRows(data);
      if (ownProfile) {
        const pointsValue = ownProfile.total_points;
        const solvedValue = ownProfile.solved_cases;
        const points = safeCount(pointsValue);
        const solved = safeCount(solvedValue);
        const summary = `Tus totales en la clasificación: ${points} puntos · ${solved} casos resueltos.`;
        ui.ownTotals.textContent = summary;
        ui.ownTotals.hidden = false;
        ui.rankingTotals.textContent = summary;
        ui.rankingTotals.hidden = false;
      } else {
        ui.ownTotals.textContent = "No se pudieron consultar los totales de tu perfil.";
        ui.ownTotals.hidden = false;
        ui.rankingTotals.textContent = "La clasificación está disponible, pero no se pudieron consultar tus totales personales.";
        ui.rankingTotals.hidden = false;
      }
      ui.rankingStatus.textContent = data.length ? "" : "Todavía no hay cuentas clasificadas.";
      ui.rankingStatus.dataset.kind = "info";
    } catch (error) {
      if (requestNumber !== rankingRequest || requestedUser !== userId || requestedEpoch !== identityEpoch) return;
      ui.rankingStatus.textContent = scoreErrorMessage(error, "leaderboard");
      ui.rankingStatus.dataset.kind = "error";
      ui.ownTotals.hidden = true;
    } finally {
      if (requestNumber === rankingRequest) {
        ui.rankingRefresh.disabled = false;
      }
    }
  }
  async function fetchOwnProfile(expectedUser) {
    if (!client || !expectedUser || typeof client.from !== "function") return null;
    try {
      const { data, error } = await client.from("murdocca_profiles")
        .select("display_name,total_points,solved_cases")
        .eq("user_id", expectedUser)
        .maybeSingle();
      return error || !data ? null : data;
    } catch {
      return null;
    }
  }


  function renderRankingRows(rows) {
    ui.rankingTbody.replaceChildren();
    if (!rows.length) {
      const row = make("tr", "");
      const cell = make("td", "mc-empty-ranking", "Aún no hay resultados.");
      cell.colSpan = 4;
      row.appendChild(cell);
      ui.rankingTbody.appendChild(row);
      return;
    }
    rows.forEach(rowData => {
      const row = make("tr", "");
      const rank = make("td", "", safeRank(rowData && rowData.rank));
      const displayName = make("td", "", safeDisplayName(rowData && rowData.display_name));
      const points = make("td", "", safeCount(rowData && rowData.total_points));
      const solved = make("td", "", safeCount(rowData && rowData.solved_cases));
      row.append(rank, displayName, points, solved);
      ui.rankingTbody.appendChild(row);
    });
  }

  function safeRank(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? String(number) : "—";
  }

  function safeCount(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? String(number) : "—";
  }

  function safeDisplayName(value) {
    return typeof value === "string" && value.trim() ? value.trim().slice(0, 80) : "Detective anónimo";
  }


  async function initialize() {
    ui = buildUi();
    updateUi();
    const sdk = root.supabase;
    if (!sdk || typeof sdk.createClient !== "function") {
      authProblem = "No se ha cargado el SDK de Supabase Auth. Comprueba que supabase-js se cargue antes de account-tools.js. Puedes seguir como invitado; para iniciar sesión, recarga cuando el SDK esté disponible.";
      authReady = true;
      if (ui) {
        setGateFeedback(authProblem, "error");
        setStatus(authProblem, "error");
      }
      updateUi();
      if (!userId) showGate("welcome");
      resolveReady();
      return;
    }

    try {
      client = sdk.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" }
      });
      client.auth.onAuthStateChange((event, nextSession) => {
        setIdentity(nextSession, event);
      });
      const sessionResult = await client.auth.getSession();
      if (sessionResult.error) throw sessionResult.error;
      if (sessionResult.data && sessionResult.data.session) setIdentity(sessionResult.data.session, "INITIAL_SESSION");
      else if (!authReady) setIdentity(null, "INITIAL_SESSION");
      if (!sessionResult.data || !sessionResult.data.session) {
        authReady = true;
        if (!guestChosen) {
          gateOpen = true;
          if (ui) {
            setGateFeedback("", "info");
            if (authProblem) setGateFeedback(authProblem, "error");
          }
        }
      }
      if (ui && !userId && !guestChosen) showGate(gateView);
      // The auth listener remains active for session restoration and token refresh.
    } catch (error) {
      authProblem = authErrorMessage(error, "restore");
      authReady = true;
      if (!userId) gateOpen = true;
      if (ui) {
        setGateFeedback(authProblem, "error");
        setStatus(authProblem, "error");
      }
      updateUi();
      if (!userId) showGate("welcome");
    } finally {
      resolveReady();
    }
  }

  function onKeyDown(event) {
    if (event.key === "Escape" && ui && !ui.rankingOverlay.hidden) closeRankingPanel();
  }

  document.addEventListener("keydown", onKeyDown);
  void initialize().catch(error => {
    authProblem = authErrorMessage(error, "restore");
    authReady = true;
    if (ui) {
      setGateFeedback(authProblem, "error");
      setStatus(authProblem, "error");
    }
    updateUi();
    resolveReady();
  });
})(globalThis);
