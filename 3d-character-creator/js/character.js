// js/character.js
import * as THREE from 'three';
import { getGenderBodyPreset } from './params.js';

const HEAD_RADIUS = 0.32;
const HEAD_SHAPE_SCALE = {
  round: { x: 1.0, y: 1.0, z: 1.0 },
  oval: { x: 0.9, y: 1.15, z: 0.95 },
  square: { x: 1.05, y: 0.95, z: 1.0 },
};

function n(v, fallback) {
  return Number.isFinite(v) ? v : fallback;
}

/**
 * torsoの寸法（radius/length）からCapsuleGeometryを生成する。
 */
function createTorsoGeometry(shoulderWidth, weight) {
  const radius = 0.28 * n(shoulderWidth, 1.0) * n(weight, 1.0);
  const length = 0.55 * n(weight, 1.0);
  return new THREE.CapsuleGeometry(radius, length, 4, 12);
}

function createNoseGeometry(shape) {
  if (shape === 'small') return new THREE.SphereGeometry(0.03, 8, 6);
  if (shape === 'wide') return new THREE.ConeGeometry(0.05, 0.05, 8);
  return new THREE.ConeGeometry(0.035, 0.07, 8);
}

function createHairChildren(style, material) {
  const children = [];
  if (style === 'bald') {
    return children;
  }
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55),
    material
  );
  children.push(cap);
  if (style === 'long') {
    const back = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.4, 4, 8), material);
    back.position.set(0, -0.22, -0.16);
    back.rotation.x = Math.PI / 2 - 0.15;
    children.push(back);
  }
  return children;
}

/**
 * torsoの寸法を基準に、頭・faceFeaturesGroup・cheekGroup・腕・脚の接続位置(position.y/x等)を
 * 再計算し直す内部関数。
 * @param {ReturnType<typeof createCharacter>} character
 */
function layoutParts(character) {
  const { parts, params } = character;
  const torsoParams = parts.torso.geometry.parameters;
  const torsoRadius = n(torsoParams.radius, 0.28);
  const torsoLength = n(torsoParams.length, 0.55);
  const torsoHalfLength = torsoLength / 2 + torsoRadius;

  const headY = torsoHalfLength + HEAD_RADIUS * 0.6;
  parts.head.position.y = headY;
  parts.faceFeaturesGroup.position.y = headY;
  parts.cheekGroup.position.y = headY;

  const legY = -torsoHalfLength - 0.2;
  parts.leftLeg.position.y = legY;
  parts.rightLeg.position.y = legY;

  const shoulderWidth = n(params.body.shoulderWidth, 1.0);
  const armX = 0.28 * shoulderWidth + 0.09;
  parts.leftArm.position.x = -armX;
  parts.rightArm.position.x = armX;
}

/**
 * gender/nose.shape/mouth.shape/face.shape/hair.style 変更時、対象パーツのジオメトリのみを
 * 破棄(dispose)して作り直す内部ヘルパー。
 * @param {THREE.Mesh} part
 * @param {THREE.BufferGeometry} newGeometry
 */
function replaceGeometry(part, newGeometry) {
  const oldGeometry = part.geometry;
  part.geometry = newGeometry;
  if (oldGeometry) oldGeometry.dispose();
}

/**
 * キャラクターを新規構築する。
 * @param {object} params - js/params.js の正規化済みパラメータ
 * @returns {{ root: THREE.Group, parts: Record<string, THREE.Object3D>, params: object }}
 */
export function createCharacter(params) {
  const parts = {};
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);
  parts.bodyGroup = bodyGroup;

  bodyGroup.scale.set(1, n(params.body.height, 1.0), 1);

  // --- torso ---
  const torsoMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });
  const torso = new THREE.Mesh(
    createTorsoGeometry(params.body.shoulderWidth, params.body.weight),
    torsoMaterial
  );
  bodyGroup.add(torso);
  parts.torso = torso;

  // --- head ---
  const skinMaterial = new THREE.MeshStandardMaterial({ color: params.skinColor });
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(HEAD_RADIUS, 24, 16),
    skinMaterial
  );
  const headScale = HEAD_SHAPE_SCALE[params.face.shape] || HEAD_SHAPE_SCALE.round;
  head.scale.set(headScale.x, headScale.y, headScale.z);
  bodyGroup.add(head);
  parts.head = head;

  // --- hair (headの子) ---
  const hairMaterial = new THREE.MeshStandardMaterial({ color: params.hair.color });
  const hairGroup = new THREE.Group();
  hairGroup.visible = params.hair.style !== 'bald';
  for (const child of createHairChildren(params.hair.style, hairMaterial)) {
    hairGroup.add(child);
  }
  head.add(hairGroup);
  parts.hairGroup = hairGroup;

  // --- faceFeaturesGroup (headと兄弟、scale固定) ---
  const faceFeaturesGroup = new THREE.Group();
  bodyGroup.add(faceFeaturesGroup);
  parts.faceFeaturesGroup = faceFeaturesGroup;

  const eyeMaterial = new THREE.MeshStandardMaterial({ color: params.face.eyes.color });
  const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), eyeMaterial);
  leftEye.position.set(-0.11 * n(params.face.eyes.spacing, 1.0), 0.03, 0.27);
  leftEye.scale.setScalar(n(params.face.eyes.size, 1.0));
  faceFeaturesGroup.add(leftEye);
  parts.leftEye = leftEye;

  const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), eyeMaterial);
  rightEye.position.set(0.11 * n(params.face.eyes.spacing, 1.0), 0.03, 0.27);
  rightEye.scale.setScalar(n(params.face.eyes.size, 1.0));
  faceFeaturesGroup.add(rightEye);
  parts.rightEye = rightEye;

  const noseMaterial = new THREE.MeshStandardMaterial({ color: params.skinColor });
  const nose = new THREE.Mesh(createNoseGeometry(params.face.nose.shape), noseMaterial);
  nose.position.set(0, 0, 0.31);
  nose.scale.setScalar(n(params.face.nose.size, 1.0));
  faceFeaturesGroup.add(nose);
  parts.nose = nose;

  const mouthMaterial = new THREE.MeshStandardMaterial({ color: 0x8a4a4a });
  const mouth = new THREE.Mesh(new THREE.CapsuleGeometry(0.015, 0.09, 2, 6), mouthMaterial);
  mouth.rotation.z = Math.PI / 2;
  if (params.face.mouth.shape === 'smile') {
    mouth.rotation.x = 0.3;
  }
  mouth.position.set(0, -0.09, 0.29);
  mouth.scale.x = n(params.face.mouth.size, 1.0);
  faceFeaturesGroup.add(mouth);
  parts.mouth = mouth;

  // --- cheekGroup (headと兄弟、scale固定、常駐生成+visible切替) ---
  const cheekGroup = new THREE.Group();
  bodyGroup.add(cheekGroup);
  parts.cheekGroup = cheekGroup;

  const cheekVisible = params.face.shape === 'square';
  const cheekGeometry = new THREE.BoxGeometry(0.12, 0.16, 0.1);
  const cheekLeft = new THREE.Mesh(cheekGeometry, skinMaterial);
  cheekLeft.position.set(-0.26, -0.05, 0.08);
  cheekLeft.visible = cheekVisible;
  cheekGroup.add(cheekLeft);
  parts.cheekLeft = cheekLeft;

  const cheekRight = new THREE.Mesh(cheekGeometry, skinMaterial);
  cheekRight.position.set(0.26, -0.05, 0.08);
  cheekRight.visible = cheekVisible;
  cheekGroup.add(cheekRight);
  parts.cheekRight = cheekRight;

  // --- arms ---
  const leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.42, 4, 8), skinMaterial);
  bodyGroup.add(leftArm);
  parts.leftArm = leftArm;

  const rightArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.42, 4, 8), skinMaterial);
  bodyGroup.add(rightArm);
  parts.rightArm = rightArm;

  // --- legs ---
  const legMaterial = new THREE.MeshStandardMaterial({ color: 0x4a4a5a });
  const leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.5, 4, 8), legMaterial);
  leftLeg.position.x = -0.13;
  bodyGroup.add(leftLeg);
  parts.leftLeg = leftLeg;

  const rightLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.5, 4, 8), legMaterial);
  rightLeg.position.x = 0.13;
  bodyGroup.add(rightLeg);
  parts.rightLeg = rightLeg;

  const character = { root, parts, params };
  layoutParts(character);
  return character;
}

function applyGenderAndBody(character, params) {
  const { parts } = character;
  parts.bodyGroup.scale.y = n(params.body.height, 1.0);
  replaceGeometry(parts.torso, createTorsoGeometry(params.body.shoulderWidth, params.body.weight));
  layoutParts(character);
}

function applyFaceShape(character, params) {
  const { parts } = character;
  const scale = HEAD_SHAPE_SCALE[params.face.shape] || HEAD_SHAPE_SCALE.round;
  parts.head.scale.set(scale.x, scale.y, scale.z);
  const visible = params.face.shape === 'square';
  parts.cheekLeft.visible = visible;
  parts.cheekRight.visible = visible;
}

function rebuildHair(character, params) {
  const { parts } = character;
  const hairGroup = parts.hairGroup;
  for (const child of [...hairGroup.children]) {
    hairGroup.remove(child);
    if (child.geometry) child.geometry.dispose();
  }
  hairGroup.visible = params.hair.style !== 'bald';
  const hairMaterial = new THREE.MeshStandardMaterial({ color: params.hair.color });
  for (const child of createHairChildren(params.hair.style, hairMaterial)) {
    hairGroup.add(child);
  }
}

/**
 * 指定パーツ（または全体）にパラメータを反映する。
 * @param {ReturnType<typeof createCharacter>} character
 * @param {string} partName - 更新対象の粒度（詳細パス方式）
 * @param {object} params - 適用する最新の全体パラメータ
 */
export function updateCharacterPart(character, partName, params) {
  const { parts } = character;
  character.params = params;

  switch (partName) {
    case 'gender': {
      const preset = getGenderBodyPreset(params.gender);
      params.body.height = preset.height;
      params.body.shoulderWidth = preset.shoulderWidth;
      params.body.weight = preset.weight;
      applyGenderAndBody(character, params);
      break;
    }
    case 'body.height': {
      parts.bodyGroup.scale.y = n(params.body.height, 1.0);
      break;
    }
    case 'body.shoulderWidth':
    case 'body.weight': {
      replaceGeometry(parts.torso, createTorsoGeometry(params.body.shoulderWidth, params.body.weight));
      layoutParts(character);
      break;
    }
    case 'skinColor': {
      const color = new THREE.Color(params.skinColor);
      parts.head.material.color.copy(color);
      parts.leftArm.material.color.copy(color);
      parts.rightArm.material.color.copy(color);
      break;
    }
    case 'face.shape': {
      applyFaceShape(character, params);
      break;
    }
    case 'face.eyes.size': {
      const s = n(params.face.eyes.size, 1.0);
      parts.leftEye.scale.setScalar(s);
      parts.rightEye.scale.setScalar(s);
      break;
    }
    case 'face.eyes.spacing': {
      const spacing = n(params.face.eyes.spacing, 1.0);
      parts.leftEye.position.x = -0.11 * spacing;
      parts.rightEye.position.x = 0.11 * spacing;
      break;
    }
    case 'face.eyes.color': {
      const color = new THREE.Color(params.face.eyes.color);
      parts.leftEye.material.color.copy(color);
      parts.rightEye.material.color.copy(color);
      break;
    }
    case 'face.nose.size': {
      parts.nose.scale.setScalar(n(params.face.nose.size, 1.0));
      break;
    }
    case 'face.nose.shape': {
      replaceGeometry(parts.nose, createNoseGeometry(params.face.nose.shape));
      parts.nose.scale.setScalar(n(params.face.nose.size, 1.0));
      break;
    }
    case 'face.mouth.size': {
      parts.mouth.scale.x = n(params.face.mouth.size, 1.0);
      break;
    }
    case 'face.mouth.shape': {
      parts.mouth.rotation.x = params.face.mouth.shape === 'smile' ? 0.3 : 0;
      break;
    }
    case 'hair.style': {
      rebuildHair(character, params);
      break;
    }
    case 'hair.color': {
      const color = new THREE.Color(params.hair.color);
      for (const child of parts.hairGroup.children) {
        child.material.color.copy(color);
      }
      break;
    }
    case 'all':
    default: {
      applyGenderAndBody(character, params);
      const color = new THREE.Color(params.skinColor);
      parts.head.material.color.copy(color);
      parts.leftArm.material.color.copy(color);
      parts.rightArm.material.color.copy(color);
      applyFaceShape(character, params);
      parts.leftEye.scale.setScalar(n(params.face.eyes.size, 1.0));
      parts.rightEye.scale.setScalar(n(params.face.eyes.size, 1.0));
      const spacing = n(params.face.eyes.spacing, 1.0);
      parts.leftEye.position.x = -0.11 * spacing;
      parts.rightEye.position.x = 0.11 * spacing;
      const eyeColor = new THREE.Color(params.face.eyes.color);
      parts.leftEye.material.color.copy(eyeColor);
      parts.rightEye.material.color.copy(eyeColor);
      replaceGeometry(parts.nose, createNoseGeometry(params.face.nose.shape));
      parts.nose.scale.setScalar(n(params.face.nose.size, 1.0));
      parts.mouth.rotation.x = params.face.mouth.shape === 'smile' ? 0.3 : 0;
      parts.mouth.scale.x = n(params.face.mouth.size, 1.0);
      rebuildHair(character, params);
      break;
    }
  }
}
