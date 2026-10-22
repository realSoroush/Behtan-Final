import assert from 'node:assert/strict';
import { createFlowWave } from '../src/components/landing/flow-wave-renderer.ts';

// Exercise the actual renderer lifecycle without a GPU or a browser process.
class WindowEvents extends EventTarget {}
const windowEvents = new WindowEvents();
Object.assign(globalThis, { window: windowEvents, innerWidth: 390, innerHeight: 844, devicePixelRatio: 3 });
windowEvents.scrollY = 0;
const documentEvents = new EventTarget();
documentEvents.hidden = false;
documentEvents.documentElement = { scrollHeight: 5000 };
globalThis.document = documentEvents;
let sequence = 0;
const scheduled = new Map();
globalThis.requestAnimationFrame = callback => { const id = ++sequence; scheduled.set(id, callback); return id; };
globalThis.cancelAnimationFrame = id => scheduled.delete(id);
let draws = 0;
const drawing = { clearRect: () => draws++, beginPath() {}, arc() {}, fill() {} };
class Canvas extends EventTarget {
  hidden = false;
  width = 0;
  height = 0;
  dataset = {};
  getContext(type) { return type === '2d' ? drawing : null; }
}
const first = new Canvas(), second = new Canvas();
const reduced = createFlowWave(first, second, true);
assert.equal(first.hidden, true);
assert.equal(second.dataset.renderer, 'canvas2d');
assert.equal(second.width, 390);
assert.equal(second.height, 844);
assert.equal(scheduled.size, 0, 'Reduced motion must not run a continuous animation');
assert.ok(draws > 0, 'Reduced motion still renders a static surface');
reduced.setPaused(false);
assert.equal(scheduled.size, 1);
reduced.setPaused(false);
assert.equal(scheduled.size, 1, 'Resuming must never stack animation loops');
documentEvents.hidden = true;
documentEvents.dispatchEvent(new Event('visibilitychange'));
assert.equal(scheduled.size, 0, 'Hidden tabs must stop the animation');
documentEvents.hidden = false;
documentEvents.dispatchEvent(new Event('visibilitychange'));
assert.equal(scheduled.size, 1);
reduced.setPaused(true);
assert.equal(scheduled.size, 0);
globalThis.innerWidth = 1440;
windowEvents.dispatchEvent(new Event('resize'));
assert.equal(second.width, 1440);
reduced.dispose();
const afterDispose = draws;
windowEvents.dispatchEvent(new Event('resize'));
documentEvents.dispatchEvent(new Event('visibilitychange'));
assert.equal(draws, afterDispose, 'Unmount must remove drawing event listeners');
assert.equal(scheduled.size, 0);
const mountedAgain = createFlowWave(new Canvas(), new Canvas(), false);
assert.equal(scheduled.size, 1, 'Remount after auth navigation starts exactly one loop');
mountedAgain.dispose();
assert.equal(scheduled.size, 0);
console.log('✓ Wave fallback, reduced motion, visibility, resize, unmount and remount lifecycle passed.');
