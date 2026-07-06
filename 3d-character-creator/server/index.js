// server/index.js
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import generateRouter from './routes/generate.js';

// 起動時のカレントディレクトリ(npm --prefix経由等)に依存せず、
// このファイル自身の場所を基準に.envを読み込む。
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
app.use(cors()); // フロントエンドが別オリジン(file://やlocalhost別ポート)から呼ぶため許可
app.use(express.json());

app.use('/api/generate', generateRouter);

app.get('/health', (req, res) => res.json({ ok: true })); // 疎通確認用

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`3d-character-creator proxy server listening on port ${PORT}`);
});
