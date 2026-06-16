import { useCallback, useEffect, useState } from 'react';
import { checkPanelAccess } from '../services/api';

export type PanelAccessState = 'loading' | 'allowed' | 'denied';

export function usePanelAccess(enabled: boolean) {
  const [state, setState] = useState<PanelAccessState>(enabled ? 'loading' : 'denied');

  const refresh = useCallback(async () => {
    if (!enabled) {
      setState('denied');
      return;
    }
    setState('loading');
    try {
      const ok = await checkPanelAccess();
      setState(ok ? 'allowed' : 'denied');
    } catch {
      setState('denied');
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { state, refresh };
}
