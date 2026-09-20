
const MODULE_ID = "holosuite-token-wardrobe";
const MODULE_TITLE = "HoloSuite Token Wardrobe";
const TOKENIZER_ID = "vtta-tokenizer";

const FLAG_KEY = "state";
const SCHEMA_VERSION = 3;

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

function parseDirectorySetting(value) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^\[([^\]]+)\]\s*(.*)$/);

  if (!match) {
    return {
      source: "data",
      current: raw.replace(/^\/+/, ""),
      bucket: null
    };
  }

  const descriptor = match[1];
  const current = match[2].replace(/^\/+/, "");

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
    zoom: Number.isFinite(zoom) ? Math.min(6, Math.max(1, zoom)) : 1,
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
    crop: normalizeCrop(entry?.crop)
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
      !raw.gallery[index]?.crop
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
  const canUpload = game.user?.can?.("FILES_UPLOAD") === true;
  const frameEnabled = active && safeTokenizerSetting("add-frame-default", false) === true;
  const tokenType = getActorTokenType(actor);
  const disposition = Number(token?.document?.disposition ?? actor?.prototypeToken?.disposition ?? 0);

  // Wardrobe intentionally uses Tokenizer's CLASSIC built-in frames, not frame-tint mode.
  // For LANCER pilot/mech this resolves to the standard brown PC ring.
  let rawFrame = "";

  if (active && frameEnabled) {
    if (tokenType === "pc") {
      rawFrame = safeTokenizerDefault(
        "default-frame-pc",
        "[data] modules/vtta-tokenizer/img/default-frame-pc.png"
      );
    } else if (disposition === 0 || disposition === 1) {
      rawFrame = safeTokenizerDefault(
        "default-frame-neutral",
        "[data] modules/vtta-tokenizer/img/default-frame-npc.png"
      );
    } else {
      rawFrame = safeTokenizerDefault(
        "default-frame-npc",
        "[data] modules/vtta-tokenizer/img/default-frame-npc.png"
      );
    }
  }

  const framePath = sanitizeSource(stripDirectoryPrefix(rawFrame));

  return {
    active,
    canUpload,
    frameEnabled,
    framePath,
    tintFrame: false,
    tintColor: null,
    classicFrame: true,
    ready: active && canUpload && frameEnabled && Boolean(framePath),
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

async function loadImage(source, {allowProxy = true} = {}) {
  const clean = sanitizeSource(source);
  if (!clean || !isSupportedSource(clean)) throw new Error("TW_BAD_IMAGE");

  const candidate = isRemoteUrl(clean) && allowProxy
    ? tokenizerProxyUrl(clean)
    : clean;

  return await new Promise((resolve, reject) => {
    const image = new Image();

    if (isRemoteUrl(candidate)) {
      image.crossOrigin = "anonymous";
    }

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("TW_SOURCE_LOAD_FAILED"));

    if (isRemoteUrl(candidate)) {
      const separator = candidate.includes("?") ? "&" : "?";
      image.src = `${candidate}${separator}hstw=${Date.now()}`;
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

function clampPan({imageWidth, imageHeight, canvasSize, zoom, panX, panY}) {
  const base = computeBaseScale(imageWidth, imageHeight, canvasSize);
  const scale = base * Math.max(1, zoom);
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;

  const maxX = Math.max(0, (drawWidth - canvasSize) / 2);
  const maxY = Math.max(0, (drawHeight - canvasSize) / 2);

  return {
    panX: Math.min(maxX, Math.max(-maxX, panX)),
    panY: Math.min(maxY, Math.max(-maxY, panY))
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

function drawFrame(ctx, frameImage, size, tintColor = null) {
  if (!frameImage) return;

  if (!tintColor) {
    ctx.drawImage(frameImage, 0, 0, size, size);
    return;
  }

  const rgba = hexToRgba(tintColor);
  if (!rgba) {
    ctx.drawImage(frameImage, 0, 0, size, size);
    return;
  }

  const temp = document.createElement("canvas");
  temp.width = size;
  temp.height = size;
  const tctx = temp.getContext("2d");

  tctx.drawImage(frameImage, 0, 0, size, size);
  tctx.globalCompositeOperation = "source-in";
  tctx.fillStyle = `rgba(${rgba.r},${rgba.g},${rgba.b},${rgba.a})`;
  tctx.fillRect(0, 0, size, size);
  tctx.globalCompositeOperation = "source-over";

  ctx.drawImage(temp, 0, 0);
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
  if (!game.user?.can?.("FILES_UPLOAD")) {
    throw new Error("TW_UPLOAD_PERMISSION");
  }

  const FilePickerClass = foundry?.applications?.apps?.FilePicker?.implementation
    ?? globalThis.FilePicker;

  if (!FilePickerClass?.upload) {
    throw new Error("TW_FILE_PICKER_UNAVAILABLE");
  }

  const directory = getUploadDirectory(actor);
  const filename = `${slugify(actor.name)}.Wardrobe-${entryId}-${Date.now()}.webp`;
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

    // Safety invariant: this remains the ONLY TokenDocument mutation in the module.
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
  crop
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
      crop: normalizeCrop(crop)
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
      return "Não consegui abrir essa imagem. Use o link direto da imagem; se o site bloquear CORS, configure o proxy do Tokenizer.";
    case "TW_UPLOAD_PERMISSION":
      return "O Tokenizer precisa de permissão FILES_UPLOAD para salvar a imagem pronta.";
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
      frameReady: this.frameConfig.ready,
      framePath: this.frameConfig.framePath,
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
      this.crop.zoom = Math.min(6, Math.max(1, Number(event.currentTarget.value || 1)));
      this.#normalizePan(canvas.width);
      zoomValue.textContent = `${Math.round(this.crop.zoom * 100)}%`;
      this.#draw(canvas);
    });

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
      this.crop.zoom = Math.min(6, Math.max(1, this.crop.zoom + delta));
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
        this.frameConfig.tintFrame ? this.frameConfig.tintColor : null
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
      this.frameConfig.tintFrame ? this.frameConfig.tintColor : null
    );

    return canvas;
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
      const finalPath = await uploadRenderedToken(this.actor, blob, entryId);

      await upsertProcessedEntry(this.actor, {
        entryId,
        name,
        source: this.source,
        src: finalPath,
        crop: this.crop
      });

      notify("info", "Aparência preparada e salva.");
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
    notify("error", "Você precisa da permissão FILES_UPLOAD para salvar a imagem pronta.");
    return null;
  }

  if (!frameConfig.frameEnabled || !frameConfig.framePath) {
    notify("error", "A borda padrão do Tokenizer está desativada ou não foi encontrada.");
    return null;
  }

  const cropper = new TokenCropperApp({
    actor,
    token,
    source,
    entryId: entry?.id ?? "",
    name: entry?.name ?? displayNameFromSource(source),
    crop: entry?.crop ?? defaultCrop()
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
      removeImage: TokenWardrobeApp.#removeImage,
      enableTokenizerFrame: TokenWardrobeApp.#enableTokenizerFrame
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
      canManage: canManageActor(actor),
      fixedRingSubject: hasFixedDynamicRingSubject(token),
      tokenizerStatus,
      tokenizerClass,
      tokenizerReady: frame.ready,
      canEnableFrame: isGM() && frame.active && !frame.frameEnabled
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
  }

  async close(options = {}) {
    if (appInstance === this) appInstance = null;
    return super.close(options);
  }

  static async #prepareUrl() {
    const actor = this.actor;
    const token = actor ? resolveToken(actor, this.tokenId) : null;
    if (!actor || !token || !canManageActor(actor)) return;

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
    if (!actor || !token || !canManageActor(actor)) return;

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

  static async #enableTokenizerFrame() {
    if (!isGM() || !game.modules.get(TOKENIZER_ID)?.active) return;

    try {
      await game.settings.set(TOKENIZER_ID, "add-frame-default", true);
      notify("info", "Borda padrão do Tokenizer ativada.");
      this.render({force: true});
    } catch (error) {
      console.error(`${MODULE_TITLE} | Could not enable Tokenizer frame`, error);
      notify("error", "Não foi possível ativar a borda do Tokenizer.");
    }
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
    name: "Players podem gerenciar a própria galeria",
    hint: "Permite que jogadores Owner adicionem, reenquadrem, renomeiem e removam artes do próprio Actor.",
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
