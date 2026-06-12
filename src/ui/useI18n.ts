import { useCallback } from 'react';
import { getMessage } from '../utils/i18n';

export function useI18n() {
  const t = useCallback((key: string, substitutions: string[] = []) => {
    return getMessage(key, substitutions);
  }, []);
  return { t };
}
