import { describe, expect, it, vi } from 'vitest';
import { RunCoordinator } from '../../src/content/coordinator';
import type { FrameReport } from '../../src/shared/report';

const frame = (over: Partial<FrameReport> = {}): FrameReport => ({
  url: 'https://jobs.example.com/apply',
  title: 'Apply',
  isTop: true,
  ats: null,
  fields: [{ label: 'Email', kind: 'text', type: 'email', status: 'filled', required: true }],
  missing: [],
  durationMs: 5,
  ...over,
});

describe('RunCoordinator', () => {
  it('waits for every started frame, then merges their reports', () => {
    const onFinish = vi.fn();
    const c = new RunCoordinator(onFinish);
    c.started('r1', 'fill', [0, 7], false);
    expect(c.activeRun).toBe('r1');
    c.report('r1', 7, frame({ isTop: false, ats: 'Greenhouse' }));
    expect(onFinish).not.toHaveBeenCalled();
    c.report('r1', 0, frame());
    expect(onFinish).toHaveBeenCalledTimes(1);
    const [runId, report] = onFinish.mock.calls[0]!;
    expect(runId).toBe('r1');
    expect(report.filledCount).toBe(2);
    expect(report.ats).toBe('Greenhouse');
    expect(report.fields.map((f: { frameId: number }) => f.frameId)).toEqual([0, 7]);
    expect(c.activeRun).toBeNull();
  });

  it('handles reports that arrive before the run-started message', () => {
    const onFinish = vi.fn();
    const c = new RunCoordinator(onFinish);
    c.report('r2', 0, frame());
    expect(onFinish).not.toHaveBeenCalled();
    c.started('r2', 'verify', [0], true);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0]![1]).toMatchObject({ mode: 'verify', profileEmpty: true });
  });

  it('reports "no form" right away when no frame started', () => {
    const onFinish = vi.fn();
    new RunCoordinator(onFinish).started('r3', 'fill', [], false);
    expect(onFinish.mock.calls[0]![1].noForm).toBe(true);
  });

  it('carries a stopped run through to the merged report', () => {
    const onFinish = vi.fn();
    const c = new RunCoordinator(onFinish);
    c.started('r4', 'fill', [0], false);
    c.report('r4', 0, frame({ stopped: true }));
    expect(onFinish.mock.calls[0]![1].stopped).toBe(true);
  });
});
