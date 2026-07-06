// js/field.js
import * as THREE from 'three';

export const FIELD_HALF_SIZE = 4.8; // キャラクター移動可能範囲（原点からの正方形半幅）

/**
 * 地面フィールドを生成する。
 * @returns {THREE.Group} - PlaneMesh と GridHelper をまとめたGroup（シーンに1回addする）
 */
export function createField() {
  const group = new THREE.Group();

  const groundGeometry = new THREE.PlaneGeometry(10, 10, 10, 10);
  const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x6fae5c });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);

  const grid = new THREE.GridHelper(10, 10, 0x3d7a34, 0x4f8f45);
  grid.position.y = 0.01;
  group.add(grid);

  return group;
}
