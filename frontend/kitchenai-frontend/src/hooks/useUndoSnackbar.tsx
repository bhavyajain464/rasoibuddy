import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { Snackbar } from 'react-native-paper';
import { showAppError } from '../utils/alertMessage';
import { useTabBarLayout } from './useTabBarLayout';
import { snackbarLayoutStyles } from '../constants/snackbarLayout';

export const DEFAULT_UNDO_SNACK_DURATION_MS = 5000;

type UseUndoSnackbarOptions = {
  durationMs?: number;
  undoFailedMessage?: string;
};

/**
 * Snackbar with optional Undo. API commit runs after durationMs unless undone.
 * Uses a timer (not only Paper onDismiss) so commits are reliable on web.
 */
export function useUndoSnackbar(options: UseUndoSnackbarOptions = {}) {
  const { totalHeight } = useTabBarLayout();
  const durationMs = options.durationMs ?? DEFAULT_UNDO_SNACK_DURATION_MS;
  const undoFailedMessage = options.undoFailedMessage ?? 'Undo failed.';

  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [hasUndo, setHasUndo] = useState(false);

  const undoRef = useRef<(() => Promise<void>) | null>(null);
  const commitRef = useRef<(() => void) | null>(null);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSessionRef = useRef(-1);

  const clearCommitTimer = useCallback(() => {
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearCommitTimer(), [clearCommitTimer]);

  const invalidateSession = useCallback(() => {
    activeSessionRef.current = -1;
    undoRef.current = null;
    commitRef.current = null;
    clearCommitTimer();
    setHasUndo(false);
  }, [clearCommitTimer]);

  const runCommit = useCallback(
    (session: number) => {
      clearCommitTimer();
      if (activeSessionRef.current !== session || session < 0) return;
      const commit = commitRef.current;
      activeSessionRef.current = -1;
      undoRef.current = null;
      commitRef.current = null;
      setHasUndo(false);
      setVisible(false);
      commit?.();
    },
    [clearCommitTimer],
  );

  const show = useCallback(
    (msg: string) => {
      invalidateSession();
      setMessage(msg);
      setVisible(true);
    },
    [invalidateSession],
  );

  const showUndo = useCallback(
    (msg: string, undo: () => Promise<void>, onCommit?: () => void) => {
      clearCommitTimer();
      const session = activeSessionRef.current + 1;
      activeSessionRef.current = session;

      undoRef.current = undo;
      commitRef.current = onCommit ?? null;

      setHasUndo(true);
      setMessage(msg);
      setVisible(true);

      if (onCommit) {
        commitTimerRef.current = setTimeout(() => runCommit(session), durationMs);
      }
    },
    [clearCommitTimer, durationMs, runCommit],
  );

  const dismiss = useCallback(() => {
    invalidateSession();
    setVisible(false);
  }, [invalidateSession]);

  /** Suppress pending commit (e.g. when flushing pending API work directly). */
  const cancelCommit = useCallback(() => {
    invalidateSession();
  }, [invalidateSession]);

  const handleDismiss = useCallback(() => {
    const session = activeSessionRef.current;
    const hadPendingCommit = commitTimerRef.current != null;
    clearCommitTimer();
    undoRef.current = null;
    commitRef.current = null;
    setHasUndo(false);
    setVisible(false);
    if (hadPendingCommit && session >= 0) {
      queueMicrotask(() => runCommit(session));
    }
  }, [clearCommitTimer, runCommit]);

  const handleUndo = useCallback(() => {
    const undo = undoRef.current;
    invalidateSession();
    setVisible(false);
    if (undo) void undo().catch(() => showAppError(undoFailedMessage));
  }, [invalidateSession, undoFailedMessage]);

  const undoSnackbar = useMemo(
    () => (
      <Snackbar
        visible={visible}
        onDismiss={handleDismiss}
        duration={durationMs}
        wrapperStyle={[snackbarLayoutStyles.host, { marginBottom: totalHeight + 12 }]}
        style={snackbarLayoutStyles.surface}
        contentStyle={snackbarLayoutStyles.paperContent}
        action={hasUndo ? { label: 'Undo', onPress: handleUndo } : undefined}
      >
        {message}
      </Snackbar>
    ),
    [visible, message, hasUndo, durationMs, handleDismiss, handleUndo, totalHeight],
  );

  return { show, showUndo, dismiss, cancelCommit, undoSnackbar };
}
