/** Server settings, read from environment variables (see .env.example). */
export type AppConfig = {
  port: number;
  mongoUri: string;
  apiKey: string;
  /** Largest backup body accepted. A year of payments plus SMS is usually well under 5 MB. */
  bodyLimit: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const apiKey = env.API_KEY ?? '';
  if (apiKey.length < 16) {
    throw new Error('API_KEY must be set to a secret of at least 16 characters (see .env.example).');
  }
  const mongoUri = env.MONGODB_URI ?? '';
  if (!mongoUri) throw new Error('MONGODB_URI must be set, e.g. mongodb://localhost:27017/drtax');
  return {
    port: Number(env.PORT ?? 3000),
    mongoUri,
    apiKey,
    bodyLimit: env.BODY_LIMIT ?? '25mb',
  };
}

export const APP_CONFIG = Symbol('APP_CONFIG');
