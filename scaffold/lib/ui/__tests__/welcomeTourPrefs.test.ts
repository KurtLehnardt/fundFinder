import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasSeenWelcomeTour,
  markWelcomeTourSeen,
  shouldStartWelcomeTour,
} from '../welcomeTourPrefs';

/**
 * Welcome guide "show at most once ever per browser" contract. The storage
 * calls degrade to their SSR/no-window fallback under node:test (no `window`
 * global, same posture as lib/sidebar/__tests__/sidebarPrefs.test.ts) — those
 * assertions cover the never-throw guarantee. shouldStartWelcomeTour is the
 * pure decision function the component's start effect calls, so it's exercised
 * exhaustively here without mocking storage, DOM, or React.
 */
describe('welcomeTourPrefs', () => {
  test('hasSeenWelcomeTour never throws and defaults to false without window', () => {
    assert.equal(hasSeenWelcomeTour(), false);
  });

  test('markWelcomeTourSeen never throws without window (SSR no-op)', () => {
    assert.doesNotThrow(() => markWelcomeTourSeen());
  });

  describe('shouldStartWelcomeTour', () => {
    test('starts once auth has resolved, on a fresh mount, when never seen', () => {
      assert.equal(
        shouldStartWelcomeTour({ loading: false, started: false, seen: false }),
        true,
      );
    });

    test('waits for auth to resolve', () => {
      assert.equal(
        shouldStartWelcomeTour({ loading: true, started: false, seen: false }),
        false,
      );
    });

    test('does not restart within the same mount once already started', () => {
      assert.equal(
        shouldStartWelcomeTour({ loading: false, started: true, seen: false }),
        false,
      );
    });

    test('never starts again once this browser has already seen it', () => {
      assert.equal(
        shouldStartWelcomeTour({ loading: false, started: false, seen: true }),
        false,
      );
    });

    test('signing in after seeing it while signed out does not re-show it: seen wins even on a fresh mount', () => {
      // Simulates the post-OAuth-redirect remount: a brand-new component
      // instance (started: false) after the guide was already marked seen
      // pre-redirect. The localStorage flag alone must block the restart.
      assert.equal(
        shouldStartWelcomeTour({ loading: false, started: false, seen: true }),
        false,
      );
    });

    test('seen + started + loading all block regardless of combination', () => {
      const combos = [
        { loading: true, started: true, seen: true },
        { loading: true, started: false, seen: true },
        { loading: true, started: true, seen: false },
        { loading: false, started: true, seen: true },
      ];
      for (const state of combos) {
        assert.equal(shouldStartWelcomeTour(state), false, JSON.stringify(state));
      }
    });
  });
});
