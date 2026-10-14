import { toXY } from '../engine/grid.ts';
import type { Direction, GameState } from '../engine/types.ts';

export interface Palette {
  board: string;
  boardAlt: string;
  snake: string;
  snakeEdge: string;
  head: string;
  eye: string;
  pupil: string;
  food: string;
  foodShine: string;
  leaf: string;
  path: string;
  danger: string;
}

const PALETTE_VARS: Readonly<Record<keyof Palette, string>> = {
  board: '--board',
  boardAlt: '--board-alt',
  snake: '--snake',
  snakeEdge: '--snake-edge',
  head: '--snake-head',
  eye: '--eye',
  pupil: '--pupil',
  food: '--food',
  foodShine: '--food-shine',
  leaf: '--leaf',
  path: '--path',
  danger: '--danger',
};

/** Reads the theme colours from CSS custom properties so the canvas follows light/dark mode. */
export function readPalette(el: Element): Palette {
  const style = getComputedStyle(el);
  const out = {} as Palette;
  for (const [key, cssVar] of Object.entries(PALETTE_VARS) as [keyof Palette, string][]) {
    out[key] = style.getPropertyValue(cssVar).trim() || '#888';
  }
  return out;
}

interface Burst {
  x: number;
  y: number;
  start: number;
}

export interface Frame {
  readonly prev: GameState;
  readonly curr: GameState;
  /** 0..1, how far between prev and curr to draw the moving ends. */
  readonly alpha: number;
  readonly path: readonly number[];
  readonly now: number;
  readonly reducedMotion: boolean;
}

const EAT_MS = 380;
const DEATH_MS = 450;

const DIR_VECTOR: Readonly<Record<Direction, readonly [number, number]>> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private palette: Palette;
  private cssSize = 0;
  private dpr = 1;
  private bursts: Burst[] = [];
  private deathAt = -Infinity;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    this.palette = readPalette(canvas);
  }

  setPalette(palette: Palette): void {
    this.palette = palette;
  }

  /**
   * Sizes the backing store to CSS size x devicePixelRatio so lines stay
   * sharp on HiDPI screens, then draws in CSS pixels via the transform.
   */
  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.cssSize = Math.max(1, Math.floor(Math.min(rect.width, rect.height)));
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    const px = Math.round(this.cssSize * this.dpr);
    if (this.canvas.width !== px || this.canvas.height !== px) {
      this.canvas.width = px;
      this.canvas.height = px;
    }
  }

  eatAt(cell: number, cols: number, now: number): void {
    const [x, y] = toXY(cols, cell);
    this.bursts.push({ x, y, start: now });
  }

  died(now: number): void {
    this.deathAt = now;
  }

  reset(): void {
    this.bursts = [];
    this.deathAt = -Infinity;
  }

  /** True while an effect still needs frames after the game stops ticking. */
  animating(now: number): boolean {
    return this.bursts.some((b) => now - b.start < EAT_MS) || now - this.deathAt < DEATH_MS;
  }

  draw(frame: Frame): void {
    const { ctx, palette: p } = this;
    const { curr, now, reducedMotion } = frame;
    const { cols, rows } = curr.config;
    const cell = this.cssSize / cols;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const sinceDeath = now - this.deathAt;
    if (!reducedMotion && sinceDeath < DEATH_MS) {
      const k = 1 - sinceDeath / DEATH_MS;
      ctx.translate(Math.sin(now * 0.09) * 4 * k, Math.cos(now * 0.11) * 3 * k);
    }

    ctx.fillStyle = p.board;
    ctx.fillRect(-8, -8, this.cssSize + 16, this.cssSize + 16);
    ctx.fillStyle = p.boardAlt;
    for (let y = 0; y < rows; y++) {
      for (let x = (y % 2) ^ 1; x < cols; x += 2) ctx.fillRect(x * cell, y * cell, cell, cell);
    }

    this.drawPath(frame.path, cols, cell);
    if (curr.food !== -1) this.drawFood(curr.food, cols, cell, reducedMotion ? 0 : now);
    this.drawSnake(frame, cell);
    this.drawBursts(cell, now, reducedMotion);

    if (!reducedMotion && sinceDeath < DEATH_MS) {
      ctx.globalAlpha = 0.28 * (1 - sinceDeath / DEATH_MS);
      ctx.fillStyle = p.danger;
      ctx.fillRect(-8, -8, this.cssSize + 16, this.cssSize + 16);
      ctx.globalAlpha = 1;
    }
  }

  private drawPath(path: readonly number[], cols: number, cell: number): void {
    if (path.length === 0) return;
    const { ctx } = this;
    ctx.fillStyle = this.palette.path;
    ctx.globalAlpha = 0.55;
    for (const c of path) {
      const [x, y] = toXY(cols, c);
      ctx.beginPath();
      ctx.arc((x + 0.5) * cell, (y + 0.5) * cell, Math.max(1.5, cell * 0.1), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawFood(food: number, cols: number, cell: number, t: number): void {
    const { ctx, palette: p } = this;
    const [x, y] = toXY(cols, food);
    const cx = (x + 0.5) * cell;
    const cy = (y + 0.53) * cell;
    const r = cell * 0.34 * (1 + 0.06 * Math.sin(t / 220));
    ctx.fillStyle = p.food;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.foodShine;
    ctx.beginPath();
    ctx.arc(cx - r * 0.35, cy - r * 0.35, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.leaf;
    ctx.beginPath();
    ctx.ellipse(cx + r * 0.35, cy - r * 1.05, r * 0.42, r * 0.2, -0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawSnake(frame: Frame, cell: number): void {
    const { ctx, palette: p } = this;
    const { prev, curr, alpha } = frame;
    const cols = curr.config.cols;
    const center = (c: number): [number, number] => {
      const [x, y] = toXY(cols, c);
      return [x + 0.5, y + 0.5];
    };
    // Position a fraction `alpha` of the way from one cell centre to the
    // next, or null when they are not neighbours (a wrap across the edge),
    // where a straight lerp would cut across the whole board.
    const slide = (from: number, to: number): [number, number] | null => {
      const a = center(from);
      const b = center(to);
      if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) > 1) return null;
      return [a[0] + (b[0] - a[0]) * alpha, a[1] + (b[1] - a[1]) * alpha];
    };

    // The head slides into its new cell and, unless the snake just grew, the
    // old tail end slides out of the cell it is leaving. Everything in
    // between sits on cell centres.
    const body = curr.snake;
    const n = body.length;
    const head = body[0] ?? 0;
    const pts: [number, number][] = [slide(prev.snake[0] ?? head, head) ?? center(head)];
    for (let i = 1; i < n; i++) pts.push(center(body[i] ?? 0));
    const leaving = prev.snake.at(-1);
    const grew = n > prev.snake.length;
    if (!grew && leaving !== undefined && leaving !== body[n - 1]) {
      const tail = slide(leaving, body[n - 1] ?? 0);
      if (tail) pts.push(tail);
    }

    const strokeBody = (width: number, color: string): void => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      pts.forEach(([x, y], i) => {
        const before = pts[i - 1];
        const jump = before ? Math.abs(before[0] - x) + Math.abs(before[1] - y) > 1.01 : true;
        if (jump) {
          // A tiny first segment so round caps still draw a piece that is cut off by a wrap.
          ctx.moveTo(x * cell, y * cell);
          ctx.lineTo(x * cell + 0.01, y * cell);
        } else {
          ctx.lineTo(x * cell, y * cell);
        }
      });
      ctx.stroke();
    };
    strokeBody(cell * 0.78, p.snakeEdge);
    strokeBody(cell * 0.62, p.snake);

    const [hx, hy] = pts[0] ?? [0, 0];
    const dead = curr.status === 'dead';
    ctx.fillStyle = dead ? p.danger : p.head;
    ctx.beginPath();
    ctx.arc(hx * cell, hy * cell, cell * 0.41, 0, Math.PI * 2);
    ctx.fill();

    const [dx, dy] = DIR_VECTOR[curr.dir];
    for (const side of [-1, 1]) {
      const ex = (hx + dx * 0.14 - dy * 0.19 * side) * cell;
      const ey = (hy + dy * 0.14 + dx * 0.19 * side) * cell;
      ctx.fillStyle = p.eye;
      ctx.beginPath();
      ctx.arc(ex, ey, cell * 0.12, 0, Math.PI * 2);
      ctx.fill();
      if (dead) {
        const s = cell * 0.06;
        ctx.strokeStyle = p.pupil;
        ctx.lineWidth = Math.max(1, cell * 0.035);
        ctx.beginPath();
        ctx.moveTo(ex - s, ey - s);
        ctx.lineTo(ex + s, ey + s);
        ctx.moveTo(ex + s, ey - s);
        ctx.lineTo(ex - s, ey + s);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.pupil;
        ctx.beginPath();
        ctx.arc(ex + dx * cell * 0.045, ey + dy * cell * 0.045, cell * 0.06, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawBursts(cell: number, now: number, reducedMotion: boolean): void {
    this.bursts = this.bursts.filter((b) => now - b.start < EAT_MS);
    if (reducedMotion) return;
    const { ctx } = this;
    for (const b of this.bursts) {
      const k = (now - b.start) / EAT_MS;
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = this.palette.food;
      ctx.lineWidth = Math.max(1, cell * 0.08 * (1 - k));
      ctx.beginPath();
      ctx.arc((b.x + 0.5) * cell, (b.y + 0.5) * cell, cell * (0.35 + 0.65 * k), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}
