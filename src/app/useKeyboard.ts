import { useEffect, type RefObject } from 'react';
import { playback } from '../timeline/playback';
import { select, timeStore, uiStore } from '../state/store';
import type { MapController } from '../map/MapController';
import { toggleFullscreen } from './fullscreen';

/**
 * Keyboard shortcuts (ignored while typing in inputs):
 *  Space play/pause · ←/→ ±1 year (Shift ±10) · Home restart · End AD 2000
 *  F fullscreen · R reset view · / focus search · Esc close panel/selection
 */
export function useKeyboard(ctrl: RefObject<MapController | null>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
        if (e.key === 'Escape') t.blur();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const role = t?.getAttribute?.('role');
      switch (e.key) {
        case ' ':
          if (t?.tagName === 'BUTTON') return;
          e.preventDefault();
          playback.toggle();
          break;
        case 'ArrowLeft':
          if (role === 'slider') return;
          e.preventDefault();
          playback.step(e.shiftKey ? -10 : -1);
          break;
        case 'ArrowRight':
          if (role === 'slider') return;
          e.preventDefault();
          playback.step(e.shiftKey ? 10 : 1);
          break;
        case 'Home':
          playback.restart();
          break;
        case 'End':
          playback.pause();
          playback.seek(2000);
          break;
        case 'f':
        case 'F':
          toggleFullscreen();
          break;
        case 'r':
        case 'R':
          ctrl.current?.resetView(uiStore.get().reducedMotion);
          break;
        case '/':
          e.preventDefault();
          document.getElementById('search-input')?.focus();
          break;
        case 'Escape':
          if (uiStore.get().panel) uiStore.set({ panel: null });
          else select(null);
          break;
      }
      void timeStore;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctrl]);
}
