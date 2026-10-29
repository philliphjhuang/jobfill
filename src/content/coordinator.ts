/**
 * Lives in the top frame and assembles a run's result: the service worker
 * says which frames started (RUN_STARTED), each frame's report arrives as
 * FRAME_REPORT, and once every frame has reported the merged TabReport is
 * handed to `onFinish`. Messages may arrive in any order (a fast frame can
 * report before RUN_STARTED is delivered), so both sides are buffered.
 */
import type { RunMode } from '../shared/messages';
import { mergeFrameReports, type FrameReport, type TabReport } from '../shared/report';

interface RunState {
  mode?: RunMode;
  frameIds?: number[];
  profileEmpty: boolean;
  reports: Map<number, FrameReport>;
}

export class RunCoordinator {
  private readonly runs = new Map<string, RunState>();
  private active: string | null = null;

  constructor(private readonly onFinish: (runId: string, report: TabReport) => void) {}

  /** The run whose progress the panel should show. */
  get activeRun(): string | null {
    return this.active;
  }

  private state(runId: string): RunState {
    let s = this.runs.get(runId);
    if (!s) {
      s = { profileEmpty: false, reports: new Map() };
      this.runs.set(runId, s);
    }
    return s;
  }

  started(runId: string, mode: RunMode, frameIds: number[], profileEmpty: boolean): void {
    const s = this.state(runId);
    s.mode = mode;
    s.frameIds = frameIds;
    s.profileEmpty = profileEmpty;
    this.active = runId;
    this.maybeFinish(runId);
  }

  report(runId: string, frameId: number, report: FrameReport): void {
    this.state(runId).reports.set(frameId, report);
    this.maybeFinish(runId);
  }

  private maybeFinish(runId: string): void {
    const s = this.runs.get(runId);
    if (!s?.frameIds || !s.mode) return;
    if (!s.frameIds.every((id) => s.reports.has(id))) return;
    this.runs.delete(runId);
    if (this.active === runId) this.active = null;
    const merged = mergeFrameReports(
      s.mode,
      s.frameIds.map((frameId) => ({ frameId, report: s.reports.get(frameId) })),
      s.profileEmpty,
    );
    this.onFinish(runId, merged);
  }
}
