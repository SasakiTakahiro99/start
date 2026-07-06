// server/index.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import generateRouter from './routes/generate.js';

const app = express();
app.use(cors()); // フロントエンドが別オリジン(file://やlocalhost別ポート)から呼ぶため許可
app.use(express.json());

app.use('/api/generate', generateRouter);

app.get('/health', (req, res) => res.json({ ok: true })); // 疎通確認用

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`3d-character-creator proxy server listening on port ${PORT}`);
});
