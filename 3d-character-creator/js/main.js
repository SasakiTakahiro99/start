// js/main.js
import * as THREE from 'three';
import { createField } from './field.js';
import { createCharacterContainer, loadCharacterModel, disposeCurrentModel, showPlaceholder } from './character.js';
import { setupControls } from './controls.js';
import { setupCustomizationUI } from './customization-ui.js';
import { saveToStorage, loadFromStorage, clearStorage } from './storage.js';
import { createDefaultParams, buildPrompt } from './params.js';

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
            modelUrl: body.modelUrl,
            generatedAt: new Date().toISOString(),
            sourceParams,
          };
          await loadCharacterModel(character, generatedModel.modelUrl);
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

function handleSave() {
  const result = saveToStorage({ params: currentParams, generatedModel: currentGeneratedModel });
  if (result.ok) {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    setSaveStatus(`保存しました（${hh}:${mm}:${ss}）`);
  } else {
    setSaveStatus('保存に失敗しました（ブラウザのストレージ設定をご確認ください）');
  }
}

function handleReset() {
  const confirmed = window.confirm('キャラクターをリセットします。よろしいですか？');
  if (!confirmed) return;

  disposeCurrentModel(character);
  showPlaceholder(character);
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
    onSave: () => handleSave(),
    onReset: () => handleReset(),
  });

  if (currentGeneratedModel) {
    uiHandle.setGeneratingState(true, 'モデルを読み込んでいます…');
    loadCharacterModel(character, currentGeneratedModel.modelUrl)
      .then(() => {
        uiHandle.setGeneratingState(false);
        uiHandle.setSaveButtonEnabled(true);
      })
      .catch(() => {
        uiHandle.setGeneratingState(false);
        uiHandle.showError('保存済みモデルの読み込みに失敗しました。再度生成してください。');
      });
  } else {
    showPlaceholder(character);
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
