
const MODULE_ID = "holosuite-token-wardrobe";
const MODULE_TITLE = "HoloSuite Token Wardrobe";
const FLAG_KEY = "state";
const SCHEMA_VERSION = 1;

const SETTING_PLAYER_MANAGE = "playerCanManage";
const SETTING_AUTO_CLOSE = "autoCloseAfterSwitch";
const SETTING_MAX_IMAGES = "maxImages";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "avif"]);
const switchLocks = new Map();

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

function sanitizePath(src) {
  const value = normalizeSlashes(src).trim();
  if (!value) return "";
  if (/^(?:javascript|data|vbscript):/i.test(value)) return "";
  if (/[\u0000-\u001F\u007F]/u.test(value)) return "";
  if (isExternalPath(value)) return "";

  let decoded = value;
  try { decoded = decodeURIComponent(value); } catch {}
  if (decoded.split("/").some(segment => segment === "..")) return "";

  return value;
}

function isExternalPath(src) {
  const value = String(src ?? "").trim();
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value);
}

function getExtension(src) {
  const clean = String(src ?? "").split(/[?#]/, 1)[0];
  const file = clean.split("/").pop() ?? "";
  const index = file.lastIndexOf(".");
  return index >= 0 ? file.slice(index + 1).toLowerCase() : "";
}

function isSupportedMediaPath(src) {
  return IMAGE_EXTENSIONS.has(getExtension(src));
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
  const src = sanitizePath(entry?.src);
  if (!src || !isSupportedMediaPath(src)) return null;

  return {
    id: String(entry?.id || foundry.utils.randomID(16)),
    name: String(entry?.name || `Aparência ${index + 1}`).trim().slice(0, 80),
    src,
    favorite: entry?.favorite === true,
    order: Number.isFinite(Number(entry?.order)) ? Number(entry.order) : index
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

  // v0.1/v0.2 stored the array directly at flags[module].gallery.
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
    normalized.some((entry, index) => !raw.gallery[index]?.id);

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

  const maxImages = Math.min(100, Math.max(1, Number(game.settings.get(MODULE_ID, SETTING_MAX_IMAGES) || 60)));
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

async function preloadMedia(src) {
  const cleanSrc = sanitizePath(src);
  if (!cleanSrc || !isSupportedMediaPath(cleanSrc)) return false;

  try {
    const loader = globalThis.TextureLoader?.loader ?? foundry?.canvas?.TextureLoader?.loader;
    if (loader?.loadTexture) {
      const texture = await loader.loadTexture(cleanSrc);
      return Boolean(texture);
    }
  } catch (error) {
    console.warn(`${MODULE_TITLE} | Texture preload failed`, cleanSrc, error);
    return false;
  }

  return await new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = cleanSrc;
  });
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

async function validateSwitchRequest({actor, token, src}) {
  if (!actor || !canAccessActor(actor)) throw new Error("TW_NOT_OWNER");
  if (!token || token.actor?.id !== actor.id) throw new Error("TW_TOKEN_MISMATCH");

  const cleanSrc = sanitizePath(src);
  if (!cleanSrc || !isSupportedMediaPath(cleanSrc)) throw new Error("TW_BAD_IMAGE");
  if (!canModifyTokenImage(token, cleanSrc)) throw new Error("TW_TOKEN_NOT_MODIFIABLE");
  if (isExternalPath(cleanSrc)) throw new Error("TW_REMOTE_URL_FORBIDDEN");

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

  if (!(await preloadMedia(cleanSrc))) {
    throw new Error("TW_IMAGE_LOAD_FAILED");
  }

  return withTokenLock(token.id, async () => {
    if (!canAccessActor(token.actor) || !canModifyTokenImage(token)) {
      throw new Error("TW_PERMISSION_CHANGED");
    }

    if (token.document.texture?.src === cleanSrc) return token;

    // Safety invariant: the only TokenDocument mutation performed by this module.
    await token.document.update({"texture.src": cleanSrc});

    Hooks.callAll(`${MODULE_ID}.imageChanged`, {
      actorId: actor.id,
      tokenId: token.id,
      src: cleanSrc
    });

    return token;
  });
}

function displayNameFromPath(src) {
  try {
    const file = decodeURIComponent(String(src).split("/").pop() || "");
    return file.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "Aparência";
  } catch {
    return "Aparência";
  }
}

async function addEntries(actor, sources) {
  if (!canManageActor(actor)) throw new Error("TW_MANAGE_FORBIDDEN");

  const gallery = getGallery(actor);
  const known = new Set(gallery.map(entry => entry.src));
  const maxImages = Math.min(100, Math.max(1, Number(game.settings.get(MODULE_ID, SETTING_MAX_IMAGES) || 60)));

  for (const source of sources) {
    if (gallery.length >= maxImages) break;

    const src = sanitizePath(source);
    if (!src || known.has(src) || !isSupportedMediaPath(src)) continue;
      if (isExternalPath(src)) continue;
    if (!(await preloadMedia(src))) continue;

    known.add(src);
    gallery.push({
      id: foundry.utils.randomID(16),
      name: displayNameFromPath(src),
      src,
      favorite: false,
      order: gallery.length
    });
  }

  return saveGallery(actor, gallery);
}

function getFilePickerClass() {
  return foundry?.applications?.apps?.FilePicker?.implementation
    ?? globalThis.FilePicker
    ?? null;
}

async function pickSingleMedia() {
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
          resolve((result?.files ?? []).filter(isSupportedMediaPath));
        } catch (error) {
          console.error(`${MODULE_TITLE} | Folder import failed`, error);
          resolve([]);
        }
      }
    });
    picker.render(true);
  });
}

async function askText({title, label, value = ""}) {
  const DialogV2 = foundry?.applications?.api?.DialogV2;
  if (!DialogV2?.input) throw new Error("TW_DIALOG_V2_UNAVAILABLE");

  const result = await DialogV2.input({
    window: {title},
    content: `
      <div class="form-group">
        <label>${foundry.utils.escapeHTML(label)}</label>
        <input type="text" name="value" value="${foundry.utils.escapeHTML(value)}">
      </div>`,
    ok: {
      label: "Salvar",
      icon: "fa-solid fa-floppy-disk"
    },
    rejectClose: false
  });

  return String(result?.value ?? "").trim();
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
    position: {width: 760, height: 680},
    actions: {
      switchImage: TokenWardrobeApp.#switchImage,
      addCurrent: TokenWardrobeApp.#addCurrent,
      pickFile: TokenWardrobeApp.#pickFile,
      importFolder: TokenWardrobeApp.#importFolder,
      removeImage: TokenWardrobeApp.#removeImage,
      toggleFavorite: TokenWardrobeApp.#toggleFavorite,
      renameImage: TokenWardrobeApp.#renameImage,
      moveUp: TokenWardrobeApp.#moveUp,
      moveDown: TokenWardrobeApp.#moveDown
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
        searchText: `${entry.name} ${entry.src}`.toLowerCase(),
        active: token?.document.texture?.src === entry.src
      })),
      totalCount: gallery.length,
      favoritesCount: gallery.filter(entry => entry.favorite).length,
      canManage: canManageActor(actor),
      hasActor: Boolean(actor),
      hasToken: Boolean(token),
      multipleActors: actors.length > 1,
      multipleTokens: tokens.length > 1,
      currentSrc: token?.document.texture?.src ?? "",
      fixedRingSubject: hasFixedDynamicRingSubject(token)
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
        notify("error", "A imagem não pôde ser carregada. O token não foi alterado.");
      } else if (error?.message === "TW_REMOTE_URL_FORBIDDEN") {
        notify("error", "Este módulo aceita apenas imagens armazenadas no Foundry.");
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

      await addEntries(actor, [token.document.texture?.src]);
      this.render({force: true});
    } catch (error) {
      console.error(`${MODULE_TITLE} | addCurrent failed`, error);
      notify("error", "Não foi possível adicionar a aparência atual.");
    }
  }

  static async #pickFile() {
    try {
      const actor = this.actor;
      if (!actor || !canManageActor(actor)) return;

      const path = await pickSingleMedia();
      if (!path) return;

      await addEntries(actor, [path]);
      this.render({force: true});
    } catch (error) {
      console.error(`${MODULE_TITLE} | File Picker failed`, error);
      notify("warn", "O File Picker não está disponível para este usuário.");
    }
  }

  static async #importFolder() {
    try {
      const actor = this.actor;
      if (!actor || !canManageActor(actor)) return;

      const files = await browseFolder();
      if (!files.length) {
        notify("info", "Nenhuma mídia compatível foi encontrada nessa pasta.");
        return;
      }

      const before = getGallery(actor).length;
      const after = await addEntries(actor, files);
      notify("info", `${Math.max(0, after.length - before)} aparência(s) adicionada(s).`);
      this.render({force: true});
    } catch (error) {
      console.error(`${MODULE_TITLE} | Folder import failed`, error);
      notify("warn", "Não foi possível importar essa pasta.");
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
    description: "Troque apenas a arte visual do seu token, sem recriá-lo.",
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
    hint: "Permite que jogadores Owner adicionem, removam, renomeiem e reordenem artes do próprio Actor.",
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
