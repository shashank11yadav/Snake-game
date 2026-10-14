/**
 * Longest frame gap we try to catch up on. After a long stall (debugger,
 * background tab on some browsers) replaying every missed tick would make the
 * snake lurch across the board, so the backlog is dropped instead.
 */
export const MAX_FRAME_MS = 250;

export interface TickPlan {
  readonly ticks: number;
  readonly accumulator: number;
}

/**
 * Fixed-timestep accounting. Game logic advances in whole ticks of `tickMs`
 * regardless of the display's refresh rate; whatever time is left over
 * becomes the interpolation factor (accumulator / tickMs) for rendering.
 */
export function planTicks(accumulator: number, frameMs: number, tickMs: number): TickPlan {
  const total = accumulator + Math.min(Math.max(frameMs, 0), MAX_FRAME_MS);
  const ticks = Math.floor(total / tickMs);
  return { ticks, accumulator: total - ticks * tickMs };
}
