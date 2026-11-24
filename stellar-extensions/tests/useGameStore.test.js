import { describe, it, expect, beforeEach } from 'vitest';
import {
  createGameStore,
  createInitialState,
  PERSIST_KEY,
  POINTS_PER_PUZZLE,
} from '../frontend/store/useGameStore.js';

/**
 * The store is created per test so persistence and module state never leak
 * between cases. `localStorage` is the synchronous backend used by the
 * `persist` middleware in the jsdom test environment.
 */
const makeStore = () => createGameStore({ name: PERSIST_KEY });

const readPersisted = () => {
  const raw = localStorage.getItem(PERSIST_KEY);
  return raw === null ? null : JSON.parse(raw);
};

describe('useGameStore initial state', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts with an empty game and no streak', () => {
    const store = makeStore();
    const state = store.getState();

    expect(state.user).toBeNull();
    expect(state.currentPuzzle).toBeNull();
    expect(state.currentDifficulty).toBe('easy');
    expect(state.currentPuzzleIndex).toBe(0);
    expect(state.completedPuzzles).toEqual([]);
    expect(state.puzzleProgress).toEqual({});
    expect(state.score).toBe(0);
    expect(state.streak).toEqual({
      current: 0,
      longest: 0,
      lastActiveDate: null,
    });
  });

  it('exposes an initial-state factory that is not mutated by the store', () => {
    const pristine = createInitialState();
    const store = makeStore();

    store.getState().completePuzzle('easy-1');

    expect(pristine.completedPuzzles).toEqual([]);
    expect(pristine.score).toBe(0);
    expect(store.getState().completedPuzzles).toEqual(['easy-1']);
  });
});

describe('setPuzzle action', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('selects a puzzle and optionally sets the puzzle index', () => {
    const store = makeStore();
    store.getState().setPuzzle({ id: 'easy-1', title: 'First puzzle' }, 1);

    const { currentPuzzle, currentPuzzleIndex } = store.getState();
    expect(currentPuzzle).toMatchObject({
      id: 'easy-1',
      title: 'First puzzle',
      status: 'active',
    });
    expect(currentPuzzleIndex).toBe(1);
  });

  it('keeps the current index when no index is supplied', () => {
    const store = makeStore();
    store.getState().setPuzzle({ id: 'easy-2' });

    expect(store.getState().currentPuzzleIndex).toBe(0);
    expect(store.getState().currentPuzzle.id).toBe('easy-2');
  });

  it('restores the completed status of a previously solved puzzle', () => {
    const store = makeStore();
    store.getState().completePuzzle('easy-1');
    store.getState().setPuzzle({ id: 'easy-1' }, 4);

    expect(store.getState().currentPuzzle.status).toBe('completed');
    expect(store.getState().currentPuzzleIndex).toBe(4);
  });

  it('clears the selection when passed null', () => {
    const store = makeStore();
    store.getState().setPuzzle({ id: 'easy-1' });
    store.getState().setPuzzle(null);

    expect(store.getState().currentPuzzle).toBeNull();
  });
});

describe('updateProgress action', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('creates a progress entry with default counters', () => {
    const store = makeStore();
    store.getState().updateProgress('easy-1', { lastAnswer: '42' });

    expect(store.getState().puzzleProgress['easy-1']).toEqual({
      attempts: 0,
      hintsUsed: 0,
      lastAnswer: '42',
    });
  });

  it('merges later updates without discarding earlier fields', () => {
    const store = makeStore();
    store.getState().updateProgress('easy-1', { attempts: 2 });
    store.getState().updateProgress('easy-1', { hintsUsed: 1 });
    store.getState().updateProgress('easy-1', { attempts: 3, lastAnswer: 'XLM' });

    const progress = store.getState().puzzleProgress['easy-1'];
    expect(progress.attempts).toBe(3);
    expect(progress.hintsUsed).toBe(1);
    expect(progress.lastAnswer).toBe('XLM');
  });

  it('tracks progress independently per puzzle', () => {
    const store = makeStore();
    store.getState().updateProgress('easy-1', { attempts: 1 });
    store.getState().updateProgress('easy-2', { attempts: 4 });

    expect(store.getState().puzzleProgress['easy-1'].attempts).toBe(1);
    expect(store.getState().puzzleProgress['easy-2'].attempts).toBe(4);
  });
});

describe('completePuzzle action', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('marks the puzzle complete, awards points, and advances the index', () => {
    const store = makeStore();
    const result = store.getState().completePuzzle('easy-1');

    const state = store.getState();
    expect(result.completed).toBe(true);
    expect(result.points).toBe(POINTS_PER_PUZZLE);
    expect(state.completedPuzzles).toEqual(['easy-1']);
    expect(state.puzzleProgress['easy-1'].status).toBe('completed');
    expect(state.score).toBe(POINTS_PER_PUZZLE);
    expect(state.currentPuzzleIndex).toBe(1);
  });

  it('is idempotent: a repeated completion awards no extra points', () => {
    const store = makeStore();
    store.getState().completePuzzle('easy-1');
    const second = store.getState().completePuzzle('easy-1');

    const state = store.getState();
    expect(second.completed).toBe(false);
    expect(second.reason).toBe('already-completed');
    expect(state.completedPuzzles).toEqual(['easy-1']);
    expect(state.score).toBe(POINTS_PER_PUZZLE);
    expect(state.currentPuzzleIndex).toBe(1);
  });

  it('honours a custom points value', () => {
    const store = makeStore();
    store.getState().completePuzzle('hard-1', { points: 250 });

    expect(store.getState().score).toBe(250);
  });

  it('marks the selected puzzle as completed', () => {
    const store = makeStore();
    store.getState().setPuzzle({ id: 'easy-1' });
    store.getState().completePuzzle('easy-1');

    expect(store.getState().currentPuzzle.status).toBe('completed');
  });

  it('records daily activity when a puzzle is completed', () => {
    const store = makeStore();
    store.getState().completePuzzle('easy-1', { date: '2026-02-01' });

    expect(store.getState().streak).toEqual({
      current: 1,
      longest: 1,
      lastActiveDate: '2026-02-01',
    });
  });
});

describe('persistence to localStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persists durable progress under the extension key and version', () => {
    const store = makeStore();
    store.getState().setPuzzle({ id: 'easy-1' }, 2);
    store.getState().updateProgress('easy-1', { attempts: 1 });
    store.getState().completePuzzle('easy-1', { date: '2026-03-01' });

    const persisted = readPersisted();
    expect(persisted).not.toBeNull();
    expect(persisted.version).toBe(1);
    expect(persisted.state.completedPuzzles).toEqual(['easy-1']);
    expect(persisted.state.puzzleProgress['easy-1']).toMatchObject({
      status: 'completed',
      attempts: 1,
    });
    expect(persisted.state.score).toBe(POINTS_PER_PUZZLE);
    expect(persisted.state.streak.current).toBe(1);
    expect(persisted.state.currentPuzzleIndex).toBe(3);
  });

  it('does not persist the user or the in-flight puzzle selection', () => {
    const store = makeStore();
    store.setState({ user: { id: 'user-1' } });
    store.getState().setPuzzle({ id: 'easy-1' });
    store.getState().completePuzzle('easy-1', { date: '2026-03-02' });

    const persisted = readPersisted();
    expect(persisted.state.user).toBeUndefined();
    expect(persisted.state.currentPuzzle).toBeUndefined();
  });

  it('rehydrates durable progress into a fresh store', () => {
    const store = makeStore();
    store.getState().setPuzzle({ id: 'easy-1' }, 1);
    store.getState().updateProgress('easy-2', { attempts: 3 });
    store.getState().completePuzzle('easy-1', { date: '2026-03-03' });

    const restored = makeStore();
    const state = restored.getState();

    expect(state.completedPuzzles).toEqual(['easy-1']);
    expect(state.score).toBe(POINTS_PER_PUZZLE);
    expect(state.currentPuzzleIndex).toBe(2);
    expect(state.puzzleProgress['easy-2'].attempts).toBe(3);
    expect(state.streak.lastActiveDate).toBe('2026-03-03');
  });
});

describe('resetProgress action', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('clears progress, score, selection, and streak but keeps the user', () => {
    const store = makeStore();
    store.setState({ user: { id: 'user-1' } });
    store.getState().setPuzzle({ id: 'easy-1' }, 3);
    store.getState().updateProgress('easy-1', { attempts: 2 });
    store.getState().completePuzzle('easy-1', { date: '2026-04-01' });

    store.getState().resetProgress();

    const state = store.getState();
    expect(state.user).toEqual({ id: 'user-1' });
    expect(state.currentPuzzle).toBeNull();
    expect(state.currentDifficulty).toBe('easy');
    expect(state.currentPuzzleIndex).toBe(0);
    expect(state.completedPuzzles).toEqual([]);
    expect(state.puzzleProgress).toEqual({});
    expect(state.score).toBe(0);
    expect(state.streak).toEqual({
      current: 0,
      longest: 0,
      lastActiveDate: null,
    });
  });

  it('persists the reset so a reload does not resurrect old progress', () => {
    const store = makeStore();
    store.getState().completePuzzle('easy-1', { date: '2026-04-02' });
    store.getState().resetProgress();

    const restored = makeStore();
    expect(restored.getState().completedPuzzles).toEqual([]);
    expect(restored.getState().score).toBe(0);
  });
});

describe('streak tracking', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts a streak on the first active day', () => {
    const store = makeStore();
    store.getState().recordDailyActivity('2026-05-01');

    expect(store.getState().streak).toEqual({
      current: 1,
      longest: 1,
      lastActiveDate: '2026-05-01',
    });
  });

  it('does not double-count the same day', () => {
    const store = makeStore();
    store.getState().recordDailyActivity('2026-05-01');
    store.getState().recordDailyActivity('2026-05-01');
    store.getState().recordDailyActivity(new Date('2026-05-01T23:30:00Z'));

    expect(store.getState().streak.current).toBe(1);
    expect(store.getState().streak.longest).toBe(1);
  });

  it('increments on consecutive days and tracks the longest streak', () => {
    const store = makeStore();
    store.getState().recordDailyActivity('2026-05-01');
    store.getState().recordDailyActivity('2026-05-02');
    store.getState().recordDailyActivity('2026-05-03');

    expect(store.getState().streak).toEqual({
      current: 3,
      longest: 3,
      lastActiveDate: '2026-05-03',
    });
  });

  it('resets the current streak after a missed day but keeps the longest', () => {
    const store = makeStore();
    store.getState().recordDailyActivity('2026-05-01');
    store.getState().recordDailyActivity('2026-05-02');
    store.getState().recordDailyActivity('2026-05-03');
    store.getState().recordDailyActivity('2026-05-06');

    expect(store.getState().streak).toEqual({
      current: 1,
      longest: 3,
      lastActiveDate: '2026-05-06',
    });
  });

  it('ignores out-of-order activity so a streak cannot rewind', () => {
    const store = makeStore();
    store.getState().recordDailyActivity('2026-05-10');
    store.getState().recordDailyActivity('2026-05-11');
    store.getState().recordDailyActivity('2026-05-01');

    expect(store.getState().streak).toEqual({
      current: 2,
      longest: 2,
      lastActiveDate: '2026-05-11',
    });
  });

  it('persists streak progress across a reload', () => {
    const store = makeStore();
    store.getState().recordDailyActivity('2026-05-01');
    store.getState().recordDailyActivity('2026-05-02');

    const restored = makeStore();
    expect(restored.getState().streak).toEqual({
      current: 2,
      longest: 2,
      lastActiveDate: '2026-05-02',
    });
  });
});
