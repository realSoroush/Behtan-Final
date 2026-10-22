type ScrollTarget = { style: { overflow: string } };
const locks = new WeakMap<ScrollTarget, { count: number; previous: string }>();

/** Nested dialogs can unmount in either order when a new sheet replaces them. */
export function acquireMemberScrollLock(target: ScrollTarget) {
  const state = locks.get(target) ?? { count: 0, previous: target.style.overflow };
  state.count += 1;
  locks.set(target, state);
  target.style.overflow = 'hidden';
  let released = false;
  return () => {
    if (released) return;
    released = true;
    state.count -= 1;
    if (state.count === 0) {
      target.style.overflow = state.previous;
      locks.delete(target);
    }
  };
}
