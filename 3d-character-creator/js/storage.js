// js/storage.js
import { normalizeParams, createDefaultParams } from './params.js';

const STORAGE_KEY = '3d-character-creator:v2:generation';

/**
 * 現在の生成パラメータ・生成結果参照情報をlocalStorageへ保存する。
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

/**
 * localStorageから保存データを読み込む。
 * @returns {{ params: object, generatedModel: object|null, restored: boolean }}
 */
export function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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
 * localStorageの保存データ（v2キーのみ）を削除する。
 * @returns {void}
 */
export function clearStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 削除失敗時も例外を外部に伝播させない
  }
}
