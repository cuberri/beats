import { describe, expect, it } from 'vitest';
import { History } from './history';

describe('undo history', () => {
  it('undoes and redoes, and a new change drops the redo steps', () => {
    const h = new History('a');
    h.record('b', false, 0);
    h.record('c', false, 5000);
    expect(h.undo()).toBe('b');
    expect(h.undo()).toBe('a');
    expect(h.undo()).toBeNull();
    expect(h.redo()).toBe('b');
    h.record('d', false, 10000);
    expect(h.canRedo).toBe(false);
    expect(h.undo()).toBe('b');
  });

  it('merges quick changes only when asked, and ignores the text it just returned', () => {
    const h = new History('');
    h.record('h', true, 0);
    h.record('he', true, 300);
    h.record('hey', true, 600);
    h.record('hey!', false, 700);
    expect(h.undo()).toBe('hey');
    h.record('hey'); // the app reports the undone text back: not a new step
    expect(h.undo()).toBe('');
    expect(h.canUndo).toBe(false);
  });

  it('starts over on reset and keeps at most `limit` steps', () => {
    const h = new History('0', 3);
    for (let i = 1; i <= 5; i++) h.record(String(i), false, i * 5000);
    expect([h.undo(), h.undo(), h.undo(), h.undo()]).toEqual(['4', '3', '2', null]);
    h.reset('x');
    expect(h.canUndo || h.canRedo).toBe(false);
  });
});
