import jwt from 'jsonwebtoken';

export function authGuard(req, res, next) {
  const raw = req.headers.authorization || '';
  const token = raw.startsWith('Bearer ') ? raw.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { sub } = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = sub;
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}
 