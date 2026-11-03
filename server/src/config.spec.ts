import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('needs a long API key and a MongoDB URI', () => {
    expect(() => loadConfig({ MONGODB_URI: 'mongodb://x/db' })).toThrow(/API_KEY/);
    expect(() => loadConfig({ API_KEY: 'short', MONGODB_URI: 'mongodb://x/db' })).toThrow(/API_KEY/);
    expect(() => loadConfig({ API_KEY: '0123456789abcdef' })).toThrow(/MONGODB_URI/);
  });

  it('reads port and defaults', () => {
    expect(loadConfig({ API_KEY: '0123456789abcdef', MONGODB_URI: 'mongodb://x/db', PORT: '8080' })).toEqual({
      port: 8080,
      mongoUri: 'mongodb://x/db',
      apiKey: '0123456789abcdef',
      bodyLimit: '25mb',
    });
  });
});
