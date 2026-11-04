import { loadSettings } from './settings';
import { useLoader } from './store';

/** Your banks (from your profile) plus "cash", for filters and pickers. */
export function useMyBanks(): string[] {
  const { data } = useLoader(loadSettings, []);
  return [...(data?.banks ?? []), 'cash'];
}
