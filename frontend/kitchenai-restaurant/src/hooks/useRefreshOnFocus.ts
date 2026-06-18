import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef } from 'react';

type Options = {
  enabled?: boolean;
  /** When true, skip reload on first focus (use if useEffect already loads on mount). */
  skipInitial?: boolean;
};

/** Re-run `refresh` whenever this screen becomes active (tab switch or stack pop). */
export function useRefreshOnFocus(refresh: () => void | Promise<void>, options: Options = {}) {
  const { enabled = true, skipInitial = true } = options;
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const initialSkipped = useRef(!skipInitial);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      if (!initialSkipped.current) {
        initialSkipped.current = true;
        return;
      }
      void refreshRef.current();
    }, [enabled]),
  );
}
