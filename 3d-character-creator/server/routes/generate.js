// server/routes/generate.js
// POST /api/generate, GET /api/generate/:jobId/status のエンドポイント実装（詳細設計書v2 5.6節）。
import { Router } from 'express';
import { createTextTo3DJob, getTextTo3DJobStatus, MeshyApiError } from '../meshyClient.js';

const router = Router();

const DEMO_FALLBACK_JOB_ID = 'demo-fallback';
// 注記: 詳細設計書v2 6.2節ではThree.js公式サンプルリポジトリ(mrdoob/three.js)経由のURLを
// 想定していたが、同リポジトリはjsDelivrのGitHub CDNモードのサイズ上限(50MB)を超過しており
// 実際には配信されない(404)ことが実装時に判明した。同一のDuck.glb(Khronosグループ公式の
// glTFサンプルモデル配布元)を代替ソースとして採用する。ダミーGLBとしての選定意図
// （軽量な既知の公開モデルで疎通確認用途に使う）は変更していない。
const DEMO_GLB_URL =
  'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models@main/2.0/Duck/glTF-Binary/Duck.glb';

const APPEARANCE_MAX_LENGTH = 500;
const PROMPT_MAX_LENGTH = 2000;
const VALID_GENDERS = ['female', 'male', 'unspecified'];
const VALID_MOODS = ['bright', 'cool', 'cute', 'mature'];
const VALID_BODY_TYPES = ['slim', 'average', 'muscular'];

function validateGenerateBody(body) {
  if (!VALID_GENDERS.includes(body.gender)) {
    return { ok: false, message: 'genderが不正です。' };
  }
  if (!VALID_MOODS.includes(body.mood)) {
    return { ok: false, message: 'moodが不正です。' };
  }
  if (!VALID_BODY_TYPES.includes(body.bodyType)) {
    return { ok: false, message: 'bodyTypeが不正です。' };
  }
  if (body.appearanceDescription !== undefined && typeof body.appearanceDescription !== 'string') {
    return { ok: false, message: 'appearanceDescriptionが不正です。' };
  }
  if (typeof body.appearanceDescription === 'string' && body.appearanceDescription.length > APPEARANCE_MAX_LENGTH) {
    return { ok: false, message: `appearanceDescriptionは${APPEARANCE_MAX_LENGTH}文字以内で入力してください。` };
  }

  // promptフィールド自体のサーバー側バリデーション（詳細設計書v2 5.6節・確定事項）
  if (typeof body.prompt !== 'string') {
    return { ok: false, message: 'promptが不正です。' };
  }
  const trimmedPrompt = body.prompt.trim();
  if (trimmedPrompt.length < 1) {
    return { ok: false, message: 'promptが不正です。' };
  }
  if (body.prompt.length > PROMPT_MAX_LENGTH) {
    return { ok: false, message: 'promptが不正です。' };
  }

  return { ok: true };
}

router.post('/', async (req, res) => {
  const body = req.body || {};
  const validation = validateGenerateBody(body);
  if (!validation.ok) {
    return res.status(400).json({ error: 'INVALID_PARAMS', message: validation.message });
  }

  try {
    const { taskId } = await createTextTo3DJob(body.prompt);
    return res.status(202).json({ jobId: taskId });
  } catch (error) {
    if (error instanceof MeshyApiError && error.statusCode === 503) {
      return res.status(503).json({
        error: 'API_KEY_NOT_CONFIGURED',
        message: 'AIモデル生成APIキーが設定されていません。デモ用モデルを表示します。',
        fallback: {
          jobId: DEMO_FALLBACK_JOB_ID,
          immediate: true,
        },
      });
    }
    return res.status(502).json({
      error: 'MESHY_API_ERROR',
      message: 'AIモデル生成APIの呼び出しに失敗しました。',
    });
  }
});

router.get('/:jobId/status', async (req, res) => {
  const { jobId } = req.params;

  if (jobId === DEMO_FALLBACK_JOB_ID) {
    return res.status(200).json({
      status: 'succeeded',
      progress: 100,
      modelUrl: DEMO_GLB_URL,
      errorMessage: null,
    });
  }

  try {
    const result = await getTextTo3DJobStatus(jobId);
    const normalizedStatus = normalizeStatus(result.status);
    return res.status(200).json({
      status: normalizedStatus,
      progress: result.progress,
      modelUrl: normalizedStatus === 'succeeded' ? result.glbUrl : null,
      errorMessage: normalizedStatus === 'failed' ? result.errorMessage || '生成に失敗しました。' : null,
    });
  } catch (error) {
    if (error instanceof MeshyApiError && error.statusCode === 503) {
      return res.status(503).json({
        error: 'API_KEY_NOT_CONFIGURED',
        message: 'AIモデル生成APIキーが設定されていません。',
      });
    }
    return res.status(502).json({
      error: 'MESHY_API_ERROR',
      message: 'AIモデル生成APIの呼び出しに失敗しました。',
    });
  }
});

function normalizeStatus(meshyStatus) {
  switch (meshyStatus) {
    case 'PENDING':
      return 'pending';
    case 'IN_PROGRESS':
      return 'in_progress';
    case 'SUCCEEDED':
      return 'succeeded';
    case 'FAILED':
      return 'failed';
    default:
      return 'pending';
  }
}

export default router;
