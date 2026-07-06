// js/controls.js
import * as THREE from 'three';
import { FIELD_HALF_SIZE } from './field.js';

const MOVE_SPEED = 2.5;
const ROTATION_LERP_FACTOR = 0.2;
const CAMERA_LERP_FACTOR = 0.08;
const CAMERA_OFFSET = new THREE.Vector3(0, 2.2, 4.5);

const UP_AXIS = new THREE.Vector3(0, 1, 0);

/**
 * キャラクターの正面はローカル+Z方向（顔パーツをz=正に配置しているため）。
 * カメラは「背後」（キャラクターの正面と逆方向）に置く必要があるため、
 * CAMERA_OFFSETをrotation.yで回転させた後、水平成分の符号を反転させる。
 */
function computeCameraOffset(rotationY) {
  const rotated = CAMERA_OFFSET.clone().applyAxisAngle(UP_AXIS, rotationY);
  return new THREE.Vector3(-rotated.x, rotated.y, -rotated.z);
}

const KEY_MAP = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'backward',
  ArrowDown: 'backward',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};

/**
 * キー入力・移動・カメラ追従のセットアップ。イベントリスナーの登録もここで行う。
 * @param {ReturnType<typeof import('./character.js').createCharacter>} character
 * @param {THREE.PerspectiveCamera} camera
 * @returns {{ update: (deltaTime: number) => void, dispose: () => void }}
 */
export function setupControls(character, camera) {
  const pressedKeys = new Set();
  const lookAtTarget = new THREE.Vector3();

  const onKeyDown = (event) => {
    if (KEY_MAP[event.code]) pressedKeys.add(event.code);
  };
  const onKeyUp = (event) => {
    if (KEY_MAP[event.code]) pressedKeys.delete(event.code);
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  // 初回のカクつき防止: カメラの初期位置・lookAtを即座に1回セット
  const initialOffset = computeCameraOffset(character.root.rotation.y);
  camera.position.copy(character.root.position).add(initialOffset);
  lookAtTarget.copy(character.root.position).add(new THREE.Vector3(0, 1.0, 0));
  camera.lookAt(lookAtTarget);

  function update(deltaTime) {
    let x = 0;
    let z = 0;
    for (const code of pressedKeys) {
      const dir = KEY_MAP[code];
      if (dir === 'forward') z -= 1;
      if (dir === 'backward') z += 1;
      if (dir === 'left') x -= 1;
      if (dir === 'right') x += 1;
    }

    if (x !== 0 || z !== 0) {
      const length = Math.hypot(x, z);
      x /= length;
      z /= length;

      const nextX = character.root.position.x + x * MOVE_SPEED * deltaTime;
      const nextZ = character.root.position.z + z * MOVE_SPEED * deltaTime;
      character.root.position.x = THREE.MathUtils.clamp(nextX, -FIELD_HALF_SIZE, FIELD_HALF_SIZE);
      character.root.position.z = THREE.MathUtils.clamp(nextZ, -FIELD_HALF_SIZE, FIELD_HALF_SIZE);

      // キャラクターの正面はローカル+Z方向（顔パーツをz=正に配置しているため）。
      // rotation.y=0で+Z、+Y軸回転が+Zから+Xへ向かうため、移動方向(x,z)に対して
      // 正面をその方向へ向けるにはatan2(x, z)ではなくatan2(x, -z)を用いる必要がある。
      const targetAngle = Math.atan2(x, -z);
      character.root.rotation.y = THREE.MathUtils.lerp(
        character.root.rotation.y,
        targetAngle,
        ROTATION_LERP_FACTOR
      );
    }

    const offset = computeCameraOffset(character.root.rotation.y);
    const targetCameraPosition = character.root.position.clone().add(offset);
    camera.position.lerp(targetCameraPosition, CAMERA_LERP_FACTOR);

    const targetLookAt = character.root.position.clone().add(new THREE.Vector3(0, 1.0, 0));
    lookAtTarget.lerp(targetLookAt, CAMERA_LERP_FACTOR);
    camera.lookAt(lookAtTarget);
  }

  function dispose() {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
  }

  return { update, dispose };
}
