import { cleanEnv, str, url } from 'envalid';
export const env = cleanEnv(process.env, {
  DATABASE_URL: url(),
  JWT_SECRET: str(),
  PORT: str({ default: '4000' }),
  OPENAI_API_KEY: str({ default: '' }) // only if you’ll use /chat
});
