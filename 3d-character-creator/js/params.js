// js/params.js
// AI生成パラメータ（性別・雰囲気・体型傾向・容姿説明）の型・デフォルト値・バリデーション、
// およびプロンプト組み立て関数(buildPrompt)を一元管理する（詳細設計書v2 2章・11章）。

const APPEARANCE_MAX_LENGTH = 500;

export const ENUM_OPTIONS = {
  gender: ['female', 'male', 'unspecified'],
  mood: ['bright', 'cool', 'cute', 'mature'],
  bodyType: ['slim', 'average', 'muscular'],
};

export const ENUM_LABELS = {
  gender: { female: '女性', male: '男性', unspecified: '指定しない' },
  mood: { bright: '明るい', cool: 'クール', cute: 'かわいい', mature: '大人っぽい' },
  bodyType: { slim: 'スリム', average: '標準', muscular: 'がっしり' },
};

/** デフォルトの生成パラメータを返す。 @returns {object} GenerationParams */
export function createDefaultParams() {
  return {
    version: 2,
    gender: 'unspecified',
    mood: 'bright',
    bodyType: 'average',
    appearanceDescription: '',
  };
}

/**
 * 任意の入力を検証し、不正・欠損値をデフォルトで補完した正規化済みパラメータを返す。
 * 例外を投げない。
 * @param {any} raw
 * @returns {object} GenerationParams
 */
export function normalizeParams(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const appearanceDescription =
    typeof src.appearanceDescription === 'string'
      ? src.appearanceDescription.slice(0, APPEARANCE_MAX_LENGTH)
      : '';
  return {
    version: 2,
    gender: ENUM_OPTIONS.gender.includes(src.gender) ? src.gender : 'unspecified',
    mood: ENUM_OPTIONS.mood.includes(src.mood) ? src.mood : 'bright',
    bodyType: ENUM_OPTIONS.bodyType.includes(src.bodyType) ? src.bodyType : 'average',
    appearanceDescription,
  };
}

/**
 * appearanceDescriptionの長さのみを検証する（フォーム側のリアルタイムバリデーション用）。
 * @param {string} text
 * @returns {{ ok: boolean, message?: string }}
 */
export function validateAppearanceDescription(text) {
  if (typeof text === 'string' && text.length > APPEARANCE_MAX_LENGTH) {
    return { ok: false, message: `容姿の説明は${APPEARANCE_MAX_LENGTH}文字以内で入力してください。` };
  }
  return { ok: true };
}

/**
 * 生成パラメータからTripo AI想定APIへ送るプロンプト文字列を組み立てる。
 * @param {object} params - normalizeParams済みのGenerationParams
 * @returns {string} プロンプト文字列
 */
export function buildPrompt(params) {
  const genderPhrase = { female: 'a woman', male: 'a man', unspecified: 'a person' }[params.gender];
  const moodPhrase = {
    bright: 'with a bright and cheerful expression',
    cool: 'with a cool and composed expression',
    cute: 'with a cute and friendly expression',
    mature: 'with a mature and elegant expression',
  }[params.mood];
  const bodyPhrase = {
    slim: 'slim build',
    average: 'average build',
    muscular: 'muscular build',
  }[params.bodyType];

  const parts = [
    `A photorealistic 3D character model of ${genderPhrase}`,
    moodPhrase,
    `, ${bodyPhrase}`,
  ];
  if (params.appearanceDescription && params.appearanceDescription.trim().length > 0) {
    parts.push(`. Appearance details: ${params.appearanceDescription.trim()}`);
  }
  parts.push('. Full body, T-pose, realistic proportions, high quality.');
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export const APPEARANCE_DESCRIPTION_MAX_LENGTH = APPEARANCE_MAX_LENGTH;
