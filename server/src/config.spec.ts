import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('needs a long secret and a MongoDB URI', () => {
    expect(() => loadConfig({ MONGODB_URI: 'mongodb://x/db' })).toThrow(/JWT_SECRET/);
    expect(() => loadConfig({ JWT_SECRET: 'short', MONGODB_URI: 'mongodb://x/db' })).toThrow(/JWT_SECRET/);
    expect(() => loadConfig({ JWT_SECRET: '0123456789abcdef' })).toThrow(/MONGODB_URI/);
  });

  it('falls back to API_KEY for older setups, and reads defaults', () => {
    expect(loadConfig({ API_KEY: '0123456789abcdef', MONGODB_URI: 'mongodb://x/db', PORT: '8080' })).toEqual({
      port: 8080,
      mongoUri: 'mongodb://x/db',
      jwtSecret: '0123456789abcdef',
      tokenTtlDays: 365,
      bodyLimit: '25mb',
    });
  });
});
