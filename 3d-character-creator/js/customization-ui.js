// js/customization-ui.js
import { PARAM_RANGES, ENUM_OPTIONS } from './params.js';

const ENUM_LABELS = {
  gender: { female: '女性', male: '男性' },
  'face.shape': { round: '丸顔', oval: '卵型', square: '角型' },
  'face.nose.shape': { normal: '標準', small: '小さめ', wide: '幅広' },
  'face.mouth.shape': { normal: '標準', smile: '笑顔', flat: '真顔' },
  'hair.style': { short: 'ショート', long: 'ロング', bald: 'なし' },
};

function getByPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function setByPath(obj, path, value) {
  const keys = path.split('.');
  let target = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    target = target[keys[i]];
  }
  target[keys[keys.length - 1]] = value;
}

/**
 * カスタマイズパネルのDOMを構築し、イベントをバインドする。
 * @param {HTMLElement} containerEl
 * @param {object} initialParams
 * @param {(newParams: object, changedPath: string) => void} onChange
 * @param {() => void} onSave
 * @param {() => void} onReset
 * @returns {{ refreshUI: (params: object) => void }}
 */
export function setupCustomizationUI(containerEl, initialParams, onChange, onSave, onReset) {
  let params = initialParams;
  const inputRefs = {};

  containerEl.innerHTML = '';

  function createSection(titleText) {
    const section = document.createElement('section');
    section.className = 'panel-section';
    const title = document.createElement('h3');
    title.textContent = titleText;
    section.appendChild(title);
    containerEl.appendChild(section);
    return section;
  }

  function createSliderRow(section, labelText, path) {
    const range = PARAM_RANGES[path];
    const row = document.createElement('div');
    row.className = 'control-row';

    const label = document.createElement('label');
    label.textContent = labelText;

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(range.min);
    input.max = String(range.max);
    input.step = String(range.step);
    input.value = String(getByPath(params, path));

    input.addEventListener('input', () => {
      setByPath(params, path, Number(input.value));
      onChange(params, path);
    });

    row.appendChild(label);
    row.appendChild(input);
    section.appendChild(row);
    inputRefs[path] = input;
    return input;
  }

  function createColorRow(section, labelText, path) {
    const row = document.createElement('div');
    row.className = 'control-row';

    const label = document.createElement('label');
    label.textContent = labelText;

    const input = document.createElement('input');
    input.type = 'color';
    input.value = getByPath(params, path);

    input.addEventListener('input', () => {
      setByPath(params, path, input.value);
      onChange(params, path);
    });

    row.appendChild(label);
    row.appendChild(input);
    section.appendChild(row);
    inputRefs[path] = input;
    return input;
  }

  function createSelectRow(section, labelText, path) {
    const options = ENUM_OPTIONS[path];
    const labels = ENUM_LABELS[path] || {};
    const row = document.createElement('div');
    row.className = 'control-row';

    const label = document.createElement('label');
    label.textContent = labelText;

    const select = document.createElement('select');
    for (const option of options) {
      const optionEl = document.createElement('option');
      optionEl.value = option;
      optionEl.textContent = labels[option] || option;
      select.appendChild(optionEl);
    }
    select.value = getByPath(params, path);

    select.addEventListener('change', () => {
      setByPath(params, path, select.value);
      onChange(params, path);
    });

    row.appendChild(label);
    row.appendChild(select);
    section.appendChild(row);
    inputRefs[path] = select;
    return select;
  }

  // 性別
  const genderSection = createSection('性別');
  createSelectRow(genderSection, '性別', 'gender');

  // 体形
  const bodySection = createSection('体形');
  createSliderRow(bodySection, '身長', 'body.height');
  createSliderRow(bodySection, '肩幅', 'body.shoulderWidth');
  createSliderRow(bodySection, '体重感', 'body.weight');

  // 肌の色
  const skinSection = createSection('肌の色');
  createColorRow(skinSection, '肌の色', 'skinColor');

  // 目
  const eyesSection = createSection('目');
  createSliderRow(eyesSection, '大きさ', 'face.eyes.size');
  createSliderRow(eyesSection, '間隔', 'face.eyes.spacing');
  createColorRow(eyesSection, '色', 'face.eyes.color');

  // 鼻
  const noseSection = createSection('鼻');
  createSliderRow(noseSection, '大きさ', 'face.nose.size');
  createSelectRow(noseSection, '形', 'face.nose.shape');

  // 口
  const mouthSection = createSection('口');
  createSliderRow(mouthSection, '大きさ', 'face.mouth.size');
  createSelectRow(mouthSection, '形', 'face.mouth.shape');

  // 輪郭
  const shapeSection = createSection('輪郭');
  createSelectRow(shapeSection, '顔の形', 'face.shape');

  // 髪
  const hairSection = createSection('髪');
  createSelectRow(hairSection, '髪型', 'hair.style');
  createColorRow(hairSection, '髪色', 'hair.color');

  // 操作
  const actionSection = createSection('操作');
  const buttonRow = document.createElement('div');
  buttonRow.className = 'control-row control-row--buttons';

  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.textContent = '保存';
  saveButton.addEventListener('click', () => onSave());

  const resetButton = document.createElement('button');
  resetButton.type = 'button';
  resetButton.textContent = 'リセット';
  resetButton.addEventListener('click', () => onReset());

  buttonRow.appendChild(saveButton);
  buttonRow.appendChild(resetButton);
  actionSection.appendChild(buttonRow);

  function refreshUI(newParams) {
    params = newParams;
    for (const path of Object.keys(inputRefs)) {
      const input = inputRefs[path];
      const value = getByPath(params, path);
      input.value = value;
    }
  }

  return { refreshUI };
}
