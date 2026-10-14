export type Phase = 'title' | 'playing' | 'paused' | 'over';

/** start: Space/Enter/tap, pause: P/Escape or the pause button, hide: tab hidden or window blur, end: died or won. */
export type PhaseEvent = 'start' | 'pause' | 'hide' | 'end';

export function transition(phase: Phase, event: PhaseEvent): Phase {
  switch (phase) {
    case 'title':
    case 'over':
      return event === 'start' ? 'playing' : phase;
    case 'playing':
      if (event === 'pause' || event === 'hide') return 'paused';
      if (event === 'end') return 'over';
      return phase;
    case 'paused':
      return event === 'start' || event === 'pause' ? 'playing' : phase;
  }
}
