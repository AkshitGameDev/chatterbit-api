import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import authRoutes from '../auth/auth.routes.js';
import userRoutes from '../routes/user.routes.js';
import { prisma } from '../lib/prisma.js';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

const app = express();

app.use(morgan('tiny'));
app.use(rateLimit({ windowMs: 60_000, max: 120 }));
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get('/healthz', (_req, res) => res.json({ ok: true }));
app.use('/auth', authRoutes);
app.use('/user', userRoutes);

app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err);           
  res.status(err.status || 500).json({
    error: err.message || 'Server error'   
  });
});

prisma.$connect()
  .then(() => console.log('✅ Prisma connected'))
  .catch((e) => { console.error(' Prisma connect failed:', e); process.exit(1); });


const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(` API running at http://localhost:${PORT}`));
