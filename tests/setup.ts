import { afterEach } from 'vitest';
import { env } from '../src/engine/dom';

// jsdom has no layout engine: every element reports a 0x0 box.
env.layout = false;

afterEach(() => {
  if (typeof document === 'undefined') return; // node-environment tests
  document.body.replaceChildren();
  document.querySelectorAll('.demo-popup').forEach((n) => n.remove());
});
