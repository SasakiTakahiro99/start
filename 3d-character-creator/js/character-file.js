// js/character-file.js
// キャラクター(生成パラメータ + GLBモデル実体)を単一ZIPファイルとしてエクスポート/インポートする。
import JSZip from 'jszip';
import { normalizeParams } from './params.js';
import { arrayBufferToBase64, base64ToArrayBuffer } from './character.js';

const PARAMS_ENTRY_NAME = 'params.json';
const MODEL_ENTRY_NAME = 'model.glb';

/**
 * GLBモデルとパラメータをZIPにまとめ、ファイルとしてダウンロードさせる。
 * modelGlbBase64が渡された場合はそれを優先して使う(fetch不要のため、失効しうる一時URLに依存しない)。
 * 渡されない場合はmodelUrlから取得する(生成直後などまだBase64を持っていない場合のフォールバック)。
 * @param {{ params: object, modelUrl?: string, modelGlbBase64?: string, fileName?: string }} data
 * @returns {Promise<void>}
 */
export async function exportCharacterToFile({ params, modelUrl, modelGlbBase64, fileName = 'character.zip' }) {
  let glbBuffer;
  if (modelGlbBase64) {
    glbBuffer = base64ToArrayBuffer(modelGlbBase64);
  } else {
    const glbRes = await fetch(modelUrl);
    if (!glbRes.ok) {
      throw new Error('モデルデータの取得に失敗しました。');
    }
    glbBuffer = await glbRes.arrayBuffer();
  }

  const zip = new JSZip();
  zip.file(PARAMS_ENTRY_NAME, JSON.stringify(params));
  zip.file(MODEL_ENTRY_NAME, glbBuffer);

  const zipBlob = await zip.generateAsync({ type: 'blob' });

  const url = URL.createObjectURL(zipBlob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * ZIPファイル(File)からパラメータとGLBモデルを読み込む。
 * GLB実体はBase64文字列として返す(呼び出し側でlocalStorageへ永続化でき、
 * 表示時にはそのBase64からその場でobject URLを作り直す。一時URLをそのまま
 * 永続化してしまうと、blob URLはページのライフタイムに紐づき失効するため)。
 * @param {File} file
 * @returns {Promise<{ params: object, modelGlbBase64: string }>}
 */
export async function importCharacterFromFile(file) {
  const zip = await JSZip.loadAsync(file);

  const paramsEntry = zip.file(PARAMS_ENTRY_NAME);
  const modelEntry = zip.file(MODEL_ENTRY_NAME);
  if (!paramsEntry || !modelEntry) {
    throw new Error('ファイルの形式が不正です（params.jsonまたはmodel.glbが見つかりません）。');
  }

  const paramsText = await paramsEntry.async('string');
  let rawParams;
  try {
    rawParams = JSON.parse(paramsText);
  } catch {
    throw new Error('ファイルの形式が不正です（パラメータの読み取りに失敗しました）。');
  }
  const params = normalizeParams(rawParams);

  const modelBuffer = await modelEntry.async('arraybuffer');
  const modelGlbBase64 = arrayBufferToBase64(modelBuffer);

  return { params, modelGlbBase64 };
}
