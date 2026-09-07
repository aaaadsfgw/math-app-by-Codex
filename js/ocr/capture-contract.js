export const OCR_CAPTURE_PROTOCOL_VERSION = 1;
export const OCR_CAPTURE_TARGET = "math-study-log-background";
export const OCR_CAPTURE_MESSAGE_TARGET = OCR_CAPTURE_TARGET;

export const START_OCR_CAPTURE = "START_OCR_CAPTURE";
export const BEGIN_OCR_SELECTION = "BEGIN_OCR_SELECTION";
export const SUBMIT_OCR_SELECTION = "SUBMIT_OCR_SELECTION";
export const PREPARE_OCR_SCREENSHOT = "PREPARE_OCR_SCREENSHOT";
export const CANCEL_OCR_CAPTURE = "CANCEL_OCR_CAPTURE";
export const GET_OCR_CAPTURE_PREVIEW = "GET_OCR_CAPTURE_PREVIEW";
export const RECOGNIZE_OCR_CAPTURE = "RECOGNIZE_OCR_CAPTURE";
export const CANCEL_OCR_RECOGNITION = "CANCEL_OCR_RECOGNITION";
export const DISCARD_OCR_CAPTURE = "DISCARD_OCR_CAPTURE";
export const OCR_CAPTURE_COMPLETE = "OCR_CAPTURE_COMPLETE";

export const OCR_CAPTURE_MESSAGE_TYPES = Object.freeze([
  START_OCR_CAPTURE,
  BEGIN_OCR_SELECTION,
  SUBMIT_OCR_SELECTION,
  PREPARE_OCR_SCREENSHOT,
  CANCEL_OCR_CAPTURE,
  GET_OCR_CAPTURE_PREVIEW,
  RECOGNIZE_OCR_CAPTURE,
  CANCEL_OCR_RECOGNITION,
  DISCARD_OCR_CAPTURE,
  OCR_CAPTURE_COMPLETE,
]);

export const OCR_CAPTURE_PHASES = Object.freeze([
  "selecting",
  "preparing",
  "capturing",
  "preview",
  "failed",
  "cancelled",
]);

export const OCR_CAPTURE_SESSION_STORAGE_KEY = "ocrCaptureSessionV1";
export const OCR_CAPTURE_MAX_ID_LENGTH = 128;
export const OCR_CAPTURE_MAX_URL_LENGTH = 4_096;

export const OCR_CAPTURE_NON_PERSISTED_IMAGE_FIELDS = Object.freeze([
  "base64",
  "blob",
  "bytes",
  "dataUrl",
  "image",
  "imageData",
  "imageDataUrl",
  "pixels",
  "preview",
  "previewDataUrl",
  "screenshot",
  "screenshotDataUrl",
]);

const MESSAGE_TYPE_SET = new Set(OCR_CAPTURE_MESSAGE_TYPES);
const PHASE_SET = new Set(OCR_CAPTURE_PHASES);
const DANGEROUS_PROPERTY_NAMES = new Set(["__proto__", "constructor", "prototype"]);
const IMAGE_FIELD_SET = new Set(OCR_CAPTURE_NON_PERSISTED_IMAGE_FIELDS);
const CAPTURE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u;
const DOCUMENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u;
const CANONICAL_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const SOURCE_PROTOCOLS = new Set(["http:", "https:"]);
const MAX_DOCUMENT_ID_LENGTH = 256;
const MAX_REASON_LENGTH = 500;
const MAX_CSS_COORDINATE = 10_000_000;
const MAX_DEVICE_PIXEL_RATIO = 100;

const MESSAGE_KEYS = Object.freeze([
  "target",
  "protocolVersion",
  "type",
  "captureId",
  "phase",
  "expiresAt",
  "tabId",
  "windowId",
  "frameId",
  "documentId",
  "sourceUrl",
  "selection",
  "viewport",
  "reason",
]);

const MESSAGE_KEYS_BY_TYPE = Object.freeze({
  [START_OCR_CAPTURE]: Object.freeze(["target", "protocolVersion", "type"]),
  [BEGIN_OCR_SELECTION]: Object.freeze([
    "target",
    "protocolVersion",
    "type",
    "captureId",
    "expiresAt",
    "documentId",
    "sourceUrl",
  ]),
  [SUBMIT_OCR_SELECTION]: Object.freeze([
    "target",
    "protocolVersion",
    "type",
    "captureId",
    "selection",
    "viewport",
  ]),
  [PREPARE_OCR_SCREENSHOT]: Object.freeze([
    "target",
    "protocolVersion",
    "type",
    "captureId",
  ]),
  [CANCEL_OCR_CAPTURE]: Object.freeze([
    "target",
    "protocolVersion",
    "type",
    "captureId",
    "reason",
  ]),
  [GET_OCR_CAPTURE_PREVIEW]: Object.freeze([
    "target",
    "protocolVersion",
    "type",
    "captureId",
  ]),
  [RECOGNIZE_OCR_CAPTURE]: Object.freeze([
    "target",
    "protocolVersion",
    "type",
    "captureId",
  ]),
  [CANCEL_OCR_RECOGNITION]: Object.freeze([
    "target",
    "protocolVersion",
    "type",
    "captureId",
  ]),
  [DISCARD_OCR_CAPTURE]: Object.freeze([
    "target",
    "protocolVersion",
    "type",
    "captureId",
  ]),
  [OCR_CAPTURE_COMPLETE]: Object.freeze([
    "target",
    "protocolVersion",
    "type",
    "captureId",
  ]),
});

const SESSION_KEYS = Object.freeze([
  "protocolVersion",
  "captureId",
  "phase",
  "expiresAt",
  "tabId",
  "windowId",
  "frameId",
  "documentId",
  "sourceUrl",
  "selection",
  "viewport",
  "previewTabId",
]);

const SELECTION_KEYS = Object.freeze(["x", "y", "width", "height"]);
const VIEWPORT_KEYS = Object.freeze([
  "width",
  "height",
  "devicePixelRatio",
  "scrollX",
  "scrollY",
]);

export class OcrCaptureContractError extends Error {
  constructor(
    message,
    {
      code = "OCR_CAPTURE_CONTRACT_INVALID",
      field = null,
      cause = null,
    } = {},
  ) {
    super(message, cause === null ? undefined : { cause });
    this.name = "OcrCaptureContractError";
    this.code = code;
    this.field = field;
  }
}

function contractError(message, code, field = null, cause = null) {
  return new OcrCaptureContractError(message, { code, field, cause });
}

function inspectRecord(value, label, allowedKeys, { storageRecord = false } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw contractError(
      `${label}はオブジェクトで指定してください。`,
      "OCR_CAPTURE_MALFORMED",
      label,
    );
  }

  let prototype;
  let keys;
  try {
    prototype = Object.getPrototypeOf(value);
    keys = Reflect.ownKeys(value);
  } catch (cause) {
    throw contractError(
      `${label}の構造を安全に検査できません。`,
      "OCR_CAPTURE_MALFORMED",
      label,
      cause,
    );
  }
  if (prototype !== Object.prototype && prototype !== null) {
    throw contractError(
      `${label}には通常のJSONオブジェクトだけを使用できます。`,
      "OCR_CAPTURE_UNSAFE_PROTOTYPE",
      label,
    );
  }

  const allowed = new Set(allowedKeys);
  const properties = Object.create(null);
  for (const key of keys) {
    if (typeof key !== "string") {
      throw contractError(
        `${label}にSymbolプロパティは使用できません。`,
        "OCR_CAPTURE_NON_JSON_PROPERTY",
        label,
      );
    }
    if (DANGEROUS_PROPERTY_NAMES.has(key)) {
      throw contractError(
        `${label}.${key}は安全上使用できません。`,
        "OCR_CAPTURE_PROTOTYPE_POLLUTION",
        `${label}.${key}`,
      );
    }
    if (storageRecord && IMAGE_FIELD_SET.has(key)) {
      throw contractError(
        "OCR画像はstorage.sessionへ保存できません。",
        "OCR_CAPTURE_IMAGE_STORAGE_FORBIDDEN",
        `${label}.${key}`,
      );
    }
    if (!allowed.has(key)) {
      throw contractError(
        `${label}.${key}はOCR capture protocol v1のフィールドではありません。`,
        "OCR_CAPTURE_UNKNOWN_FIELD",
        `${label}.${key}`,
      );
    }

    let descriptor;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch (cause) {
      throw contractError(
        `${label}.${key}を安全に検査できません。`,
        "OCR_CAPTURE_MALFORMED",
        `${label}.${key}`,
        cause,
      );
    }
    if (!descriptor || !Object.hasOwn(descriptor, "value")) {
      throw contractError(
        `${label}.${key}にgetterまたはsetterは使用できません。`,
        "OCR_CAPTURE_ACCESSOR_FORBIDDEN",
        `${label}.${key}`,
      );
    }
    if (!descriptor.enumerable) {
      throw contractError(
        `${label}.${key}はJSONへ保存できる列挙可能な値で指定してください。`,
        "OCR_CAPTURE_NON_JSON_PROPERTY",
        `${label}.${key}`,
      );
    }
    properties[key] = descriptor.value;
  }
  return properties;
}

function has(properties, key) {
  return Object.hasOwn(properties, key);
}

function required(properties, key, label) {
  if (!has(properties, key)) {
    throw contractError(
      `${label}.${key}がありません。`,
      "OCR_CAPTURE_REQUIRED_FIELD",
      `${label}.${key}`,
    );
  }
  return properties[key];
}

function normalizeExactString(value, expected, field) {
  if (value !== expected) {
    throw contractError(
      `${field}がOCR capture protocol v1と一致しません。`,
      "OCR_CAPTURE_PROTOCOL_MISMATCH",
      field,
    );
  }
  return expected;
}

function normalizeProtocolVersion(value, field) {
  if (value !== OCR_CAPTURE_PROTOCOL_VERSION) {
    throw contractError(
      `${field}は${OCR_CAPTURE_PROTOCOL_VERSION}である必要があります。`,
      "OCR_CAPTURE_PROTOCOL_MISMATCH",
      field,
    );
  }
  return OCR_CAPTURE_PROTOCOL_VERSION;
}

function normalizeType(value, field) {
  if (typeof value !== "string" || !MESSAGE_TYPE_SET.has(value)) {
    throw contractError(
      `${field}は未対応のOCR captureメッセージです。`,
      "OCR_CAPTURE_UNSUPPORTED_MESSAGE",
      field,
    );
  }
  return value;
}

function normalizePhase(value, field) {
  if (typeof value !== "string" || !PHASE_SET.has(value)) {
    throw contractError(
      `${field}は未対応のOCR capture phaseです。`,
      "OCR_CAPTURE_INVALID_PHASE",
      field,
    );
  }
  return value;
}

function normalizeToken(value, field, maximumLength, pattern, code) {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > maximumLength
    || !pattern.test(value)
  ) {
    throw contractError(`${field}の形式が不正です。`, code, field);
  }
  return value;
}

function normalizeCaptureId(value, field) {
  return normalizeToken(
    value,
    field,
    OCR_CAPTURE_MAX_ID_LENGTH,
    CAPTURE_ID_PATTERN,
    "OCR_CAPTURE_INVALID_ID",
  );
}

function normalizeDocumentId(value, field) {
  return normalizeToken(
    value,
    field,
    MAX_DOCUMENT_ID_LENGTH,
    DOCUMENT_ID_PATTERN,
    "OCR_CAPTURE_INVALID_DOCUMENT",
  );
}

function normalizeIsoExpiry(value, field) {
  if (
    typeof value !== "string"
    || value.length > 64
    || !CANONICAL_ISO_PATTERN.test(value)
  ) {
    throw contractError(`${field}は正規化済みISO日時で指定してください。`, "OCR_CAPTURE_INVALID_EXPIRY", field);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) {
    throw contractError(`${field}は有効なISO日時ではありません。`, "OCR_CAPTURE_INVALID_EXPIRY", field);
  }
  return value;
}

function normalizeRoutingInteger(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw contractError(`${field}は0以上の安全な整数で指定してください。`, "OCR_CAPTURE_INVALID_ROUTE", field);
  }
  return value;
}

function normalizeFiniteNumber(
  value,
  field,
  {
    minimum = 0,
    maximum = MAX_CSS_COORDINATE,
    exclusiveMinimum = false,
  } = {},
) {
  const passesMinimum = exclusiveMinimum ? value > minimum : value >= minimum;
  if (
    typeof value !== "number"
    || !Number.isFinite(value)
    || !passesMinimum
    || value > maximum
  ) {
    throw contractError(`${field}は有効な有限数で指定してください。`, "OCR_CAPTURE_INVALID_METADATA", field);
  }
  return Object.is(value, -0) ? 0 : value;
}

function normalizeSelection(value, field) {
  const properties = inspectRecord(value, field, SELECTION_KEYS);
  return Object.freeze({
    x: normalizeFiniteNumber(required(properties, "x", field), `${field}.x`),
    y: normalizeFiniteNumber(required(properties, "y", field), `${field}.y`),
    width: normalizeFiniteNumber(
      required(properties, "width", field),
      `${field}.width`,
      { exclusiveMinimum: true },
    ),
    height: normalizeFiniteNumber(
      required(properties, "height", field),
      `${field}.height`,
      { exclusiveMinimum: true },
    ),
  });
}

function normalizeViewport(value, field) {
  const properties = inspectRecord(value, field, VIEWPORT_KEYS);
  const viewport = {
    width: normalizeFiniteNumber(
      required(properties, "width", field),
      `${field}.width`,
      { exclusiveMinimum: true },
    ),
    height: normalizeFiniteNumber(
      required(properties, "height", field),
      `${field}.height`,
      { exclusiveMinimum: true },
    ),
    devicePixelRatio: normalizeFiniteNumber(
      required(properties, "devicePixelRatio", field),
      `${field}.devicePixelRatio`,
      { exclusiveMinimum: true, maximum: MAX_DEVICE_PIXEL_RATIO },
    ),
  };
  if (has(properties, "scrollX")) {
    viewport.scrollX = normalizeFiniteNumber(properties.scrollX, `${field}.scrollX`);
  }
  if (has(properties, "scrollY")) {
    viewport.scrollY = normalizeFiniteNumber(properties.scrollY, `${field}.scrollY`);
  }
  return Object.freeze(viewport);
}

function validateSelectionWithinViewport(selection, viewport, field) {
  if (!selection || !viewport) return;
  const right = selection.x + selection.width;
  const bottom = selection.y + selection.height;
  if (
    !Number.isFinite(right)
    || !Number.isFinite(bottom)
    || right > viewport.width
    || bottom > viewport.height
  ) {
    throw contractError(
      `${field}はviewportの表示領域内に収めてください。`,
      "OCR_CAPTURE_SELECTION_OUT_OF_BOUNDS",
      field,
    );
  }
}

function normalizeSourceUrl(value, field) {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > OCR_CAPTURE_MAX_URL_LENGTH
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw contractError(`${field}のURLが不正です。`, "OCR_CAPTURE_INVALID_SOURCE_URL", field);
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch (cause) {
    throw contractError(`${field}のURLを解析できません。`, "OCR_CAPTURE_INVALID_SOURCE_URL", field, cause);
  }
  if (!SOURCE_PROTOCOLS.has(parsed.protocol) || parsed.username || parsed.password) {
    throw contractError(
      `${field}には認証情報を含まないHTTP(S) URLだけを使用できます。`,
      "OCR_CAPTURE_INVALID_SOURCE_URL",
      field,
    );
  }
  if (parsed.href.length > OCR_CAPTURE_MAX_URL_LENGTH) {
    throw contractError(`${field}のURLが長すぎます。`, "OCR_CAPTURE_INVALID_SOURCE_URL", field);
  }
  return parsed.href;
}

function normalizeReason(value, field) {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > MAX_REASON_LENGTH
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
  ) {
    throw contractError(`${field}の形式が不正です。`, "OCR_CAPTURE_INVALID_REASON", field);
  }
  return value;
}

function normalizeOptionalMetadata(properties, label, output) {
  if (has(properties, "phase")) {
    output.phase = normalizePhase(properties.phase, `${label}.phase`);
  }
  if (has(properties, "expiresAt")) {
    output.expiresAt = normalizeIsoExpiry(properties.expiresAt, `${label}.expiresAt`);
  }
  for (const key of ["tabId", "windowId", "frameId", "previewTabId"]) {
    if (has(properties, key)) {
      output[key] = normalizeRoutingInteger(properties[key], `${label}.${key}`);
    }
  }
  if (has(properties, "documentId")) {
    output.documentId = normalizeDocumentId(properties.documentId, `${label}.documentId`);
  }
  if (has(properties, "sourceUrl")) {
    output.sourceUrl = normalizeSourceUrl(properties.sourceUrl, `${label}.sourceUrl`);
  }
  if (has(properties, "selection")) {
    output.selection = normalizeSelection(properties.selection, `${label}.selection`);
  }
  if (has(properties, "viewport")) {
    output.viewport = normalizeViewport(properties.viewport, `${label}.viewport`);
  }
  validateSelectionWithinViewport(output.selection, output.viewport, `${label}.selection`);
}

function rejectTypeSpecificMessageFields(properties, type, label) {
  const allowed = new Set(MESSAGE_KEYS_BY_TYPE[type]);
  for (const key of Object.keys(properties)) {
    if (allowed.has(key)) continue;
    throw contractError(
      `${type}では${key}を使用できません。`,
      "OCR_CAPTURE_UNEXPECTED_FIELD",
      `${label}.${key}`,
    );
  }
}

/**
 * Validates an extension message and returns a deeply frozen JSON-safe copy.
 * Unknown fields are rejected so a protocol-version change cannot be mistaken
 * for protocol v1. START creates a capture; every other operation is bound to
 * an existing captureId. SUBMIT additionally carries the page-bound selection.
 */
export function normalizeOcrCaptureMessage(value) {
  const label = "message";
  const properties = inspectRecord(value, label, MESSAGE_KEYS);
  const type = normalizeType(required(properties, "type", label), `${label}.type`);
  rejectTypeSpecificMessageFields(properties, type, label);
  const output = {
    target: normalizeExactString(
      required(properties, "target", label),
      OCR_CAPTURE_TARGET,
      `${label}.target`,
    ),
    protocolVersion: normalizeProtocolVersion(
      required(properties, "protocolVersion", label),
      `${label}.protocolVersion`,
    ),
    type,
  };

  if (type !== START_OCR_CAPTURE) {
    output.captureId = normalizeCaptureId(
      required(properties, "captureId", label),
      `${label}.captureId`,
    );
  }

  normalizeOptionalMetadata(properties, label, output);
  if (has(properties, "reason")) {
    if (type !== CANCEL_OCR_CAPTURE) {
      throw contractError(
        "reasonはCANCEL_OCR_CAPTUREでだけ使用できます。",
        "OCR_CAPTURE_UNEXPECTED_FIELD",
        `${label}.reason`,
      );
    }
    output.reason = normalizeReason(properties.reason, `${label}.reason`);
  }

  if (type === BEGIN_OCR_SELECTION) {
    output.expiresAt = normalizeIsoExpiry(
      required(properties, "expiresAt", label),
      `${label}.expiresAt`,
    );
    output.documentId = normalizeDocumentId(
      required(properties, "documentId", label),
      `${label}.documentId`,
    );
    output.sourceUrl = normalizeSourceUrl(
      required(properties, "sourceUrl", label),
      `${label}.sourceUrl`,
    );
  }
  if (type === SUBMIT_OCR_SELECTION) {
    output.selection = normalizeSelection(
      required(properties, "selection", label),
      `${label}.selection`,
    );
    output.viewport = normalizeViewport(
      required(properties, "viewport", label),
      `${label}.viewport`,
    );
    validateSelectionWithinViewport(output.selection, output.viewport, `${label}.selection`);
  }

  return Object.freeze(output);
}

/**
 * Normalizes the metadata-only state that may be written to storage.session.
 * Bitmap, data URL, byte, Blob, and pixel fields are deliberately outside this
 * schema and receive a dedicated error rather than being silently discarded.
 */
export function normalizeOcrCaptureSession(value) {
  const label = "session";
  const properties = inspectRecord(value, label, SESSION_KEYS, { storageRecord: true });
  const output = {
    protocolVersion: normalizeProtocolVersion(
      required(properties, "protocolVersion", label),
      `${label}.protocolVersion`,
    ),
    captureId: normalizeCaptureId(
      required(properties, "captureId", label),
      `${label}.captureId`,
    ),
    phase: normalizePhase(required(properties, "phase", label), `${label}.phase`),
    expiresAt: normalizeIsoExpiry(
      required(properties, "expiresAt", label),
      `${label}.expiresAt`,
    ),
    tabId: normalizeRoutingInteger(
      required(properties, "tabId", label),
      `${label}.tabId`,
    ),
    windowId: normalizeRoutingInteger(
      required(properties, "windowId", label),
      `${label}.windowId`,
    ),
    frameId: normalizeRoutingInteger(
      required(properties, "frameId", label),
      `${label}.frameId`,
    ),
    documentId: normalizeDocumentId(
      required(properties, "documentId", label),
      `${label}.documentId`,
    ),
    sourceUrl: normalizeSourceUrl(
      required(properties, "sourceUrl", label),
      `${label}.sourceUrl`,
    ),
  };
  normalizeOptionalMetadata(properties, label, output);

  const hasSelection = has(properties, "selection");
  const hasViewport = has(properties, "viewport");
  if (hasSelection !== hasViewport) {
    throw contractError(
      "session.selectionとsession.viewportは同時に指定してください。",
      "OCR_CAPTURE_INCOMPLETE_METADATA",
      hasSelection ? `${label}.viewport` : `${label}.selection`,
    );
  }
  if (
    new Set(["preparing", "capturing", "preview"]).has(output.phase)
    && (!hasSelection || !hasViewport)
  ) {
    throw contractError(
      `${output.phase} phaseにはselectionとviewportが必要です。`,
      "OCR_CAPTURE_INCOMPLETE_METADATA",
      label,
    );
  }
  if (output.phase === "selecting" && (hasSelection || hasViewport)) {
    throw contractError(
      "selecting phaseには確定済みselectionを保存できません。",
      "OCR_CAPTURE_UNEXPECTED_FIELD",
      label,
    );
  }
  if (output.phase !== "preview" && has(properties, "previewTabId")) {
    throw contractError(
      "previewTabIdはpreview phaseでだけ保存できます。",
      "OCR_CAPTURE_UNEXPECTED_FIELD",
      `${label}.previewTabId`,
    );
  }

  return Object.freeze(output);
}

export const normalizeOcrCaptureStorageRecord = normalizeOcrCaptureSession;

export function isOcrCaptureExpired(value, now = Date.now()) {
  if (typeof now !== "number" || !Number.isFinite(now)) {
    throw new TypeError("nowは有限のUNIX時刻で指定してください。");
  }
  return Date.parse(normalizeOcrCaptureSession(value).expiresAt) <= now;
}
