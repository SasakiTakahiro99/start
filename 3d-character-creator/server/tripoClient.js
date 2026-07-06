// server/tripoClient.js
// Tripo AI(https://www.tripo3d.ai/)のOpenAPI v3(https://developers.tripo3d.ai/)との通信を担うクライアント層。
// 実際のAPI仕様との差異が判明した場合、このファイルのみを修正すればよいよう
// プロキシの外部インターフェース（routes/generate.js）からは分離してある。

const TRIPO_BASE_URL = 'https://openapi.tripo3d.ai/v3';
const FETCH_TIMEOUT_MS = 10000;

/** Tripo AI API呼び出し失敗を表すエラークラス。routes/generate.js側でHTTPステータスへマッピングする。 */
export class TripoApiError extends Error {
  constructor(message, { statusCode = 502, cause } = {}) {
    super(message);
    this.name = 'TripoApiError';
    this.statusCode = statusCode;
    this.cause = cause;
  }
}

function getApiKey() {
  const key = process.env.TRIPO_API_KEY;
  return key && key.trim().length > 0 ? key : null;
}

async function parseJsonBody(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * v3のエラーレスポンス(`{code, message, ...}`、codeが非0)を判定してTripoApiErrorを投げる。
 * 実測したcode:2(Invalid API key)はstatusCode:503(デモフォールバック経路)にマッピングする。
 */
function throwTripoApiError(context, res, body) {
  const code = body && typeof body.code === 'number' ? body.code : null;
  const message = (body && body.message) || `HTTP ${res.status}`;
  if (res.status === 401 || code === 2) {
    throw new TripoApiError(`${context} - authentication failed: ${message}`, { statusCode: 503 });
  }
  throw new TripoApiError(`${context} (${res.status}): ${message}`, { statusCode: 502 });
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    throw new TripoApiError('Tripo AI APIへの接続に失敗しました。', { statusCode: 502, cause: error });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Tripo AIへtext_to_model生成タスクを発行する。
 * @param {string} prompt - 組み立て済みプロンプト
 * @returns {Promise<{ taskId: string }>}
 * @throws {TripoApiError} APIキー未設定・HTTPエラー・レスポンス形式不正の場合
 */
export async function createTextTo3DJob(prompt) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new TripoApiError('TRIPO_API_KEY is not configured', { statusCode: 503 });
  }

  const res = await fetchWithTimeout(`${TRIPO_BASE_URL}/generation/text-to-model`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      prompt,
      model: 'v2.5-20250123',
      negative_prompt: 'low quality, blurry, deformed',
    }),
  });

  const body = await parseJsonBody(res);

  if (!res.ok || !body || body.code !== 0) {
    throwTripoApiError('Tripo AI job creation failed', res, body);
  }

  if (!body.data || typeof body.data.task_id !== 'string') {
    throw new TripoApiError('Tripo AI response did not contain a task id.', { statusCode: 502 });
  }

  return { taskId: body.data.task_id };
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
 * @throws {TripoApiError} APIキー未設定・HTTPエラー・レスポンス形式不正の場合
 */
export async function getTextTo3DJobStatus(taskId) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new TripoApiError('TRIPO_API_KEY is not configured', { statusCode: 503 });
  }

  const res = await fetchWithTimeout(`${TRIPO_BASE_URL}/tasks/${encodeURIComponent(taskId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  const body = await parseJsonBody(res);

  if (!res.ok || !body || body.code !== 0) {
    throwTripoApiError('Tripo AI status fetch failed', res, body);
  }

  const data = body.data || {};
  const output = data.output || {};

  return {
    status: normalizeTripoStatus(data.status),
    progress: typeof data.progress === 'number' ? data.progress : 0,
    glbUrl: output.model_url || null,
    errorMessage: data.status === 'failed' ? 'Tripo AI task failed.' : null,
  };
}

/**
 * Tripo AIのstatus値をroutes/generate.jsのnormalizeStatus()が期待する
 * 'PENDING'|'IN_PROGRESS'|'SUCCEEDED'|'FAILED' 相当へマッピングする。
 * @param {string} tripoStatus
 * @returns {"PENDING"|"IN_PROGRESS"|"SUCCEEDED"|"FAILED"}
 */
function normalizeTripoStatus(tripoStatus) {
  switch (tripoStatus) {
    case 'queued':
      return 'PENDING';
    case 'running':
      return 'IN_PROGRESS';
    case 'success':
      return 'SUCCEEDED';
    case 'failed':
    case 'cancelled':
      return 'FAILED';
    default:
      return 'PENDING';
  }
}
