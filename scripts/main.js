
const MODULE_ID = "holosuite-token-wardrobe";
const MODULE_TITLE = "HoloSuite Token Wardrobe";
const TOKENIZER_ID = "vtta-tokenizer";

const FLAG_KEY = "state";
const SCHEMA_VERSION = 2;

const SETTING_PLAYER_MANAGE = "playerCanManage";
const SETTING_AUTO_CLOSE = "autoCloseAfterSwitch";
const SETTING_MAX_IMAGES = "maxImages";
const SETTING_AUTO_TOKENIZER = "autoTokenizer";
const SETTING_REQUIRE_TOKENIZER_FRAME = "requireTokenizerFrame";
const SETTING_RAW_FALLBACK = "rawFallbackOnTokenizerFailure";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "avif"]);
const switchLocks = new Map();
const processingLocks = new Map();

let appInstance = null;
let registeredWithHoloSuite = false;

function notify(type, message) {
  ui.notifications?.[type]?.(message);
}

function isGM() {
  return game.user?.isGM === true;
}

function normalizeSlashes(value) {
  return String(value ?? "").replace(/\\/g, "/");
}

function isRemoteUrl(value) {
  return /^https?:\/\//i.test(String(value ?? "").trim());
}

function hasExternalScheme(value) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(String(value ?? "").trim());
}

function sanitizeSource(source) {
  const value = normalizeSlashes(source).trim();
  if (!value) return "";

  if (/^(?:javascript|data|vbscript|file|blob):/i.test(value)) return "";
  if (/[\u0000-\u001F\u007F]/u.test(value)) return "";

  if (hasExternalScheme(value) && !isRemoteUrl(value)) return "";

  if (!isRemoteUrl(value)) {
    let decoded = value;
    try { decoded = decodeURIComponent(value); } catch {}
    if (decoded.split("/").some(segment => segment === "..")) return "";
  }

  return value;
}

function getExtension(source) {
  const clean = String(source ?? "").split(/[?#]/, 1)[0];
  const file = clean.split("/").pop() ?? "";
  const index = file.lastIndexOf(".");
  return index >= 0 ? file.slice(index + 1).toLowerCase() : "";
}

function isSupportedSource(source) {
  const clean = sanitizeSource(source);
  if (!clean) return false;
  if (isRemoteUrl(clean)) return true;
  return IMAGE_EXTENSIONS.has(getExtension(clean));
}

function cacheBust(path) {
  const clean = String(path ?? "").split("?")[0];
  return clean ? `${clean}?hstw=${Date.now()}` : "";
}

function canAccessActor(actor) {
  if (!actor) return false;
  if (isGM()) return true;
  return actor.isOwner === true;
}

function canManageActor(actor) {
  if (!canAccessActor(actor)) return false;
  if (isGM()) return true;
  return game.settings.get(MODULE_ID, SETTING_PLAYER_MANAGE) === true;
}

function canModifyTokenImage(token, targetSrc = token?.document?.texture?.src) {
  if (!token?.document || !token.actor) return false;
  if (!canAccessActor(token.actor)) return false;
  if (isGM()) return true;

  try {
    if (typeof token.document.canUserModify === "function") {
      return token.document.canUserModify(game.user, "update", {"texture.src": targetSrc});
    }
  } catch (error) {
    console.warn(`${MODULE_TITLE} | Token permission pre-check failed`, error);
  }

  return token.isOwner === true || token.document.isOwner === true;
}

function defaultState() {
  return {schemaVersion: SCHEMA_VERSION, gallery: []};
}

function normalizeEntry(entry, index = 0) {
  const legacySrc = sanitizeSource(entry?.src);
  const source = sanitizeSource(entry?.source || legacySrc);
  const src = sanitizeSource(legacySrc || source);

  if (!source || !src || !isSupportedSource(source) || !isSupportedSource(src)) return null;

  const processor = entry?.processor === "tokenizer" ? "tokenizer" : "raw";

  return {
    id: String(entry?.id || foundry.utils.randomID(16)),
    name: String(entry?.name || `Aparência ${index + 1}`).trim().slice(0, 80),
    source,
    src,
    favorite: entry?.favorite === true,
    order: Number.isFinite(Number(entry?.order)) ? Number(entry.order) : index,
    processor,
    processedAt: Number.isFinite(Number(entry?.processedAt)) ? Number(entry.processedAt) : null,
    processorVersion: String(entry?.processorVersion ?? "").trim()
  };
}

function getRawState(actor) {
  const raw = actor?.getFlag?.(MODULE_ID, FLAG_KEY);

  if (raw && typeof raw === "object") {
    if (Array.isArray(raw)) {
      return {schemaVersion: 0, gallery: raw, legacy: false};
    }

    return {
      schemaVersion: Number(raw.schemaVersion || 0),
      gallery: Array.isArray(raw.gallery) ? raw.gallery : [],
      legacy: false
    };
  }

  const legacyGallery = actor?.getFlag?.(MODULE_ID, "gallery");
  if (Array.isArray(legacyGallery)) {
    return {schemaVersion: 0, gallery: legacyGallery, legacy: true};
  }

  return {...defaultState(), legacy: false};
}

function getGallery(actor, {requireAccess = true} = {}) {
  if (!actor) return [];

  if (requireAccess && !canAccessActor(actor)) {
    console.warn(`${MODULE_TITLE} | Blocked gallery read for unauthorized Actor ${actor.id}`);
    return [];
  }

  const state = getRawState(actor);
  const normalized = state.gallery
    .map((entry, index) => normalizeEntry(entry, index))
    .filter(Boolean);

  normalized.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  return normalized;
}

async function migrateActorState(actor) {
  if (!actor || !canManageActor(actor)) return false;

  const raw = getRawState(actor);
  const normalized = getGallery(actor, {requireAccess: false})
    .map((entry, index) => ({...entry, order: index}));

  const needsMigration =
    raw.legacy === true ||
    raw.schemaVersion !== SCHEMA_VERSION ||
    raw.gallery.length !== normalized.length ||
    normalized.some((entry, index) =>
      !raw.gallery[index]?.id ||
      !raw.gallery[index]?.source ||
      !raw.gallery[index]?.processor
    );

  if (!needsMigration) return false;

  await actor.setFlag(MODULE_ID, FLAG_KEY, {
    schemaVersion: SCHEMA_VERSION,
    gallery: normalized
  });

  if (raw.legacy === true && typeof actor.unsetFlag === "function") {
    await actor.unsetFlag(MODULE_ID, "gallery");
  }

  return true;
}

async function saveGallery(actor, entries) {
  if (!actor || !canManageActor(actor)) throw new Error("TW_MANAGE_FORBIDDEN");

  const maxImages = Math.min(
    100,
    Math.max(1, Number(game.settings.get(MODULE_ID, SETTING_MAX_IMAGES) || 60))
  );

  const normalized = entries
    .map((entry, index) => normalizeEntry(entry, index))
    .filter(Boolean)
    .slice(0, maxImages)
    .map((entry, index) => ({...entry, order: index}));

  await actor.setFlag(MODULE_ID, FLAG_KEY, {
    schemaVersion: SCHEMA_VERSION,
    gallery: normalized
  });

  Hooks.callAll(`${MODULE_ID}.galleryChanged`, actor, normalized);
  return normalized;
}

function getAllSceneTokens() {
  return canvas?.tokens?.placeables ?? [];
}

function actorTokensOnCurrentScene(actor) {
  if (!actor) return [];
  return getAllSceneTokens().filter(token => token.actor?.id === actor.id);
}

function currentControlledOwnedToken() {
  return (canvas?.tokens?.controlled ?? [])
    .find(token => canAccessActor(token.actor) && canModifyTokenImage(token)) ?? null;
}

function characterActor() {
  const actor = game.user?.character ?? null;
  return canAccessActor(actor) ? actor : null;
}

function ownedActorsWithTokens() {
  const seen = new Set();
  const actors = [];

  for (const token of getAllSceneTokens()) {
    const actor = token.actor;
    if (!actor || seen.has(actor.id)) continue;
    if (!canAccessActor(actor) || !canModifyTokenImage(token)) continue;
    seen.add(actor.id);
    actors.push(actor);
  }

  return actors;
}

function resolveDefaultActor() {
  const controlled = currentControlledOwnedToken();
  if (controlled?.actor) return controlled.actor;

  const character = characterActor();
  if (character && actorTokensOnCurrentScene(character).some(canModifyTokenImage)) {
    return character;
  }

  const sceneActors = ownedActorsWithTokens();
  if (sceneActors.length) return sceneActors[0];

  return character ?? null;
}

function getEligibleActors() {
  const seen = new Set();
  const actors = [];

  if (isGM()) {
    for (const token of getAllSceneTokens()) {
      if (!token.actor || seen.has(token.actor.id)) continue;
      seen.add(token.actor.id);
      actors.push(token.actor);
    }
  } else {
    for (const actor of ownedActorsWithTokens()) {
      if (seen.has(actor.id)) continue;
      seen.add(actor.id);
      actors.push(actor);
    }

    const character = characterActor();
    if (character && !seen.has(character.id)) {
      seen.add(character.id);
      actors.push(character);
    }
  }

  return actors.sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")));
}

function resolveToken(actor, preferredTokenId = "") {
  if (!actor || !canAccessActor(actor)) return null;

  if (preferredTokenId) {
    const token = canvas?.tokens?.get?.(preferredTokenId);
    if (
      token?.actor?.id === actor.id &&
      canAccessActor(token.actor) &&
      canModifyTokenImage(token)
    ) return token;
  }

  const controlled = currentControlledOwnedToken();
  if (controlled?.actor?.id === actor.id) return controlled;

  const tokens = actorTokensOnCurrentScene(actor).filter(canModifyTokenImage);
  if (tokens.length === 1) return tokens[0];

  return tokens[0] ?? null;
}

function hasFixedDynamicRingSubject(token) {
  const subject = token?.document?.ring?.subject;
  if (!subject) return false;

  const candidate = typeof subject.texture === "string"
    ? subject.texture
    : subject.texture?.src;

  return Boolean(candidate);
}

function safeTokenizerSetting(key, fallback = null) {
  try {
    return game.settings.get(TOKENIZER_ID, key);
  } catch {
    return fallback;
  }
}

function getTokenizerStatus() {
  const module = game.modules.get(TOKENIZER_ID);
  const api = module?.active ? module.api : null;
  const available = Boolean(module?.active && typeof api?.autoToken === "function");
  const canUpload = game.user?.can?.("FILES_UPLOAD") === true;
  const frameEnabled = available ? safeTokenizerSetting("add-frame-default", false) === true : false;
  const cropEnabled = available ? safeTokenizerSetting("default-crop-image", false) === true : false;
  const offset = available ? Number(safeTokenizerSetting("default-token-offset", -35)) : null;
  const autoEnabled = game.settings.get(MODULE_ID, SETTING_AUTO_TOKENIZER) === true;
  const requireFrame = game.settings.get(MODULE_ID, SETTING_REQUIRE_TOKENIZER_FRAME) === true;

  let state = "off";
  let label = "Desativado";

  if (autoEnabled) {
    if (!available) {
      state = "error";
      label = "Tokenizer não disponível";
    } else if (!canUpload) {
      state = "error";
      label = "Sem permissão de upload";
    } else if (requireFrame && !frameEnabled) {
      state = "warn";
      label = "Borda automática desativada";
    } else {
      state = "ok";
      label = "Conectado";
    }
  }

  return {
    active: Boolean(module?.active),
    available,
    canUpload,
    frameEnabled,
    cropEnabled,
    offset,
    autoEnabled,
    requireFrame,
    ready: autoEnabled && available && canUpload && (!requireFrame || frameEnabled),
    state,
    label,
    version: String(module?.version ?? "")
  };
}

function tokenizerShouldProxy(source) {
  const lower = String(source ?? "").toLowerCase();

  if (
    lower.startsWith("https://www.dndbeyond.com/") ||
    lower.startsWith("https://dndbeyond.com/") ||
    lower.startsWith("https://media-waterdeep.cursecdn.com/") ||
    lower.startsWith("https://images.dndbeyond.com")
  ) return true;

  return safeTokenizerSetting("force-proxy", false) === true && isRemoteUrl(source);
}

function tokenizerProxyUrl(source) {
  const proxy = String(safeTokenizerSetting("proxy", "") ?? "").trim();
  if (!proxy || !tokenizerShouldProxy(source)) return source;

  return proxy.includes("%URL%")
    ? proxy.replace("%URL%", encodeURIComponent(source))
    : `${proxy}${source}`;
}

async function preloadSource(source, {tokenizerCompatible = false} = {}) {
  const clean = sanitizeSource(source);
  if (!clean || !isSupportedSource(clean)) return false;

  if (!isRemoteUrl(clean)) {
    try {
      const loader = globalThis.TextureLoader?.loader ?? foundry?.canvas?.TextureLoader?.loader;
      if (loader?.loadTexture) {
        return Boolean(await loader.loadTexture(clean));
      }
    } catch (error) {
      console.warn(`${MODULE_TITLE} | Local texture preload failed`, clean, error);
      return false;
    }
  }

  const candidate = tokenizerCompatible ? tokenizerProxyUrl(clean) : clean;

  return await new Promise(resolve => {
    const image = new Image();
    if (tokenizerCompatible) image.crossOrigin = "";
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);

    if (tokenizerCompatible) {
      const base = String(candidate).split("?")[0];
      image.src = `${base}?${Date.now()}`;
    } else {
      image.src = candidate;
    }
  });
}

async function preloadFinalTexture(src) {
  const clean = sanitizeSource(src);
  if (!clean || !isSupportedSource(clean)) return false;

  try {
    const loader = globalThis.TextureLoader?.loader ?? foundry?.canvas?.TextureLoader?.loader;
    if (loader?.loadTexture) {
      return Boolean(await loader.loadTexture(clean));
    }
  } catch (error) {
    console.warn(`${MODULE_TITLE} | Final texture preload failed`, clean, error);
    return false;
  }

  return preloadSource(clean);
}

async function withTokenLock(tokenId, task) {
  const previous = switchLocks.get(tokenId) ?? Promise.resolve();

  let releaseCurrent;
  const current = new Promise(resolve => {
    releaseCurrent = resolve;
  });

  const queued = previous.then(() => current);
  switchLocks.set(tokenId, queued);

  await previous;

  try {
    return await task();
  } finally {
    releaseCurrent();
    if (switchLocks.get(tokenId) === queued) switchLocks.delete(tokenId);
  }
}

async function withProcessingLock(actorId, task) {
  const previous = processingLocks.get(actorId) ?? Promise.resolve();

  let releaseCurrent;
  const current = new Promise(resolve => {
    releaseCurrent = resolve;
  });

  const queued = previous.then(() => current);
  processingLocks.set(actorId, queued);

  await previous;

  try {
    return await task();
  } finally {
    releaseCurrent();
    if (processingLocks.get(actorId) === queued) processingLocks.delete(actorId);
  }
}

async function validateSwitchRequest({actor, token, src}) {
  if (!actor || !canAccessActor(actor)) throw new Error("TW_NOT_OWNER");
  if (!token || token.actor?.id !== actor.id) throw new Error("TW_TOKEN_MISMATCH");

  const cleanSrc = sanitizeSource(src);
  if (!cleanSrc || !isSupportedSource(cleanSrc)) throw new Error("TW_BAD_IMAGE");
  if (!canModifyTokenImage(token, cleanSrc)) throw new Error("TW_TOKEN_NOT_MODIFIABLE");

  const gallery = getGallery(actor);
  if (!gallery.some(entry => entry.src === cleanSrc)) {
    throw new Error("TW_IMAGE_NOT_REGISTERED");
  }

  return cleanSrc;
}

async function switchImage({actorId, tokenId, src}) {
  const tokenFromId = tokenId ? canvas?.tokens?.get?.(tokenId) : null;
  const actor = tokenFromId?.actor ?? game.actors?.get?.(actorId) ?? null;

  if (!actor || !canAccessActor(actor)) throw new Error("TW_NOT_OWNER");

  const token = resolveToken(actor, tokenId);
  if (!token) throw new Error("TW_TOKEN_NOT_FOUND");

  const cleanSrc = await validateSwitchRequest({actor, token, src});

  if (token.document.texture?.src === cleanSrc) return token;

  if (!(await preloadFinalTexture(cleanSrc))) {
    throw new Error("TW_IMAGE_LOAD_FAILED");
  }

  return withTokenLock(token.id, async () => {
    if (!canAccessActor(token.actor) || !canModifyTokenImage(token, cleanSrc)) {
      throw new Error("TW_PERMISSION_CHANGED");
    }

    if (token.document.texture?.src === cleanSrc) return token;

    // Safety invariant: this is the ONLY TokenDocument mutation performed by the module.
    await token.document.update({"texture.src": cleanSrc});

    Hooks.callAll(`${MODULE_ID}.imageChanged`, {
      actorId: actor.id,
      tokenId: token.id,
      src: cleanSrc
    });

    return token;
  });
}

function displayNameFromSource(source) {
  if (isRemoteUrl(source)) {
    try {
      const url = new URL(source);
      const file = decodeURIComponent(url.pathname.split("/").pop() || "");
      return file.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || url.hostname;
    } catch {
      return "Imagem por URL";
    }
  }

  try {
    const file = decodeURIComponent(String(source).split("/").pop() || "");
    return file.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "Aparência";
  } catch {
    return "Aparência";
  }
}

async function autoTokenizeSource(actor, token, source, entryId) {
  const status = getTokenizerStatus();

  if (!status.available) throw new Error("TW_TOKENIZER_UNAVAILABLE");
  if (!status.canUpload) throw new Error("TW_TOKENIZER_UPLOAD_PERMISSION");
  if (status.requireFrame && !status.frameEnabled) {
    throw new Error("TW_TOKENIZER_FRAME_DISABLED");
  }

  const cleanSource = sanitizeSource(source);
  if (!cleanSource || !isSupportedSource(cleanSource)) throw new Error("TW_BAD_IMAGE");

  // Tokenizer intentionally requires CORS-compatible remote images. Preflight using
  // the same proxy settings and cross-origin behavior so a failed URL never turns
  // into Tokenizer's fallback mystery-man token.
  if (!(await preloadSource(cleanSource, {tokenizerCompatible: true}))) {
    throw new Error("TW_SOURCE_LOAD_FAILED");
  }

  const tokenizer = game.modules.get(TOKENIZER_ID)?.api;
  const nameSuffix = `.hstw-${String(entryId).replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const processed = await withProcessingLock(actor.id, async () => {
    return tokenizer.autoToken(actor, {
      tokenFilename: cleanSource,
      updateActor: false,
      isWildCard: false,
      nameSuffix,
      disposition: token?.document?.disposition ?? actor.prototypeToken?.disposition ?? 0
    });
  });

  const outputPath = sanitizeSource(processed);
  if (!outputPath || isRemoteUrl(outputPath)) throw new Error("TW_TOKENIZER_BAD_OUTPUT");

  const finalPath = cacheBust(outputPath);
  if (!(await preloadFinalTexture(finalPath))) {
    throw new Error("TW_TOKENIZER_OUTPUT_LOAD_FAILED");
  }

  return {
    src: finalPath,
    processor: "tokenizer",
    processedAt: Date.now(),
    processorVersion: status.version
  };
}

async function processSource(actor, token, source, entryId, {forceTokenizer = false, forceRaw = false} = {}) {
  const clean = sanitizeSource(source);
  if (!clean || !isSupportedSource(clean)) throw new Error("TW_BAD_IMAGE");

  const autoTokenizer = game.settings.get(MODULE_ID, SETTING_AUTO_TOKENIZER) === true;
  const shouldTokenize = !forceRaw && (forceTokenizer || autoTokenizer);

  if (shouldTokenize) {
    try {
      return await autoTokenizeSource(actor, token, clean, entryId);
    } catch (error) {
      const rawFallback = game.settings.get(MODULE_ID, SETTING_RAW_FALLBACK) === true;
      if (!rawFallback || forceTokenizer) throw error;

      console.warn(`${MODULE_TITLE} | Tokenizer processing failed; using raw source`, error);
      notify("warn", "Tokenizer falhou; a imagem original será usada sem borda.");
    }
  }

  if (!(await preloadSource(clean))) throw new Error("TW_SOURCE_LOAD_FAILED");

  return {
    src: clean,
    processor: "raw",
    processedAt: null,
    processorVersion: ""
  };
}

async function addSources(actor, token, sources, {forceRaw = false} = {}) {
  if (!canManageActor(actor)) throw new Error("TW_MANAGE_FORBIDDEN");

  const gallery = getGallery(actor);
  const knownSources = new Set(gallery.map(entry => entry.source));
  const maxImages = Math.min(
    100,
    Math.max(1, Number(game.settings.get(MODULE_ID, SETTING_MAX_IMAGES) || 60))
  );

  const failures = [];
  let added = 0;

  for (const item of sources) {
    if (gallery.length >= maxImages) break;

    const source = sanitizeSource(typeof item === "string" ? item : item?.source);
    if (!source || knownSources.has(source) || !isSupportedSource(source)) continue;

    const id = foundry.utils.randomID(16);
    const name = String(
      (typeof item === "object" && item?.name) || displayNameFromSource(source)
    ).trim().slice(0, 80);

    try {
      const processed = await processSource(actor, token, source, id, {forceRaw});

      knownSources.add(source);
      gallery.push({
        id,
        name,
        source,
        src: processed.src,
        favorite: false,
        order: gallery.length,
        processor: processed.processor,
        processedAt: processed.processedAt,
        processorVersion: processed.processorVersion
      });
      added++;
    } catch (error) {
      failures.push({source, error});
      console.error(`${MODULE_TITLE} | Could not add source`, source, error);
    }
  }

  const saved = await saveGallery(actor, gallery);
  return {gallery: saved, added, failures};
}

async function reprocessEntry(actor, token, entryId) {
  if (!canManageActor(actor)) throw new Error("TW_MANAGE_FORBIDDEN");

  const gallery = getGallery(actor);
  const entry = gallery.find(item => item.id === entryId);
  if (!entry) throw new Error("TW_ENTRY_NOT_FOUND");

  const processed = await processSource(
    actor,
    token,
    entry.source,
    entry.id,
    {forceTokenizer: true}
  );

  entry.src = processed.src;
  entry.processor = processed.processor;
  entry.processedAt = processed.processedAt;
  entry.processorVersion = processed.processorVersion;

  await saveGallery(actor, gallery);
  return entry;
}

function getFilePickerClass() {
  return foundry?.applications?.apps?.FilePicker?.implementation
    ?? globalThis.FilePicker
    ?? null;
}

async function pickSingleImage() {
  const FilePickerClass = getFilePickerClass();
  if (!FilePickerClass) throw new Error("TW_FILE_PICKER_UNAVAILABLE");

  return await new Promise(resolve => {
    const picker = new FilePickerClass({
      type: "image",
      callback: path => resolve(path || null)
    });
    picker.render(true);
  });
}

async function browseFolder() {
  const FilePickerClass = getFilePickerClass();
  if (!FilePickerClass) throw new Error("TW_FILE_PICKER_UNAVAILABLE");

  return await new Promise(resolve => {
    const picker = new FilePickerClass({
      type: "folder",
      callback: async (path, fp) => {
        try {
          const source = fp?.activeSource ?? "data";
          const options = {extensions: [...IMAGE_EXTENSIONS]};
          const bucket = fp?.source?.bucket ?? fp?.sources?.s3?.bucket;
          if (source === "s3" && bucket) options.bucket = bucket;

          const result = await FilePickerClass.browse(source, path, options);
          resolve((result?.files ?? []).filter(isSupportedSource));
        } catch (error) {
          console.error(`${MODULE_TITLE} | Folder import failed`, error);
          resolve([]);
        }
      }
    });
    picker.render(true);
  });
}

async function askText({title, label, value = "", placeholder = ""}) {
  const DialogV2 = foundry?.applications?.api?.DialogV2;
  if (!DialogV2?.input) throw new Error("TW_DIALOG_V2_UNAVAILABLE");

  const result = await DialogV2.input({
    window: {title},
    content: `
      <div class="form-group">
        <label>${foundry.utils.escapeHTML(label)}</label>
        <input
          type="text"
          name="value"
          value="${foundry.utils.escapeHTML(value)}"
          placeholder="${foundry.utils.escapeHTML(placeholder)}">
      </div>`,
    ok: {
      label: "Confirmar",
      icon: "fa-solid fa-check"
    },
    rejectClose: false
  });

  return String(result?.value ?? "").trim();
}

function explainProcessingError(error) {
  const code = error?.message;

  switch (code) {
    case "TW_TOKENIZER_UNAVAILABLE":
      return "Tokenizer não está ativo ou não expôs a API autoToken.";
    case "TW_TOKENIZER_UPLOAD_PERMISSION":
      return "O Tokenizer precisa da permissão FILES_UPLOAD para gerar e salvar a borda.";
    case "TW_TOKENIZER_FRAME_DISABLED":
      return "A borda automática do Tokenizer está desativada. O GM pode ativá-la pelo painel Aparências.";
    case "TW_SOURCE_LOAD_FAILED":
      return "A imagem de origem não pôde ser carregada. Em URLs, verifique CORS ou o proxy do Tokenizer.";
    case "TW_TOKENIZER_BAD_OUTPUT":
    case "TW_TOKENIZER_OUTPUT_LOAD_FAILED":
      return "O Tokenizer não conseguiu gerar um arquivo de token válido.";
    default:
      return "A imagem não pôde ser processada.";
  }
}

const ApplicationV2 = foundry.applications?.api?.ApplicationV2;
const HandlebarsApplicationMixin = foundry.applications?.api?.HandlebarsApplicationMixin;

if (!ApplicationV2 || !HandlebarsApplicationMixin) {
  throw new Error(`${MODULE_TITLE} requires Foundry VTT 13 ApplicationV2.`);
}

const BaseApplication = HandlebarsApplicationMixin(ApplicationV2);

class TokenWardrobeApp extends BaseApplication {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-app`,
    tag: "section",
    classes: ["twl-app"],
    window: {
      title: "Aparências",
      icon: "fa-solid fa-masks-theater",
      resizable: true
    },
    position: {width: 800, height: 720},
    actions: {
      switchImage: TokenWardrobeApp.#switchImage,
      addCurrent: TokenWardrobeApp.#addCurrent,
      pickFile: TokenWardrobeApp.#pickFile,
      addUrl: TokenWardrobeApp.#addUrl,
      importFolder: TokenWardrobeApp.#importFolder,
      removeImage: TokenWardrobeApp.#removeImage,
      toggleFavorite: TokenWardrobeApp.#toggleFavorite,
      renameImage: TokenWardrobeApp.#renameImage,
      reprocessImage: TokenWardrobeApp.#reprocessImage,
      moveUp: TokenWardrobeApp.#moveUp,
      moveDown: TokenWardrobeApp.#moveDown,
      enableTokenizerFrame: TokenWardrobeApp.#enableTokenizerFrame,
      toggleTokenizerCrop: TokenWardrobeApp.#toggleTokenizerCrop,
      setTokenizerOffset: TokenWardrobeApp.#setTokenizerOffset,
      toggleAutoTokenizer: TokenWardrobeApp.#toggleAutoTokenizer
    }
  };

  static PARTS = {
    main: {template: `modules/${MODULE_ID}/templates/main.hbs`}
  };

  constructor(options = {}) {
    super(options);
    this.actorId = options.actorId ?? resolveDefaultActor()?.id ?? "";
    this.tokenId = options.tokenId ?? "";
  }

  get actor() {
    const byId = this.actorId ? game.actors?.get?.(this.actorId) : null;
    if (byId && canAccessActor(byId)) return byId;

    if (this.tokenId) {
      const syntheticActor = canvas?.tokens?.get?.(this.tokenId)?.actor;
      if (syntheticActor && canAccessActor(syntheticActor)) return syntheticActor;
    }

    return resolveDefaultActor();
  }

  async _prepareContext() {
    const actor = this.actor;

    if (actor && canManageActor(actor)) {
      try {
        await migrateActorState(actor);
      } catch (error) {
        console.warn(`${MODULE_TITLE} | Migration skipped`, error);
      }
    }

    const actors = getEligibleActors();
    const tokens = actor ? actorTokensOnCurrentScene(actor).filter(canModifyTokenImage) : [];
    const token = actor ? resolveToken(actor, this.tokenId) : null;

    if (token) this.tokenId = token.id;

    const gallery = actor ? getGallery(actor) : [];
    const tokenizer = getTokenizerStatus();

    return {
      actor,
      actors: actors.map(item => ({
        id: item.id,
        name: item.name,
        selected: item.id === actor?.id
      })),
      tokens: tokens.map(item => ({
        id: item.id,
        name: item.name || actor?.name || "Token",
        selected: item.id === this.tokenId
      })),
      gallery: gallery.map(entry => ({
        ...entry,
        searchText: `${entry.name} ${entry.source} ${entry.src}`.toLowerCase(),
        active: token?.document.texture?.src === entry.src,
        tokenizerProcessed: entry.processor === "tokenizer",
        processorLabel: entry.processor === "tokenizer" ? "TOKENIZER" : "RAW"
      })),
      totalCount: gallery.length,
      favoritesCount: gallery.filter(entry => entry.favorite).length,
      canManage: canManageActor(actor),
      hasActor: Boolean(actor),
      hasToken: Boolean(token),
      multipleActors: actors.length > 1,
      multipleTokens: tokens.length > 1,
      currentSrc: token?.document.texture?.src ?? "",
      fixedRingSubject: hasFixedDynamicRingSubject(token),
      tokenizer,
      tokenizerStateOk: tokenizer.state === "ok",
      tokenizerStateWarn: tokenizer.state === "warn",
      tokenizerStateError: tokenizer.state === "error",
      canConfigureTokenizer: isGM() && tokenizer.active,
      canAdjustTokenizerOffset: tokenizer.active,
      autoTokenizerEnabled: tokenizer.autoEnabled
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);

    const root = this.element;
    if (!root) return;

    root.querySelector('[data-role="actor-select"]')?.addEventListener("change", event => {
      this.actorId = String(event.currentTarget.value || "");
      this.tokenId = "";
      this.render({force: true});
    });

    root.querySelector('[data-role="token-select"]')?.addEventListener("change", event => {
      this.tokenId = String(event.currentTarget.value || "");
      this.render({force: true});
    });

    root.querySelector('[data-role="search"]')?.addEventListener("input", event => {
      const query = String(event.currentTarget.value || "").trim().toLowerCase();

      for (const card of root.querySelectorAll(".twl-card[data-search]")) {
        const haystack = String(card.dataset.search || "");
        card.hidden = Boolean(query) && !haystack.includes(query);
      }
    });
  }

  async close(options = {}) {
    if (appInstance === this) appInstance = null;
    return super.close(options);
  }

  static async #switchImage(event, target) {
    if (target?.disabled) return;

    target.disabled = true;

    try {
      const actor = this.actor;
      const token = actor ? resolveToken(actor, this.tokenId) : null;
      if (!actor || !token) throw new Error("TW_TOKEN_NOT_FOUND");

      await switchImage({
        actorId: actor.id,
        tokenId: token.id,
        src: target.dataset.src
      });

      if (game.settings.get(MODULE_ID, SETTING_AUTO_CLOSE) === true) {
        await this.close();
      } else {
        this.render({force: true});
      }
    } catch (error) {
      console.error(`${MODULE_TITLE} | switchImage failed`, error);

      if (error?.message === "TW_IMAGE_LOAD_FAILED") {
        notify("error", "A imagem final não pôde ser carregada. O token não foi alterado.");
      } else {
        notify("error", "Não foi possível trocar a aparência desse token.");
      }
    } finally {
      target.disabled = false;
    }
  }

  static async #addCurrent() {
    try {
      const actor = this.actor;
      const token = actor ? resolveToken(actor, this.tokenId) : null;
      if (!actor || !token || !canManageActor(actor)) return;

      const result = await addSources(
        actor,
        token,
        [{source: token.document.texture?.src, name: token.name || actor.name}],
        {forceRaw: true}
      );

      if (result.added) notify("info", "Arte atual adicionada à galeria.");
      this.render({force: true});
    } catch (error) {
      console.error(`${MODULE_TITLE} | addCurrent failed`, error);
      notify("error", explainProcessingError(error));
    }
  }

  static async #pickFile() {
    try {
      const actor = this.actor;
      const token = actor ? resolveToken(actor, this.tokenId) : null;
      if (!actor || !token || !canManageActor(actor)) return;

      const path = await pickSingleImage();
      if (!path) return;

      notify("info", "Processando imagem...");
      const result = await addSources(actor, token, [path]);

      if (result.added) {
        notify("info", "Imagem adicionada.");
      } else if (result.failures.length) {
        notify("error", explainProcessingError(result.failures[0].error));
      }

      this.render({force: true});
    } catch (error) {
      console.error(`${MODULE_TITLE} | File Picker failed`, error);
      notify("error", explainProcessingError(error));
    }
  }

  static async #addUrl() {
    try {
      const actor = this.actor;
      const token = actor ? resolveToken(actor, this.tokenId) : null;
      if (!actor || !token || !canManageActor(actor)) return;

      const source = await askText({
        title: "Adicionar imagem por URL",
        label: "URL pública da imagem",
        placeholder: "https://..."
      });

      if (!source) return;

      const clean = sanitizeSource(source);
      if (!clean || !isRemoteUrl(clean)) {
        notify("error", "Informe uma URL http/https válida.");
        return;
      }

      notify("info", "Processando URL com o Tokenizer...");
      const result = await addSources(actor, token, [clean]);

      if (result.added) {
        notify("info", "URL processada e adicionada.");
      } else if (result.failures.length) {
        notify("error", explainProcessingError(result.failures[0].error));
      }

      this.render({force: true});
    } catch (error) {
      console.error(`${MODULE_TITLE} | URL import failed`, error);
      notify("error", explainProcessingError(error));
    }
  }

  static async #importFolder() {
    try {
      const actor = this.actor;
      const token = actor ? resolveToken(actor, this.tokenId) : null;
      if (!actor || !token || !canManageActor(actor)) return;

      const files = await browseFolder();
      if (!files.length) {
        notify("info", "Nenhuma imagem compatível foi encontrada nessa pasta.");
        return;
      }

      notify("info", `Processando ${files.length} imagem(ns)...`);
      const result = await addSources(actor, token, files);

      if (result.added) {
        notify("info", `${result.added} aparência(s) adicionada(s).`);
      }

      if (result.failures.length) {
        notify("warn", `${result.failures.length} imagem(ns) não puderam ser processadas.`);
      }

      this.render({force: true});
    } catch (error) {
      console.error(`${MODULE_TITLE} | Folder import failed`, error);
      notify("error", explainProcessingError(error));
    }
  }

  static async #removeImage(event, target) {
    const actor = this.actor;
    if (!actor || !canManageActor(actor)) return;

    const id = String(target.dataset.id || "");
    await saveGallery(actor, getGallery(actor).filter(entry => entry.id !== id));
    this.render({force: true});
  }

  static async #toggleFavorite(event, target) {
    const actor = this.actor;
    if (!actor || !canManageActor(actor)) return;

    const id = String(target.dataset.id || "");
    const gallery = getGallery(actor).map(entry =>
      entry.id === id ? {...entry, favorite: !entry.favorite} : entry);

    await saveGallery(actor, gallery.sort((a, b) => a.order - b.order));
    this.render({force: true});
  }

  static async #renameImage(event, target) {
    try {
      const actor = this.actor;
      if (!actor || !canManageActor(actor)) return;

      const id = String(target.dataset.id || "");
      const gallery = getGallery(actor);
      const entry = gallery.find(item => item.id === id);
      if (!entry) return;

      const name = await askText({
        title: "Renomear aparência",
        label: "Nome",
        value: entry.name
      });

      if (!name) return;

      entry.name = String(name).trim().slice(0, 80);
      await saveGallery(actor, gallery.sort((a, b) => a.order - b.order));
      this.render({force: true});
    } catch (error) {
      console.error(`${MODULE_TITLE} | Rename failed`, error);
      notify("error", "Não foi possível renomear esta aparência.");
    }
  }

  static async #reprocessImage(event, target) {
    try {
      const actor = this.actor;
      const token = actor ? resolveToken(actor, this.tokenId) : null;
      if (!actor || !token || !canManageActor(actor)) return;

      notify("info", "Reprocessando com o Tokenizer...");
      await reprocessEntry(actor, token, String(target.dataset.id || ""));
      notify("info", "Aparência reprocessada.");
      this.render({force: true});
    } catch (error) {
      console.error(`${MODULE_TITLE} | Reprocess failed`, error);
      notify("error", explainProcessingError(error));
    }
  }

  static async #moveUp(event, target) {
    return this.#move(String(target.dataset.id || ""), -1);
  }

  static async #moveDown(event, target) {
    return this.#move(String(target.dataset.id || ""), 1);
  }

  async #move(id, direction) {
    const actor = this.actor;
    if (!actor || !canManageActor(actor)) return;

    const gallery = getGallery(actor).sort((a, b) => a.order - b.order);
    const index = gallery.findIndex(entry => entry.id === id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= gallery.length) return;

    [gallery[index], gallery[targetIndex]] = [gallery[targetIndex], gallery[index]];
    gallery.forEach((entry, order) => entry.order = order);

    await saveGallery(actor, gallery);
    this.render({force: true});
  }

  static async #enableTokenizerFrame() {
    if (!isGM() || !game.modules.get(TOKENIZER_ID)?.active) return;

    try {
      await game.settings.set(TOKENIZER_ID, "add-frame-default", true);
      notify("info", "Borda automática do Tokenizer ativada.");
      this.render({force: true});
    } catch (error) {
      console.error(`${MODULE_TITLE} | Could not enable Tokenizer frame`, error);
      notify("error", "Não foi possível alterar a configuração do Tokenizer.");
    }
  }

  static async #toggleTokenizerCrop() {
    if (!isGM() || !game.modules.get(TOKENIZER_ID)?.active) return;

    try {
      const current = safeTokenizerSetting("default-crop-image", false) === true;
      await game.settings.set(TOKENIZER_ID, "default-crop-image", !current);
      notify(
        "info",
        !current
          ? "Preenchimento central ativado."
          : "Modo conter imagem ativado."
      );
      this.render({force: true});
    } catch (error) {
      console.error(`${MODULE_TITLE} | Could not toggle Tokenizer crop`, error);
      notify("error", "Não foi possível alterar o enquadramento do Tokenizer.");
    }
  }

  static async #setTokenizerOffset() {
    if (!game.modules.get(TOKENIZER_ID)?.active) return;

    try {
      const current = Number(safeTokenizerSetting("default-token-offset", -35));
      const raw = await askText({
        title: "Ajustar recuo do Tokenizer",
        label: "Offset em pixels",
        value: String(Number.isFinite(current) ? current : -35),
        placeholder: "-35"
      });

      if (raw === "") return;

      const value = Number(raw);
      if (!Number.isFinite(value) || value < -500 || value > 500) {
        notify("error", "Use um valor entre -500 e 500.");
        return;
      }

      await game.settings.set(TOKENIZER_ID, "default-token-offset", value);
      notify("info", `Offset do Tokenizer ajustado para ${value}.`);
      this.render({force: true});
    } catch (error) {
      console.error(`${MODULE_TITLE} | Could not set Tokenizer offset`, error);
      notify("error", "Não foi possível alterar o offset do Tokenizer.");
    }
  }

  static async #toggleAutoTokenizer() {
    if (!isGM()) return;

    const current = game.settings.get(MODULE_ID, SETTING_AUTO_TOKENIZER) === true;
    await game.settings.set(MODULE_ID, SETTING_AUTO_TOKENIZER, !current);
    notify("info", !current ? "Tokenizer automático ativado." : "Tokenizer automático desativado.");
    this.render({force: true});
  }
}

function openWardrobe(options = {}) {
  if (appInstance?.rendered) {
    appInstance.bringToFront?.();
    return appInstance;
  }

  appInstance = new TokenWardrobeApp(options);
  appInstance.render({force: true});
  return appInstance;
}

function registerWithHoloSuite(api = null) {
  if (registeredWithHoloSuite) return true;

  const holo = api ?? game.modules.get("holosuite-core")?.api ?? game.holosuite;
  if (typeof holo?.registerApp !== "function") return false;

  const result = holo.registerApp({
    id: MODULE_ID,
    title: "Aparências",
    icon: "fa-solid fa-masks-theater",
    premium: false,
    playerVisible: true,
    featureId: MODULE_ID,
    description: "Troque e processe automaticamente a arte visual do seu token.",
    open: () => openWardrobe()
  });

  registeredWithHoloSuite = Boolean(result);
  return registeredWithHoloSuite;
}

function exposeApi() {
  const api = Object.freeze({
    open: options => openWardrobe(options),

    getGallery: actorId => {
      const actor = game.actors?.get?.(actorId) ?? null;
      if (!actor || !canAccessActor(actor)) return [];
      return getGallery(actor).map(entry => ({...entry}));
    },

    switchImage: args => switchImage(args),

    addSource: async ({actorId, tokenId, source, name = ""}) => {
      const token = tokenId ? canvas?.tokens?.get?.(tokenId) : null;
      const actor = token?.actor ?? game.actors?.get?.(actorId) ?? null;

      if (!actor || !canManageActor(actor)) throw new Error("TW_MANAGE_FORBIDDEN");

      const resolvedToken = resolveToken(actor, tokenId);
      if (!resolvedToken) throw new Error("TW_TOKEN_NOT_FOUND");

      return addSources(actor, resolvedToken, [{source, name}]);
    },

    reprocess: async ({actorId, tokenId, entryId}) => {
      const token = tokenId ? canvas?.tokens?.get?.(tokenId) : null;
      const actor = token?.actor ?? game.actors?.get?.(actorId) ?? null;

      if (!actor || !canManageActor(actor)) throw new Error("TW_MANAGE_FORBIDDEN");

      const resolvedToken = resolveToken(actor, tokenId);
      if (!resolvedToken) throw new Error("TW_TOKEN_NOT_FOUND");

      return reprocessEntry(actor, resolvedToken, entryId);
    },

    getTokenizerStatus: () => ({...getTokenizerStatus()}),

    resolveDefaultActor: () => {
      const actor = resolveDefaultActor();
      return actor && canAccessActor(actor) ? actor : null;
    },

    getEligibleActors: () => getEligibleActors().filter(canAccessActor)
  });

  const moduleEntry = game.modules.get(MODULE_ID);
  if (moduleEntry) moduleEntry.api = api;
  game.holosuiteTokenWardrobe = api;
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, SETTING_PLAYER_MANAGE, {
    name: "Players podem gerenciar a própria galeria",
    hint: "Permite que jogadores Owner adicionem, removam, renomeiem, processem e reordenem artes do próprio Actor.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    restricted: true
  });

  game.settings.register(MODULE_ID, SETTING_AUTO_CLOSE, {
    name: "Fechar após trocar aparência",
    hint: "Fecha o app automaticamente após selecionar uma arte.",
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, SETTING_MAX_IMAGES, {
    name: "Máximo de aparências por personagem",
    hint: "Limite de entradas armazenadas por Actor.",
    scope: "world",
    config: true,
    type: Number,
    default: 60,
    restricted: true
  });

  game.settings.register(MODULE_ID, SETTING_AUTO_TOKENIZER, {
    name: "Processar novas artes automaticamente com Tokenizer",
    hint: "Quando ativo, arquivos e URLs são enviados ao autoToken do Tokenizer sem abrir sua interface.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    restricted: true
  });

  game.settings.register(MODULE_ID, SETTING_REQUIRE_TOKENIZER_FRAME, {
    name: "Exigir borda automática do Tokenizer",
    hint: "Impede criar uma aparência processada se a opção Add Frame Default do Tokenizer estiver desligada.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    restricted: true
  });

  game.settings.register(MODULE_ID, SETTING_RAW_FALLBACK, {
    name: "Usar imagem sem borda se Tokenizer falhar",
    hint: "Se desativado, uma falha do Tokenizer cancela a adição em vez de salvar a imagem original.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    restricted: true
  });

  exposeApi();

  Hooks.on("holosuite-core.apiReady", api => {
    registerWithHoloSuite(api);
  });
});

Hooks.once("ready", () => {
  exposeApi();
  registerWithHoloSuite();
  console.log(`${MODULE_TITLE} | Ready`);
});

Hooks.on(`${MODULE_ID}.galleryChanged`, () => {
  if (appInstance?.rendered) appInstance.render({force: true});
});
