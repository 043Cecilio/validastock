import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { apiRouter } from './routes/api';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'ValidaStock API' });
});

app.use('/api', apiRouter);

const PORT = process.env.PORT || 3333;

app.listen(PORT, () => {
  console.log(`🚀 ValidaStock API rodando em http://localhost:${PORT}`);
});