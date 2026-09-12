(() => {
  "use strict";

  const DATA = window.SOLAR_DATA;
  const ORBITERS = window.ORBITER_DATA || {};
  const I18N = window.HELIOS_I18N;
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const DEG = Math.PI / 180;
  const TAU = Math.PI * 2;
  const J2000 = 2451545.0;
  const ORBITAL_ANIMATION_SCALE = .18;
  const MAX_FOCUS_ITEMS = 3;
  const LANGUAGES = ["ru", "en", "de", "es"];
  const INTRO_DURATION = 2400;
  const introStartedAt = performance.now();
  const BODY_TEXTURES = {
    sun: "assets/sun-map.jpg",
    mercury: "assets/mercury-clean-v11.png",
    venus: "assets/venus-visible-v12.png",
    earth: "assets/earth-clean-v11.png",
    mars: "assets/mars-map.jpg",
    jupiter: "assets/jupiter-clean-v11.png",
    saturn: "assets/saturn-clean-v11.png",
    uranus: "assets/uranus-clean-v11.png",
    neptune: "assets/neptune-clean-v11.png"
  };

  const ui = {
    canvas: $("#scene"), layer: $("#ui-layer"), loading: $("#loading"), labels: $("#labels"),
    tooltip: $("#tooltip"), date: $("#date-input"), clock: $("#clock"), clockCaption: $("#clock-caption"),
    jd: $("#date-jd"), now: $("#now-button"), play: $("#play-button"), speed: $("#speed-input"), speedOut: $("#speed-output"),
    panel: $("#object-panel"), objectIndex: $("#object-index"), name: $("#object-name"), latin: $("#object-latin"),
    lead: $("#object-lead"), story: $("#object-story"), stats: $("#object-stats"), discoveries: $("#discoveries-list"),
    hotspotCount: $("#hotspot-count"), orbiterCount: $("#orbiter-count"), orbiters: $("#orbiter-list"), orbiterLabels: $("#orbiter-labels"),
    focusCaption: $("#focus-caption"), focusName: $("#focus-name"),
    hotspotCard: $("#hotspot-card"), hotspotType: $("#hotspot-type"), hotspotTitle: $("#hotspot-title"), hotspotText: $("#hotspot-text"),
    wallpaperToggle: $("#wallpaper-mode-button"), rotationToggle: $("#rotation-toggle"), explorationToggle: $("#exploration-toggle"), wallpaperExit: $("#wallpaper-mode-exit"), widgets: $("#wallpaper-widgets"),
    clockWidget: $("#desktop-clock-widget"), desktopClock: $("#desktop-clock"), desktopDate: $("#desktop-date"),
    clockMeta: $("#clock-meta"), clockZone: $("#clock-zone"), clockDay: $("#clock-day"),
    audioWidget: $("#audio-widget"), audioCanvas: $("#audio-visualizer"), audioStyle: $("#audio-style-label"), audioStatus: $("#audio-source-status"),
    timerWidget: $("#timer-widget"), timerDisplay: $("#timer-display"), timerStatus: $("#timer-status"),
    timerToggle: $("#timer-toggle"), timerReset: $("#timer-reset"), language: $("#language-select")
  };

  const state = {
    mode: "orbit", scale: "scenic", language: "en", date: new Date(), playing: true, realtime: true, speed: 10,
    selected: null, activeHotspot: -1, activeOrbiter: null, hovered: null, showLabels: true, showOrbits: true, rotationEnabled: true, explorationEnabled: true,
    quality: 1, fps: 60, theta: .78, phi: .92, distance: 23.5, targetDistance: 23.5,
    dragging: false, moved: false, pointerX: 0, pointerY: 0, focusRotX: .08, focusRotY: -.45,
    targetFocusRotX: .08, targetFocusRotY: -.45, targetFocusDistance: 10.6, lastFrame: 0, lastDateUi: 0, lastRealtimeOrbit: 0,
    fallback2D: false, fallbackZoom: 1, fallbackFocusZoom: 1, wallpaperMode: false, widgetsWallpaperOnly: true,
    showClockWidget: true, showDateWidget: true, clockStyle: "digital", showVisualizer: false, visualizerStyle: "bars",
    visualizerSensitivity: 1, widgetPosition: "top-right", widgetScale: 1, interfaceScale: 1, textScale: 1,
    showTimer: false, timerDuration: 1500, timerRemaining: 1500, timerRunning: false, clock12: false,
    showGravityGrid: true, gravityGridCellScale: .5, gravityGridStrength: 1, gravityGridOpacity: .28, gravityWaves: true,
    audioData: new Array(64).fill(0), audioSmooth: new Array(64).fill(0), audioConnected: false,
    audioListenerRegistered: false, lastAudioRegisterAttempt: 0, lastAudioPacket: 0, lastWidgetClock: 0
  };

  let renderer, scene, camera, systemGroup, orbitGroup, focusRoot, focusBody, focusHotspots, focusOrbitalSystem;
  let gravityGrid, gravityGridLines, gravityGridBase, gravityGridFade, lastGravityUpdate = 0;
  let raycaster, pointer, stars, sunLight, ambientLight;
  let mainLoopStarted = false, introTimer = 0;
  const bodies = new Map();
  const orbitLines = [];
  const labelEls = new Map();
  const textureCache = new Map();
  const clickTargets = [];
  const focusOrbiterEntries = [];
  let fallbackCtx;
  const fallbackBodies = [];
  const cameraTarget = new THREE.Vector3();
  const desiredCamera = new THREE.Vector3();
  const tempV = new THREE.Vector3();

  function currentLocale() { return I18N?.locales?.[state.language] || I18N?.locales?.en; }
  function t(key) { return currentLocale()?.ui?.[key] ?? I18N?.locales?.en?.ui?.[key] ?? key; }

  function translateType(type) {
    const key = I18N?.shared?.typeKeys?.[type];
    return key ? (currentLocale()?.types?.[key] || type) : type;
  }

  function translatePeriodText(value) {
    if (state.language === "ru") return value;
    const replacements = {
      en:[["Наблюдается с","Observed since"],["Открыты","Discovered"],["Открыт","Discovered"],["Обнаружен","Discovered"],["Миссия · с","Mission · since"],["Полярная миссия · с","Polar mission · since"],["Архивная полярная орбита","Archived polar orbit"],["Архивные меняющиеся орбиты","Archived changing orbits"],["Низкая орбита","Low orbit"],["Ретроградная орбита","Retrograde orbit"],["Период","Period"],["суток","days"],["сутки","days"],["часа","hours"],["ч ","h "],["мин","min"]],
      de:[["Наблюдается с","Beobachtet seit"],["Открыты","Entdeckt"],["Открыт","Entdeckt"],["Обнаружен","Entdeckt"],["Миссия · с","Mission · seit"],["Полярная миссия · с","Polarmission · seit"],["Архивная полярная орбита","Archivierte Polarbahn"],["Архивные меняющиеся орбиты","Archivierte wechselnde Bahnen"],["Низкая орбита","Niedrige Umlaufbahn"],["Ретроградная орбита","Retrograde Umlaufbahn"],["Период","Umlaufzeit"],["суток","Tage"],["сутки","Tage"],["часа","Stunden"],["ч ","h "],["мин","min"]],
      es:[["Наблюдается с","Observada desde"],["Открыты","Descubiertos"],["Открыт","Descubierto"],["Обнаружен","Descubierto"],["Миссия · с","Misión · desde"],["Полярная миссия · с","Misión polar · desde"],["Архивная полярная орбита","Órbita polar histórica"],["Архивные меняющиеся орбиты","Órbitas variables históricas"],["Низкая орбита","Órbita baja"],["Ретроградная орбита","Órbita retrógrada"],["Период","Periodo"],["суток","días"],["сутки","días"],["часа","horas"],["ч ","h "],["мин","min"]]
    };
    return [...(replacements[state.language] || [])].sort((a, b) => b[0].length - a[0].length).reduce((text, [from, to]) => text.replace(from, to), String(value));
  }

  function localizedBody(data) {
    const copy = currentLocale()?.bodies?.[data.id] || {};
    const titles = copy.hotspots || [];
    return {
      ...data, ...copy,
      hotspots:data.hotspots.map((spot, index) => {
        const title = titles[index] || spot.title;
        return { ...spot, title, type:translateType(spot.type), year:translatePeriodText(spot.year), text:state.language === "ru" ? spot.text : t("hotspotGeneric").replace("{name}", title) };
      })
    };
  }

  function localizedOrbiter(bodyId, orbiter, index) {
    if (state.language === "ru") return orbiter;
    const translatedNames = currentLocale()?.orbiterNames?.[bodyId] || I18N?.shared?.orbiterNames?.[bodyId] || [];
    const name = translatedNames[index] || orbiter.name;
    return {
      ...orbiter, name, type:translateType(orbiter.type), status:translatePeriodText(orbiter.status),
      text:t(orbiter.craft ? "craftGeneric" : "moonGeneric").replace("{name}", name)
    };
  }

  function localizedOrbiters(bodyId) {
    return (ORBITERS[bodyId] || []).slice(0, MAX_FOCUS_ITEMS).map((orbiter, index) => localizedOrbiter(bodyId, orbiter, index));
  }

  function init() {
    initWallpaperUi();
    try {
      renderer = new THREE.WebGLRenderer({ canvas: ui.canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    } catch (error) {
      initFallback2D();
      return;
    }
    renderer.setClearColor(0x010308, 1);
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.8));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x010308, .0048);
    camera = new THREE.PerspectiveCamera(43, innerWidth / innerHeight, .02, 700);
    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();

    ambientLight = new THREE.AmbientLight(0x657286, .29);
    sunLight = new THREE.PointLight(0xffe0b0, 3.4, 150, 1.12);
    scene.add(ambientLight, sunLight);

    createStarfield();
    createSystem();
    createGravityGrid();
    createLabels();
    bindUi();
    setDateInput(state.date);
    syncPlay();
    updatePositions(true);
    setMode("orbit", true);
    resize();

    completeIntro();
  }

  function completeIntro() {
    const delay = Math.max(180, INTRO_DURATION - (performance.now() - introStartedAt));
    clearTimeout(introTimer);
    introTimer = setTimeout(finishIntro, delay);
  }

  function finishIntro() {
    clearTimeout(introTimer);
    ui.loading.classList.add("done");
    if (mainLoopStarted) return;
    mainLoopStarted = true;
    state.lastFrame = performance.now();
    requestAnimationFrame(state.fallback2D ? animateFallback : animate);
  }

  function initWallpaperUi() {
    let savedLanguage = "en";
    try { savedLanguage = localStorage.getItem("helios-language") || "en"; } catch (error) {}
    ui.language.addEventListener("click", () => {
      const current = LANGUAGES.indexOf(state.language);
      setLanguage(LANGUAGES[(current + 1) % LANGUAGES.length], true);
    });
    ui.loading.addEventListener("pointerdown", finishIntro, { once:true });
    ui.rotationToggle.addEventListener("click", () => setRotationEnabled(!state.rotationEnabled));
    ui.explorationToggle.addEventListener("click", () => setExplorationEnabled(!state.explorationEnabled));
    ui.wallpaperToggle.addEventListener("click", () => setWallpaperMode(!state.wallpaperMode));
    ui.wallpaperExit.addEventListener("click", () => setWallpaperMode(false));
    ui.timerToggle.addEventListener("click", () => {
      if (state.timerRemaining <= 0) state.timerRemaining = state.timerDuration;
      state.timerRunning = !state.timerRunning;
      updateTimerUi();
    });
    ui.timerReset.addEventListener("click", () => {
      state.timerRunning = false;
      state.timerRemaining = state.timerDuration;
      updateTimerUi();
    });
    setWidgetPosition(state.widgetPosition);
    setClockStyle(state.clockStyle);
    setLanguage(savedLanguage, false);
    updateWidgetVisibility();
    updateTimerUi();
  }

  function setRotationEnabled(enabled) {
    state.rotationEnabled = !!enabled;
    document.body.classList.toggle("rotation-disabled", !state.rotationEnabled);
    ui.rotationToggle.classList.toggle("active", state.rotationEnabled);
    ui.rotationToggle.setAttribute("aria-pressed", String(state.rotationEnabled));
    ui.rotationToggle.textContent = t(state.rotationEnabled ? "rotationOn" : "rotationOff");
    ui.rotationToggle.title = t("rotationToggle");
    const focusInstruction = $("#focus-caption > span");
    if (focusInstruction) focusInstruction.textContent = t(state.rotationEnabled ? "dragPlanet" : "rotationDisabled");
    updateModeCopy();
    if (!state.rotationEnabled) {
      state.dragging = false;
      ui.canvas.classList.remove("dragging");
    }
  }

  function setExplorationEnabled(enabled) {
    state.explorationEnabled = !!enabled;
    document.body.classList.toggle("exploration-disabled", !state.explorationEnabled);
    ui.explorationToggle.classList.toggle("active", state.explorationEnabled);
    ui.explorationToggle.setAttribute("aria-pressed", String(state.explorationEnabled));
    ui.explorationToggle.textContent = t(state.explorationEnabled ? "explorationOn" : "explorationOff");
    ui.explorationToggle.title = t("explorationToggle");
    if (!state.explorationEnabled) {
      state.hovered = null;
      ui.tooltip.style.display = "none";
    }
    updateModeCopy();
  }

  function setLanguage(language, persist) {
    state.language = I18N?.locales?.[language] ? language : "en";
    document.documentElement.lang = state.language;
    ui.language.dataset.language = state.language;
    ui.language.textContent = state.language.toUpperCase();
    if (persist) { try { localStorage.setItem("helios-language", state.language); } catch (error) {} }
    applyStaticLanguage();
    refreshPlanetLabels();
    updateTimerUi();
    syncPlay();
    updateClock();
    state.lastWidgetClock = 0;
    if (state.selected) openFocus(state.selected);
  }

  function applyStaticLanguage() {
    document.title = t("pageTitle");
    $(".brand b").textContent = state.language === "ru" ? "ГЕЛИОС" : "HELIOS";
    $("#prev-day").textContent = `−1${state.language === "de" ? "T" : state.language === "ru" ? "д" : "d"}`;
    $("#next-day").textContent = `+1${state.language === "de" ? "T" : state.language === "ru" ? "д" : "d"}`;
    const textTargets = [
      [".brand small","brandSubtitle"],["#wallpaper-mode-button","wallpaperMode"],["#date-dock label > span","epoch"],["#now-button","now"],
      ["#date-dock .speed > span","speed"],[".map-legend .eyebrow","scaleTitle"],["[data-scale='scenic']","scenic"],["[data-scale='relative']","relative"],
      ["#wallpaper-mode-exit","showUi"],[".timer-widget .widget-head span","timer"],["#timer-reset","reset"],["#close-panel","back"],
      [".facts h2","facts"],[".discoveries .section-title h2","discoveries"],[".orbital-objects .section-title h2","companions"],
      [".orbit-note","orbitNote"],["#focus-caption > span","dragPlanet"],["#intro-status","loading"],["#intro-ephemerides","ephemerides"]
    ];
    textTargets.forEach(([selector, key]) => { const element = $(selector); if (element) element.textContent = t(key); });
    const orbitMode = $(".mode[data-mode='orbit']");
    const lineupMode = $(".mode[data-mode='lineup']");
    if (orbitMode) orbitMode.innerHTML = `<span>01</span> ${t("modeOrbit")}`;
    if (lineupMode) lineupMode.innerHTML = `<span>02</span> ${t("modeLineup")}`;
    const firstStatus = $(".system-status span:nth-child(1)");
    const secondStatus = $(".system-status span:nth-child(2)");
    if (firstStatus) firstStatus.innerHTML = `<i class="status-orbit"></i> ${t("ecliptic")}`;
    if (secondStatus) secondStatus.innerHTML = `<i></i> ${t("calculated")}`;
    ui.canvas.setAttribute("aria-label", t("pageTitle"));
    $(".mode-switch")?.setAttribute("aria-label", t("mapMode"));
    ui.wallpaperToggle.title = t("hideUi");
    ui.wallpaperExit.setAttribute("aria-label", t("showUi"));
    ui.widgets.setAttribute("aria-label", t("desktopItems"));
    ui.audioCanvas.setAttribute("aria-label", t("spectrum"));
    $("#close-panel")?.setAttribute("aria-label", t("backAria"));
    $("#prev-object")?.setAttribute("aria-label", t("previousObject"));
    $("#next-object")?.setAttribute("aria-label", t("nextObject"));
    $("#hotspot-card button")?.setAttribute("aria-label", t("close"));
    ui.language.setAttribute("aria-label", t("language"));
    ui.language.parentElement.title = t("language");
    setRotationEnabled(state.rotationEnabled);
    setExplorationEnabled(state.explorationEnabled);
    $("#prev-day").title = t("previousDay");
    $("#next-day").title = t("nextDay");
    ui.play.title = t("startTime");
    updateModeCopy();
    updateScaleCopy();
  }

  function updateModeCopy() {
    let key;
    if (state.mode === "orbit") {
      key = state.explorationEnabled
        ? (state.rotationEnabled ? "hintOrbit" : "hintOrbitLocked")
        : (state.rotationEnabled ? "hintOrbitNoExplore" : "hintLockedNoExplore");
    } else key = state.explorationEnabled ? "hintLineup" : "hintLineupNoExplore";
    $("#hint").innerHTML = t(key);
  }

  function updateScaleCopy() {
    $("#scale-note").textContent = state.scale === "scenic" ? t("scenicNote") : t("relativeNote");
  }

  function refreshPlanetLabels() {
    DATA.forEach((data) => {
      const el = labelEls.get(data.id);
      if (!el) return;
      const copy = localizedBody(data);
      el.innerHTML = `<b>${copy.name}</b><small>${data.id === "sun" ? t("center") : semimajor(data).toFixed(data.index < 4 ? 2 : 1) + " " + t("au")}</small>`;
    });
  }

  function wallpaperAudioListener(samples) {
    if (!samples || samples.length < 2) return;
    const half = Math.min(64, Math.floor(samples.length / 2));
    for (let i = 0; i < 64; i++) {
      const bin = Math.min(half - 1, Math.floor(i / 63 * Math.max(0, half - 1)));
      const raw = Math.min(1, Math.max(0, ((Number(samples[bin]) || 0) + (Number(samples[Math.min(samples.length - 1, bin + half)]) || 0)) * .5));
      state.audioData[i] = raw;
      state.audioSmooth[i] += (raw - state.audioSmooth[i]) * .42;
    }
    state.audioConnected = true;
    state.lastAudioPacket = performance.now();
  }

  function registerWallpaperAudio() {
    if (state.audioListenerRegistered || typeof window.wallpaperRegisterAudioListener !== "function") return false;
    try {
      window.wallpaperRegisterAudioListener(wallpaperAudioListener);
      state.audioListenerRegistered = true;
      return true;
    } catch (error) {
      return false;
    }
  }

  function setWallpaperMode(enabled) {
    state.wallpaperMode = !!enabled;
    document.body.classList.toggle("wallpaper-mode", state.wallpaperMode);
    ui.wallpaperToggle.classList.toggle("active", state.wallpaperMode);
    ui.wallpaperToggle.setAttribute("aria-pressed", String(state.wallpaperMode));
    updateFocusPresentation();
  }

  function updateFocusPresentation() {
    if (!state.selected) return;
    if (state.fallback2D) return;
    if (!focusBody) return;
    focusBody.position.x = state.wallpaperMode ? 0 : 2.25;
    if (focusHotspots) focusHotspots.visible = !state.wallpaperMode;
    desiredCamera.set(0, .05, state.targetFocusDistance);
    cameraTarget.set(state.wallpaperMode ? 0 : .25, 0, 0);
  }

  function setWidgetPosition(position) {
    const positions = ["top-right", "top-left", "bottom-right", "bottom-left"];
    state.widgetPosition = positions.includes(position) ? position : "top-right";
    positions.forEach((value) => ui.widgets.classList.toggle(`position-${value}`, value === state.widgetPosition));
  }

  function setClockStyle(style) {
    const styles = ["digital", "mission", "orbital", "minimal", "terminal"];
    state.clockStyle = styles.includes(style) ? style : "digital";
    styles.forEach((value) => ui.clockWidget.classList.toggle(`clock-${value}`, value === state.clockStyle));
  }

  function updateWidgetVisibility() {
    ui.desktopClock.hidden = !state.showClockWidget;
    ui.desktopDate.hidden = !state.showDateWidget;
    ui.clockMeta.hidden = !state.showClockWidget;
    ui.clockWidget.hidden = !state.showClockWidget && !state.showDateWidget;
    ui.audioWidget.hidden = !state.showVisualizer;
    ui.timerWidget.hidden = !state.showTimer;
    ui.widgets.style.setProperty("--widget-scale", state.widgetScale.toFixed(2));
    document.body.classList.toggle("widgets-wallpaper-only", state.widgetsWallpaperOnly);
  }

  function updateTimerUi() {
    const total = Math.max(0, Math.ceil(state.timerRemaining));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    ui.timerDisplay.textContent = `${hours ? String(hours).padStart(2, "0") + ":" : ""}${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    ui.timerToggle.textContent = state.timerRunning ? t("pause") : total <= 0 ? t("again") : t("start");
    ui.timerStatus.textContent = total <= 0 ? t("done") : state.timerRunning ? t("running") : t("pause");
  }

  function updateDesktopWidgets(now, dt) {
    if (now - state.lastWidgetClock > 200) {
      const actual = new Date();
      ui.desktopClock.textContent = new Intl.DateTimeFormat(currentLocale().code, {
        hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: state.clock12 === true
      }).format(actual);
      ui.desktopDate.textContent = new Intl.DateTimeFormat(currentLocale().code, {
        weekday: "long", day: "2-digit", month: "long", year: "numeric"
      }).format(actual).toUpperCase();
      const zone = new Intl.DateTimeFormat(currentLocale().code, { timeZoneName: "short" }).formatToParts(actual).find((part) => part.type === "timeZoneName")?.value || "LOCAL";
      const start = new Date(actual.getFullYear(), 0, 0);
      const day = Math.floor((actual - start) / 86400000);
      ui.clockZone.textContent = zone.toUpperCase();
      ui.clockDay.textContent = `${t("day")} ${String(day).padStart(3, "0")}`;
      state.lastWidgetClock = now;
    }
    if (state.timerRunning) {
      state.timerRemaining = Math.max(0, state.timerRemaining - dt);
      if (state.timerRemaining <= 0) state.timerRunning = false;
      updateTimerUi();
    }
    if (state.showVisualizer) {
      if (!state.audioListenerRegistered && now - state.lastAudioRegisterAttempt > 1000) {
        state.lastAudioRegisterAttempt = now;
        registerWallpaperAudio();
      }
      const age = now - state.lastAudioPacket;
      const live = state.audioConnected && age < 1200;
      if (!live) state.audioSmooth.forEach((value, index) => { state.audioSmooth[index] = value * .92; });
      ui.audioStatus.textContent = live ? t("audioLive") : state.audioListenerRegistered ? t("noSignal") : t("apiUnavailable");
      ui.audioWidget.classList.toggle("audio-live", live);
      ui.audioWidget.classList.toggle("audio-silent", !live);
      drawAudioVisualizer(now);
    }
  }

  function audioValue(index, count, now) {
    const samples = state.audioSmooth;
    if (!state.audioConnected || !samples.length) return .008 + Math.max(0, Math.sin(now * .0016 + index * .72)) * .008;
    const bin = Math.min(samples.length - 1, Math.floor(index / Math.max(1, count - 1) * (samples.length - 1)));
    const value = Number(samples[bin]) || 0;
    return Math.min(1, Math.pow(Math.max(0, value) * state.visualizerSensitivity, .78));
  }

  function drawAudioVisualizer(now) {
    const canvas = ui.audioCanvas;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    const width = Math.round(rect.width * dpr), height = Math.round(rect.height * dpr);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width, h = rect.height;
    ctx.clearRect(0, 0, w, h);
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#3fd2ff";
    const gradient = ctx.createLinearGradient(0, h, 0, 0);
    gradient.addColorStop(0, "rgba(63,210,255,.08)"); gradient.addColorStop(1, accent);
    ctx.strokeStyle = accent; ctx.fillStyle = gradient; ctx.lineCap = "round";
    const labels = { bars:"spectrum", wave:"wave", radial:"radial", mirror:"mirror", rings:"rings", constellation:"constellation" };
    ui.audioWidget.classList.toggle("radial", state.visualizerStyle === "radial" || state.visualizerStyle === "rings");
    ui.audioStyle.textContent = t(labels[state.visualizerStyle] || "spectrum");
    if (state.visualizerStyle === "wave") {
      const count = 64;
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const x = i / (count - 1) * w;
        const value = audioValue(i, count, now);
        const y = h * .5 + Math.sin(i * .52 + now * .003) * value * h * .42;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.lineWidth = 1.5; ctx.shadowColor = accent; ctx.shadowBlur = 7; ctx.stroke();
      ctx.shadowBlur = 0; ctx.strokeStyle = "rgba(120,170,195,.13)"; ctx.beginPath(); ctx.moveTo(0, h * .5); ctx.lineTo(w, h * .5); ctx.stroke();
    } else if (state.visualizerStyle === "radial") {
      const count = 56, cx = w * .5, cy = h * .52, base = Math.min(w, h) * .23;
      ctx.lineWidth = 2;
      for (let i = 0; i < count; i++) {
        const angle = i / count * TAU - Math.PI / 2;
        const value = audioValue(i, count, now);
        const inner = base, outer = base + 5 + value * Math.min(w, h) * .22;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner); ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer); ctx.stroke();
      }
      ctx.strokeStyle = "rgba(120,190,215,.16)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, base - 5, 0, TAU); ctx.stroke();
    } else if (state.visualizerStyle === "mirror") {
      const count = 42, gap = 3, barWidth = (w - gap * (count - 1)) / count;
      for (let i = 0; i < count; i++) {
        const value = audioValue(Math.abs(i - count / 2), count / 2, now);
        const barHeight = 2 + value * h * .44;
        ctx.globalAlpha = .4 + value * .6;
        ctx.fillRect(i * (barWidth + gap), h * .5 - barHeight, Math.max(1, barWidth), barHeight);
        ctx.fillRect(i * (barWidth + gap), h * .5 + 2, Math.max(1, barWidth), barHeight);
      }
      ctx.globalAlpha = 1; ctx.strokeStyle = "rgba(120,190,215,.18)"; ctx.beginPath(); ctx.moveTo(0,h*.5); ctx.lineTo(w,h*.5); ctx.stroke();
    } else if (state.visualizerStyle === "rings") {
      const cx = w * .5, cy = h * .52, base = Math.min(w,h) * .105;
      ctx.lineWidth = 2.2; ctx.shadowColor = accent; ctx.shadowBlur = 5;
      for (let ring = 0; ring < 7; ring++) {
        const value = audioValue(ring * 8, 56, now);
        const radius = base + ring * Math.min(w,h) * .047 + value * 9;
        ctx.globalAlpha = .18 + value * .72;
        ctx.beginPath(); ctx.arc(cx,cy,radius,(-.9 + ring*.11)*Math.PI,(1.55 + ring*.08)*Math.PI); ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    } else if (state.visualizerStyle === "constellation") {
      const count = 22, points = [];
      for (let i = 0; i < count; i++) {
        const value = audioValue(i,count,now);
        points.push({x:i/(count-1)*w, y:h*.5 + Math.sin(i*.86 + now*.0015)*h*.12 + (value-.15)*h*.38});
      }
      ctx.strokeStyle = "rgba(120,210,235,.34)"; ctx.lineWidth = 1; ctx.beginPath();
      points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)); ctx.stroke();
      points.forEach((p,i)=>{const value=audioValue(i,count,now);ctx.globalAlpha=.35+value*.65;ctx.fillStyle=accent;ctx.beginPath();ctx.arc(p.x,p.y,1.4+value*3.2,0,TAU);ctx.fill();});
      ctx.globalAlpha = 1;
    } else {
      const count = 38, gap = 3, barWidth = (w - gap * (count - 1)) / count;
      for (let i = 0; i < count; i++) {
        const value = audioValue(i, count, now);
        const barHeight = 2 + value * (h - 7);
        ctx.globalAlpha = .46 + value * .54;
        ctx.fillRect(i * (barWidth + gap), h - barHeight, Math.max(1, barWidth), barHeight);
      }
      ctx.globalAlpha = 1;
    }
  }

  function initFallback2D() {
    state.fallback2D = true;
    const replacement = ui.canvas.cloneNode(false);
    ui.canvas.replaceWith(replacement);
    ui.canvas = replacement;
    fallbackCtx = ui.canvas.getContext("2d");
    ui.labels.style.display = "none";
    bindFallbackUi();
    setDateInput(state.date);
    syncSpeed();
    syncPlay();
    resizeFallback();
    addEventListener("resize", resizeFallback);
    completeIntro();
  }

  function bindFallbackUi() {
    $$(".mode").forEach((b) => b.addEventListener("click", () => setFallbackMode(b.dataset.mode)));
    $$("[data-scale]").forEach((b) => b.addEventListener("click", () => setFallbackScale(b.dataset.scale)));
    $("#prev-day").addEventListener("click", () => fallbackChangeDays(-1));
    $("#next-day").addEventListener("click", () => fallbackChangeDays(1));
    $("#now-button").addEventListener("click", activateRealtime);
    ui.date.addEventListener("change", () => { const d = new Date(ui.date.value); if (!isNaN(d)) { state.date = d; pauseTime(); } });
    ui.play.addEventListener("click", togglePlayback);
    ui.speed.addEventListener("input", () => { state.realtime = false; syncSpeed(); state.playing = state.speed !== 0; syncPlay(); });
    $("#close-panel").addEventListener("click", closeFocus);
    $("#prev-object").addEventListener("click", () => cycleObject(-1));
    $("#next-object").addEventListener("click", () => cycleObject(1));
    ui.hotspotCard.querySelector("button").addEventListener("click", () => { ui.hotspotCard.classList.remove("visible"); state.activeHotspot = -1; state.activeOrbiter = null; });
    ui.canvas.addEventListener("pointerdown", (e) => { state.dragging = true; state.moved = false; state.pointerX = e.clientX; state.pointerY = e.clientY; });
    ui.canvas.addEventListener("pointermove", (e) => {
      if (!state.dragging) return;
      const dx = e.clientX - state.pointerX, dy = e.clientY - state.pointerY;
      if (Math.abs(dx) + Math.abs(dy) > 2) state.moved = true;
      if (state.rotationEnabled) {
        if (state.selected) { state.targetFocusRotY += dx * .007; state.targetFocusRotX = THREE.MathUtils.clamp(state.targetFocusRotX + dy * .004, -.8, .8); }
        else if (state.mode === "orbit") state.theta -= dx * .006;
      }
      state.pointerX = e.clientX; state.pointerY = e.clientY;
    });
    ui.canvas.addEventListener("pointerup", (e) => { if (state.dragging && !state.moved) pickFallback(e.clientX, e.clientY); state.dragging = false; });
    addEventListener("keydown", (e) => { if (e.key === "Escape") state.wallpaperMode ? setWallpaperMode(false) : closeFocus(); });
  }

  function setFallbackMode(mode) {
    if (state.selected) closeFocus();
    state.mode = mode;
    $$(".mode").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
    $("#map-legend").style.display = mode === "orbit" ? "block" : "none";
    $("#date-dock").style.display = mode === "orbit" ? "flex" : "none";
    updateModeCopy();
  }

  function setFallbackScale(scale) {
    state.scale = scale;
    $$("[data-scale]").forEach((b) => b.classList.toggle("active", b.dataset.scale === scale));
    updateScaleCopy();
  }

  function fallbackChangeDays(days) {
    state.date = new Date(state.date.getTime() + days * 86400000); pauseTime(); setDateInput(state.date);
  }

  function resizeFallback() {
    applyInterfaceScale();
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    ui.canvas.width = Math.round(innerWidth * dpr); ui.canvas.height = Math.round(innerHeight * dpr);
    ui.canvas.style.width = innerWidth + "px"; ui.canvas.style.height = innerHeight + "px";
    fallbackCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function animateFallback(now) {
    requestAnimationFrame(animateFallback);
    const dt = Math.min(.05, (now - (state.lastFrame || now)) / 1000); state.lastFrame = now;
    if (state.realtime) {
      state.date = new Date();
      if (now - state.lastDateUi > 1000) { setDateInput(state.date); state.lastDateUi = now; }
    } else if (state.playing && !state.selected) {
      state.date = new Date(state.date.getTime() + dt * state.speed * 86400000);
      if (now - state.lastDateUi > 200) { setDateInput(state.date); state.lastDateUi = now; }
    }
    updateClock(); ui.jd.textContent = "JD " + julianDate(state.date).toFixed(2);
    updateDesktopWidgets(now, dt);
    state.focusRotX = THREE.MathUtils.lerp(state.focusRotX, state.targetFocusRotX, .09);
    state.focusRotY = THREE.MathUtils.lerp(state.focusRotY, state.targetFocusRotY, .09);
    drawFallback(now);
  }

  function drawFallback(now) {
    const ctx = fallbackCtx, w = innerWidth, h = innerHeight;
    ctx.clearRect(0, 0, w, h);
    const bg = ctx.createRadialGradient(w * .58, h * .48, 0, w * .58, h * .48, Math.max(w, h) * .8);
    bg.addColorStop(0, "#07111d"); bg.addColorStop(.42, "#030812"); bg.addColorStop(1, "#010207"); ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    drawFallbackStars(ctx, w, h);
    fallbackBodies.length = 0;
    if (state.selected) drawFallbackFocus(ctx, w, h, now);
    else if (state.mode === "lineup") drawFallbackLineup(ctx, w, h, now);
    else drawFallbackOrbits(ctx, w, h, now);
  }

  function drawFallbackStars(ctx, w, h) {
    ctx.save();
    for (let i = 0; i < 560; i++) {
      const x = ((Math.sin(i * 91.7) * 43758.5) % 1 + 1) % 1 * w;
      const y = ((Math.sin(i * 37.3 + 8) * 24634.2) % 1 + 1) % 1 * h;
      const a = .12 + ((i * 17) % 13) / 22; const r = i % 41 === 0 ? 1.15 : .48;
      ctx.fillStyle = `rgba(${i % 7 === 0 ? "150,194,255" : "220,232,243"},${a})`; ctx.fillRect(x, y, r, r);
    }
    ctx.restore();
  }

  function drawFallbackOrbits(ctx, w, h, now) {
    const cx = w * .53, cy = h * .56;
    const mapScale = Math.min(w, h) / (state.scale === "relative" ? 49 : 24) * state.fallbackZoom;
    DATA.slice(1).forEach((data) => {
      ctx.beginPath();
      for (let i = 0; i <= 150; i++) {
        const result = orbitalPosition(data, state.date, i / 150 * TAU), p = scaledPosition(result);
        const q = fallbackProject(p.x, p.z, p.y, cx, cy, mapScale);
        if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y);
      }
      ctx.strokeStyle = "rgba(113,151,176,.18)"; ctx.lineWidth = 1; ctx.stroke();
    });
    DATA.forEach((data) => {
      const p = data.id === "sun" ? {x:0,y:0,z:0} : scaledPosition(orbitalPosition(data, state.date));
      const q = fallbackProject(p.x, p.z, p.y, cx, cy, mapScale);
      const r = data.id === "sun" ? 14 : Math.max(3.4, data.visualRadius * 4.6);
      drawFallbackBody(ctx, data, q.x, q.y, r, now); fallbackBodies.push({ data, x:q.x, y:q.y, r:Math.max(12,r + 6) });
      drawFallbackLabel(ctx, data, q.x, q.y - r - 13);
    });
  }

  function fallbackProject(x, z, y, cx, cy, scale) {
    const c = Math.cos(state.theta), s = Math.sin(state.theta), rx = x * c - z * s, rz = x * s + z * c;
    return { x: cx + rx * scale, y: cy + rz * scale * .38 - y * scale };
  }

  function drawFallbackLineup(ctx, w, h, now) {
    const xs = [.08,.18,.29,.39,.50,.62,.74,.85,.94];
    ctx.strokeStyle = "rgba(105,143,168,.17)"; ctx.beginPath(); ctx.moveTo(w*.05,h*.58); ctx.lineTo(w*.97,h*.58); ctx.stroke();
    DATA.forEach((data, i) => {
      const x = xs[i] * w, y = h * .58, r = data.id === "sun" ? Math.min(w,h)*.052 : Math.max(4, data.visualRadius * Math.min(w,h) * .018);
      drawFallbackBody(ctx, data, x, y, r, now); fallbackBodies.push({ data, x, y, r:Math.max(14,r + 5) }); drawFallbackLabel(ctx, data, x, y - r - 16);
    });
  }

  function drawFallbackBody(ctx, data, x, y, r, now) {
    ctx.save();
    if (data.id === "sun") {
      const glow = ctx.createRadialGradient(x,y,r*.1,x,y,r*3.4); glow.addColorStop(0,"rgba(255,218,128,.9)"); glow.addColorStop(.24,"rgba(255,145,45,.3)"); glow.addColorStop(1,"rgba(255,80,20,0)"); ctx.fillStyle=glow; ctx.beginPath(); ctx.arc(x,y,r*3.4,0,TAU); ctx.fill();
    }
    if (data.rings) { ctx.strokeStyle="rgba(218,198,150,.55)"; ctx.lineWidth=Math.max(2,r*.18); ctx.beginPath(); ctx.ellipse(x,y,r*2.0,r*.55,-.15,0,TAU); ctx.stroke(); }
    const g = ctx.createRadialGradient(x-r*.3,y-r*.35,r*.08,x,y,r*1.15);
    const base = new THREE.Color(data.color), light = base.clone().offsetHSL(0,-.05,.2), dark=base.clone().offsetHSL(0,.04,-.32);
    g.addColorStop(0,`#${light.getHexString()}`); g.addColorStop(.55,data.color); g.addColorStop(1,`#${dark.getHexString()}`);
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,TAU); ctx.fill();
    ctx.clip(); ctx.globalAlpha=.22;
    if (["jupiter","saturn","venus","uranus","neptune","sun"].includes(data.id)) for(let k=-5;k<=5;k++){ctx.fillStyle=k%2?"#fff1ce":"#5b3a2c";ctx.fillRect(x-r,y+k*r*.18,r*2,r*.07);}
    else for(let k=0;k<16;k++){const a=k*2.4+data.index,r2=r*(.05+((k*37)%11)/18);ctx.fillStyle=k%2?"#130f0c":"#d7c39d";ctx.beginPath();ctx.arc(x+Math.sin(a)*r*.72,y+Math.cos(a*1.7)*r*.65,r2,0,TAU);ctx.fill();}
    ctx.restore();
  }

  function drawFallbackLabel(ctx, data, x, y) {
    const copy = localizedBody(data);
    ctx.save(); ctx.textAlign="center"; ctx.fillStyle="rgba(222,235,244,.76)"; ctx.font="600 8px Segoe UI"; ctx.fillText(copy.name.toUpperCase(),x,y); ctx.fillStyle="rgba(101,122,139,.65)"; ctx.font="7px Consolas"; ctx.fillText(data.id==="sun"?t("centerShort"):semimajor(data).toFixed(data.index<4?2:1)+" "+t("au").toUpperCase(),x,y+11); ctx.restore();
  }

  function drawFallbackFocus(ctx, w, h, now) {
    const data = state.selected, x=state.wallpaperMode?w*.5:w*.73, y=h*.52, r=Math.min(w,h)*.215*state.fallbackFocusZoom;
    drawFallbackBody(ctx,data,x,y,r,now); fallbackBodies.push({data,x,y,r});
    const orbiters = localizedOrbiters(data.id);
    orbiters.forEach((orbiter, i) => {
      const orbitRadius = r * (.72 + orbiter.distance * .24);
      const angle = (orbiter.phase || 0) + now * .001 * orbiter.speed * ORBITAL_ANIMATION_SCALE;
      ctx.strokeStyle = orbiter.historic ? "rgba(112,101,92,.16)" : "rgba(79,131,157,.24)";
      ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x, y, orbitRadius, orbitRadius * .34, 0, 0, TAU); ctx.stroke();
      const ox = x + Math.cos(angle) * orbitRadius, oy = y + Math.sin(angle) * orbitRadius * .34;
      ctx.fillStyle = orbiter.color;
      if (orbiter.craft) { ctx.fillRect(ox - 5, oy - 2, 10, 4); ctx.fillRect(ox - 1, oy - 5, 2, 10); }
      else { ctx.beginPath(); ctx.arc(ox, oy, Math.max(3, orbiter.size * r * .55), 0, TAU); ctx.fill(); }
      ctx.fillStyle = orbiter.historic ? "rgba(167,177,183,.45)" : "rgba(210,226,235,.78)"; ctx.font = "7px Segoe UI"; ctx.textAlign = "center"; ctx.fillText(orbiter.name.toUpperCase(), ox, oy - 9);
      fallbackBodies.push({orbiter:i,x:ox,y:oy,r:13});
    });
    if (!state.wallpaperMode) data.hotspots.slice(0, MAX_FOCUS_ITEMS).forEach((spot,i)=>{
      const lat=spot.lat*DEG+state.focusRotX*.35, lon=spot.lon*DEG+state.focusRotY;
      const px=x+Math.sin(lon)*Math.cos(lat)*r*.95, py=y-Math.sin(lat)*r*.95, front=Math.cos(lon)*Math.cos(lat)>-.08;
      if(!front)return;
      const pulse=1+Math.sin(now*.004+i*2)*.25; ctx.strokeStyle=i===state.activeHotspot?"#d8f8ff":"rgba(63,210,255,.8)"; ctx.lineWidth=1;
      ctx.beginPath();ctx.arc(px,py,7*pulse,0,TAU);ctx.stroke();ctx.fillStyle="#9bedff";ctx.beginPath();ctx.arc(px,py,2.2,0,TAU);ctx.fill();
      fallbackBodies.push({hotspot:i,x:px,y:py,r:13});
    });
    const activeMarker = state.activeHotspot >= 0
      ? fallbackBodies.find((b) => b.hotspot === state.activeHotspot)
      : state.activeOrbiter ? fallbackBodies.find((b) => b.orbiter === state.activeOrbiter.index) : null;
    if (activeMarker) {
      ui.hotspotCard.style.left = THREE.MathUtils.clamp(activeMarker.x + 20, w * .43, w - 310) + "px";
      ui.hotspotCard.style.top = THREE.MathUtils.clamp(activeMarker.y - 25, 95, h - 175) + "px";
    }
  }

  function pickFallback(x, y) {
    const hit=[...fallbackBodies].reverse().find((b)=>Math.hypot(x-b.x,y-b.y)<=b.r);
    if(!hit)return;
    if(hit.hotspot!=null)selectHotspot(hit.hotspot);else if(hit.orbiter!=null)selectOrbiter(hit.orbiter);else if(!state.selected && state.explorationEnabled)openFocus(hit.data);
  }

  function createStarfield() {
    const count = state.quality ? 4200 : 2100;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const r = 105 + Math.random() * 210;
      const u = Math.random() * 2 - 1;
      const a = Math.random() * TAU;
      const s = Math.sqrt(1 - u * u);
      positions[i * 3] = r * s * Math.cos(a);
      positions[i * 3 + 1] = r * u;
      positions[i * 3 + 2] = r * s * Math.sin(a);
      const warmth = Math.random();
      color.setHSL(.56 + warmth * .08, .25 + warmth * .35, .6 + Math.random() * .38);
      colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    stars = new THREE.Points(geometry, new THREE.PointsMaterial({ size: .34, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: .85, depthWrite: false }));
    scene.add(stars);

    const hazeGeometry = new THREE.SphereGeometry(92, 32, 16);
    const hazeMaterial = new THREE.MeshBasicMaterial({ color: 0x07111e, side: THREE.BackSide, transparent: true, opacity: .28, depthWrite: false });
    scene.add(new THREE.Mesh(hazeGeometry, hazeMaterial));
  }

  function createSystem() {
    systemGroup = new THREE.Group();
    orbitGroup = new THREE.Group();
    focusRoot = new THREE.Group();
    focusRoot.visible = false;
    scene.add(orbitGroup, systemGroup, focusRoot);

    DATA.forEach((data) => {
      const radius = data.id === "sun" ? .72 : Math.max(.105, data.visualRadius * .25);
      const mesh = createBodyMesh(data, radius, false);
      mesh.userData.planet = data;
      systemGroup.add(mesh);
      bodies.set(data.id, mesh);
      clickTargets.push(mesh);
      if (data.id !== "sun") {
        const line = createOrbitLine(data);
        orbitGroup.add(line);
        orbitLines.push(line);
      }
    });
  }

  function createGravityGrid() {
    gravityGrid = new THREE.Group();
    gravityGrid.name = "gravity-fabric";
    gravityGridLines = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: state.gravityGridOpacity, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    gravityGridLines.frustumCulled = false;
    gravityGridLines.renderOrder = -2;
    gravityGrid.add(gravityGridLines);
    scene.add(gravityGrid);
    rebuildGravityGrid();
    syncGravityGridVisibility();
  }

  function rebuildGravityGrid() {
    if (!gravityGridLines) return;
    const baseDivisions = state.quality ? 46 : 30;
    const divisions = Math.max(24, Math.min(112, Math.round(baseDivisions / state.gravityGridCellScale)));
    const extent = state.scale === "relative" ? 52 : 28;
    const half = extent * .5;
    const positions = [];
    const colors = [];
    const fades = [];
    const accent = new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#3fd2ff");
    const edgeFade = (x, z) => {
      const radius = Math.hypot(x, z) / half;
      if (radius >= 1) return 0;
      const t = Math.max(0, Math.min(1, (radius - .68) / .32));
      return 1 - t * t * (3 - 2 * t);
    };
    const point = (x, z, fade, strength) => {
      positions.push(x, -.24, z);
      colors.push(accent.r * fade * strength, accent.g * fade * strength, accent.b * fade * strength);
      fades.push(fade);
    };
    const segment = (x1, z1, x2, z2, strength) => {
      const fade1 = edgeFade(x1, z1);
      const fade2 = edgeFade(x2, z2);
      if (fade1 <= .001 && fade2 <= .001) return;
      point(x1, z1, fade1, strength);
      point(x2, z2, fade2, strength);
    };
    const majorStep = Math.max(4, Math.round(4 / state.gravityGridCellScale));
    for (let i = 0; i <= divisions; i++) {
      const fixed = -half + i / divisions * extent;
      const strength = (i - Math.floor(divisions / 2)) % majorStep === 0 ? 1 : .48;
      for (let j = 0; j < divisions; j++) {
        const a = -half + j / divisions * extent;
        const b = -half + (j + 1) / divisions * extent;
        segment(fixed, a, fixed, b, strength);
        segment(a, fixed, b, fixed, strength);
      }
    }
    gravityGridBase = new Float32Array(positions);
    gravityGridFade = new Float32Array(fades);
    const attribute = new THREE.BufferAttribute(new Float32Array(gravityGridBase), 3);
    attribute.setUsage(THREE.DynamicDrawUsage);
    gravityGridLines.geometry.dispose();
    gravityGridLines.geometry = new THREE.BufferGeometry();
    gravityGridLines.geometry.setAttribute("position", attribute);
    gravityGridLines.geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(colors), 3));
    gravityGridLines.geometry.computeBoundingSphere();
    lastGravityUpdate = 0;
  }

  function syncGravityGridVisibility() {
    if (!gravityGrid) return;
    gravityGrid.visible = state.showGravityGrid && state.mode === "orbit" && !state.selected;
    gravityGridLines.material.opacity = state.gravityGridOpacity;
  }

  function updateGravityGrid(now) {
    if (!gravityGrid?.visible || !gravityGridBase || now - lastGravityUpdate < 58) return;
    lastGravityUpdate = now;
    const weights = { sun:1.9, mercury:.2, venus:.34, earth:.38, mars:.25, jupiter:.88, saturn:.7, uranus:.42, neptune:.4 };
    const attractors = DATA.map((data) => {
      const position = bodies.get(data.id).position;
      return { x:position.x, z:position.z, weight:weights[data.id] * state.gravityGridStrength, radius:data.id === "sun" ? 2.25 : data.id === "jupiter" || data.id === "saturn" ? 1.45 : 1.05 };
    });
    const attribute = gravityGridLines.geometry.getAttribute("position");
    const values = attribute.array;
    const waveTime = now * .0022;
    for (let i = 0; i < gravityGridBase.length; i += 3) {
      const x = gravityGridBase[i], z = gravityGridBase[i + 2];
      let y = -.24;
      if (gravityGridFade[i / 3] <= .001) {
        values[i] = x; values[i + 1] = y; values[i + 2] = z;
        continue;
      }
      for (const body of attractors) {
        const dx = x - body.x, dz = z - body.z;
        const distance2 = dx * dx + dz * dz;
        const distance = Math.sqrt(distance2);
        y -= body.weight * 1.48 / (1 + distance2 / (body.radius * body.radius));
        if (state.gravityWaves) {
          const wave = (.5 + .5 * Math.sin(distance * 4.4 - waveTime)) * Math.exp(-distance * .42);
          y -= wave * body.weight * .105;
        }
      }
      values[i] = x;
      values[i + 1] = Math.max(-4.4, y);
      values[i + 2] = z;
    }
    attribute.needsUpdate = true;
  }

  function createBodyMesh(data, radius, detailed) {
    const segments = detailed ? (state.quality ? 96 : 64) : (state.quality ? 48 : 28);
    const group = new THREE.Group();
    const geometry = new THREE.SphereGeometry(radius, segments, Math.max(20, segments / 2));
    let material;
    if (data.id === "sun") {
      material = new THREE.MeshBasicMaterial({ map: makeTexture(data, detailed), color: 0xffffff });
    } else {
      material = new THREE.MeshStandardMaterial({ map: makeTexture(data, detailed), roughness: data.id === "earth" ? .72 : .88, metalness: 0 });
      if (data.id === "earth") {
        material.emissive = new THREE.Color(0x061326);
        material.emissiveIntensity = detailed ? .24 : .1;
      }
    }
    const sphere = new THREE.Mesh(geometry, material);
    sphere.name = data.id;
    sphere.rotation.z = data.axialTilt * DEG;
    sphere.userData.planet = data;
    group.add(sphere);
    group.userData.planet = data;
    group.userData.sphere = sphere;
    group.userData.radius = radius;

    if (data.clouds) {
      const cloudGeo = new THREE.SphereGeometry(radius * 1.008, segments, Math.max(20, segments / 2));
      const clouds = new THREE.Mesh(cloudGeo, new THREE.MeshStandardMaterial({ map: makeCloudTexture(detailed), transparent: true, opacity: .48, depthWrite: false, roughness: 1 }));
      clouds.rotation.z = data.axialTilt * DEG;
      clouds.userData.clouds = true;
      group.add(clouds);
      group.userData.cloudLayer = clouds;
    }

    if (["earth", "venus", "uranus", "neptune"].includes(data.id)) {
      const atmosphere = new THREE.Mesh(
        new THREE.SphereGeometry(radius * 1.055, segments, Math.max(20, segments / 2)),
        new THREE.MeshBasicMaterial({ color: data.color, side: THREE.BackSide, transparent: true, opacity: data.id === "earth" ? .18 : .09, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      group.add(atmosphere);
    }

    if (data.rings) addRings(group, radius, detailed, data.axialTilt);
    if (data.id === "sun") addSunGlow(group, radius, detailed);
    return group;
  }

  function addRings(group, radius, detailed, axialTilt = 0) {
    const geometry = new THREE.RingGeometry(radius * 1.25, radius * 2.22, detailed ? 160 : 96, 8);
    const colors = new Float32Array(geometry.attributes.position.count * 3);
    const pos = geometry.attributes.position;
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getY(i));
      const band = .48 + .22 * Math.sin(r / radius * 32) + .15 * Math.sin(r / radius * 83);
      c.setRGB(.74 * band, .68 * band, .52 * band);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const ring = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: .68, depthWrite: false }));
    ring.rotation.x = Math.PI / 2;
    const equatorialPlane = new THREE.Group();
    equatorialPlane.rotation.z = axialTilt * DEG;
    equatorialPlane.add(ring);
    group.add(equatorialPlane);
  }

  function addSunGlow(group, radius, detailed) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = detailed ? 512 : 256;
    const ctx = canvas.getContext("2d");
    const g = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, canvas.width * .05, canvas.width / 2, canvas.height / 2, canvas.width / 2);
    g.addColorStop(0, "rgba(255,236,174,.85)"); g.addColorStop(.18, "rgba(255,175,70,.42)"); g.addColorStop(.55, "rgba(255,101,30,.11)"); g.addColorStop(1, "rgba(255,80,20,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    sprite.scale.setScalar(radius * 6.6);
    group.add(sprite);
  }

  function makeTexture(data, detailed) {
    const key = data.id + (detailed ? "-detail" : "-map");
    if (textureCache.has(key)) return textureCache.get(key);
    const source = BODY_TEXTURES[data.id];
    if (source) {
      const texture = new THREE.TextureLoader().load(source, (loaded) => {
        loaded.colorSpace = THREE.SRGBColorSpace;
        loaded.wrapS = THREE.RepeatWrapping;
        loaded.anisotropy = Math.min(detailed ? 12 : 8, renderer.capabilities.getMaxAnisotropy());
        loaded.needsUpdate = true;
      });
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      textureCache.set(key, texture);
      return texture;
    }
    const canvas = document.createElement("canvas");
    canvas.width = detailed && state.quality ? 1024 : 512;
    canvas.height = canvas.width / 2;
    const ctx = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height;
    const base = new THREE.Color(data.color);
    const seed = data.index * 991 + 17;
    const noise = (x, y, k = 1) => {
      const n = Math.sin((x * 127.1 + y * 311.7 + seed * 74.7) * k) * 43758.5453;
      return n - Math.floor(n);
    };
    ctx.fillStyle = data.color; ctx.fillRect(0, 0, w, h);

    if (["jupiter", "saturn", "uranus", "neptune", "venus", "sun"].includes(data.id)) {
      const bands = data.id === "jupiter" ? 58 : data.id === "saturn" ? 72 : 34;
      for (let i = 0; i < bands; i++) {
        const y = i * h / bands;
        const n = noise(i, seed);
        const hueShift = data.id === "jupiter" ? (n - .5) * .08 : (n - .5) * .025;
        const c = base.clone().offsetHSL(hueShift, (n - .5) * .22, (n - .5) * .28);
        ctx.fillStyle = `rgb(${c.r * 255},${c.g * 255},${c.b * 255})`;
        ctx.fillRect(0, y, w, h / bands + 2);
      }
      ctx.globalAlpha = data.id === "sun" ? .32 : .13;
      for (let i = 0; i < 520; i++) {
        const x = noise(i, 3) * w, y = noise(i, 7) * h;
        const rx = 4 + noise(i, 11) * 35, ry = 1 + noise(i, 13) * 5;
        ctx.fillStyle = noise(i, 17) > .5 ? "#fff3d0" : "#553327";
        ctx.beginPath(); ctx.ellipse(x, y, rx, ry, noise(i, 19) * .4, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (data.id === "jupiter") {
        ctx.fillStyle = "rgba(151,59,35,.72)"; ctx.beginPath(); ctx.ellipse(w * .69, h * .63, w * .075, h * .04, -.08, 0, TAU); ctx.fill();
        ctx.strokeStyle = "rgba(255,210,170,.35)"; ctx.lineWidth = 4; ctx.stroke();
      }
      if (data.id === "neptune") {
        ctx.fillStyle = "rgba(14,31,91,.52)"; ctx.beginPath(); ctx.ellipse(w * .35, h * .58, w * .065, h * .038, 0, 0, TAU); ctx.fill();
      }
    } else {
      const image = ctx.getImageData(0, 0, w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const p = (y * w + x) * 4;
        const continental = layeredNoise(x / w, y / h, seed);
        let c = base.clone();
        if (data.id === "earth") {
          if (continental > .54) c.set(continental > .68 ? "#8b8a62" : "#3f7449");
          else c.set(continental < .30 ? "#163d72" : "#245e8b");
          if (y < h * .09 || y > h * .91) c.lerp(new THREE.Color("#e8f0ed"), .82);
        } else {
          const delta = (continental - .5) * (data.id === "mars" ? .48 : .34);
          c.offsetHSL((noise(x, y) - .5) * .015, (noise(x, y, 2) - .5) * .08, delta);
        }
        image.data[p] = c.r * 255; image.data[p + 1] = c.g * 255; image.data[p + 2] = c.b * 255;
      }
      ctx.putImageData(image, 0, 0);
      ctx.globalAlpha = .18;
      for (let i = 0; i < 130; i++) {
        const x = noise(i, 5) * w, y = noise(i, 9) * h, r = 2 + noise(i, 12) * (data.id === "mercury" ? 20 : 12);
        ctx.fillStyle = "#1b1310"; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
        ctx.strokeStyle = "#f6dcc0"; ctx.lineWidth = 1; ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    textureCache.set(key, texture);
    return texture;
  }

  function layeredNoise(x, y, seed) {
    let v = 0, amp = .55, f = 2.1;
    for (let i = 0; i < 5; i++) {
      v += amp * smoothNoise(x * f, y * f, seed + i * 31);
      f *= 2.03; amp *= .49;
    }
    return v / 1.07;
  }

  function smoothNoise(x, y, seed) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const n = (a, b) => { const q = Math.sin((a * 127.1 + b * 311.7 + seed * 74.7)) * 43758.5453; return q - Math.floor(q); };
    const a = n(xi, yi), b = n(xi + 1, yi), c = n(xi, yi + 1), d = n(xi + 1, yi + 1);
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, u), THREE.MathUtils.lerp(c, d, u), v);
  }

  function makeCloudTexture(detailed) {
    const key = "clouds-" + (detailed ? "detail" : "map");
    if (textureCache.has(key)) return textureCache.get(key);
    const canvas = document.createElement("canvas"); canvas.width = detailed ? 1024 : 512; canvas.height = canvas.width / 2;
    const ctx = canvas.getContext("2d"), image = ctx.createImageData(canvas.width, canvas.height);
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const p = (y * canvas.width + x) * 4; const n = layeredNoise(x / canvas.width * 1.7, y / canvas.height * 1.7, 805);
      image.data[p] = image.data[p + 1] = image.data[p + 2] = 255;
      // A UV sphere collapses every longitude into one vertex at each pole.
      // Fade the procedural layer there so varying alpha values cannot form
      // visible triangular fans over the surface texture.
      const poleDistance = Math.min(y, canvas.height - 1 - y) / (canvas.height - 1);
      const polarFade = THREE.MathUtils.smoothstep(poleDistance, .012, .075);
      image.data[p + 3] = Math.max(0, n - .48) * 430 * polarFade;
    }
    ctx.putImageData(image, 0, 0);
    const texture = new THREE.CanvasTexture(canvas); texture.wrapS = THREE.RepeatWrapping; texture.colorSpace = THREE.SRGBColorSpace;
    textureCache.set(key, texture); return texture;
  }

  function orbitalPosition(data, date, meanOverride) {
    const jd = julianDate(date);
    const T = (jd - J2000) / 36525;
    const value = (pair) => pair[0] + pair[1] * T;
    const a = value(data.elements.a), e = value(data.elements.e), I = value(data.elements.I) * DEG;
    const L = value(data.elements.L), p = value(data.elements.p), N = value(data.elements.N);
    let M = meanOverride == null ? normalizeDegrees(L - p) * DEG : meanOverride;
    let E = M;
    for (let i = 0; i < 9; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    const xv = a * (Math.cos(E) - e), yv = a * Math.sqrt(1 - e * e) * Math.sin(E);
    const v = Math.atan2(yv, xv), r = Math.hypot(xv, yv), w = (p - N) * DEG, node = N * DEG;
    const cw = Math.cos(v + w), sw = Math.sin(v + w), cN = Math.cos(node), sN = Math.sin(node), cI = Math.cos(I), sI = Math.sin(I);
    const x = r * (cN * cw - sN * sw * cI);
    const z = r * (sN * cw + cN * sw * cI);
    const y = r * sw * sI;
    return { vector: new THREE.Vector3(x, y, z), au: r };
  }

  function scaledPosition(result) {
    const direction = result.vector.clone().normalize();
    // Keep an AU-dominated scale while expanding the crowded inner system.
    // A purely linear map puts Mercury inside the enlarged display Sun.
    const d = state.scale === "relative"
      ? result.au * .45 + Math.log1p(result.au) * 1.8 + Math.sqrt(result.au) * 1.2
      : 2.05 + Math.log1p(result.au) * 2.62;
    return direction.multiplyScalar(d);
  }

  function createOrbitLine(data) {
    const points = [];
    for (let i = 0; i <= 240; i++) points.push(scaledPosition(orbitalPosition(data, state.date, i / 240 * TAU)));
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0x5d788a, transparent: true, opacity: .23, depthWrite: false });
    const line = new THREE.LineLoop(geometry, material);
    line.userData.planet = data;
    return line;
  }

  function rebuildOrbits() {
    orbitLines.forEach((line) => {
      const data = line.userData.planet, points = [];
      for (let i = 0; i <= 240; i++) points.push(scaledPosition(orbitalPosition(data, state.date, i / 240 * TAU)));
      line.geometry.dispose(); line.geometry = new THREE.BufferGeometry().setFromPoints(points);
      line.visible = state.showOrbits && state.mode === "orbit";
    });
  }

  function updatePositions(force) {
    if (state.mode === "orbit") {
      DATA.forEach((data) => {
        const body = bodies.get(data.id);
        if (data.id === "sun") body.position.set(0, 0, 0);
        else body.position.copy(scaledPosition(orbitalPosition(data, state.date)));
      });
      if (force) rebuildOrbits();
    }
    const jd = julianDate(state.date);
    ui.jd.textContent = "JD " + jd.toFixed(2);
  }

  function lineupPositions() {
    const xs = [-8.9, -6.7, -4.7, -2.55, -.3, 2.25, 5.0, 7.55, 9.9];
    DATA.forEach((data, i) => {
      const body = bodies.get(data.id);
      body.position.set(xs[i], i % 2 ? .03 : -.03, 0);
    });
  }

  function configureMapLighting() {
    if (state.mode === "lineup") {
      // In the comparison view the Sun is moved to the left edge of the row.
      // Keep the actual light source on it and soften distance falloff so the
      // outer planets remain readable without reversing their day side.
      sunLight.position.copy(bodies.get("sun").position);
      sunLight.intensity = 3.8;
      sunLight.decay = .12;
      ambientLight.intensity = .34;
    } else {
      sunLight.position.set(0, 0, 0);
      sunLight.intensity = 3.4;
      sunLight.decay = 1.12;
      ambientLight.intensity = .29;
    }
  }

  function createLabels() {
    DATA.forEach((data) => {
      const el = document.createElement("div");
      el.className = "planet-label";
      const copy = localizedBody(data);
      el.innerHTML = `<b>${copy.name}</b><small>${data.id === "sun" ? t("center") : semimajor(data).toFixed(data.index < 4 ? 2 : 1) + " " + t("au")}</small>`;
      ui.labels.appendChild(el); labelEls.set(data.id, el);
    });
  }

  function setMode(mode, instant) {
    if (state.fallback2D) { setFallbackMode(mode); return; }
    if (state.selected) closeFocus();
    state.mode = mode;
    $$(".mode").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
    orbitGroup.visible = mode === "orbit";
    $("#map-legend").style.display = mode === "orbit" ? "block" : "none";
    $("#date-dock").style.display = mode === "orbit" ? "flex" : "none";
    updateModeCopy();
    if (mode === "lineup") {
      lineupPositions(); state.targetDistance = 26;
      desiredCamera.set(.8, 4.2, 25.5); cameraTarget.set(.5, 0, 0);
    } else {
      updatePositions(true); setMapCamera(true);
    }
    configureMapLighting();
    syncGravityGridVisibility();
    if (instant) camera.position.copy(desiredCamera);
  }

  function setMapCamera(force) {
    if (state.mode !== "orbit" || state.selected) return;
    const max = state.scale === "relative" ? 25 : 17.5;
    state.targetDistance = THREE.MathUtils.clamp(state.targetDistance || max, state.scale === "relative" ? 8 : 6, state.scale === "relative" ? 52 : 34);
    const d = state.targetDistance;
    desiredCamera.set(d * Math.sin(state.phi) * Math.cos(state.theta), d * Math.cos(state.phi), d * Math.sin(state.phi) * Math.sin(state.theta));
    cameraTarget.set(0, 0, 0);
    if (force) camera.position.copy(desiredCamera);
  }

  function openFocus(data) {
    state.selected = data; state.activeHotspot = -1; state.activeOrbiter = null;
    syncGravityGridVisibility();
    state.hovered = null; ui.tooltip.style.display = "none";
    document.body.classList.add("focused");
    ui.panel.classList.add("open"); ui.focusCaption.classList.add("visible");
    ui.hotspotCard.classList.remove("visible");
    if (state.fallback2D) {
      state.fallbackFocusZoom = 1;
      fillPanel(data);
      return;
    }
    systemGroup.visible = false; orbitGroup.visible = false; ui.hotspotCard.classList.remove("visible");
    while (focusRoot.children.length) disposeObject(focusRoot.children[0]);
    focusRoot.visible = true;

    focusBody = createBodyMesh(data, 1.88, true);
    focusBody.position.set(state.wallpaperMode ? 0 : 2.25, 0, 0);
    focusBody.rotation.set(state.focusRotX, state.focusRotY, 0);
    focusRoot.add(focusBody);
    createFocusHotspots(data);
    createFocusOrbiters(data);
    fillPanel(data);

    state.targetFocusDistance = 10.6;
    desiredCamera.set(0, .05, state.targetFocusDistance); cameraTarget.set(state.wallpaperMode ? 0 : .25, 0, 0);
    updateFocusPresentation();
    sunLight.position.set(-1.8, 2.4, 5.5);
    sunLight.decay = 1.12;
    sunLight.intensity = data.id === "sun" ? .35 : data.id === "earth" ? 65 : 18;
    ambientLight.intensity = data.id === "sun" ? .7 : data.id === "earth" ? .56 : .48;
  }

  function closeFocus() {
    if (!state.selected) return;
    state.selected = null; state.activeHotspot = -1; state.activeOrbiter = null;
    document.body.classList.remove("focused"); ui.panel.classList.remove("open"); ui.focusCaption.classList.remove("visible"); ui.hotspotCard.classList.remove("visible");
    ui.orbiterLabels.innerHTML = ""; focusOrbiterEntries.length = 0;
    if (state.fallback2D) return;
    focusRoot.visible = false; systemGroup.visible = true; orbitGroup.visible = state.mode === "orbit";
    syncGravityGridVisibility();
    configureMapLighting();
    if (state.mode === "orbit") { updatePositions(true); setMapCamera(); } else { desiredCamera.set(.8, 4.2, 25.5); cameraTarget.set(.5, 0, 0); }
  }

  function createFocusHotspots(data) {
    focusHotspots = new THREE.Group();
    // Attach markers to the rotating surface mesh, not to its stationary wrapper.
    // This keeps every discovery at its latitude/longitude as the planet spins.
    focusBody.userData.sphere.add(focusHotspots);
    data.hotspots.slice(0, MAX_FOCUS_ITEMS).forEach((spot, index) => {
      const p = latLonToSurface(spot.lat, spot.lon, 1.98);
      const group = new THREE.Group(); group.position.copy(p); group.lookAt(p.clone().multiplyScalar(2));
      const stemGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,-.10), new THREE.Vector3(0,0,.12)]);
      const stem = new THREE.Line(stemGeo, new THREE.LineBasicMaterial({ color: 0x61dcff, transparent: true, opacity: .6 }));
      const dot = new THREE.Mesh(new THREE.SphereGeometry(.045, 16, 10), new THREE.MeshBasicMaterial({ color: 0xa7efff }));
      const ring = new THREE.Mesh(new THREE.RingGeometry(.075, .1, 24), new THREE.MeshBasicMaterial({ color: 0x3fd2ff, side: THREE.DoubleSide, transparent: true, opacity: .7, blending: THREE.AdditiveBlending, depthWrite: false }));
      ring.position.z = .13; dot.position.z = .13; group.add(stem, ring, dot);
      group.userData.hotspot = { spot, index, ring }; dot.userData.hotspot = group.userData.hotspot; ring.userData.hotspot = group.userData.hotspot;
      focusHotspots.add(group); clickTargets.push(dot, ring);
    });
  }

  // Three.js maps an equirectangular texture from -180° at the left edge to
  // +180° at the right edge. Longitudes in the dataset are positive east.
  function latLonToSurface(latDegrees, lonDegrees, radius) {
    const lat = latDegrees * DEG;
    const lon = lonDegrees * DEG;
    const cosLat = Math.cos(lat);
    return new THREE.Vector3(
      radius * cosLat * Math.cos(lon),
      radius * Math.sin(lat),
      -radius * cosLat * Math.sin(lon)
    );
  }

  function createFocusOrbiters(data) {
    focusOrbiterEntries.length = 0;
    ui.orbiterLabels.innerHTML = "";
    focusOrbitalSystem = new THREE.Group();
    focusOrbitalSystem.position.set(0, 0, 0);
    // The orbital system follows manual rotation of the planet wrapper, while
    // remaining independent from the sphere's own axial spin.
    focusBody.add(focusOrbitalSystem);

    const orbiters = localizedOrbiters(data.id);
    orbiters.forEach((orbiter, index) => {
      const referencePlane = new THREE.Group();
      // Natural satellites are specified relative to a planet's equator or
      // local Laplace plane. Heliocentric objects and the Moon use ecliptic
      // elements and therefore do not inherit the planet's axial tilt.
      referencePlane.rotation.z = (orbiter.reference === "ecliptic" ? 0 : data.axialTilt) * DEG;
      focusOrbitalSystem.add(referencePlane);

      const plane = new THREE.Group();
      plane.rotation.order = "YXZ";
      plane.rotation.y = (orbiter.node || 0) * DEG;
      plane.rotation.x = Math.abs(orbiter.inclination || 0) * DEG;
      referencePlane.add(plane);

      const apsis = new THREE.Group();
      apsis.rotation.y = (orbiter.argument || 0) * DEG;
      plane.add(apsis);

      const semiMajor = orbiter.distance;
      const recordedEccentricity = THREE.MathUtils.clamp(orbiter.eccentricity || 0, 0, .82);
      // Distances in the dossier are deliberately compressed. Cap only the
      // rendered eccentricity when a physically shaped ellipse would cross
      // the enlarged display sphere; the real value remains in the dataset.
      const maxDisplayEccentricity = Math.max(0, 1 - 2.12 / semiMajor);
      const eccentricity = Math.min(recordedEccentricity, maxDisplayEccentricity);
      const semiMinor = semiMajor * Math.sqrt(1 - eccentricity * eccentricity);
      const orbitPoints = [];
      for (let i = 0; i < 192; i++) {
        const eccentricAnomaly = i / 192 * TAU;
        orbitPoints.push(new THREE.Vector3(
          semiMajor * (Math.cos(eccentricAnomaly) - eccentricity),
          0,
          semiMinor * Math.sin(eccentricAnomaly)
        ));
      }
      const orbit = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(orbitPoints),
        new THREE.LineBasicMaterial({ color: orbiter.historic ? 0x665f58 : 0x4f839d, transparent: true, opacity: orbiter.historic ? .12 : .23, depthWrite: false })
      );
      apsis.add(orbit);

      const object = orbiter.craft ? createCraftObject(orbiter) : createMoonObject(orbiter);
      apsis.add(object);

      const label = document.createElement("div");
      label.className = "orbiter-label";
      label.innerHTML = `${orbiter.name}<small>${orbiter.type}</small>`;
      ui.orbiterLabels.appendChild(label);

      const entry = { data: orbiter, index, referencePlane, plane, apsis, mesh: object, label, angle: orbiter.phase || 0, eccentricity, semiMajor, semiMinor };
      setFocusOrbitPosition(entry);
      object.userData.orbitingObject = entry;
      object.traverse((child) => { child.userData.orbitingObject = entry; });
      focusOrbiterEntries.push(entry);
    });
  }

  function setFocusOrbitPosition(entry) {
    const meanAnomaly = ((entry.angle + Math.PI) % TAU + TAU) % TAU - Math.PI;
    let eccentricAnomaly = meanAnomaly;
    for (let i = 0; i < 7; i++) {
      eccentricAnomaly -= (eccentricAnomaly - entry.eccentricity * Math.sin(eccentricAnomaly) - meanAnomaly) /
        (1 - entry.eccentricity * Math.cos(eccentricAnomaly));
    }
    entry.mesh.position.set(
      entry.semiMajor * (Math.cos(eccentricAnomaly) - entry.eccentricity),
      0,
      entry.semiMinor * Math.sin(eccentricAnomaly)
    );
    if (entry.data.craft) {
      const tangentX = -entry.semiMajor * Math.sin(eccentricAnomaly);
      const tangentZ = entry.semiMinor * Math.cos(eccentricAnomaly);
      entry.mesh.rotation.y = Math.atan2(tangentX, tangentZ);
    } else {
      // Regular moons are approximately tidally locked: keep one hemisphere
      // directed toward the parent body instead of spinning independently.
      entry.mesh.rotation.y = Math.atan2(-entry.mesh.position.x, -entry.mesh.position.z);
    }
  }

  function createMoonObject(orbiter) {
    const geometry = new THREE.SphereGeometry(orbiter.size, state.quality ? 28 : 18, state.quality ? 18 : 12);
    const material = new THREE.MeshStandardMaterial({ color: orbiter.color, roughness: .94, metalness: 0, emissive: orbiter.color, emissiveIntensity: .08 });
    const moon = new THREE.Mesh(geometry, material);
    const seed = orbiter.name.length * 1.37;
    moon.rotation.set(seed * .13, seed * .23, seed * .07);
    return moon;
  }

  function createCraftObject(orbiter) {
    const craft = new THREE.Group();
    const scale = orbiter.size / .07;
    const craftColor = new THREE.Color(orbiter.color).lerp(new THREE.Color(0xd9e9f0), .28);
    const metal = new THREE.MeshStandardMaterial({ color: craftColor, roughness: .58, metalness: .12, emissive: craftColor, emissiveIntensity: .52 });
    const panel = new THREE.MeshStandardMaterial({ color: 0x548aa7, roughness: .6, metalness: .12, emissive: 0x18587c, emissiveIntensity: .92 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xd3a458, roughness: .52, metalness: .18, emissive: 0x70400f, emissiveIntensity: .72 });
    const core = new THREE.Mesh(new THREE.BoxGeometry(.14, .11, .22), metal);
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(.09, .025, .045, 18), gold);
    dish.rotation.x = Math.PI / 2; dish.position.z = .13;
    const leftPanel = new THREE.Mesh(new THREE.BoxGeometry(.28, .018, .12), panel);
    const rightPanel = leftPanel.clone(); leftPanel.position.x = -.22; rightPanel.position.x = .22;
    craft.add(core, dish, leftPanel, rightPanel);
    craft.scale.setScalar(scale);
    return craft;
  }

  function fillPanel(data) {
    data = localizedBody(data);
    const hotspots = data.hotspots.slice(0, MAX_FOCUS_ITEMS);
    const orbiters = localizedOrbiters(data.id);
    ui.objectIndex.textContent = `${t("object")} ${String(data.index + 1).padStart(2,"0")} / ${String(DATA.length).padStart(2,"0")}`;
    ui.name.textContent = data.name; ui.latin.textContent = data.latin; ui.lead.textContent = data.lead; ui.story.textContent = data.story;
    ui.focusName.textContent = data.name.toUpperCase(); ui.hotspotCount.textContent = String(hotspots.length).padStart(2,"0");
    ui.stats.innerHTML = data.stats.map(([label, value]) => `<div class="stat"><small>${label}</small><b>${value}</b></div>`).join("");
    ui.discoveries.innerHTML = hotspots.map((spot, i) => `<button class="discovery" data-hotspot="${i}"><span class="pin">${i + 1}</span><span><b>${spot.title}</b><small>${spot.type}</small></span><time>${spot.year}</time></button>`).join("");
    ui.discoveries.querySelectorAll(".discovery").forEach((button) => button.addEventListener("click", () => selectHotspot(Number(button.dataset.hotspot))));
    ui.orbiterCount.textContent = String(orbiters.length).padStart(2, "0");
    ui.orbiters.innerHTML = orbiters.map((orbiter, i) => `<button class="discovery orbit-object-entry${orbiter.historic ? " historic" : ""}" data-orbiter="${i}"><span class="pin">${orbiter.craft ? t("craftShort") : "●"}</span><span><b>${orbiter.name}</b><small>${orbiter.type}</small></span><time>${orbiter.historic ? t("archive") : t("orbit")}</time></button>`).join("");
    ui.orbiters.querySelectorAll("[data-orbiter]").forEach((button) => button.addEventListener("click", () => selectOrbiter(Number(button.dataset.orbiter))));
  }

  function selectHotspot(index) {
    if (!state.selected) return;
    state.activeHotspot = index; state.activeOrbiter = null;
    const spot = localizedBody(state.selected).hotspots[index];
    const coordinateStatus = spot.schematic ? t("schematicPoint") : spot.dynamic ? t("dynamicLongitude") : formatCoordinates(spot);
    ui.hotspotType.textContent = `${spot.type} · ${spot.year} · ${coordinateStatus}`; ui.hotspotTitle.textContent = spot.title; ui.hotspotText.textContent = spot.text;
    ui.hotspotCard.classList.add("visible");
    ui.discoveries.querySelectorAll(".discovery").forEach((b, i) => b.classList.toggle("active", i === index));
    ui.orbiters.querySelectorAll("[data-orbiter]").forEach((b) => b.classList.remove("active"));
    const lon = spot.lon * DEG;
    state.targetFocusRotY = -lon - Math.PI / 2 + .6;
    state.targetFocusRotX = THREE.MathUtils.clamp(-spot.lat * DEG * .45, -.55, .55);
  }

  function formatCoordinates(spot) {
    const precision = (value) => Number.isInteger(Math.abs(value)) ? 0 : Number.isInteger(Math.abs(value) * 10) ? 1 : 2;
    const lat = Math.abs(spot.lat).toFixed(precision(spot.lat));
    const normalizedLon = ((spot.lon + 180) % 360 + 360) % 360 - 180;
    const lon = Math.abs(normalizedLon).toFixed(precision(normalizedLon));
    return `${lat}° ${spot.lat < 0 ? t("south") : t("north")}, ${lon}° ${normalizedLon < 0 ? t("west") : t("east")}`;
  }

  function selectOrbiter(index) {
    if (!state.selected) return;
    const orbiter = localizedOrbiters(state.selected.id)[index];
    if (!orbiter) return;
    state.activeHotspot = -1;
    state.activeOrbiter = focusOrbiterEntries[index] || { data: orbiter, index, mesh: null };
    ui.hotspotType.textContent = `${orbiter.type} · ${orbiter.status}`;
    ui.hotspotTitle.textContent = orbiter.name;
    ui.hotspotText.textContent = orbiter.text;
    ui.hotspotCard.classList.add("visible");
    ui.discoveries.querySelectorAll(".discovery").forEach((b) => b.classList.remove("active"));
    ui.orbiters.querySelectorAll("[data-orbiter]").forEach((b, i) => b.classList.toggle("active", i === index));
  }

  function disposeObject(object) {
    object.parent?.remove(object);
    object.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
  }

  function bindUi() {
    addEventListener("resize", resize);
    $$(".mode").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
    $$("[data-scale]").forEach((b) => b.addEventListener("click", () => setScale(b.dataset.scale)));
    $("#prev-day").addEventListener("click", () => changeDays(-1));
    $("#next-day").addEventListener("click", () => changeDays(1));
    $("#now-button").addEventListener("click", activateRealtime);
    ui.date.addEventListener("change", () => { const date = new Date(ui.date.value); if (!isNaN(date)) { state.date = date; pauseTime(); updatePositions(true); } });
    ui.play.addEventListener("click", togglePlayback);
    ui.speed.addEventListener("input", () => { state.realtime = false; syncSpeed(); state.playing = state.speed !== 0; syncPlay(); });
    $("#close-panel").addEventListener("click", closeFocus);
    $("#prev-object").addEventListener("click", () => cycleObject(-1));
    $("#next-object").addEventListener("click", () => cycleObject(1));
    ui.hotspotCard.querySelector("button").addEventListener("click", () => { ui.hotspotCard.classList.remove("visible"); state.activeHotspot = -1; state.activeOrbiter = null; });
    addEventListener("keydown", (e) => {
      if (e.key === "Escape") state.wallpaperMode ? setWallpaperMode(false) : closeFocus();
      if (e.key === "ArrowLeft" && state.selected) cycleObject(-1);
      if (e.key === "ArrowRight" && state.selected) cycleObject(1);
      if (e.code === "Space" && !state.selected) { e.preventDefault(); togglePlayback(); }
    });
    ui.canvas.addEventListener("pointerdown", pointerDown);
    ui.canvas.addEventListener("pointermove", pointerMove);
    ui.canvas.addEventListener("pointerup", pointerUp);
    ui.canvas.addEventListener("pointercancel", pointerUp);
    // Some embedded Chromium builds synthesize `click` without a complete
    // PointerEvent sequence. Keep object selection available there as well.
    ui.canvas.addEventListener("click", (e) => { if (!state.dragging && !state.moved) pickAt(e.clientX, e.clientY); });
    syncSpeed();
  }

  function pointerDown(e) {
    if (e.button !== 0) return;
    state.dragging = true; state.moved = false; state.pointerX = e.clientX; state.pointerY = e.clientY;
    if (state.rotationEnabled) ui.canvas.classList.add("dragging");
    ui.canvas.setPointerCapture?.(e.pointerId);
  }

  function pointerMove(e) {
    const dx = e.clientX - state.pointerX, dy = e.clientY - state.pointerY;
    if (state.dragging) {
      if (Math.abs(dx) + Math.abs(dy) > 2) state.moved = true;
      if (state.rotationEnabled) {
        if (state.selected) {
          state.targetFocusRotY += dx * .006; state.targetFocusRotX = THREE.MathUtils.clamp(state.targetFocusRotX + dy * .004, -.8, .8);
        } else if (state.mode === "orbit") {
          state.theta -= dx * .0045; state.phi = THREE.MathUtils.clamp(state.phi + dy * .0038, .2, 1.48); setMapCamera();
        }
      }
      state.pointerX = e.clientX; state.pointerY = e.clientY;
    } else updateHover(e);
  }

  function pointerUp(e) {
    if (!state.dragging) return;
    state.dragging = false; ui.canvas.classList.remove("dragging");
    if (!state.moved) pickAt(e.clientX, e.clientY);
  }

  function updatePointer(x, y) {
    const rect = ui.canvas.getBoundingClientRect();
    pointer.x = ((x - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((y - rect.top) / rect.height) * 2 + 1;
  }

  function pickAt(x, y) {
    updatePointer(x, y); raycaster.setFromCamera(pointer, camera);
    const roots = state.selected ? [focusRoot] : [systemGroup];
    const hits = raycaster.intersectObjects(roots, true);
    if (!hits.length) return;
    let object = hits[0].object;
    if (object.userData.hotspot) { selectHotspot(object.userData.hotspot.index); return; }
    let orbitalObject = object;
    while (orbitalObject && !orbitalObject.userData.orbitingObject) orbitalObject = orbitalObject.parent;
    if (orbitalObject?.userData.orbitingObject) {
      selectOrbiter(orbitalObject.userData.orbitingObject.index);
      return;
    }
    while (object && !object.userData.planet) object = object.parent;
    if (object?.userData.planet && !state.selected && state.explorationEnabled) openFocus(object.userData.planet);
  }

  function updateHover(e) {
    if (state.selected || !state.explorationEnabled) { ui.tooltip.style.display = "none"; return; }
    updatePointer(e.clientX, e.clientY); raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects([systemGroup], true).find((h) => {
      let o = h.object; while (o && !o.userData.planet) o = o.parent; return !!o?.userData.planet;
    });
    if (!hit) { ui.tooltip.style.display = "none"; state.hovered = null; return; }
    let object = hit.object; while (object && !object.userData.planet) object = object.parent;
    state.hovered = object.userData.planet; ui.tooltip.textContent = `${localizedBody(state.hovered).name} · ${t("dossier")}`;
    ui.tooltip.style.display = "block"; ui.tooltip.style.left = e.clientX + "px"; ui.tooltip.style.top = e.clientY + "px";
  }

  function cycleObject(direction) {
    if (!state.selected || !state.explorationEnabled) return;
    const next = (state.selected.index + direction + DATA.length) % DATA.length;
    openFocus(DATA[next]);
  }

  function setScale(scale) {
    if (state.fallback2D) { setFallbackScale(scale); return; }
    state.scale = scale;
    $$("[data-scale]").forEach((b) => b.classList.toggle("active", b.dataset.scale === scale));
    updateScaleCopy();
    state.targetDistance = scale === "relative" ? 38 : 23.5;
    rebuildGravityGrid(); updatePositions(true); setMapCamera();
  }

  function changeDays(days) {
    state.date = new Date(state.date.getTime() + days * 86400000); pauseTime(); updatePositions(true); setDateInput(state.date);
  }

  function activateRealtime() {
    state.realtime = true;
    state.playing = true;
    state.date = new Date();
    if (!state.fallback2D && bodies.size) updatePositions(true);
    setDateInput(state.date);
    syncPlay();
  }

  function pauseTime() {
    state.realtime = false;
    state.playing = false;
    syncPlay();
  }

  function togglePlayback() {
    if (state.realtime) {
      state.date = new Date();
      state.realtime = false;
      state.playing = false;
    } else {
      state.playing = !state.playing && state.speed !== 0;
    }
    syncPlay();
  }

  function syncPlay() {
    ui.play.classList.toggle("playing", state.playing); ui.play.textContent = state.playing ? "Ⅱ" : "▶";
    ui.now.classList.toggle("active", state.realtime);
    ui.clockCaption.textContent = state.realtime ? t("realtime") : state.playing ? t("modeltime") : t("calculatedTime");
    syncSpeed();
  }

  function syncSpeed() {
    state.speed = Number(ui.speed.value);
    ui.speedOut.textContent = state.realtime ? t("realSpeed") : state.speed === 0 ? t("stopped") : `${state.speed} ${t("daysPerSecond")}`;
  }

  function setDateInput(date) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    ui.date.value = local.toISOString().slice(0, 16);
  }

  function updateClock() {
    ui.clock.textContent = new Intl.DateTimeFormat(currentLocale().code, { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit", second:"2-digit" }).format(state.date).toUpperCase();
  }

  function updateLabels() {
    const visible = state.showLabels && !state.selected;
    DATA.forEach((data) => {
      const el = labelEls.get(data.id);
      if (!visible) { el.style.display = "none"; return; }
      const body = bodies.get(data.id); body.getWorldPosition(tempV); tempV.project(camera);
      const behind = tempV.z > 1 || tempV.z < -1;
      el.style.display = behind ? "none" : "block";
      const x = (tempV.x * .5 + .5) * innerWidth;
      const y = (-tempV.y * .5 + .5) * innerHeight - (state.mode === "lineup" ? 34 : 22);
      el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) translate(-50%, -50%)`;
      el.style.opacity = data.id === state.hovered?.id ? "1" : ".78";
    });
  }

  function updateHotspotCard() {
    if (!state.selected) return;
    let anchor = null;
    if (state.activeHotspot >= 0 && focusHotspots) anchor = focusHotspots.children[state.activeHotspot];
    else if (state.activeOrbiter?.mesh) anchor = state.activeOrbiter.mesh;
    if (!anchor) return;
    anchor.getWorldPosition(tempV); tempV.project(camera);
    const x = THREE.MathUtils.clamp((tempV.x * .5 + .5) * innerWidth + 22, innerWidth * .45, innerWidth - 310);
    const y = THREE.MathUtils.clamp((-tempV.y * .5 + .5) * innerHeight - 30, 100, innerHeight - 175);
    ui.hotspotCard.style.left = x + "px"; ui.hotspotCard.style.top = y + "px";
  }

  function updateOrbiterLabels() {
    const panelEdge = Math.min(innerWidth * .42, 610);
    focusOrbiterEntries.forEach((entry) => {
      entry.mesh.getWorldPosition(tempV);
      tempV.project(camera);
      const x = (tempV.x * .5 + .5) * innerWidth;
      const y = (-tempV.y * .5 + .5) * innerHeight - 14;
      const visible = state.selected && tempV.z > -1 && tempV.z < 1 && x > panelEdge + 8 && x < innerWidth - 8 && y > 84 && y < innerHeight - 28;
      entry.label.style.display = visible ? "block" : "none";
      if (!visible) return;
      entry.label.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) translate(-50%, -50%)`;
      entry.label.style.opacity = state.activeOrbiter?.index === entry.index ? "1" : entry.data.historic ? ".48" : ".82";
    });
  }

  function animate(now) {
    requestAnimationFrame(animate);
    const frameMin = 1000 / state.fps;
    if (now - state.lastFrame < frameMin) return;
    const dt = Math.min(.05, (now - (state.lastFrame || now)) / 1000);
    state.lastFrame = now;

    if (state.realtime) {
      state.date = new Date();
      if (!state.selected && now - state.lastRealtimeOrbit > 250) {
        updatePositions(false);
        state.lastRealtimeOrbit = now;
      }
      if (now - state.lastDateUi > 1000) { setDateInput(state.date); state.lastDateUi = now; }
    } else if (state.playing && !state.selected) {
      state.date = new Date(state.date.getTime() + dt * state.speed * 86400000);
      updatePositions(false);
      if (now - state.lastDateUi > 200) { setDateInput(state.date); state.lastDateUi = now; }
    }
    updateClock();
    updateDesktopWidgets(now, dt);

    camera.position.lerp(desiredCamera, 1 - Math.pow(.003, dt));
    camera.lookAt(cameraTarget);
    // Projection of DOM labels must use the same camera matrix as this frame.
    // Without this update the labels trail the WebGL scene by one rendered frame.
    camera.updateMatrixWorld(true);
    stars.rotation.y += dt * .0015;

    if (state.selected && focusBody) {
      state.focusRotX = THREE.MathUtils.lerp(state.focusRotX, state.targetFocusRotX, 1 - Math.pow(.004, dt));
      state.focusRotY = THREE.MathUtils.lerp(state.focusRotY, state.targetFocusRotY, 1 - Math.pow(.004, dt));
      focusBody.rotation.x = state.focusRotX; focusBody.rotation.y = state.focusRotY;
      const sphere = focusBody.userData.sphere;
      sphere.rotation.y += dt * (state.dragging ? 0 : .025);
      if (focusBody.userData.cloudLayer) focusBody.userData.cloudLayer.rotation.y += dt * .035;
      focusHotspots?.children.forEach((marker, i) => {
        const ring = marker.userData.hotspot.ring;
        const pulse = 1 + Math.sin(now * .003 + i * 2) * .22;
        ring.scale.setScalar(pulse); ring.material.opacity = i === state.activeHotspot ? 1 : .55 + pulse * .12;
      });
      focusOrbiterEntries.forEach((entry) => {
        entry.angle += dt * entry.data.speed * ORBITAL_ANIMATION_SCALE;
        setFocusOrbitPosition(entry);
      });
      focusOrbitalSystem?.updateMatrixWorld(true);
      updateOrbiterLabels();
      updateHotspotCard();
    } else {
      DATA.forEach((data) => {
        const body = bodies.get(data.id), sphere = body.userData.sphere;
        sphere.rotation.y += dt * (data.id === "jupiter" ? .12 : data.id === "sun" ? .025 : .055);
        if (body.userData.cloudLayer) body.userData.cloudLayer.rotation.y += dt * .063;
      });
    }

    updateLabels();
    updateGravityGrid(now);
    renderer.render(scene, camera);
  }

  function resize() {
    applyInterfaceScale();
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight, false);
  }

  function applyInterfaceScale(multiplier = state.interfaceScale) {
    const requested = Number(multiplier);
    state.interfaceScale = Math.max(.75, Math.min(2, Number.isFinite(requested) ? requested : 1));

    // Match the physical size of the 1080p interface on high-resolution
    // desktops while keeping the WebGL canvas at the monitor's native size.
    const automatic = Math.max(1, Math.min(2, Math.min(innerWidth / 1920, innerHeight / 1080)));
    const scale = Math.max(.75, Math.min(2.5, automatic * state.interfaceScale));
    const root = document.documentElement;
    root.style.setProperty("--interface-scale", scale.toFixed(3));
    const text = state.textScale;
    root.style.setProperty("--planet-label-font", `${(8 * scale * text).toFixed(1)}px`);
    root.style.setProperty("--planet-label-small-font", `${(7 * scale * text).toFixed(1)}px`);
    root.style.setProperty("--orbiter-label-font", `${(7 * scale * text).toFixed(1)}px`);
    root.style.setProperty("--orbiter-label-small-font", `${(6 * scale * text).toFixed(1)}px`);
    root.style.setProperty("--overlay-font", `${(9 * scale * text).toFixed(1)}px`);
    root.style.setProperty("--overlay-small-font", `${(7 * scale * text).toFixed(1)}px`);
    root.style.setProperty("--overlay-body-font", `${(10 * scale * text).toFixed(1)}px`);
    root.style.setProperty("--overlay-title-font", `${(12 * scale * text).toFixed(1)}px`);
    [6, 7, 8, 9, 10, 11, 12, 13, 15].forEach((size) => root.style.setProperty(`--ui-font-${size}`, `${(size * text).toFixed(1)}px`));
    if (ui.layer) {
      ui.layer.style.width = `${100 / scale}%`;
      ui.layer.style.height = `${100 / scale}%`;
    }
  }

  function julianDate(date) { return date.getTime() / 86400000 + 2440587.5; }
  function normalizeDegrees(v) { return ((v % 360) + 360) % 360; }
  function semimajor(data) { return data.elements ? data.elements.a[0] : 0; }

  window.wallpaperPropertyListener = {
    applyUserProperties(properties) {
      if (properties.language) setLanguage(["ru", "en", "de", "es"][Number(properties.language.value)] || "ru", false);
      if (properties.mapmode) setMode(Number(properties.mapmode.value) === 1 ? "lineup" : "orbit");
      if (properties.distancescale) setScale(Number(properties.distancescale.value) === 1 ? "relative" : "scenic");
      if (properties.timespeed) {
        ui.speed.value = properties.timespeed.value;
        if (Number(properties.timespeed.value) === 0) activateRealtime();
        else { state.realtime = false; syncSpeed(); state.playing = true; syncPlay(); }
      }
      if (properties.showlabels) state.showLabels = !!properties.showlabels.value;
      if (properties.showorbits) { state.showOrbits = !!properties.showorbits.value; rebuildOrbits(); }
      if (properties.mouserotation) setRotationEnabled(!!properties.mouserotation.value);
      if (properties.planettransitions) setExplorationEnabled(!!properties.planettransitions.value);
      if (properties.wallpapermode) setWallpaperMode(!!properties.wallpapermode.value);
      if (properties.widgetvisibility) { state.widgetsWallpaperOnly = Number(properties.widgetvisibility.value) === 0; updateWidgetVisibility(); }
      if (properties.showclock) { state.showClockWidget = !!properties.showclock.value; updateWidgetVisibility(); }
      if (properties.showdate) { state.showDateWidget = !!properties.showdate.value; updateWidgetVisibility(); }
      if (properties.clockformat) state.clock12 = Number(properties.clockformat.value) === 1;
      if (properties.clockstyle) setClockStyle(["digital", "mission", "orbital", "minimal", "terminal"][Number(properties.clockstyle.value)] || "digital");
      if (properties.showvisualizer) {
        state.showVisualizer = !!properties.showvisualizer.value;
        if (state.showVisualizer) registerWallpaperAudio();
        updateWidgetVisibility();
      }
      if (properties.visualizerstyle) {
        state.visualizerStyle = ["bars", "wave", "radial", "mirror", "rings", "constellation"][Number(properties.visualizerstyle.value)] || "bars";
        ui.audioWidget.classList.toggle("radial", state.visualizerStyle === "radial" || state.visualizerStyle === "rings");
      }
      if (properties.visualizersensitivity) state.visualizerSensitivity = Math.max(.25, Number(properties.visualizersensitivity.value) / 100);
      if (properties.showtimer) { state.showTimer = !!properties.showtimer.value; updateWidgetVisibility(); }
      if (properties.timerduration) {
        state.timerDuration = Math.max(60, Number(properties.timerduration.value) * 60);
        if (!state.timerRunning) state.timerRemaining = state.timerDuration;
        updateTimerUi();
      }
      if (properties.widgetposition) setWidgetPosition(["top-right", "top-left", "bottom-right", "bottom-left"][Number(properties.widgetposition.value)] || "top-right");
      if (properties.widgetscale) { state.widgetScale = Math.max(.5, Number(properties.widgetscale.value) / 100); updateWidgetVisibility(); }
      if (properties.uiscale) applyInterfaceScale(Number(properties.uiscale.value) / 100);
      if (properties.textscale) {
        state.textScale = Math.max(.75, Math.min(2, Number(properties.textscale.value) / 100));
        applyInterfaceScale();
      }
      if (properties.showgravitygrid) { state.showGravityGrid = !!properties.showgravitygrid.value; syncGravityGridVisibility(); }
      if (properties.gravitycellsize) { state.gravityGridCellScale = Math.max(.25, Math.min(2, Number(properties.gravitycellsize.value) / 100)); rebuildGravityGrid(); }
      if (properties.gravitygridstrength) state.gravityGridStrength = Math.max(.2, Number(properties.gravitygridstrength.value) / 100);
      if (properties.gravitygridopacity) { state.gravityGridOpacity = Math.max(.04, Number(properties.gravitygridopacity.value) / 100); syncGravityGridVisibility(); }
      if (properties.gravitywaves) state.gravityWaves = !!properties.gravitywaves.value;
      if (properties.fps) state.fps = Math.max(20, Number(properties.fps.value));
      if (properties.quality) {
        state.quality = Number(properties.quality.value);
        if (!state.fallback2D) {
          renderer.setPixelRatio(Math.min(devicePixelRatio || 1, state.quality ? 1.8 : 1));
          rebuildGravityGrid();
          resize();
        }
      }
      if (properties.accentcolor) {
        const parts = String(properties.accentcolor.value).split(" ").map(Number);
        const rgb = parts.map((v) => Math.round(v * 255));
        document.documentElement.style.setProperty("--accent", `rgb(${rgb.join(",")})`);
        document.documentElement.style.setProperty("--accent-rgb", rgb.join(","));
        rebuildGravityGrid();
      }
    }
  };

  registerWallpaperAudio();
  init();
})();
