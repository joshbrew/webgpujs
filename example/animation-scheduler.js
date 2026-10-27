/** One serialized animation loop, asleep when no visible preview needs work. */
export function createAnimationScheduler({
  requestFrame,
  cancelFrame,
  onState = () => {},
  onError = () => {},
}) {
  const items = new Set();
  let pending = null,
    ticking = false,
    paused = false,
    hidden = false;
  const runnable = (item) =>
    item.visible &&
    !item.failed &&
    !paused &&
    !hidden &&
    (item.continuous || item.dirty);
  function schedule() {
    if (pending !== null && ![...items].some(runnable)) {
      cancelFrame(pending);
      pending = null;
    }
    if (pending === null && !ticking && [...items].some(runnable))
      pending = requestFrame(tick);
  }
  function state(item) {
    onState(
      item,
      item.failed
        ? "error"
        : hidden
          ? "hidden"
          : paused
            ? "paused"
            : !item.visible
              ? "offscreen"
              : item.continuous
                ? "running"
                : item.dirty
                  ? "updating"
                  : "ready",
    );
  }
  async function tick(timestamp) {
    pending = null;
    ticking = true;
    try {
      for (const item of items) {
        if (!runnable(item)) continue;
        // Each preview owns a clock; time offscreen never advances it.
        if (item.lastTime !== null)
          item.time += Math.max(0, Math.min(timestamp - item.lastTime, 100));
        item.lastTime = timestamp;
        item.dirty = false;
        try {
          await item.frame(item.time);
          item.frames++;
        } catch (error) {
          item.failed = true;
          onError(error, item);
        }
        state(item);
      }
    } finally {
      ticking = false;
      schedule();
    }
  }
  function suspend(key, value) {
    if (key === "paused") paused = value;
    else hidden = value;
    for (const item of items) {
      item.lastTime = null;
      state(item);
    }
    schedule();
  }
  return {
    add(frame, { continuous = true, visible = false, context } = {}) {
      const item = {
        frame,
        continuous,
        visible,
        context,
        dirty: true,
        failed: false,
        time: 0,
        lastTime: null,
        frames: 0,
      };
      items.add(item);
      state(item);
      schedule();
      return item;
    },
    setVisible(item, visible) {
      if (item.visible !== visible) item.lastTime = null;
      item.visible = visible;
      state(item);
      schedule();
    },
    invalidate(item) {
      item.dirty = true;
      schedule();
    },
    setPaused: (value) => suspend("paused", value),
    setHidden: (value) => suspend("hidden", value),
  };
}
