// js/character.js
// AI生成GLBのロード・シーン配置・破棄処理を担う（詳細設計書v2 10章）。
// controls.js/main.jsが操作対象とする character.root（THREE.Group）のインターフェース契約は維持する。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MESHY_MODEL_FRONT_CORRECTION_Y = 0; // 8.2節。ラジアン。初期値は無補正
const MODEL_TARGET_HEIGHT = 1.7; // モデルの高さをこの値(m相当)へ正規化する目標値
const GLB_LOAD_TIMEOUT_MS = 30000;

const loader = new GLTFLoader();

/**
 * character.root（常に単一インスタンス）とローディング/未生成表示の管理ハンドルを構築する。
 * ページ初期化時に1回だけ呼ぶ。
 * @returns {{ root: THREE.Group, modelContainer: THREE.Group, currentModelUrl: string|null }}
 */
export function createCharacterContainer() {
  const root = new THREE.Group();
  const modelContainer = new THREE.Group();
  root.add(modelContainer);

  return {
    root,
    modelContainer,
    currentModelUrl: null,
    _loadToken: 0,
  };
}

/**
 * character.modelContainer配下の現在のGLBシーンを破棄する（geometry/material/textureのdispose）。
 * @param {ReturnType<typeof createCharacterContainer>} character
 */
export function disposeCurrentModel(character) {
  for (const child of [...character.modelContainer.children]) {
    character.modelContainer.remove(child);
    child.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of materials) {
          for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) {
            if (mat[key]) mat[key].dispose();
          }
          mat.dispose();
        }
      }
    });
  }
  character.currentModelUrl = null;
}

/**
 * 指定URLのGLBをロードし、character.modelContainer配下に配置する。
 * ロードが成功して初めて既存の表示をdispose→差し替えする（失敗時は直前の表示を維持）。
 * また、呼び出しごとにトークンを発行し、タイムアウト等の後に古いロードが遅れて
 * 完了しても、その結果が既存の表示へ反映されないようにする。
 * @param {ReturnType<typeof createCharacterContainer>} character
 * @param {string} modelUrl - プロキシ経由で取得したGLBのURL
 * @returns {Promise<void>} ロード完了時にresolve。失敗時はrejectする
 */
export function loadCharacterModel(character, modelUrl) {
  if (character.currentModelUrl === modelUrl) {
    return Promise.resolve();
  }

  const myToken = ++character._loadToken;

  const loadPromise = new Promise((resolve, reject) => {
    loader.load(
      modelUrl,
      (gltf) => {
        if (character._loadToken !== myToken) {
          // 既にタイムアウト済み、または後続のロードに追い越された古い結果なので無視する
          return;
        }

        const scene = gltf.scene;

        // 【スケール適用"前"】デフォルトスケールのままバウンディングボックスを計算
        const preScaleBox = new THREE.Box3().setFromObject(scene);
        const preScaleSize = new THREE.Vector3();
        preScaleBox.getSize(preScaleSize);

        const scaleFactor = preScaleSize.y > 0 ? MODEL_TARGET_HEIGHT / preScaleSize.y : 1;
        scene.scale.setScalar(scaleFactor);

        // 【スケール適用"後"】再計算した最小Y座標で底面を地面に合わせる
        const postScaleBox = new THREE.Box3().setFromObject(scene);
        scene.position.y -= postScaleBox.min.y;

        // ここまでロードが成功して初めて、既存の表示をdisposeして差し替える
        disposeCurrentModel(character);
        character.modelContainer.add(scene);
        character.modelContainer.rotation.y = MESHY_MODEL_FRONT_CORRECTION_Y;
        character.currentModelUrl = modelUrl;
        resolve();
      },
      undefined,
      (error) => {
        if (character._loadToken !== myToken) {
          return;
        }
        reject(new Error('GLBのロードに失敗しました: ' + (error && error.message ? error.message : String(error))));
      }
    );
  });

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      if (character._loadToken !== myToken) {
        return;
      }
      // トークンを進め、以後この呼び出しの結果が遅れて届いても
      // disposeCurrentModel/modelContainer.addが実行されないようにする
      character._loadToken++;
      reject(new Error('モデルの読み込みがタイムアウトしました'));
    }, GLB_LOAD_TIMEOUT_MS);
  });

  return Promise.race([loadPromise, timeoutPromise]);
}

/**
 * 未生成状態のプレースホルダー表示を設置する。
 * 過剰な作り込みを避けるため、プリミティブ形状のプレースホルダーは設置せず、
 * modelContainerを空のままにする（10.5節）。
 * @param {ReturnType<typeof createCharacterContainer>} character
 */
export function showPlaceholder(character) {
  character._loadToken++;
  disposeCurrentModel(character);
}
