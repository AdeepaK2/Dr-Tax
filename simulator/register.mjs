// Redirects phone-only modules to simulator mocks so the app's real logic runs in Node.
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const mock = (name) => pathToFileURL(path.join(here, 'mocks', `${name}.ts`)).href;
const MOCKS = {
  'react-native': mock('react-native'),
  'expo-sqlite': mock('expo-sqlite'),
  'expo-notifications': mock('expo-notifications'),
  'expo-router': mock('expo-router'),
  'expo-file-system': mock('expo-stub'),
  'expo-sharing': mock('expo-stub'),
  'expo-background-task': mock('expo-stub'),
  'expo-task-manager': mock('expo-stub'),
  'expo-secure-store': mock('expo-secure-store'),
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (MOCKS[specifier]) return { url: MOCKS[specifier], shortCircuit: true };
    if (specifier.endsWith('modules/sms-reader')) return { url: mock('sms-reader'), shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
