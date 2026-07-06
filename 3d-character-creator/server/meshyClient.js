// server/meshyClient.js
// Meshy AI想定APIとの通信を担うクライアント層（詳細設計書v2 1章・5.5節）。
// 実際のAPI仕様との差異が判明した場合、このファイルのみを修正すればよいよう
// プロキシの外部インターフェース（routes/generate.js）からは分離してある。

const MESHY_BASE_URL = 'https://api.meshy.ai';
const FETCH_TIMEOUT_MS = 10000;

/** Meshy API呼び出し失敗を表すエラークラス。routes/generate.js側でHTTPステータスへマッピングする。 */
export class MeshyApiError extends Error {
  constructor(message, { statusCode = 502, cause } = {}) {
    super(message);
    this.name = 'MeshyApiError';
    this.statusCode = statusCode;
    this.cause = cause;
  }
}

function getApiKey() {
  const key = process.env.MESHY_API_KEY;
  return key && key.trim().length > 0 ? key : null;
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    throw new MeshyApiError('Meshy AI APIへの接続に失敗しました。', { statusCode: 502, cause: error });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Meshy AI想定APIへText-to-3D生成ジョブを発行する。
 * @param {string} prompt - 組み立て済みプロンプト
 * @returns {Promise<{ taskId: string }>}
 * @throws {MeshyApiError} APIキー未設定・HTTPエラー・レスポンス形式不正の場合
 */
export async function createTextTo3DJob(prompt) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new MeshyApiError('MESHY_API_KEY is not configured', { statusCode: 503 });
  }

  const res = await fetchWithTimeout(`${MESHY_BASE_URL}/v2/text-to-3d`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      mode: 'preview',
      prompt,
      art_style: 'realistic',
      negative_prompt: 'low quality, blurry, deformed',
    }),
  });

  if (!res.ok) {
    let bodyText = '';
    try {
      bodyText = await res.text();
    } catch {
      // ignore
    }
    throw new MeshyApiError(`Meshy AI job creation failed (${res.status}): ${bodyText}`, { statusCode: 502 });
  }

  let body;
  try {
    body = await res.json();
  } catch (error) {
    throw new MeshyApiError('Meshy AI response was not valid JSON.', { statusCode: 502, cause: error });
  }

  if (!body || typeof body.result !== 'string') {
    throw new MeshyApiError('Meshy AI response did not contain a task id.', { statusCode: 502 });
  }

  return { taskId: body.result };
}

/**
 * 指定タスクのステータス・結果を取得する。
 * @param {string} taskId
 * @returns {Promise<{
 *   status: "PENDING"|"IN_PROGRESS"|"SUCCEEDED"|"FAILED",
 *   progress: number,
 *   glbUrl: string|null,
 *   errorMessage: string|null
 * }>}
 * @throws {MeshyApiError} APIキー未設定・HTTPエラー・レスポンス形式不正の場合
 */
export async function getTextTo3DJobStatus(taskId) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new MeshyApiError('MESHY_API_KEY is not configured', { statusCode: 503 });
  }

  const res = await fetchWithTimeout(`${MESHY_BASE_URL}/v2/text-to-3d/${encodeURIComponent(taskId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!res.ok) {
    let bodyText = '';
    try {
      bodyText = await res.text();
    } catch {
      // ignore
    }
    throw new MeshyApiError(`Meshy AI status fetch failed (${res.status}): ${bodyText}`, { statusCode: 502 });
  }

  let body;
  try {
    body = await res.json();
  } catch (error) {
    throw new MeshyApiError('Meshy AI response was not valid JSON.', { statusCode: 502, cause: error });
  }

  return {
    status: body.status,
    progress: typeof body.progress === 'number' ? body.progress : 0,
    glbUrl: body.model_urls && body.model_urls.glb ? body.model_urls.glb : null,
    errorMessage: body.task_error && body.task_error.message ? body.task_error.message : null,
  };
}
