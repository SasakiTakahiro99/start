// js/storage.js
import { normalizeParams, createDefaultParams } from './params.js';

const DRAFT_STORAGE_KEY = '3d-character-creator:v2:generation';
const GALLERY_STORAGE_KEY = '3d-character-creator:v3:gallery';

/**
 * 現在の生成パラメータ・生成結果参照情報(下書き状態)をlocalStorageへ保存する。
 * 「保存」ボタン(ギャラリーへの追加)とは別に、ページ再読み込み時の作業状態復元に使う。
 * @param {{ params: object, generatedModel: object|null }} data
 * @returns {{ ok: boolean, error?: Error }}
 */
export function saveToStorage(data) {
  try {
    const payload = {
      version: 2,
      params: data.params,
      generatedModel: data.generatedModel ?? null,
    };
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

/**
 * localStorageから下書き状態を読み込む。
 * @returns {{ params: object, generatedModel: object|null, restored: boolean }}
 */
export function loadFromStorage() {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (raw === null) {
      return { params: createDefaultParams(), generatedModel: null, restored: false };
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { params: createDefaultParams(), generatedModel: null, restored: false };
    }
    if (!parsed || typeof parsed !== 'object' || parsed.version !== 2) {
      return { params: createDefaultParams(), generatedModel: null, restored: false };
    }
    return {
      params: normalizeParams(parsed.params),
      generatedModel: parsed.generatedModel ?? null,
      restored: true,
    };
  } catch {
    return { params: createDefaultParams(), generatedModel: null, restored: false };
  }
}

/**
 * localStorageの下書き状態(v2キーのみ)を削除する。
 * @returns {void}
 */
export function clearStorage() {
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // 削除失敗時も例外を外部に伝播させない
  }
}

/**
 * ギャラリー(保存済みキャラクター一覧)をlocalStorageから読み込む。
 * generatedModel.modelGlbBase64(GLB実体のBase64)を永続化の実データとして扱う。
 * @returns {Array<{ id: string, name: string, createdAt: string, params: object, generatedModel: object|null }>}
 */
export function loadGallery() {
  try {
    const raw = localStorage.getItem(GALLERY_STORAGE_KEY);
    if (raw === null) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry) => entry && typeof entry === 'object' && typeof entry.id === 'string')
      .map((entry) => ({
        id: entry.id,
        name: typeof entry.name === 'string' ? entry.name : '無題のキャラクター',
        createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : new Date().toISOString(),
        params: normalizeParams(entry.params),
        generatedModel: entry.generatedModel ?? null,
      }));
  } catch {
    return [];
  }
}

/**
 * ギャラリー全体をlocalStorageへ保存する。
 * @param {Array<object>} gallery
 * @returns {{ ok: boolean, error?: Error }}
 */
export function saveGallery(gallery) {
  try {
    localStorage.setItem(GALLERY_STORAGE_KEY, JSON.stringify(gallery));
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

/**
 * 現在のキャラクターをギャラリーへ新規追加する。
 * @param {{ name: string, params: object, generatedModel: object|null }} data
 * @returns {{ ok: boolean, error?: Error, entry?: object }}
 */
export function addToGallery(data) {
  const gallery = loadGallery();
  const entry = {
    id: `char-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: data.name,
    createdAt: new Date().toISOString(),
    params: normalizeParams(data.params),
    generatedModel: data.generatedModel ?? null,
  };
  gallery.push(entry);
  const result = saveGallery(gallery);
  return { ...result, entry };
}

/**
 * 指定IDのキャラクターをギャラリーから削除する。
 * @param {string} id
 * @returns {{ ok: boolean, error?: Error }}
 */
export function removeFromGallery(id) {
  const gallery = loadGallery().filter((entry) => entry.id !== id);
  return saveGallery(gallery);
}
