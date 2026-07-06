// js/main.js
import * as THREE from 'three';
import { createField } from './field.js';
import {
  createCharacterContainer,
  loadCharacterModel,
  disposeCurrentModel,
  showPlaceholder,
  arrayBufferToBase64,
  createObjectUrlFromBase64,
} from './character.js';
import { setupControls } from './controls.js';
import { setupCustomizationUI } from './customization-ui.js';
import { saveToStorage, loadFromStorage, clearStorage, loadGallery, addToGallery, removeFromGallery } from './storage.js';
import { createDefaultParams, buildPrompt } from './params.js';
import { exportCharacterToFile, importCharacterFromFile } from './character-file.js';

const PROXY_BASE_URL = 'http://localhost:3001';
const POLL_INTERVAL_MS = 2000;
const GENERATION_TIMEOUT_MS = 180000;
const MAX_POLL_ERROR_RETRY = 3;

// main.jsトップレベルで管理する状態変数（詳細設計書v2 13.2.1節）
let character = null;
let currentParams = createDefaultParams();
let currentGeneratedModel = null;
let uiHandle = null;
let controlsHandle = null;
let gallery = [];
let selectedGalleryId = null;
// ギャラリー表示用にその場で発行したobject URL（Base64→Blobから再生成したもの）。
// 永続化はしない一時URLのため、差し替え・別キャラ選択のたびに解放する。
let currentDisplayObjectUrl = null;

/**
 * ギャラリー表示用に発行済みのobject URLを解放する。
 */
function revokeCurrentDisplayObjectUrl() {
  if (currentDisplayObjectUrl) {
    URL.revokeObjectURL(currentDisplayObjectUrl);
    currentDisplayObjectUrl = null;
  }
}

/** WebGLがこの環境で利用可能か判定する。 */
function isWebGLAvailable() {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function showWebGLUnavailableMessage() {
  const canvasContainer = document.getElementById('canvas-container');
  if (canvasContainer) {
    const message = document.createElement('p');
    message.className = 'webgl-error-message';
    message.textContent =
      'お使いのブラウザ/環境では3D表示に対応していません。最新のChromeまたはEdgeでお試しください。';
    canvasContainer.appendChild(message);
  }
  console.error('WebGL is not available in this environment.');
}

function setSaveStatus(text) {
  const el = document.getElementById('save-status');
  if (el) el.textContent = text;
}

async function handleGenerate(formParams) {
  uiHandle.clearError();
  uiHandle.clearGenerationNotice();
  uiHandle.setGeneratingState(true, '生成をリクエストしています…');

  const prompt = buildPrompt(formParams);

  try {
    const res = await fetch(`${PROXY_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...formParams, prompt }),
    });
    const body = await res.json();

    if (res.status === 503 && body.fallback) {
      uiHandle.showGenerationNotice('デモ用モデルを表示しています（実際のAI生成ではありません）');
      await pollJobStatus(body.fallback.jobId, formParams);
      return;
    }
    if (!res.ok) {
      throw new Error(body.message || '生成リクエストに失敗しました。');
    }
    await pollJobStatus(body.jobId, formParams);
  } catch (err) {
    uiHandle.setGeneratingState(false);
    uiHandle.showError(err.message || 'サーバーに接続できませんでした。');
  }
}

// サーバーは相対パス(プロキシ中継エンドポイント)またはKhronosグループCDN等の絶対URL(デモ用)を返す。
// 相対パスの場合のみPROXY_BASE_URLを前置する。
function resolveModelUrl(modelUrl) {
  if (typeof modelUrl === 'string' && modelUrl.startsWith('/')) {
    return `${PROXY_BASE_URL}${modelUrl}`;
  }
  return modelUrl;
}

function pollJobStatus(jobId, sourceParams) {
  const startTime = Date.now();
  let errorRetryCount = 0;

  return new Promise((resolve, reject) => {
    async function poll() {
      if (Date.now() - startTime > GENERATION_TIMEOUT_MS) {
        uiHandle.setGeneratingState(false);
        uiHandle.showError('生成がタイムアウトしました。しばらくしてから再度お試しください。');
        reject(new Error('timeout'));
        return;
      }
      try {
        const res = await fetch(`${PROXY_BASE_URL}/api/generate/${jobId}/status`);
        if (!res.ok) throw new Error('status fetch failed');
        const body = await res.json();
        errorRetryCount = 0;

        if (body.status === 'succeeded') {
          uiHandle.setGeneratingState(true, 'モデルを読み込んでいます…');
          const generatedModel = {
            modelId: jobId,
            modelUrl: resolveModelUrl(body.modelUrl),
            generatedAt: new Date().toISOString(),
            sourceParams,
          };
          try {
            await loadCharacterModel(character, generatedModel.modelUrl);
          } catch (loadErr) {
            // ステータス取得自体は成功しているため、これをerrorRetryCountによる再試行対象にはしない
            // (再試行してもモデル読み込み失敗は解消せず、無限ループになるため即座にエラー終了する)
            uiHandle.setGeneratingState(false);
            uiHandle.showError('モデルの読み込みに失敗しました。');
            reject(loadErr);
            return;
          }
          currentGeneratedModel = generatedModel;
          currentParams = sourceParams;
          uiHandle.clearGenerationNotice();
          uiHandle.setGeneratingState(false);
          uiHandle.setSaveButtonEnabled(true);
          resolve();
          return;
        }
        if (body.status === 'failed') {
          uiHandle.setGeneratingState(false);
          uiHandle.showError(body.errorMessage || 'モデルの生成に失敗しました。');
          reject(new Error('failed'));
          return;
        }
        uiHandle.setGeneratingState(true, `生成中…(${body.progress ?? 0}%)`);
        setTimeout(poll, POLL_INTERVAL_MS);
      } catch (err) {
        errorRetryCount += 1;
        if (errorRetryCount > MAX_POLL_ERROR_RETRY) {
          uiHandle.setGeneratingState(false);
          uiHandle.showError('生成状況の確認に失敗しました。');
          reject(err);
          return;
        }
        setTimeout(poll, POLL_INTERVAL_MS);
      }
    }
    poll();
  });
}

function refreshGalleryUI() {
  gallery = loadGallery();
  uiHandle.refreshGallery(gallery, selectedGalleryId);
}

/**
 * GLBモデルの実体データをBase64文字列として取得する。
 * 既にBase64を保持している場合(インポート由来・ギャラリーから読み込み済みの場合)はそれを再利用し、
 * 生成直後などまだ持っていない場合はmodelUrlから改めてfetchする。
 * @param {object} generatedModel
 * @returns {Promise<string>} Base64文字列
 */
async function ensureModelGlbBase64(generatedModel) {
  if (generatedModel.modelGlbBase64) {
    return generatedModel.modelGlbBase64;
  }
  const res = await fetch(generatedModel.modelUrl);
  if (!res.ok) {
    throw new Error('モデルデータの取得に失敗しました。');
  }
  const buffer = await res.arrayBuffer();
  return arrayBufferToBase64(buffer);
}

async function handleSave(inputName) {
  if (!currentGeneratedModel) return;

  const name = inputName && inputName.length > 0 ? inputName : `キャラクター${gallery.length + 1}`;

  let modelGlbBase64;
  try {
    modelGlbBase64 = await ensureModelGlbBase64(currentGeneratedModel);
  } catch {
    setSaveStatus('保存に失敗しました（モデルデータの取得に失敗しました）');
    return;
  }

  currentGeneratedModel = { ...currentGeneratedModel, modelGlbBase64 };
  // 下書き状態としてもキャッシュしておく（ページ再読み込み時の作業状態復元用）
  saveToStorage({ params: currentParams, generatedModel: currentGeneratedModel });

  const result = addToGallery({ name, params: currentParams, generatedModel: currentGeneratedModel });
  if (result.ok) {
    selectedGalleryId = result.entry.id;
    refreshGalleryUI();
    setSaveStatus(`「${name}」として一覧に保存しました`);
  } else {
    setSaveStatus('保存に失敗しました（ブラウザのストレージ設定をご確認ください）');
  }
}

async function handleSelectGalleryItem(id) {
  const entry = gallery.find((item) => item.id === id);
  if (!entry || !entry.generatedModel || !entry.generatedModel.modelGlbBase64) return;

  uiHandle.clearError();
  uiHandle.setGeneratingState(true, 'モデルを読み込んでいます…');
  const objectUrl = createObjectUrlFromBase64(entry.generatedModel.modelGlbBase64);
  try {
    await loadCharacterModel(character, objectUrl);
    revokeCurrentDisplayObjectUrl();
    currentDisplayObjectUrl = objectUrl;
    currentParams = entry.params;
    currentGeneratedModel = { ...entry.generatedModel, modelUrl: objectUrl };
    selectedGalleryId = entry.id;
    uiHandle.refreshUI(currentParams);
    uiHandle.setSaveButtonEnabled(true);
    uiHandle.setGeneratingState(false);
    refreshGalleryUI();
    setSaveStatus(`「${entry.name}」を表示しています`);
  } catch {
    URL.revokeObjectURL(objectUrl);
    uiHandle.setGeneratingState(false);
    uiHandle.showError('このキャラクターのモデル読み込みに失敗しました（データが失効している可能性があります）。');
  }
}

function handleDeleteGalleryItem(id) {
  const entry = gallery.find((item) => item.id === id);
  const confirmed = window.confirm(`「${entry ? entry.name : 'このキャラクター'}」を一覧から削除します。よろしいですか？`);
  if (!confirmed) return;

  removeFromGallery(id);
  if (selectedGalleryId === id) selectedGalleryId = null;
  refreshGalleryUI();
}

async function handleExportCurrent() {
  if (!currentGeneratedModel) return;
  try {
    await exportCharacterToFile({
      params: currentParams,
      modelUrl: currentGeneratedModel.modelUrl,
      modelGlbBase64: currentGeneratedModel.modelGlbBase64,
      fileName: 'character.zip',
    });
  } catch (err) {
    uiHandle.showError(err.message || 'ファイルのエクスポートに失敗しました。');
  }
}

async function handleExportGalleryItem(id) {
  const entry = gallery.find((item) => item.id === id);
  if (!entry || !entry.generatedModel) return;
  try {
    await exportCharacterToFile({
      params: entry.params,
      modelUrl: entry.generatedModel.modelUrl,
      modelGlbBase64: entry.generatedModel.modelGlbBase64,
      fileName: `${entry.name}.zip`,
    });
  } catch (err) {
    uiHandle.showError(err.message || 'ファイルのエクスポートに失敗しました。');
  }
}

async function handleImportFile(file) {
  uiHandle.clearError();
  uiHandle.setGeneratingState(true, 'ファイルを読み込んでいます…');
  try {
    const { params, modelGlbBase64 } = await importCharacterFromFile(file);
    const displayUrl = createObjectUrlFromBase64(modelGlbBase64);
    await loadCharacterModel(character, displayUrl);
    revokeCurrentDisplayObjectUrl();
    currentDisplayObjectUrl = displayUrl;

    const generatedModel = {
      modelId: null,
      modelUrl: displayUrl,
      modelGlbBase64,
      generatedAt: new Date().toISOString(),
      sourceParams: params,
    };
    currentParams = params;
    currentGeneratedModel = generatedModel;
    uiHandle.refreshUI(currentParams);
    uiHandle.setSaveButtonEnabled(true);
    uiHandle.setGeneratingState(false);

    const name = file.name ? file.name.replace(/\.zip$/i, '') : `キャラクター${gallery.length + 1}`;
    const result = addToGallery({ name, params, generatedModel });
    if (result.ok) {
      selectedGalleryId = result.entry.id;
      refreshGalleryUI();
      setSaveStatus(`「${name}」をインポートし、一覧に保存しました`);
    } else {
      setSaveStatus('保存に失敗しました（ブラウザのストレージ設定をご確認ください）');
    }
  } catch (err) {
    uiHandle.setGeneratingState(false);
    uiHandle.showError(err.message || 'ファイルのインポートに失敗しました。');
  }
}

function handleReset() {
  const confirmed = window.confirm('キャラクターをリセットします。よろしいですか？');
  if (!confirmed) return;

  disposeCurrentModel(character);
  showPlaceholder(character);
  revokeCurrentDisplayObjectUrl();
  currentParams = createDefaultParams();
  currentGeneratedModel = null;
  uiHandle.clearGenerationNotice();
  uiHandle.refreshUI(currentParams);
  uiHandle.setSaveButtonEnabled(false);
  clearStorage();
  setSaveStatus('未保存の変更があります');
}

function init() {
  if (!isWebGLAvailable()) {
    showWebGLUnavailableMessage();
    return;
  }

  const canvasContainer = document.getElementById('canvas-container');
  const panelEl = document.getElementById('customization-panel');

  const { params, generatedModel, restored } = loadFromStorage();
  currentParams = params;
  currentGeneratedModel = generatedModel;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);

  const camera = new THREE.PerspectiveCamera(
    50,
    canvasContainer.clientWidth / canvasContainer.clientHeight,
    0.1,
    100
  );

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
  canvasContainer.appendChild(renderer.domElement);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambientLight);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(3, 5, 4);
  scene.add(directionalLight);

  const field = createField();
  scene.add(field);

  character = createCharacterContainer();
  scene.add(character.root);

  controlsHandle = setupControls(character, camera);

  uiHandle = setupCustomizationUI(panelEl, currentParams, {
    onGenerate: (formParams) => handleGenerate(formParams),
    onSave: (name) => handleSave(name),
    onReset: () => handleReset(),
    onSelectGalleryItem: (id) => handleSelectGalleryItem(id),
    onDeleteGalleryItem: (id) => handleDeleteGalleryItem(id),
    onExportCurrent: () => handleExportCurrent(),
    onExportGalleryItem: (id) => handleExportGalleryItem(id),
    onImportFile: (file) => handleImportFile(file),
  });

  refreshGalleryUI();

  if (currentGeneratedModel && currentGeneratedModel.modelGlbBase64) {
    // Base64実体を持っている場合のみ復元する。modelUrlは一時URL(blob URL等)の可能性があり
    // ページ再読み込み後は失効しているため、それ単体では復元しない。
    uiHandle.setGeneratingState(true, 'モデルを読み込んでいます…');
    const displayUrl = createObjectUrlFromBase64(currentGeneratedModel.modelGlbBase64);
    loadCharacterModel(character, displayUrl)
      .then(() => {
        revokeCurrentDisplayObjectUrl();
        currentDisplayObjectUrl = displayUrl;
        currentGeneratedModel = { ...currentGeneratedModel, modelUrl: displayUrl };
        uiHandle.setGeneratingState(false);
        uiHandle.setSaveButtonEnabled(true);
      })
      .catch(() => {
        URL.revokeObjectURL(displayUrl);
        uiHandle.setGeneratingState(false);
        uiHandle.showError('保存済みモデルの読み込みに失敗しました。再度生成してください。');
      });
  } else {
    showPlaceholder(character);
    currentGeneratedModel = null;
    uiHandle.setSaveButtonEnabled(false);
  }

  setSaveStatus(restored ? '保存済みのキャラクターを復元しました' : 'デフォルト設定で開始しました');

  window.addEventListener('resize', () => onWindowResize(camera, renderer, canvasContainer));

  let lastTimestampMs = 0;
  function animate(timestampMs) {
    const deltaTime = lastTimestampMs === 0 ? 0 : (timestampMs - lastTimestampMs) / 1000;
    lastTimestampMs = timestampMs;

    controlsHandle.update(deltaTime);
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
}

function onWindowResize(camera, renderer, canvasContainer) {
  camera.aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
}

document.addEventListener('DOMContentLoaded', init);
