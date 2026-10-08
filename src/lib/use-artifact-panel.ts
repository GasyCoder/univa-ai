'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Artifact } from './artifacts';

export type PanelMode = 'normal' | 'maximized' | 'fullscreen';

const SIZE_KEY = 'univa-artifact-panel-size';
export const PANEL_DEFAULT = 40;
export const PANEL_MIN = 25;
export const PANEL_MAX = 65; // keeps the chat at 35% or more

const clamp = (value: number) => Math.min(PANEL_MAX, Math.max(PANEL_MIN, value));

/** The single source of truth for the side panel: which file is shown, and how. */
export function useArtifactPanel() {
  const [activeArtifact, setActiveArtifact] = useState<Artifact | null>(null);
  const [artifactPanelOpen, setOpen] = useState(false);
  const [mode, setMode] = useState<PanelMode>('normal');
  const [size, setSizeState] = useState(PANEL_DEFAULT);

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(SIZE_KEY));
      if (saved) setSizeState(clamp(saved));
    } catch {}
  }, []);

  const setSize = useCallback((value: number) => {
    const next = clamp(value);
    setSizeState(next);
    try {
      localStorage.setItem(SIZE_KEY, String(Math.round(next)));
    } catch {}
  }, []);

  const openArtifact = useCallback((artifact: Artifact) => {
    setActiveArtifact(artifact);
    setOpen(true);
  }, []);
  const closeArtifact = useCallback(() => {
    setOpen(false);
    setMode('normal');
  }, []);
  const resetArtifacts = useCallback(() => {
    setActiveArtifact(null);
    setOpen(false);
    setMode('normal');
  }, []);

  return {
    activeArtifact,
    artifactPanelOpen,
    mode,
    size,
    openArtifact,
    closeArtifact,
    resetArtifacts,
    setActiveArtifact,
    setSize,
    maximizeArtifact: () => setMode('maximized'),
    fullscreenArtifact: () => setMode('fullscreen'),
    restoreArtifact: () => setMode('normal'),
  };
}
