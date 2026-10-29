import { describe, expect, it, vi } from 'vitest';
import { Panel } from '../../src/content/panel';
import { mergeFrameReports } from '../../src/shared/report';

function report(label: string) {
  return mergeFrameReports('fill', [
    {
      frameId: 3,
      report: {
        url: 'https://example.com',
        title: 'Apply',
        isTop: true,
        ats: 'Lever',
        fields: [
          {
            label: 'Email',
            kind: 'text',
            type: 'email',
            status: 'filled',
            required: true,
            detail: 'ada@example.com',
          },
        ],
        missing: [{ ref: 4, label, kind: 'textarea', required: true }],
        durationMs: 5,
      },
    },
  ]);
}

describe('in-page panel', () => {
  it('shows the button, results, and focuses missing fields on click', () => {
    const onFocus = vi.fn();
    const panel = new Panel({
      onFill: vi.fn(),
      onVerify: vi.fn(),
      onFocus,
      onStop: vi.fn(),
      onOpenOptions: vi.fn(),
    });
    panel.showButton();
    const root = document.getElementById('jobfill-host')!.shadowRoot!;
    expect(root.querySelector('.fab')?.textContent).toContain('Auto-Fill');

    panel.showReport(report('Why us?'));
    expect(root.querySelector('.chip')?.textContent).toBe('Lever');
    expect(root.querySelector('.stat.bad b')?.textContent).toBe('1');
    const item = root.querySelector<HTMLButtonElement>('.req li button')!;
    expect(item.textContent).toContain('Why us?');
    item.click();
    expect(onFocus).toHaveBeenCalledWith(3, 4);
  });

  it('renders page-supplied labels as text, never as HTML', () => {
    const panel = new Panel({
      onFill: vi.fn(),
      onVerify: vi.fn(),
      onFocus: vi.fn(),
      onStop: vi.fn(),
      onOpenOptions: vi.fn(),
    });
    panel.showReport(report('<img src=x onerror="alert(1)">'));
    const root = document.getElementById('jobfill-host')!.shadowRoot!;
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('.req li button')?.textContent).toContain('<img src=x');
  });

  it('shows errors and the running state', () => {
    const onFill = vi.fn();
    const panel = new Panel({
      onFill,
      onVerify: vi.fn(),
      onFocus: vi.fn(),
      onStop: vi.fn(),
      onOpenOptions: vi.fn(),
    });
    panel.showRunning('fill');
    const root = document.getElementById('jobfill-host')!.shadowRoot!;
    expect(root.querySelector('.running')?.textContent).toContain('Filling');
    panel.showError('Cannot run here');
    expect(root.querySelector('.note.error')?.textContent).toBe('Cannot run here');
    root.querySelector<HTMLButtonElement>('.btn.primary')!.click();
    expect(onFill).toHaveBeenCalled();
  });

  it('shows live progress of a paced fill and a working Stop button', () => {
    const onStop = vi.fn();
    const panel = new Panel({
      onFill: vi.fn(),
      onVerify: vi.fn(),
      onFocus: vi.fn(),
      onStop,
      onOpenOptions: vi.fn(),
    });
    panel.showRunning('fill');
    const root = document.getElementById('jobfill-host')!.shadowRoot!;
    const text = () => root.querySelector('.running')!.textContent;

    panel.showProgress({
      step: 3,
      total: 20,
      label: 'Email',
      phase: 'waiting',
      waitMs: 4200,
      etaMs: 300_000,
    });
    expect(text()).toContain('Field 3 of 20');
    expect(text()).toContain('Next: Email (in 4 s)');
    expect(text()).toContain('about 5 min left');

    panel.showProgress({ step: 3, total: 20, label: 'Email', phase: 'typing', etaMs: 30_000 });
    expect(text()).toContain('Typing: Email');
    expect(text()).toContain('less than a minute left');

    panel.showProgress({
      step: 1,
      total: 20,
      label: 'Resume/CV',
      action: 'upload',
      phase: 'typing',
      etaMs: null,
    });
    expect(text()).toContain('Uploading: Resume/CV');

    panel.showProgress({ step: 3, total: 20, label: 'Email', phase: 'paused', etaMs: null });
    expect(text()).toContain('Paused while this tab is in the background');

    const stop = root.querySelector<HTMLButtonElement>('.btn.stop')!;
    stop.click();
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(stop.disabled).toBe(true);
    expect(text()).toContain('Finishing the current field');
  });

  it('says when a run was stopped', () => {
    const panel = new Panel({
      onFill: vi.fn(),
      onVerify: vi.fn(),
      onFocus: vi.fn(),
      onStop: vi.fn(),
      onOpenOptions: vi.fn(),
    });
    panel.showReport({ ...report('Phone'), stopped: true });
    const root = document.getElementById('jobfill-host')!.shadowRoot!;
    expect(root.querySelector('.note')?.textContent).toMatch(/^Stopped\./);
  });
});
