import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import authRoutes from './auth/auth.routes.js';
import userRoutes from './routes/user.routes.js';

const app = express();
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get('/healthz', (_req, res) => res.json({ ok: true }));
app.use('/auth', authRoutes);
app.use('/user', userRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(` API running at http://localhost:${PORT}`));
