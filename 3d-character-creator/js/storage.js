// js/storage.js
import { normalizeParams, createDefaultParams } from './params.js';

const STORAGE_KEY = '3d-character-creator:params';

/**
 * 現在のパラメータをlocalStorageへ保存する。
 * @param {object} params
 * @returns {{ ok: boolean, error?: Error }}
 */
export function saveToStorage(params) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(params));
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

/**
 * localStorageからパラメータを読み込む。
 * @returns {{ params: object, restored: boolean }}
 */
export function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return { params: createDefaultParams(), restored: false };
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { params: createDefaultParams(), restored: false };
    }
    return { params: normalizeParams(parsed), restored: true };
  } catch {
    return { params: createDefaultParams(), restored: false };
  }
}

/**
 * localStorageの保存データを削除する。
 * @returns {void}
 */
export function clearStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 削除失敗時も例外を外部に伝播させない
  }
}
