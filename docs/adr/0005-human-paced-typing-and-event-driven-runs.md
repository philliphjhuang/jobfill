# ADR 0005 — Human-paced typing and event-driven fill runs

- **Status:** Accepted
- **Date:** 2026-10-14

## Context

Users asked that a fill no longer appear instantly: text should be typed one character at a time
(0.1–0.9 s between characters) and moving to another field should take 3–7 s, like a person.

That turns a sub-second operation into one lasting several minutes (≈ 5–15 min for a typical
application; a 1,500-character cover letter alone adds ≈ 12 min at 0.5 s per character). Two
platform constraints follow:

1. **Service-worker lifetime.** Chrome terminates an extension service worker when a single event
   or API call takes longer than 5 minutes. The previous design had the worker `await` a
   `chrome.scripting.executeScript` call that resolved only when every frame had finished filling
   — a paced run would be killed before its report was shown or logged.
2. **Background-tab throttling.** Timers in hidden tabs are throttled (down to once per minute
   after a few minutes), which would stretch a paced fill to hours.

## Decision

- **Pacing in the engine.** A `Pacer` draws uniform random delays from user-configurable ranges
  (defaults 0.1–0.9 s per keystroke, 3–7 s per field; no pause before the first field). Fillers
  call it right before touching a field, so skipped or already-filled fields cost no time.
  `typeText` emits the full per-character event sequence so frameworks and input masks behave as
  with real typing. Pacing can be turned off in Settings (instant fill).
- **Event-driven runs.** The worker only starts runs (`__jobfill.start()` returns immediately) and
  relays messages. Frames send `FRAME_PROGRESS` and `FRAME_DONE`; a `RunCoordinator` in the top
  frame waits for every started frame (tolerating any message order), merges the reports and shows
  them; the top frame then sends `RUN_COMPLETE` for the application log. Every worker handler
  finishes in milliseconds.
- **Control.** The panel shows "Field N of M", the current action and a time estimate, and offers
  **Stop** (an `AbortSignal` checked at every pause). Stop completes a half-typed field at once,
  then the verification pass still runs. Typing waits while the tab is hidden.

## Consequences

- ✅ Fills look like a person typing, at the speed the user chose; long runs survive worker
  restarts and can be followed and stopped.
- ✅ The engine stays testable: delays are injectable, so tests assert the exact pause ranges and
  ordering without waiting.
- ❌ Paced fills take minutes; the user must keep the tab in front (it pauses otherwise).
- ❌ The popup can no longer show the final counts (the run outlives it); results are shown on the
  page instead.
- ❌ Synthetic keyboard events are still `isTrusted: false`; pacing changes timing, not trust.
