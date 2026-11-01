/**
 * Decides what to do when a basemap tile fails. The fallback to bundled imagery is for a basemap that
 * does not work at all (key refused, service blocked or down), not for the occasional dropped tile on
 * a flaky connection: those are retried, and a few that still fail just stay blank until the next view.
 */
export const TILE_RETRIES = 2;
/** Failed tiles (after retries) with no tile ever loaded: the service is refusing or unreachable. */
export const FAIL_BEFORE_ANY_SUCCESS = 4;
/** Consecutive failed tiles after imagery had worked: the service went away mid-visit. */
export const CONSECUTIVE_FAILS_AFTER_SUCCESS = 24;

export type TileDecision = "retry" | "skip" | "fallback";

export class BasemapHealth {
  successes = 0;
  failedTiles = 0;
  consecutiveFails = 0;
  private done = false;

  tileLoaded(): void {
    this.successes++;
    this.consecutiveFails = 0;
  }

  /** `timesRetried` is how often this tile has already been retried (Cesium's TileProviderError). */
  tileFailed(timesRetried: number): TileDecision {
    if (this.done) return "skip";
    if (timesRetried < TILE_RETRIES) return "retry";
    this.failedTiles++;
    this.consecutiveFails++;
    const broken =
      (this.successes === 0 && this.failedTiles >= FAIL_BEFORE_ANY_SUCCESS) ||
      this.consecutiveFails >= CONSECUTIVE_FAILS_AFTER_SUCCESS;
    if (broken) {
      this.done = true;
      return "fallback";
    }
    return "skip";
  }
}
