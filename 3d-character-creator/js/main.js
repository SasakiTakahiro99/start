// js/main.js
import * as THREE from 'three';
import { createField } from './field.js';
import { createCharacter, updateCharacterPart } from './character.js';
import { setupControls } from './controls.js';
import { setupCustomizationUI } from './customization-ui.js';
import { saveToStorage, loadFromStorage, clearStorage } from './storage.js';
import { createDefaultParams } from './params.js';

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

function init() {
  if (!isWebGLAvailable()) {
    showWebGLUnavailableMessage();
    return;
  }

  const canvasContainer = document.getElementById('canvas-container');
  const panelEl = document.getElementById('customization-panel');

  const { params: loadedParams, restored } = loadFromStorage();
  let params = loadedParams;

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

  const character = createCharacter(params);
  scene.add(character.root);

  const controlsHandle = setupControls(character, camera);

  const uiHandle = setupCustomizationUI(
    panelEl,
    params,
    (newParams, changedPath) => {
      updateCharacterPart(character, changedPath, newParams);
      params = newParams;
      uiHandle.refreshUI(params);
      setSaveStatus('未保存の変更があります');
    },
    () => {
      const result = saveToStorage(params);
      if (result.ok) {
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const ss = String(now.getSeconds()).padStart(2, '0');
        setSaveStatus(`保存しました（${hh}:${mm}:${ss}）`);
      } else {
        setSaveStatus('保存に失敗しました（ブラウザのストレージ設定をご確認ください）');
      }
    },
    () => {
      const confirmed = window.confirm('カスタマイズ内容をリセットします。よろしいですか？');
      if (!confirmed) return;
      params = createDefaultParams();
      updateCharacterPart(character, 'all', params);
      uiHandle.refreshUI(params);
      clearStorage();
      setSaveStatus('未保存の変更があります');
    }
  );

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
