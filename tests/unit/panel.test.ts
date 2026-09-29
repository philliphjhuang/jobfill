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
});
