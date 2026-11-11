/**
 * Undo/redo for the song text. The app reports every new text with `record`; `undo` and `redo` return
 * the text to show. Quick successive changes can be merged into one step (typing in the Text tab).
 */
export class History {
  private past: string[] = [];
  private future: string[] = [];
  private lastAt = 0;

  constructor(
    private current: string,
    private readonly limit = 200,
  ) {}

  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }

  /**
   * The text changed to `text`. With `merge`, a change within `mergeMs` of the previous one joins
   * its step instead of making a new one.
   */
  record(text: string, merge = false, now = Date.now(), mergeMs = 1000) {
    if (text === this.current) return;
    if (!(merge && this.past.length && now - this.lastAt < mergeMs)) {
      this.past.push(this.current);
      if (this.past.length > this.limit) this.past.shift();
    }
    this.future = [];
    this.current = text;
    this.lastAt = now;
  }

  undo(): string | null {
    const prev = this.past.pop();
    if (prev === undefined) return null;
    this.future.push(this.current);
    this.current = prev;
    this.lastAt = 0;
    return prev;
  }

  redo(): string | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(this.current);
    this.current = next;
    this.lastAt = 0;
    return next;
  }

  /** Start over from `text` (another song was opened). */
  reset(text: string) {
    this.past = [];
    this.future = [];
    this.current = text;
    this.lastAt = 0;
  }
}
