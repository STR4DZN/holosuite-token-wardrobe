
const MODULE_ID = "holosuite-token-wardrobe";
const MODULE_TITLE = "HoloSuite Token Wardrobe";
const TOKENIZER_ID = "vtta-tokenizer";

const FLAG_KEY = "state";
const SCHEMA_VERSION = 4;
const DEFAULT_FRAME_COLOR = "#8B5A2B";
const MIN_CROP_ZOOM = 0.10;
const MAX_CROP_ZOOM = 6;

const SETTING_PLAYER_MANAGE = "playerCanManage";
const SETTING_AUTO_CLOSE = "autoCloseAfterSwitch";
const SETTING_MAX_IMAGES = "maxImages";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "avif"]);
const switchLocks = new Map();

let appInstance = null;
let registeredWithHoloSuite = false;
let socketlibSocket = null;

function notify(type, message) {
  ui.notifications?.[type]?.(message);
}

function isGM() {
  return game.user?.isGM === true;
}


function usersArray() {
  if (Array.isArray(game.users)) return game.users;
  return game.users?.contents ?? [];
}

function getUserById(userId) {
  return game.users?.get?.(userId) ?? usersArray().find(user => user.id === userId) ?? null;
}

function getActiveGM() {
  return game.users?.activeGM ?? usersArray().find(user => user.active && user.isGM) ?? null;
}

function canUseGmRelay() {
  return !isGM() && Boolean(getActiveGM()) && Boolean(socketlibSocket);
}

function actorOwnedByUser(actor, userId) {
  if (!actor || !userId) return false;
  if (game.user?.id === userId && canAccessActor(actor)) return true;

  const user = getUserById(userId);
  const ownerLevel =
    globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER
    ?? globalThis.CONST?.ENTITY_PERMISSIONS?.OWNER
    ?? 3;

  try {
    if (user && typeof actor.testUserPermission === "function") {
      return actor.testUserPermission(user, ownerLevel);
    }
  } catch {}

  try {
    if (user && typeof actor.getUserLevel === "function") {
      return actor.getUserLevel(user) >= ownerLevel;
    }
  } catch {}

  const level = actor.ownership?.[userId] ?? actor.permission?.[userId] ?? 0;
  return Number(level) >= ownerLevel;
}

async function blobToBase64(blob) {
  if (typeof FileReader !== "undefined") {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result ?? "");
        const [, base64 = ""] = result.split(",", 2);
        resolve(base64);
      };
      reader.onerror = () => reject(new Error("TW_BASE64_ENCODE_FAILED"));
      reader.readAsDataURL(blob);
    });
  }

  if (blob?.arrayBuffer && typeof Buffer !== "undefined") {
    const buffer = await blob.arrayBuffer();
    return Buffer.from(buffer).toString("base64");
  }

  throw new Error("TW_BASE64_ENCODE_FAILED");
}

function base64ToUint8Array(base64) {
  if (typeof atob === "function") {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
  }

  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(base64, "base64"));
  }

  throw new Error("TW_BASE64_DECODE_FAILED");
}

async function sendSocketRequest(action, payload) {
  if (isGM()) {
    return await processSocketRequest({
      action,
      payload,
      requesterId: game.user?.id
    });
  }

  if (!socketlibSocket || !getActiveGM()) {
    throw new Error("TW_NO_ACTIVE_GM");
  }

  return await socketlibSocket.executeAsGM(
    "gmRequest",
    action,
    payload
  );
}

async function handleSocketlibGmRequest(action, payload) {
  const requesterId = this?.socketdata?.userId;

  if (!requesterId) {
    throw new Error("TW_AUTH_UNAUTHENTICATED");
  }

  return await processSocketRequest({
    action,
    payload,
    requesterId
  });
}

function registerSocketlibBridge() {
  if (socketlibSocket) return socketlibSocket;

  const api = globalThis.socketlib;
  if (!api?.registerModule) return null;

  socketlibSocket = api.registerModule(MODULE_ID);
  socketlibSocket.register("gmRequest", handleSocketlibGmRequest);

  return socketlibSocket;
}

async function requestAppearanceSave({
  actor,
  entryId,
  name,
  source,
  crop,
  frameColor,
  blob
}) {
  if (!actor || !canAccessActor(actor)) throw new Error("TW_MANAGE_FORBIDDEN");

  const filename = `${slugify(actor.name)}.Wardrobe-${entryId}-${Date.now()}.webp`;
  const base64 = await blobToBase64(blob);

  return await sendSocketRequest(
    "saveAppearance",
    {
      actorId: actor.id,
      entryId,
      name,
      source,
      crop: normalizeCrop(crop),
      frameColor: normalizeHexColor(frameColor),
      filename,
      mimeType: "image/webp",
      base64
    }
  );
}

async function relayTokenizerUpload({
  actor,
  kind,
  fileName,
  blob
}) {
  if (!actor || !canAccessActor(actor)) throw new Error("TW_MANAGE_FORBIDDEN");
  if (!["token", "avatar"].includes(kind)) throw new Error("TW_BAD_UPLOAD_KIND");

  const base64 = await blobToBase64(blob);

  return await sendSocketRequest(
    "tokenizerUpload",
    {
      actorId: actor.id,
      kind,
      fileName: String(fileName || "").slice(0, 160),
      mimeType: String(blob?.type || "image/webp"),
      base64
    }
  );
}



async function processSocketRequest(message) {
  const {action, payload = {}, requesterId} = message ?? {};

  switch (action) {
    case "saveAppearance": {
      const actor = game.actors?.get?.(payload.actorId) ?? null;
      if (!actor || !actorOwnedByUser(actor, requesterId)) {
        throw new Error("TW_MANAGE_FORBIDDEN");
      }

      const source = sanitizeSource(payload.source);
      if (!source || !isSupportedSource(source)) throw new Error("TW_BAD_IMAGE");

      const base64 = String(payload.base64 || "");
      if (!base64 || base64.length > 28_000_000) throw new Error("TW_UPLOAD_TOO_LARGE");

      const bytes = base64ToUint8Array(base64);
      const safeName = sanitizeUploadFileName(payload.filename, "token.webp");
      const file = new File([bytes], safeName, {
        type: String(payload.mimeType || "image/webp")
      });

      const FilePickerClass = getFoundryFilePickerClass();
      if (!FilePickerClass?.upload) throw new Error("TW_FILE_PICKER_UNAVAILABLE");

      const directory = getUploadDirectory(actor);
      await ensureDirectoryExists(directory);

      const options = {};
      if (directory.bucket) options.bucket = directory.bucket;

      const result = await FilePickerClass.upload(
        directory.source,
        directory.current,
        file,
        options,
        {notify: false}
      );

      const uploadedPath = sanitizeSource(result?.path);
      if (!uploadedPath) throw new Error("TW_UPLOAD_FAILED");

      const finalPath = cacheBust(uploadedPath);

      await upsertProcessedEntry(actor, {
        entryId: String(payload.entryId || foundry.utils.randomID(16)),
        name: String(payload.name || "Nova aparência").slice(0, 80),
        source,
        src: finalPath,
        crop: normalizeCrop(payload.crop),
        frameColor: normalizeHexColor(payload.frameColor)
      });

      return {
        saved: true,
        path: finalPath
      };
    }

    case "tokenizerUpload": {
      const actor = game.actors?.get?.(payload.actorId) ?? null;
      if (!actor || !actorOwnedByUser(actor, requesterId)) {
        throw new Error("TW_MANAGE_FORBIDDEN");
      }

      if (!["token", "avatar"].includes(payload.kind)) {
        throw new Error("TW_BAD_UPLOAD_KIND");
      }

      const base64 = String(payload.base64 || "");
      if (!base64 || base64.length > 28_000_000) throw new Error("TW_UPLOAD_TOO_LARGE");

      const bytes = base64ToUint8Array(base64);
      const safeName = sanitizeUploadFileName(
        payload.fileName,
        payload.kind === "avatar" ? "Avatar.webp" : "Token.webp"
      );

      const file = new File([bytes], safeName, {
        type: String(payload.mimeType || "image/webp")
      });

      const FilePickerClass = getFoundryFilePickerClass();
      if (!FilePickerClass?.upload) throw new Error("TW_FILE_PICKER_UNAVAILABLE");

      const directory = getUploadDirectory(actor);
      await ensureDirectoryExists(directory);

      const options = {};
      if (directory.bucket) options.bucket = directory.bucket;

      const result = await FilePickerClass.upload(
        directory.source,
        directory.current,
        file,
        options,
        {notify: false}
      );

      const path = sanitizeSource(result?.path);
      if (!path) throw new Error("TW_UPLOAD_FAILED");

      return {path};
    }

    case "saveGalleryState": {
      const actor = game.actors?.get?.(payload.actorId) ?? null;
      if (!actor || !actorOwnedByUser(actor, requesterId)) {
        throw new Error("TW_MANAGE_FORBIDDEN");
      }

      const rawGallery = Array.isArray(payload?.state?.gallery)
        ? payload.state.gallery
        : [];

      const maxImages = Math.min(
        100,
        Math.max(1, Number(game.settings.get(MODULE_ID, SETTING_MAX_IMAGES) || 60))
      );

      const gallery = rawGallery
        .map((entry, index) => normalizeEntry(entry, index))
        .filter(Boolean)
        .slice(0, maxImages)
        .map((entry, index) => ({...entry, order: index}));

      await actor.setFlag(MODULE_ID, FLAG_KEY, {
        schemaVersion: SCHEMA_VERSION,
        gallery
      });

      return {saved: true};
    }

    case "switchTexture": {
      const actor = game.actors?.get?.(payload.actorId) ?? null;
      if (!actor || !actorOwnedByUser(actor, requesterId)) {
        throw new Error("TW_MANAGE_FORBIDDEN");
      }

      const token = payload.tokenId ? canvas?.tokens?.get?.(payload.tokenId) : null;
      if (!token || token.actor?.id !== actor.id) throw new Error("TW_TOKEN_NOT_FOUND");

      const cleanSrc = sanitizeSource(payload.src);
      if (!cleanSrc || !isSupportedSource(cleanSrc)) throw new Error("TW_BAD_IMAGE");

      const gallery = getGallery(actor, {requireAccess: false});
      if (!gallery.some(entry => entry.src === cleanSrc)) {
        throw new Error("TW_IMAGE_NOT_REGISTERED");
      }

      await token.document.update({"texture.src": cleanSrc});

      Hooks.callAll(`${MODULE_ID}.imageChanged`, {
        actorId: actor.id,
        tokenId: token.id,
        src: cleanSrc
      });

      return {ok: true};
    }

    default:
      throw new Error("TW_UNKNOWN_SOCKET_ACTION");
  }
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

function stripDirectoryPrefix(value) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^\[([^\]]+)\]\s*(.*)$/);
  return match ? match[2] : raw;
}

function normalizeDirectoryPath(value) {
  const raw = normalizeSlashes(value).trim().replace(/^\/+|\/+$/gu, "");
  if (!raw) return "";

  const parts = raw.split("/").filter(Boolean);
  if (parts.some(part => part === "." || part === "..")) {
    throw new Error("TW_BAD_UPLOAD_DIRECTORY");
  }

  return parts.join("/");
}

function parseDirectorySetting(value) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^\[([^\]]+)\]\s*(.*)$/);

  if (!match) {
    return {
      source: "data",
      current: normalizeDirectoryPath(raw),
      bucket: null
    };
  }

  const descriptor = match[1];
  const current = normalizeDirectoryPath(match[2]);

  if (descriptor.startsWith("s3:")) {
    return {
      source: "s3",
      current,
      bucket: descriptor.slice(3) || null
    };
  }

  return {
    source: descriptor || "data",
    current,
    bucket: null
  };
}


function getFoundryFilePickerClass() {
  return foundry?.applications?.apps?.FilePicker?.implementation
    ?? globalThis.FilePicker
    ?? null;
}

function sanitizeUploadFileName(value, fallback = "token.webp") {
  const raw = String(value ?? "").split(/[\\/]/).pop().trim();
  const cleaned = raw
    .replace(/[\u0000-\u001F\u007F]/gu, "")
    .replace(/[^a-zA-Z0-9._-]+/gu, "_")
    .replace(/_+/gu, "_")
    .slice(0, 160);

  if (!cleaned || cleaned === "." || cleaned === "..") return fallback;

  const ext = getExtension(cleaned);
  if (!["webp", "png", "jpg", "jpeg"].includes(ext)) {
    return `${cleaned.replace(/\.+$/u, "")}.webp`;
  }

  return cleaned;
}

async function ensureDirectoryExists(directory) {
  const FilePickerClass = getFoundryFilePickerClass();
  if (!FilePickerClass?.createDirectory) return true;

  const current = String(directory?.current || "").replace(/^\/+|\/+$/gu, "");
  if (!current) return true;

  const parts = current.split("/").filter(Boolean);
  let path = "";

  for (const part of parts) {
    path = path ? `${path}/${part}` : part;

    try {
      const options = {};
      if (directory.bucket) options.bucket = directory.bucket;
      await FilePickerClass.createDirectory(directory.source, path, options);
    } catch (error) {
      const message = String(error?.message || error || "");
      if (
        !message.includes("EEXIST") &&
        !message.includes("already exists") &&
        !message.includes("The S3 key")
      ) {
        console.warn(`${MODULE_TITLE} | Could not ensure directory ${path}`, error);
      }
    }
  }

  return true;
}

async function ensureTokenizerUploadDirectories() {
  if (!isGM() || !game.modules.get(TOKENIZER_ID)?.active) return;

  const settings = [
    safeTokenizerSetting("image-upload-directory", "[data] tokenizer/pc-images"),
    safeTokenizerSetting("npc-image-upload-directory", "[data] tokenizer/npc-images")
  ];

  for (const setting of settings) {
    try {
      await ensureDirectoryExists(parseDirectorySetting(setting));
    } catch (error) {
      console.warn(`${MODULE_TITLE} | Tokenizer directory verification failed`, error);
    }
  }
}

function cacheBust(path) {
  const clean = String(path ?? "").split("?")[0];
  return clean ? `${clean}?hstw=${Date.now()}` : "";
}

function canAccessActor(actor) {
  if (!actor) return false;
  if (isGM()) return true;
  if (actor.isOwner === true) return true;

  const ownerLevel =
    globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER
    ?? globalThis.CONST?.ENTITY_PERMISSIONS?.OWNER
    ?? 3;

  try {
    if (typeof actor.testUserPermission === "function") {
      return actor.testUserPermission(game.user, ownerLevel);
    }
  } catch {}

  try {
    if (typeof actor.getUserLevel === "function") {
      return actor.getUserLevel(game.user) >= ownerLevel;
    }
  } catch {}

  const userId = game.user?.id;
  const level = userId
    ? (actor.ownership?.[userId] ?? actor.permission?.[userId] ?? 0)
    : 0;

  return Number(level) >= ownerLevel;
}

function canManageActor(actor) {
  return canAccessActor(actor);
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


function normalizeHexColor(value, fallback = DEFAULT_FRAME_COLOR) {
  const raw = String(value ?? "").trim();

  if (/^#[0-9a-f]{6}$/i.test(raw)) {
    return raw.toUpperCase();
  }

  if (/^[0-9a-f]{6}$/i.test(raw)) {
    return `#${raw.toUpperCase()}`;
  }

  return fallback;
}

function frameColorPresets() {
  return [
    {label: "Marrom", value: "#8B5A2B"},
    {label: "Ciano", value: "#20D9E8"},
    {label: "Laranja", value: "#F59A23"},
    {label: "Vermelho", value: "#D94C4C"},
    {label: "Verde", value: "#45B96B"},
    {label: "Roxo", value: "#9B6FE8"},
    {label: "Branco", value: "#E8E8E8"},
    {label: "Preto", value: "#222222"}
  ];
}

function defaultCrop() {
  return {
    zoom: 1,
    panX: 0,
    panY: 0
  };
}

function normalizeCrop(crop) {
  const zoom = Number(crop?.zoom);
  const panX = Number(crop?.panX);
  const panY = Number(crop?.panY);

  return {
    zoom: Number.isFinite(zoom)
      ? Math.min(MAX_CROP_ZOOM, Math.max(MIN_CROP_ZOOM, zoom))
      : 1,
    panX: Number.isFinite(panX) ? panX : 0,
    panY: Number.isFinite(panY) ? panY : 0
  };
}

function defaultState() {
  return {schemaVersion: SCHEMA_VERSION, gallery: []};
}

function normalizeEntry(entry, index = 0) {
  const source = sanitizeSource(entry?.source || entry?.src);
  const src = sanitizeSource(entry?.src || source);

  if (!source || !src || !isSupportedSource(source) || !isSupportedSource(src)) return null;

  return {
    id: String(entry?.id || foundry.utils.randomID(16)),
    name: String(entry?.name || `Aparência ${index + 1}`).trim().slice(0, 80),
    source,
    src,
    favorite: entry?.favorite === true,
    order: Number.isFinite(Number(entry?.order)) ? Number(entry.order) : index,
    processor: entry?.processor === "frame" ? "frame" : "raw",
    processedAt: Number.isFinite(Number(entry?.processedAt)) ? Number(entry.processedAt) : null,
    crop: normalizeCrop(entry?.crop),
    frameColor: normalizeHexColor(entry?.frameColor)
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

  const normalized = getRawState(actor).gallery
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
      !raw.gallery[index]?.crop ||
      !raw.gallery[index]?.frameColor
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

  const state = {
    schemaVersion: SCHEMA_VERSION,
    gallery: normalized
  };

  try {
    await actor.setFlag(MODULE_ID, FLAG_KEY, state);
  } catch (error) {
    if (!isGM() && canUseGmRelay()) {
      await sendSocketRequest("saveGalleryState", {
        actorId: actor.id,
        state
      });
    } else {
      throw error;
    }
  }

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

function tokenOwnedByCurrentUser(token) {
  if (!token?.actor) return false;
  if (isGM()) return true;
  if (token.isOwner === true || token.document?.isOwner === true) return true;
  return actorOwnedByUser(token.actor, game.user?.id);
}

function currentControlledOwnedToken() {
  return (canvas?.tokens?.controlled ?? [])
    .find(token => tokenOwnedByCurrentUser(token)) ?? null;
}

function preferredSceneTokenForUser() {
  // Important: resolving a token for Wardrobe must never control/select it.
  // Canvas selection/highlight is visual state owned by Foundry/LANCER.
  const controlled = currentControlledOwnedToken();
  if (controlled) return controlled;

  const character = game.user?.character ?? null;
  if (character) {
    const byCharacter = getAllSceneTokens().find(token =>
      token.actor?.id === character.id && tokenOwnedByCurrentUser(token)
    );
    if (byCharacter) return byCharacter;
  }

  return getAllSceneTokens().find(token => tokenOwnedByCurrentUser(token)) ?? null;
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
    if (!canAccessActor(actor)) continue;
    seen.add(actor.id);
    actors.push(actor);
  }

  return actors;
}

function resolveDefaultActor() {
  const controlled = currentControlledOwnedToken();
  if (controlled?.actor) return controlled.actor;

  const character = characterActor();
  if (character && actorTokensOnCurrentScene(character).some(token => canAccessActor(token.actor))) {
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
      canAccessActor(token.actor)
    ) return token;
  }

  const controlled = currentControlledOwnedToken();
  if (controlled?.actor?.id === actor.id) return controlled;

  const tokens = actorTokensOnCurrentScene(actor).filter(token => canAccessActor(token.actor));
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

function getActorTokenType(actor) {
  const type = String(actor?.type ?? "").toLowerCase();

  // Explicit LANCER support: both Pilot and Mech are player-character actor types.
  if (["character", "pc", "pilot", "mech"].includes(type)) {
    if (foundry.utils.getProperty?.(actor, "system.subtype.type") === "npc") return "npc";
    return "pc";
  }

  return "npc";
}

function safeTokenizerDefault(key, fallback = null) {
  try {
    const setting = game.settings.settings?.get?.(`${TOKENIZER_ID}.${key}`);
    return setting?.default ?? fallback;
  } catch {
    return fallback;
  }
}

function getTokenizerFrameConfig(actor, token) {
  const module = game.modules.get(TOKENIZER_ID);
  const active = Boolean(module?.active);
  const localUpload = game.user?.can?.("FILES_UPLOAD") === true;
  const relayUpload = canUseGmRelay();
  const canUpload = localUpload || relayUpload;

  // Tokenizer 5.0.3 tint mode uses `default-frame-tint` as its frame image.
  // Its built-in default is plain-marble-frame-grey.png.
  const configuredTintFrame = safeTokenizerSetting(
    "default-frame-tint",
    "[data] modules/vtta-tokenizer/img/plain-marble-frame-grey.png"
  );

  const rawFrame = String(configuredTintFrame || "").trim()
    || "[data] modules/vtta-tokenizer/img/plain-marble-frame-grey.png";

  const framePath = sanitizeSource(stripDirectoryPrefix(rawFrame));

  return {
    active,
    localUpload,
    relayUpload,
    canUpload,
    frameEnabled: active && Boolean(framePath),
    framePath,
    tintFrame: true,
    tintAlgorithm: "tokenizer-5.0.3",
    tokenizerTintBase: true,
    ready: active && canUpload && Boolean(framePath),
    version: String(module?.version ?? "")
  };
}

function tokenizerProxyUrl(source) {
  const lower = String(source ?? "").toLowerCase();
  const forceProxy = safeTokenizerSetting("force-proxy", false) === true;
  const knownProxySite =
    lower.startsWith("https://www.dndbeyond.com/") ||
    lower.startsWith("https://dndbeyond.com/") ||
    lower.startsWith("https://media-waterdeep.cursecdn.com/") ||
    lower.startsWith("https://images.dndbeyond.com");

  if (!forceProxy && !knownProxySite) return source;

  const proxy = String(safeTokenizerSetting("proxy", "") ?? "").trim();
  if (!proxy) return source;

  return proxy.includes("%URL%")
    ? proxy.replace("%URL%", encodeURIComponent(source))
    : `${proxy}${source}`;
}

function buildImageRequestUrl(source, {allowProxy = true} = {}) {
  const clean = sanitizeSource(source);
  if (!clean || !isSupportedSource(clean)) return "";

  return isRemoteUrl(clean) && allowProxy
    ? tokenizerProxyUrl(clean)
    : clean;
}

async function loadImage(source, {allowProxy = true} = {}) {
  const candidate = buildImageRequestUrl(source, {allowProxy});
  if (!candidate) throw new Error("TW_BAD_IMAGE");

  return await new Promise((resolve, reject) => {
    const image = new Image();

    if (isRemoteUrl(candidate)) {
      image.crossOrigin = "anonymous";
    }

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("TW_SOURCE_LOAD_FAILED"));

    // Do NOT append our own query parameter to remote URLs. Discord CDN links
    // commonly use signed query strings, and changing them can invalidate the URL.
    image.src = candidate;
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

  try {
    await loadImage(clean, {allowProxy: false});
    return true;
  } catch {
    return false;
  }
}

function computeBaseScale(imageWidth, imageHeight, canvasSize) {
  if (!imageWidth || !imageHeight || !canvasSize) return 1;
  return Math.max(canvasSize / imageWidth, canvasSize / imageHeight);
}

function computeFitZoom(imageWidth, imageHeight, canvasSize) {
  if (!imageWidth || !imageHeight || !canvasSize) return 1;

  const coverScale = computeBaseScale(imageWidth, imageHeight, canvasSize);
  const containScale = Math.min(canvasSize / imageWidth, canvasSize / imageHeight);
  const zoom = containScale / coverScale;

  return Math.min(1, Math.max(MIN_CROP_ZOOM, zoom));
}

function clampPan({imageWidth, imageHeight, canvasSize, zoom, panX, panY}) {
  const base = computeBaseScale(imageWidth, imageHeight, canvasSize);
  const safeZoom = Math.min(MAX_CROP_ZOOM, Math.max(MIN_CROP_ZOOM, Number(zoom) || 1));
  const scale = base * safeZoom;
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;

  // When an axis is smaller than the canvas after zooming out, keep that axis
  // centered instead of snapping the user back to cover mode.
  const maxX = drawWidth > canvasSize ? (drawWidth - canvasSize) / 2 : 0;
  const maxY = drawHeight > canvasSize ? (drawHeight - canvasSize) / 2 : 0;

  return {
    panX: Math.min(maxX, Math.max(-maxX, Number(panX) || 0)),
    panY: Math.min(maxY, Math.max(-maxY, Number(panY) || 0))
  };
}

function calculateDrawRect(imageWidth, imageHeight, canvasSize, crop) {
  const normalized = normalizeCrop(crop);
  const base = computeBaseScale(imageWidth, imageHeight, canvasSize);
  const scale = base * normalized.zoom;
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  const bounded = clampPan({
    imageWidth,
    imageHeight,
    canvasSize,
    zoom: normalized.zoom,
    panX: normalized.panX,
    panY: normalized.panY
  });

  return {
    x: (canvasSize - drawWidth) / 2 + bounded.panX,
    y: (canvasSize - drawHeight) / 2 + bounded.panY,
    width: drawWidth,
    height: drawHeight,
    crop: {
      zoom: normalized.zoom,
      panX: bounded.panX,
      panY: bounded.panY
    }
  };
}


function drawCroppedSource(ctx, image, size, crop) {
  const rect = calculateDrawRect(
    image.naturalWidth,
    image.naturalHeight,
    size,
    crop
  );

  // Real token mask: pixels outside the circular token boundary never reach
  // the output canvas. This is not only a preview overlay.
  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();

  ctx.drawImage(
    image,
    rect.x,
    rect.y,
    rect.width,
    rect.height
  );

  ctx.restore();
  return rect;
}

function hexToRgba(hex) {
  const value = String(hex ?? "").trim();
  const match = value.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (!match) return null;

  const raw = match[1];
  return {
    r: parseInt(raw.slice(0, 2), 16),
    g: parseInt(raw.slice(2, 4), 16),
    b: parseInt(raw.slice(4, 6), 16),
    a: match[2] ? parseInt(match[2], 16) / 255 : 1
  };
}

function drawFrame(ctx, frameImage, size, tintColor = DEFAULT_FRAME_COLOR) {
  if (!frameImage) return;

  const color = normalizeHexColor(tintColor, "");
  if (!color) {
    ctx.drawImage(frameImage, 0, 0, size, size);
    return;
  }

  // Reproduce Tokenizer 5.0.3 Layer.applyTint() instead of approximating it.
  //
  // Tokenizer 5.0.3:
  // 1) draws the original marble frame;
  // 2) creates a tinted copy using source-atop;
  // 3) composites that copy over the original using the Canvas "color"
  //    blend mode, preserving the original frame's luminosity/details.
  const frameCanvas = document.createElement("canvas");
  frameCanvas.width = size;
  frameCanvas.height = size;
  const frameCtx = frameCanvas.getContext("2d");

  const tintCanvas = document.createElement("canvas");
  tintCanvas.width = size;
  tintCanvas.height = size;
  const tintCtx = tintCanvas.getContext("2d");

  frameCtx.clearRect(0, 0, size, size);
  frameCtx.drawImage(frameImage, 0, 0, size, size);

  tintCtx.clearRect(0, 0, size, size);
  tintCtx.drawImage(frameImage, 0, 0, size, size);
  tintCtx.globalCompositeOperation = "source-atop";
  tintCtx.fillStyle = color;
  tintCtx.fillRect(0, 0, size, size);
  tintCtx.globalCompositeOperation = "source-over";

  frameCtx.globalCompositeOperation = "color";
  frameCtx.drawImage(tintCanvas, 0, 0, size, size);
  frameCtx.globalCompositeOperation = "source-over";

  ctx.drawImage(frameCanvas, 0, 0, size, size);
}

async function canvasToBlob(canvas, type = "image/webp", quality = 0.92) {
  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error("TW_CANVAS_EXPORT_FAILED")),
      type,
      quality
    );
  });
}

function slugify(value) {
  return String(value ?? "token")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "token";
}

function getUploadDirectory(actor) {
  const tokenType = getActorTokenType(actor);
  const setting = tokenType === "pc"
    ? safeTokenizerSetting("image-upload-directory", "")
    : safeTokenizerSetting("npc-image-upload-directory", "");

  const parsed = parseDirectorySetting(setting);

  if (!parsed.current) {
    throw new Error("TW_UPLOAD_DIRECTORY_MISSING");
  }

  return parsed;
}

async function uploadRenderedToken(actor, blob, entryId) {
  const filename = `${slugify(actor.name)}.Wardrobe-${entryId}-${Date.now()}.webp`;

  if (!isGM() && !game.user?.can?.("FILES_UPLOAD")) {
    throw new Error("TW_UPLOAD_PERMISSION");
  }

  const FilePickerClass = foundry?.applications?.apps?.FilePicker?.implementation
    ?? globalThis.FilePicker;

  if (!FilePickerClass?.upload) throw new Error("TW_FILE_PICKER_UNAVAILABLE");

  const directory = getUploadDirectory(actor);
  const file = new File([blob], filename, {type: "image/webp"});
  const options = {};
  if (directory.bucket) options.bucket = directory.bucket;

  const result = await FilePickerClass.upload(
    directory.source,
    directory.current,
    file,
    options,
    {notify: false}
  );

  const path = sanitizeSource(result?.path);
  if (!path) throw new Error("TW_UPLOAD_FAILED");

  return cacheBust(path);
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

  const cleanSrc = sanitizeSource(src);
  if (!cleanSrc || !isSupportedSource(cleanSrc)) throw new Error("TW_BAD_IMAGE");

  const canDirectlyUpdate = canModifyTokenImage(token, cleanSrc);
  if (!canDirectlyUpdate && !canUseGmRelay()) throw new Error("TW_TOKEN_NOT_MODIFIABLE");

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

  const canDirectlyUpdate = canModifyTokenImage(token, cleanSrc);

  if (!canDirectlyUpdate && canUseGmRelay()) {
    await sendSocketRequest("switchTexture", {
      actorId: actor.id,
      tokenId: token.id,
      src: cleanSrc
    });

    Hooks.callAll(`${MODULE_ID}.imageChanged`, {
      actorId: actor.id,
      tokenId: token.id,
      src: cleanSrc
    });

    return token;
  }

  return withTokenLock(token.id, async () => {
    if (!canAccessActor(token.actor) || !canModifyTokenImage(token, cleanSrc)) {
      throw new Error("TW_PERMISSION_CHANGED");
    }

    if (token.document.texture?.src === cleanSrc) return token;

    // Safety invariant: this remains the ONLY direct local TokenDocument mutation in the module.
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

async function upsertProcessedEntry(actor, {
  entryId = "",
  name = "",
  source,
  src,
  crop,
  frameColor = DEFAULT_FRAME_COLOR
}) {
  if (!actor || !canManageActor(actor)) throw new Error("TW_MANAGE_FORBIDDEN");

  const gallery = getGallery(actor);
  const id = entryId || foundry.utils.randomID(16);
  const normalizedName = String(name || displayNameFromSource(source)).trim().slice(0, 80);

  const existing = gallery.find(entry => entry.id === id);

  if (existing) {
    existing.name = normalizedName;
    existing.source = source;
    existing.src = src;
    existing.processor = "frame";
    existing.processedAt = Date.now();
    existing.crop = normalizeCrop(crop);
    existing.frameColor = normalizeHexColor(frameColor);
  } else {
    gallery.push({
      id,
      name: normalizedName,
      source,
      src,
      favorite: false,
      order: gallery.length,
      processor: "frame",
      processedAt: Date.now(),
      crop: normalizeCrop(crop),
      frameColor: normalizeHexColor(frameColor)
    });
  }

  return saveGallery(actor, gallery);
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
    ok: {label: "Salvar", icon: "fa-solid fa-floppy-disk"},
    rejectClose: false
  });

  return String(result?.value ?? "").trim();
}

function processingErrorMessage(error) {
  switch (error?.message) {
    case "TW_SOURCE_LOAD_FAILED":
      return "Não consegui abrir essa imagem. Use o link direto do arquivo (não a página do pin/post); se o site bloquear CORS, configure o proxy do Tokenizer.";
    case "TW_UPLOAD_PERMISSION":
      return "Sem upload local e sem GM ativo para relay.";
    case "TW_NO_ACTIVE_GM":
      return "É necessário um GM ativo para o relay técnico de upload.";
    case "TW_GM_TIMEOUT":
      return "O relay técnico de upload não respondeu a tempo.";
    case "TW_UPLOAD_DIRECTORY_MISSING":
      return "O diretório de upload do Tokenizer não está configurado.";
    case "TW_FRAME_NOT_READY":
      return "A moldura padrão do Tokenizer não está pronta ou está desativada.";
    default:
      return "Não foi possível preparar essa aparência.";
  }
}

const ApplicationV2 = foundry.applications?.api?.ApplicationV2;
const HandlebarsApplicationMixin = foundry.applications?.api?.HandlebarsApplicationMixin;

if (!ApplicationV2 || !HandlebarsApplicationMixin) {
  throw new Error(`${MODULE_TITLE} requires Foundry VTT 13 ApplicationV2.`);
}

const BaseApplication = HandlebarsApplicationMixin(ApplicationV2);

class TokenCropperApp extends BaseApplication {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-cropper`,
    tag: "section",
    classes: ["twl-cropper-app"],
    window: {
      title: "Preparar aparência",
      icon: "fa-solid fa-crop-simple",
      resizable: true
    },
    position: {width: 520, height: 640},
    actions: {
      resetCrop: TokenCropperApp.#resetCrop,
      fitImage: TokenCropperApp.#fitImage,
      saveCrop: TokenCropperApp.#saveCrop,
      cancelCrop: TokenCropperApp.#cancelCrop
    }
  };

  static PARTS = {
    main: {template: `modules/${MODULE_ID}/templates/cropper.hbs`}
  };

  constructor(options = {}) {
    super(options);

    this.actor = options.actor;
    this.token = options.token;
    this.source = sanitizeSource(options.source);
    this.entryId = String(options.entryId || "");
    this.entryName = String(options.name || displayNameFromSource(this.source));
    this.crop = normalizeCrop(options.crop);
    this.frameColor = normalizeHexColor(options.frameColor);
    this.sourceImage = null;
    this.frameImage = null;
    this.frameConfig = getTokenizerFrameConfig(this.actor, this.token);
    this.dragging = false;
    this.dragStart = null;
    this.savePending = false;
  }

  async _prepareContext() {
    return {
      source: this.source,
      name: this.entryName,
      zoom: this.crop.zoom,
      zoomPercent: Math.round(this.crop.zoom * 100),
      zoomMin: MIN_CROP_ZOOM,
      zoomMax: MAX_CROP_ZOOM,
      frameColor: this.frameColor,
      frameColorPresets: frameColorPresets(),
      frameReady: this.frameConfig.ready,
      framePath: this.frameConfig.framePath,
      frameAlgorithm: this.frameConfig.tintAlgorithm,
      canUpload: this.frameConfig.canUpload,
      tokenizerActive: this.frameConfig.active,
      tokenizerVersion: this.frameConfig.version,
      frameEnabled: this.frameConfig.frameEnabled
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);

    const root = this.element;
    if (!root) return;

    const canvas = root.querySelector('[data-role="crop-canvas"]');
    const zoom = root.querySelector('[data-role="zoom"]');
    const zoomValue = root.querySelector('[data-role="zoom-value"]');

    if (!canvas || !zoom) return;

    canvas.width = 512;
    canvas.height = 512;

    try {
      this.sourceImage = await loadImage(this.source);

      if (this.frameConfig.framePath) {
        try {
          this.frameImage = await loadImage(this.frameConfig.framePath, {allowProxy: false});
        } catch (error) {
          console.warn(`${MODULE_TITLE} | Could not preview Tokenizer frame`, error);
          this.frameImage = null;
        }
      }

      this.#normalizePan(canvas.width);
      this.#draw(canvas);
    } catch (error) {
      console.error(`${MODULE_TITLE} | Cropper image load failed`, error);
      notify("error", processingErrorMessage(error));
      await this.close();
      return;
    }

    zoom.value = String(this.crop.zoom);

    zoom.addEventListener("input", event => {
      this.crop.zoom = Math.min(
        MAX_CROP_ZOOM,
        Math.max(MIN_CROP_ZOOM, Number(event.currentTarget.value || 1))
      );
      this.#normalizePan(canvas.width);
      zoomValue.textContent = `${Math.round(this.crop.zoom * 100)}%`;
      this.#draw(canvas);
    });

    const colorPicker = root.querySelector('[data-role="frame-color"]');
    const colorHex = root.querySelector('[data-role="frame-color-hex"]');

    const applyFrameColor = value => {
      this.frameColor = normalizeHexColor(value);

      if (colorPicker) colorPicker.value = this.frameColor;
      if (colorHex) colorHex.value = this.frameColor;

      this.#draw(canvas);
    };

    colorPicker?.addEventListener("input", event => {
      applyFrameColor(event.currentTarget.value);
    });

    colorHex?.addEventListener("change", event => {
      applyFrameColor(event.currentTarget.value);
    });

    colorHex?.addEventListener("keydown", event => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      applyFrameColor(event.currentTarget.value);
    });

    for (const button of root.querySelectorAll('[data-role="frame-preset"]')) {
      button.addEventListener("click", event => {
        event.preventDefault();
        applyFrameColor(event.currentTarget.dataset.color);
      });
    }

    canvas.addEventListener("pointerdown", event => {
      this.dragging = true;
      canvas.setPointerCapture?.(event.pointerId);
      this.dragStart = {
        x: event.clientX,
        y: event.clientY,
        panX: this.crop.panX,
        panY: this.crop.panY
      };
      canvas.classList.add("is-dragging");
    });

    canvas.addEventListener("pointermove", event => {
      if (!this.dragging || !this.dragStart) return;

      const rect = canvas.getBoundingClientRect();
      const factorX = canvas.width / rect.width;
      const factorY = canvas.height / rect.height;

      this.crop.panX = this.dragStart.panX + ((event.clientX - this.dragStart.x) * factorX);
      this.crop.panY = this.dragStart.panY + ((event.clientY - this.dragStart.y) * factorY);

      this.#normalizePan(canvas.width);
      this.#draw(canvas);
    });

    const stopDrag = event => {
      if (!this.dragging) return;
      this.dragging = false;
      this.dragStart = null;
      canvas.releasePointerCapture?.(event.pointerId);
      canvas.classList.remove("is-dragging");
    };

    canvas.addEventListener("pointerup", stopDrag);
    canvas.addEventListener("pointercancel", stopDrag);

    canvas.addEventListener("wheel", event => {
      event.preventDefault();

      const delta = event.deltaY > 0 ? -0.08 : 0.08;
      this.crop.zoom = Math.min(
        MAX_CROP_ZOOM,
        Math.max(MIN_CROP_ZOOM, this.crop.zoom + delta)
      );
      zoom.value = String(this.crop.zoom);
      zoomValue.textContent = `${Math.round(this.crop.zoom * 100)}%`;

      this.#normalizePan(canvas.width);
      this.#draw(canvas);
    }, {passive: false});
  }

  #normalizePan(size) {
    if (!this.sourceImage) return;

    const bounded = clampPan({
      imageWidth: this.sourceImage.naturalWidth,
      imageHeight: this.sourceImage.naturalHeight,
      canvasSize: size,
      zoom: this.crop.zoom,
      panX: this.crop.panX,
      panY: this.crop.panY
    });

    this.crop.panX = bounded.panX;
    this.crop.panY = bounded.panY;
  }

  #draw(canvas) {
    if (!this.sourceImage) return;

    const ctx = canvas.getContext("2d");
    const size = canvas.width;
    ctx.clearRect(0, 0, size, size);

    const clippedRect = drawCroppedSource(
      ctx,
      this.sourceImage,
      size,
      this.crop
    );

    this.crop = clippedRect.crop;

    if (this.frameImage) {
      drawFrame(
        ctx,
        this.frameImage,
        size,
        this.frameColor
      );
    } else {
      ctx.save();
      ctx.strokeStyle = "rgba(116,231,255,.9)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size * 0.44, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  async #renderFinalCanvas() {
    if (!this.sourceImage) throw new Error("TW_SOURCE_LOAD_FAILED");
    if (!this.frameConfig.ready || !this.frameImage) throw new Error("TW_FRAME_NOT_READY");

    const tokenSizeSetting = Number(safeTokenizerSetting("token-size", 400));
    const size = Math.min(2048, Math.max(256, Number.isFinite(tokenSizeSetting) ? tokenSizeSetting : 400));

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext("2d");
    const previewSize = 512;

    // Crop pan is stored in preview-space units. Scale it to final output.
    const cropForOutput = {
      zoom: this.crop.zoom,
      panX: this.crop.panX * (size / previewSize),
      panY: this.crop.panY * (size / previewSize)
    };

    ctx.clearRect(0, 0, size, size);

    // Preserve transparent corners in the final WEBP.
    drawCroppedSource(
      ctx,
      this.sourceImage,
      size,
      cropForOutput
    );

    drawFrame(
      ctx,
      this.frameImage,
      size,
      this.frameColor
    );

    return canvas;
  }

  static async #fitImage() {
    if (!this.sourceImage) return;

    const canvas = this.element?.querySelector?.('[data-role="crop-canvas"]');
    const zoom = this.element?.querySelector?.('[data-role="zoom"]');
    const zoomValue = this.element?.querySelector?.('[data-role="zoom-value"]');
    const size = canvas?.width || 512;

    this.crop.zoom = computeFitZoom(
      this.sourceImage.naturalWidth,
      this.sourceImage.naturalHeight,
      size
    );
    this.crop.panX = 0;
    this.crop.panY = 0;

    if (zoom) zoom.value = String(this.crop.zoom);
    if (zoomValue) zoomValue.textContent = `${Math.round(this.crop.zoom * 100)}%`;

    if (canvas) {
      this.#normalizePan(size);
      this.#draw(canvas);
    }
  }

  static async #resetCrop() {
    this.crop = defaultCrop();

    const canvas = this.element?.querySelector?.('[data-role="crop-canvas"]');
    const zoom = this.element?.querySelector?.('[data-role="zoom"]');
    const zoomValue = this.element?.querySelector?.('[data-role="zoom-value"]');

    if (zoom) zoom.value = "1";
    if (zoomValue) zoomValue.textContent = "100%";

    if (canvas) {
      this.#normalizePan(canvas.width || 512);
      this.#draw(canvas);
    }
  }

  static async #saveCrop(event, target) {
    if (this.savePending) return;

    this.savePending = true;
    target.disabled = true;

    try {
      if (!this.frameConfig.ready) throw new Error("TW_FRAME_NOT_READY");

      const nameInput = this.element?.querySelector?.('[data-role="crop-name"]');
      const name = String(nameInput?.value || this.entryName).trim().slice(0, 80);

      const canvas = await this.#renderFinalCanvas();
      const blob = await canvasToBlob(canvas, "image/webp", 0.92);
      const entryId = this.entryId || foundry.utils.randomID(16);

      if (isGM() || game.user?.can?.("FILES_UPLOAD")) {
        const finalPath = await uploadRenderedToken(this.actor, blob, entryId);

        await upsertProcessedEntry(this.actor, {
          entryId,
          name,
          source: this.source,
          src: finalPath,
          crop: this.crop,
          frameColor: this.frameColor
        });
      } else {
        await requestAppearanceSave({
          actor: this.actor,
          entryId,
          name,
          source: this.source,
          crop: this.crop,
          frameColor: this.frameColor,
          blob
        });
      }

      notify("info", "Aparência salva.");
      await this.close();

      if (appInstance?.rendered) {
        appInstance.render({force: true});
      }
    } catch (error) {
      console.error(`${MODULE_TITLE} | Crop save failed`, error);
      notify("error", processingErrorMessage(error));
    } finally {
      this.savePending = false;
      target.disabled = false;
    }
  }

  static async #cancelCrop() {
    await this.close();
  }
}

function openCropper({actor, token, source, entry = null}) {
  const frameConfig = getTokenizerFrameConfig(actor, token);

  if (!frameConfig.active) {
    notify("error", "Ative o Tokenizer para usar a moldura configurada nele.");
    return null;
  }

  if (!frameConfig.canUpload) {
    notify("error", "É preciso FILES_UPLOAD local ou um GM ativo para relay.");
    return null;
  }

  if (!frameConfig.frameEnabled || !frameConfig.framePath) {
    notify("error", "Não encontrei a moldura de tonalidade do Tokenizer 5.0.3.");
    return null;
  }

  const cropper = new TokenCropperApp({
    actor,
    token,
    source,
    entryId: entry?.id ?? "",
    name: entry?.name ?? displayNameFromSource(source),
    crop: entry?.crop ?? defaultCrop(),
    frameColor: entry?.frameColor ?? DEFAULT_FRAME_COLOR
  });

  cropper.render({force: true});
  return cropper;
}

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
    position: {width: 560, height: 620},
    actions: {
      prepareUrl: TokenWardrobeApp.#prepareUrl,
      pickFile: TokenWardrobeApp.#pickFile,
      switchImage: TokenWardrobeApp.#switchImage,
      editCrop: TokenWardrobeApp.#editCrop,
      renameImage: TokenWardrobeApp.#renameImage,
      toggleFavorite: TokenWardrobeApp.#toggleFavorite,
      removeImage: TokenWardrobeApp.#removeImage
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
    const tokens = actor
      ? actorTokensOnCurrentScene(actor).filter(item => canAccessActor(item.actor))
      : [];
    const token = actor ? resolveToken(actor, this.tokenId) : null;

    if (token) this.tokenId = token.id;

    const gallery = actor ? getGallery(actor) : [];
    const frame = actor && token ? getTokenizerFrameConfig(actor, token) : {
      active:false,
      canUpload:false,
      frameEnabled:false,
      framePath:"",
      ready:false,
      version:""
    };

    let tokenizerStatus = "Tokenizer indisponível";
    let tokenizerClass = "is-error";

    if (frame.active && !frame.canUpload) {
      tokenizerStatus = "Tokenizer · sem upload";
      tokenizerClass = "is-warn";
    } else if (frame.active && !frame.frameEnabled) {
      tokenizerStatus = "Tokenizer · borda OFF";
      tokenizerClass = "is-warn";
    } else if (frame.ready) {
      tokenizerStatus = `Tokenizer · pronto${frame.version ? ` v${frame.version}` : ""}`;
      tokenizerClass = "is-ok";
    }

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
      gallery: [
        ...gallery.filter(entry => entry.favorite),
        ...gallery.filter(entry => !entry.favorite)
      ].map(entry => ({
        ...entry,
        active: token?.document.texture?.src === entry.src,
        searchText: `${entry.name} ${entry.source}`.toLowerCase()
      })),
      hasActor: Boolean(actor),
      hasToken: Boolean(token),
      multipleActors: actors.length > 1,
      multipleTokens: tokens.length > 1,
      currentSrc: token?.document.texture?.src ?? "",
      canSubmitUrl: canAccessActor(actor),
      canEditCrop: canAccessActor(actor),
      canManage: canManageActor(actor),
      fixedRingSubject: hasFixedDynamicRingSubject(token),
      tokenizerStatus,
      tokenizerClass,
      tokenizerReady: frame.ready,
      relayUpload: frame.relayUpload,
      localUpload: frame.localUpload,
      canBrowseFiles: isGM(),
      canPickCurrentToken: Boolean(preferredSceneTokenForUser())
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

    root.querySelector('[data-role="url-input"]')?.addEventListener("keydown", event => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      root.querySelector('[data-action="prepareUrl"]')?.click();
    });

    root.querySelector('[data-role="use-selected-token"]')?.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();

      const token = currentControlledOwnedToken();

      if (!token?.actor) {
        notify("warn", "Selecione o seu token na mesa e tente novamente.");
        return;
      }

      this.actorId = token.actor.id;
      this.tokenId = token.id;

      try {
        if (token.center && canvas?.animatePan) {
          await canvas.animatePan({x: token.center.x, y: token.center.y, duration: 180});
        }
      } catch (error) {
        console.warn(`${MODULE_TITLE} | Could not focus selected token`, error);
      }

      notify("info", `Token selecionado: ${token.name || token.actor.name}`);
      this.render({force: true});
    });

    root.querySelector('[data-role="use-my-token"]')?.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();

      const token = preferredSceneTokenForUser();

      if (!token?.actor) {
        notify("warn", "Não encontrei um token seu na cena atual.");
        return;
      }

      this.actorId = token.actor.id;
      this.tokenId = token.id;

      try {
        if (token.center && canvas?.animatePan) {
          await canvas.animatePan({x: token.center.x, y: token.center.y, duration: 180});
        }
      } catch (error) {
        console.warn(`${MODULE_TITLE} | Could not focus owned token`, error);
      }

      notify("info", `Usando: ${token.name || token.actor.name}`);
      this.render({force: true});
    });
  }

  async close(options = {}) {
    if (appInstance === this) appInstance = null;
    return super.close(options);
  }

  static async #prepareUrl() {
    const actor = this.actor;
    const token = actor ? resolveToken(actor, this.tokenId) : null;

    if (!actor || !token) {
      notify("warn", "Primeiro escolha seu token com “Token selecionado” ou “Meu token na cena”.");
      return;
    }

    if (!canAccessActor(actor)) {
      notify("error", "Você não tem ownership desse personagem.");
      return;
    }

    const input = this.element?.querySelector?.('[data-role="url-input"]');
    const source = sanitizeSource(input?.value);

    if (!source || !isRemoteUrl(source)) {
      notify("error", "Cole o link direto http/https de uma imagem.");
      return;
    }

    openCropper({actor, token, source});
  }

  static async #pickFile() {
    try {
      const actor = this.actor;
      const token = actor ? resolveToken(actor, this.tokenId) : null;
      if (!actor || !token || !canManageActor(actor)) return;

      const source = await pickSingleImage();
      if (!source) return;

      openCropper({actor, token, source});
    } catch (error) {
      console.error(`${MODULE_TITLE} | File Picker failed`, error);
      notify("error", "Não foi possível abrir o seletor de arquivos.");
    }
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
      notify("error", "Não foi possível trocar a aparência desse token.");
    } finally {
      target.disabled = false;
    }
  }

  static async #editCrop(event, target) {
    const actor = this.actor;
    const token = actor ? resolveToken(actor, this.tokenId) : null;
    if (!actor || !token || !canAccessActor(actor)) return;

    const id = String(target.dataset.id || "");
    const entry = getGallery(actor).find(item => item.id === id);
    if (!entry) return;

    openCropper({
      actor,
      token,
      source: entry.source,
      entry
    });
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

      entry.name = name.slice(0, 80);
      await saveGallery(actor, gallery);
      this.render({force: true});
    } catch (error) {
      console.error(`${MODULE_TITLE} | Rename failed`, error);
      notify("error", "Não foi possível renomear.");
    }
  }

  static async #toggleFavorite(event, target) {
    const actor = this.actor;
    if (!actor || !canManageActor(actor)) return;

    const id = String(target.dataset.id || "");
    const gallery = getGallery(actor).map(entry =>
      entry.id === id ? {...entry, favorite: !entry.favorite} : entry);

    await saveGallery(actor, gallery);
    this.render({force: true});
  }

  static async #removeImage(event, target) {
    const actor = this.actor;
    if (!actor || !canManageActor(actor)) return;

    const id = String(target.dataset.id || "");
    await saveGallery(actor, getGallery(actor).filter(entry => entry.id !== id));
    this.render({force: true});
  }

}


function isTokenizerApplication(app) {
  if (!app) return false;

  return (
    app.constructor?.name === "Tokenizer" ||
    app.id === "tokenizer-control" ||
    app.options?.id === "tokenizer-control"
  );
}

function tokenizerBridgeActor(app) {
  return app?.tokenOptions?.actor ?? null;
}

function canBridgeTokenizerForApp(app) {
  if (!isTokenizerApplication(app)) return false;
  if (isGM()) return false;
  if (game.user?.can?.("FILES_UPLOAD")) return false;
  if (!getActiveGM()) return false;

  const actor = tokenizerBridgeActor(app);
  return Boolean(actor && canAccessActor(actor));
}

function patchTokenizerApplication(app) {
  if (!canBridgeTokenizerForApp(app)) return false;

  const actor = tokenizerBridgeActor(app);
  if (!actor) return false;

  if (!app.__hstwContextPatched && typeof app._prepareContext === "function") {
    const originalPrepareContext = app._prepareContext.bind(app);

    app._prepareContext = async (...args) => {
      const context = await originalPrepareContext(...args);
      return {
        ...context,
        canUpload: true
      };
    };

    app.__hstwContextPatched = true;
  }

  if (!app.__hstwUploadPatched) {
    app.updateToken = async function(dataBlob) {
      if (!this.modifyToken) return;

      const result = await relayTokenizerUpload({
        actor,
        kind: "token",
        fileName: this.tokenFileName,
        blob: dataBlob
      });

      const path = sanitizeSource(result?.path);
      if (!path) throw new Error("TW_TOKENIZER_RELAY_UPLOAD_FAILED");

      this.tokenOptions.tokenUploadDirectory = this.tokenUploadDirectory;
      this.tokenOptions.tokenFilename = path;
    };

    app.updateAvatar = async function(dataBlob) {
      if (!this.modifyAvatar) return;

      const result = await relayTokenizerUpload({
        actor,
        kind: "avatar",
        fileName: this.avatarFileName,
        blob: dataBlob
      });

      const path = sanitizeSource(result?.path);
      if (!path) throw new Error("TW_TOKENIZER_RELAY_UPLOAD_FAILED");

      this.tokenOptions.avatarUploadDirectory = this.avatarUploadDirectory;
      this.tokenOptions.avatarFilename = path;
    };

    app.__hstwUploadPatched = true;
  }

  const applyButton = app.element?.querySelector?.("#ok");
  if (applyButton) {
    applyButton.disabled = false;
    applyButton.removeAttribute?.("disabled");
    applyButton.title = "Save using HoloSuite GM relay";
  }

  return true;
}

function registerTokenizerCompatibilityHooks() {
  Hooks.on("renderTokenizer", app => {
    patchTokenizerApplication(app);
  });

  Hooks.on("renderApplicationV2", app => {
    if (isTokenizerApplication(app)) {
      patchTokenizerApplication(app);
    }
  });
}

async function configureTokenizerPlayerBridge() {
  if (!isGM() || !game.modules.get(TOKENIZER_ID)?.active) return;

  try {
    if (game.settings.get(TOKENIZER_ID, "disable-player") === true) {
      await game.settings.set(TOKENIZER_ID, "disable-player", false);
      console.log(`${MODULE_TITLE} | Enabled Tokenizer UI for players; uploads remain GM-relayed.`);
    }
  } catch (error) {
    console.warn(`${MODULE_TITLE} | Could not enable Tokenizer player UI`, error);
  }

  await ensureTokenizerUploadDirectories();
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
    description: "Cole uma arte, enquadre manualmente e use a moldura do Tokenizer.",
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

    openCropper: ({actorId, tokenId, source, entryId = ""}) => {
      const token = tokenId ? canvas?.tokens?.get?.(tokenId) : null;
      const actor = token?.actor ?? game.actors?.get?.(actorId) ?? null;

      if (!actor || !canManageActor(actor)) throw new Error("TW_MANAGE_FORBIDDEN");

      const resolvedToken = resolveToken(actor, tokenId);
      if (!resolvedToken) throw new Error("TW_TOKEN_NOT_FOUND");

      const entry = entryId
        ? getGallery(actor).find(item => item.id === entryId) ?? null
        : null;

      return openCropper({
        actor,
        token: resolvedToken,
        source: sanitizeSource(source || entry?.source),
        entry
      });
    },

    getTokenizerFrameConfig: ({actorId, tokenId}) => {
      const token = tokenId ? canvas?.tokens?.get?.(tokenId) : null;
      const actor = token?.actor ?? game.actors?.get?.(actorId) ?? null;
      if (!actor || !canAccessActor(actor)) return null;
      return {...getTokenizerFrameConfig(actor, token ?? resolveToken(actor, tokenId))};
    },

    resolveDefaultActor: () => {
      const actor = resolveDefaultActor();
      return actor && canAccessActor(actor) ? actor : null;
    }
  });

  const moduleEntry = game.modules.get(MODULE_ID);
  if (moduleEntry) moduleEntry.api = api;
  game.holosuiteTokenWardrobe = api;
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, SETTING_PLAYER_MANAGE, {
    name: "Legacy: player gallery management",
    hint: "Legacy setting retained for migration compatibility. Actor Owners always manage their own wardrobe.",
    scope: "world",
    config: false,
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
  registerTokenizerCompatibilityHooks();

  Hooks.once("socketlib.ready", () => {
    registerSocketlibBridge();
  });

  Hooks.on("holosuite-core.apiReady", api => {
    registerWithHoloSuite(api);
  });
});

Hooks.once("ready", async () => {
  exposeApi();
  registerWithHoloSuite();
  registerSocketlibBridge();
  await configureTokenizerPlayerBridge();
  console.log(`${MODULE_TITLE} | Ready`);
});

Hooks.on(`${MODULE_ID}.galleryChanged`, () => {
  if (appInstance?.rendered) appInstance.render({force: true});
});
