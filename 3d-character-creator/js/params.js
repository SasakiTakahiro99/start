// js/params.js
// パラメータの型・値域・デフォルト値・性別プリセット差分・バリデーションを一元管理する。

export const PARAM_RANGES = {
  'body.height': { min: 0.85, max: 1.15, step: 0.01, default: 1.0 },
  'body.shoulderWidth': { min: 0.8, max: 1.2, step: 0.01, default: 1.0 },
  'body.weight': { min: 0.85, max: 1.25, step: 0.01, default: 1.0 },
  'face.eyes.size': { min: 0.7, max: 1.4, step: 0.01, default: 1.0 },
  'face.eyes.spacing': { min: 0.8, max: 1.3, step: 0.01, default: 1.0 },
  'face.nose.size': { min: 0.7, max: 1.4, step: 0.01, default: 1.0 },
  'face.mouth.size': { min: 0.7, max: 1.4, step: 0.01, default: 1.0 },
};

export const ENUM_OPTIONS = {
  gender: ['female', 'male'],
  'face.shape': ['round', 'oval', 'square'],
  'face.nose.shape': ['normal', 'small', 'wide'],
  'face.mouth.shape': ['normal', 'smile', 'flat'],
  'hair.style': ['short', 'long', 'bald'],
};

const ENUM_DEFAULTS = {
  gender: 'female',
  'face.shape': 'round',
  'face.nose.shape': 'normal',
  'face.mouth.shape': 'normal',
  'hair.style': 'short',
};

const COLOR_DEFAULTS = {
  skinColor: '#f2c9a1',
  'face.eyes.color': '#3b2a1a',
  'hair.color': '#222222',
};

export const GENDER_PRESETS = {
  female: { height: 0.95, shoulderWidth: 0.9, weight: 0.95 },
  male: { height: 1.05, shoulderWidth: 1.1, weight: 1.05 },
};

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** デフォルトパラメータのディープコピーを返す */
export function createDefaultParams() {
  return {
    version: 1,
    gender: ENUM_DEFAULTS.gender,
    body: {
      height: PARAM_RANGES['body.height'].default,
      shoulderWidth: PARAM_RANGES['body.shoulderWidth'].default,
      weight: PARAM_RANGES['body.weight'].default,
    },
    skinColor: COLOR_DEFAULTS.skinColor,
    face: {
      shape: ENUM_DEFAULTS['face.shape'],
      eyes: {
        size: PARAM_RANGES['face.eyes.size'].default,
        spacing: PARAM_RANGES['face.eyes.spacing'].default,
        color: COLOR_DEFAULTS['face.eyes.color'],
      },
      nose: {
        size: PARAM_RANGES['face.nose.size'].default,
        shape: ENUM_DEFAULTS['face.nose.shape'],
      },
      mouth: {
        size: PARAM_RANGES['face.mouth.size'].default,
        shape: ENUM_DEFAULTS['face.mouth.shape'],
      },
    },
    hair: {
      style: ENUM_DEFAULTS['hair.style'],
      color: COLOR_DEFAULTS['hair.color'],
    },
  };
}

/**
 * 性別プリセットに応じた body 値を返す（gender変更時にcharacter/UIから呼ばれる）
 * @param {"female"|"male"} gender
 * @returns {{height:number, shoulderWidth:number, weight:number}}
 */
export function getGenderBodyPreset(gender) {
  const preset = GENDER_PRESETS[gender];
  return preset ? { ...preset } : { ...GENDER_PRESETS.female };
}

function clampNumber(value, rangeKey) {
  const range = PARAM_RANGES[rangeKey];
  const n = Number(value);
  if (!Number.isFinite(n)) return range.default;
  return Math.min(range.max, Math.max(range.min, n));
}

function normalizeEnum(value, enumKey) {
  const options = ENUM_OPTIONS[enumKey];
  return options.includes(value) ? value : ENUM_DEFAULTS[enumKey];
}

function normalizeColor(value, colorKey) {
  return typeof value === 'string' && HEX_COLOR_RE.test(value) ? value : COLOR_DEFAULTS[colorKey];
}

/**
 * 任意のオブジェクトを検証し、不正・欠損値をデフォルトで補完した正規化済みパラメータを返す。
 * 例外を投げず、常に完全なParamsObjectを返す。
 * @param {any} raw 任意の入力（JSON.parse結果、undefined、壊れたオブジェクト等）
 * @returns {object} 正規化済みパラメータ
 */
export function normalizeParams(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const body = src.body && typeof src.body === 'object' ? src.body : {};
  const face = src.face && typeof src.face === 'object' ? src.face : {};
  const eyes = face.eyes && typeof face.eyes === 'object' ? face.eyes : {};
  const nose = face.nose && typeof face.nose === 'object' ? face.nose : {};
  const mouth = face.mouth && typeof face.mouth === 'object' ? face.mouth : {};
  const hair = src.hair && typeof src.hair === 'object' ? src.hair : {};

  return {
    version: 1,
    gender: normalizeEnum(src.gender, 'gender'),
    body: {
      height: clampNumber(body.height, 'body.height'),
      shoulderWidth: clampNumber(body.shoulderWidth, 'body.shoulderWidth'),
      weight: clampNumber(body.weight, 'body.weight'),
    },
    skinColor: normalizeColor(src.skinColor, 'skinColor'),
    face: {
      shape: normalizeEnum(face.shape, 'face.shape'),
      eyes: {
        size: clampNumber(eyes.size, 'face.eyes.size'),
        spacing: clampNumber(eyes.spacing, 'face.eyes.spacing'),
        color: normalizeColor(eyes.color, 'face.eyes.color'),
      },
      nose: {
        size: clampNumber(nose.size, 'face.nose.size'),
        shape: normalizeEnum(nose.shape, 'face.nose.shape'),
      },
      mouth: {
        size: clampNumber(mouth.size, 'face.mouth.size'),
        shape: normalizeEnum(mouth.shape, 'face.mouth.shape'),
      },
    },
    hair: {
      style: normalizeEnum(hair.style, 'hair.style'),
      color: normalizeColor(hair.color, 'hair.color'),
    },
  };
}
