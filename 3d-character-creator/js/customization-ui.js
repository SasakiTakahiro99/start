// js/customization-ui.js
import { ENUM_OPTIONS, ENUM_LABELS, validateAppearanceDescription } from './params.js';

/**
 * カスタマイズパネルのDOMを構築し、イベントをバインドする。
 * @param {HTMLElement} containerEl
 * @param {object} initialParams - GenerationParams
 * @param {{
 *   onGenerate: (params: object) => void,
 *   onSave: (name: string) => void,
 *   onReset: () => void,
 *   onSelectGalleryItem: (id: string) => void,
 *   onDeleteGalleryItem: (id: string) => void,
 *   onExportCurrent: () => void,
 *   onExportGalleryItem: (id: string) => void,
 *   onImportFile: (file: File) => void,
 * }} handlers
 * @returns {{
 *   refreshUI: (params: object) => void,
 *   setGeneratingState: (isGenerating: boolean, progressText?: string) => void,
 *   showError: (message: string) => void,
 *   clearError: () => void,
 *   showGenerationNotice: (message: string) => void,
 *   clearGenerationNotice: () => void,
 *   setSaveButtonEnabled: (enabled: boolean) => void,
 *   refreshGallery: (entries: Array<object>, selectedId: string|null) => void,
 * }}
 */
export function setupCustomizationUI(containerEl, initialParams, handlers) {
  let formParams = { ...initialParams };

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

  function createSelectRow(section, labelText, key) {
    const options = ENUM_OPTIONS[key];
    const labels = ENUM_LABELS[key] || {};
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
    select.value = formParams[key];

    select.addEventListener('change', () => {
      formParams[key] = select.value;
    });

    row.appendChild(label);
    row.appendChild(select);
    section.appendChild(row);
    return select;
  }

  // 性別
  const genderSection = createSection('性別');
  const genderSelect = createSelectRow(genderSection, '性別', 'gender');

  // 雰囲気
  const moodSection = createSection('雰囲気');
  const moodSelect = createSelectRow(moodSection, '雰囲気', 'mood');

  // 体型傾向
  const bodyTypeSection = createSection('体型傾向');
  const bodyTypeSelect = createSelectRow(bodyTypeSection, '体型傾向', 'bodyType');

  // 容姿の説明
  const appearanceSection = createSection('容姿の説明');
  const appearanceRow = document.createElement('div');
  appearanceRow.className = 'control-row control-row--textarea';

  const appearanceTextarea = document.createElement('textarea');
  appearanceTextarea.id = 'appearance-description';
  appearanceTextarea.maxLength = 500;
  appearanceTextarea.value = formParams.appearanceDescription;
  appearanceTextarea.placeholder = '例: 黒髪ロング、優しい笑顔、ナチュラルメイク';

  const charCounter = document.createElement('span');
  charCounter.className = 'char-counter';
  function updateCharCounter() {
    charCounter.textContent = `${appearanceTextarea.value.length} / 500`;
  }
  updateCharCounter();

  appearanceTextarea.addEventListener('input', () => {
    formParams.appearanceDescription = appearanceTextarea.value;
    updateCharCounter();
    const result = validateAppearanceDescription(appearanceTextarea.value);
    if (!result.ok) {
      showError(result.message);
    } else {
      clearError();
    }
  });

  appearanceRow.appendChild(appearanceTextarea);
  appearanceRow.appendChild(charCounter);
  appearanceSection.appendChild(appearanceRow);

  // 生成ボタン
  const generateSection = createSection('生成');
  const generateButton = document.createElement('button');
  generateButton.type = 'button';
  generateButton.className = 'generate-button';
  generateButton.textContent = '生成';
  generateButton.addEventListener('click', () => {
    const currentParams = {
      version: 2,
      gender: genderSelect.value,
      mood: moodSelect.value,
      bodyType: bodyTypeSelect.value,
      appearanceDescription: appearanceTextarea.value,
    };
    const validation = validateAppearanceDescription(currentParams.appearanceDescription);
    if (!validation.ok) {
      showError(validation.message);
      return;
    }
    formParams = currentParams;
    handlers.onGenerate(currentParams);
  });
  generateSection.appendChild(generateButton);

  // ローディング表示
  const loadingIndicator = document.createElement('div');
  loadingIndicator.className = 'loading-indicator';
  loadingIndicator.hidden = true;
  const spinner = document.createElement('span');
  spinner.className = 'spinner';
  const progressText = document.createElement('span');
  progressText.className = 'progress-text';
  loadingIndicator.appendChild(spinner);
  loadingIndicator.appendChild(progressText);
  generateSection.appendChild(loadingIndicator);

  // エラー表示
  const errorEl = document.createElement('div');
  errorEl.className = 'generation-error';
  errorEl.hidden = true;
  generateSection.appendChild(errorEl);

  // デモ注記表示
  const noticeEl = document.createElement('div');
  noticeEl.className = 'generation-notice';
  noticeEl.hidden = true;
  generateSection.appendChild(noticeEl);

  // 操作（保存/リセット）
  const actionSection = createSection('操作');

  const saveNameRow = document.createElement('div');
  saveNameRow.className = 'control-row';
  const saveNameLabel = document.createElement('label');
  saveNameLabel.textContent = '保存名';
  const saveNameInput = document.createElement('input');
  saveNameInput.type = 'text';
  saveNameInput.placeholder = '例: キャラクター1';
  saveNameInput.maxLength = 50;
  saveNameRow.appendChild(saveNameLabel);
  saveNameRow.appendChild(saveNameInput);
  actionSection.appendChild(saveNameRow);

  const buttonRow = document.createElement('div');
  buttonRow.className = 'control-row control-row--buttons';

  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.textContent = '保存（一覧に追加）';
  saveButton.disabled = true;
  saveButton.addEventListener('click', () => handlers.onSave(saveNameInput.value.trim()));

  const resetButton = document.createElement('button');
  resetButton.type = 'button';
  resetButton.textContent = 'リセット';
  resetButton.addEventListener('click', () => handlers.onReset());

  buttonRow.appendChild(saveButton);
  buttonRow.appendChild(resetButton);
  actionSection.appendChild(buttonRow);

  // ファイルへのエクスポート/インポート
  const fileRow = document.createElement('div');
  fileRow.className = 'control-row control-row--buttons';

  const exportButton = document.createElement('button');
  exportButton.type = 'button';
  exportButton.textContent = '現在のキャラをファイル保存';
  exportButton.disabled = true;
  exportButton.addEventListener('click', () => handlers.onExportCurrent());

  const importInput = document.createElement('input');
  importInput.type = 'file';
  importInput.accept = '.zip';
  importInput.style.display = 'none';
  importInput.addEventListener('change', () => {
    const file = importInput.files && importInput.files[0];
    if (file) {
      handlers.onImportFile(file);
    }
    importInput.value = '';
  });

  const importButton = document.createElement('button');
  importButton.type = 'button';
  importButton.textContent = 'ファイルから読み込み';
  importButton.addEventListener('click', () => importInput.click());

  fileRow.appendChild(exportButton);
  fileRow.appendChild(importButton);
  actionSection.appendChild(fileRow);
  actionSection.appendChild(importInput);

  // 保存済みキャラクター一覧（ギャラリー）
  const gallerySection = createSection('保存済みキャラクター一覧');
  const galleryListEl = document.createElement('div');
  galleryListEl.className = 'gallery-list';
  gallerySection.appendChild(galleryListEl);

  function renderGallery(entries, selectedId) {
    galleryListEl.innerHTML = '';
    if (!entries || entries.length === 0) {
      const emptyEl = document.createElement('p');
      emptyEl.className = 'gallery-empty';
      emptyEl.textContent = 'まだ保存されたキャラクターはありません。';
      galleryListEl.appendChild(emptyEl);
      return;
    }

    for (const entry of entries) {
      const item = document.createElement('div');
      item.className = 'gallery-item';
      if (entry.id === selectedId) item.classList.add('gallery-item--selected');

      const nameButton = document.createElement('button');
      nameButton.type = 'button';
      nameButton.className = 'gallery-item__name';
      nameButton.textContent = entry.name;
      nameButton.addEventListener('click', () => handlers.onSelectGalleryItem(entry.id));

      const itemButtonRow = document.createElement('div');
      itemButtonRow.className = 'gallery-item__buttons';

      const itemExportButton = document.createElement('button');
      itemExportButton.type = 'button';
      itemExportButton.textContent = 'エクスポート';
      itemExportButton.addEventListener('click', () => handlers.onExportGalleryItem(entry.id));

      const itemDeleteButton = document.createElement('button');
      itemDeleteButton.type = 'button';
      itemDeleteButton.textContent = '削除';
      itemDeleteButton.addEventListener('click', () => handlers.onDeleteGalleryItem(entry.id));

      itemButtonRow.appendChild(itemExportButton);
      itemButtonRow.appendChild(itemDeleteButton);

      item.appendChild(nameButton);
      item.appendChild(itemButtonRow);
      galleryListEl.appendChild(item);
    }
  }

  function refreshUI(newParams) {
    formParams = { ...newParams };
    genderSelect.value = formParams.gender;
    moodSelect.value = formParams.mood;
    bodyTypeSelect.value = formParams.bodyType;
    appearanceTextarea.value = formParams.appearanceDescription;
    updateCharCounter();
  }

  function setGeneratingState(isGenerating, progressTextValue) {
    generateButton.disabled = isGenerating;
    loadingIndicator.hidden = !isGenerating;
    if (isGenerating) {
      progressText.textContent = progressTextValue || '生成中…';
    }
  }

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function clearError() {
    errorEl.textContent = '';
    errorEl.hidden = true;
  }

  function showGenerationNotice(message) {
    noticeEl.textContent = message;
    noticeEl.hidden = false;
  }

  function clearGenerationNotice() {
    noticeEl.textContent = '';
    noticeEl.hidden = true;
  }

  function setSaveButtonEnabled(enabled) {
    saveButton.disabled = !enabled;
    exportButton.disabled = !enabled;
  }

  return {
    refreshUI,
    setGeneratingState,
    showError,
    clearError,
    showGenerationNotice,
    clearGenerationNotice,
    setSaveButtonEnabled,
    refreshGallery: renderGallery,
  };
}
