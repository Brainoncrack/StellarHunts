import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Extension game store (issue #982).
 *
 * The core `frontend/store/useGameStore.js` is intentionally left untouched by
 * the extension isolation rule. This module provides the same durable game
 * progress model plus the actions the extension features need: selecting a
 * puzzle, recording partial progress, completing a puzzle once, and tracking a
 * daily streak. It is a standalone store with its own persist key so it can
 * never collide with `game-store:v1`.
 *
 * Only durable progress is persisted. `user` and the in-flight `currentPuzzle`
 * are ephemeral and re-fetched by the caller.
 */

export const PERSIST_KEY = 'stellar-extensions-game-store:v1';
export const POINTS_PER_PUZZLE = 100;
export const DIFFICULTY_LEVELS = ['easy', 'medium', 'hard', 'master'];

export const createInitialState = () => ({
  // Session/account data (never persisted).
  user: null,

  // Currently selected puzzle (never persisted).
  currentPuzzle: null,

  // Durable progress.
  currentDifficulty: 'easy',
  currentPuzzleIndex: 0,
  completedPuzzles: [],
  puzzleProgress: {},
  score: 0,
  streak: {
    current: 0,
    longest: 0,
    lastActiveDate: null,
  },
});

/**
 * Normalises a Date or ISO timestamp to a UTC `YYYY-MM-DD` key. Using a date
 * key rather than a timestamp makes "same day" and "consecutive day" checks
 * independent of the current time.
 */
export const toDateKey = (value = new Date()) => {
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
};

const daysBetween = (fromKey, toKey) => {
  const from = Date.parse(`${fromKey}T00:00:00Z`);
  const to = Date.parse(`${toKey}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.round((to - from) / 86_400_000);
};

const safeStorage = (storage) => {
  if (storage) return storage;
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  return {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
};

/**
 * Creates an independent store instance. Tests (and multi-tenant embeds) use
 * this factory so state never leaks between cases through the module-level
 * singleton.
 */
export const createGameStore = ({ name = PERSIST_KEY, storage } = {}) =>
  create(
    persist(
      (set, get) => ({
        ...createInitialState(),

        /**
         * Selects the puzzle shown to the player. Passing `null` clears the
         * selection. The stored status is derived from prior progress so a
         * revisited puzzle keeps its completed/attempted state.
         */
        setPuzzle: (puzzle, index) =>
          set((state) => {
            if (puzzle === null || puzzle === undefined) {
              return { currentPuzzle: null };
            }
            return {
              currentPuzzle: {
                ...puzzle,
                status: state.puzzleProgress[puzzle.id]?.status ?? 'active',
              },
              currentPuzzleIndex:
                typeof index === 'number' ? index : state.currentPuzzleIndex,
            };
          }),

        /**
         * Merges partial progress for a puzzle (attempts, hints used, last
         * answer, elapsed time, ...). Unknown fields are preserved, and
         * repeated updates never discard previously recorded fields.
         */
        updateProgress: (puzzleId, updates = {}) =>
          set((state) => ({
            puzzleProgress: {
              ...state.puzzleProgress,
              [puzzleId]: {
                attempts: 0,
                hintsUsed: 0,
                ...(state.puzzleProgress[puzzleId] ?? {}),
                ...updates,
              },
            },
          })),

        /**
         * Records one daily activity event and advances the streak. A second
         * event on the same day is a no-op; consecutive days increment;
         * a gap resets the current streak to 1 while `longest` is retained.
         */
        recordDailyActivity: (date = new Date()) => {
          const dateKey = toDateKey(date);
          const streak = get().streak;

          if (streak.lastActiveDate === dateKey) return;

          const gap = streak.lastActiveDate
            ? daysBetween(streak.lastActiveDate, dateKey)
            : null;

          // Out-of-order activity must not rewind a streak.
          if (gap !== null && gap <= 0) return;

          const current = gap === 1 ? streak.current + 1 : 1;
          set({
            streak: {
              current,
              longest: Math.max(streak.longest, current),
              lastActiveDate: dateKey,
            },
          });
        },

        /**
         * Completes a puzzle exactly once: adds it to the completed list,
         * marks its progress entry, awards points, advances the puzzle index,
         * and records daily activity. Repeated calls are idempotent and do not
         * award points twice.
         */
        completePuzzle: (puzzleId, options = {}) => {
          const { completedPuzzles, score } = get();
          if (completedPuzzles.includes(puzzleId)) {
            return { completed: false, score, reason: 'already-completed' };
          }

          get().recordDailyActivity(options.date);
          const points = options.points ?? POINTS_PER_PUZZLE;

          set((state) => ({
            completedPuzzles: [...state.completedPuzzles, puzzleId],
            puzzleProgress: {
              ...state.puzzleProgress,
              [puzzleId]: {
                attempts: 0,
                hintsUsed: 0,
                ...(state.puzzleProgress[puzzleId] ?? {}),
                status: 'completed',
                completedAt: options.completedAt ?? Date.now(),
              },
            },
            score: state.score + points,
            currentPuzzleIndex: state.currentPuzzleIndex + 1,
            currentPuzzle:
              state.currentPuzzle?.id === puzzleId
                ? { ...state.currentPuzzle, status: 'completed' }
                : state.currentPuzzle,
          }));

          return { completed: true, score: get().score, points };
        },

        /**
         * Resets durable progress and the streak while keeping the signed-in
         * user. The selected puzzle is cleared.
         */
        resetProgress: () => {
          const { user } = get();
          set({ ...createInitialState(), user });
        },
      }),
      {
        name,
        storage: createJSONStorage(() => safeStorage(storage)),
        version: 1,
        // Allow-list: only durable progress survives a reload. `user` and
        // `currentPuzzle` stay in memory.
        partialize: (state) => ({
          completedPuzzles: state.completedPuzzles,
          puzzleProgress: state.puzzleProgress,
          currentDifficulty: state.currentDifficulty,
          currentPuzzleIndex: state.currentPuzzleIndex,
          score: state.score,
          streak: state.streak,
        }),
      },
    ),
  );

const useGameStore = createGameStore();

export default useGameStore;
