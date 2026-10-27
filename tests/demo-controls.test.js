import test from "node:test";
import assert from "node:assert/strict";
import {
  mountPointerControls,
  consumePointerPress,
} from "../example/shared/controls.js";

test("a press and release between frames applies once, while dragging stays active", () => {
  const canvas = new EventTarget();
  canvas.getBoundingClientRect = () => ({
    left: 10,
    top: 20,
    width: 200,
    height: 100,
  });
  canvas.setPointerCapture = () => {};
  const values = {};
  let invalidations = 0;
  mountPointerControls(
    canvas,
    { stateType: "grid" },
    values,
    () => invalidations++,
  );
  function send(type, x = 110, y = 45) {
    const event = new Event(type);
    Object.assign(event, { clientX: x, clientY: y, pointerId: 1 });
    canvas.dispatchEvent(event);
  }
  send("pointerdown");
  send("pointerup");
  send("lostpointercapture");
  assert.equal(values.down, false);
  assert.deepEqual(values.pointer, [0.5, 0.25]);
  assert.equal(
    consumePointerPress(values),
    true,
    "quick clicks survive until an update",
  );
  assert.equal(
    consumePointerPress(values),
    false,
    "the click is consumed exactly once",
  );
  send("pointerdown");
  assert.equal(consumePointerPress(values), true);
  send("pointermove", 170, 70);
  assert.equal(
    consumePointerPress(values),
    true,
    "held drags remain active on later frames",
  );
  assert.deepEqual(values.pointer, [0.8, 0.5]);
  send("pointercancel");
  assert.equal(consumePointerPress(values), false);
  assert.ok(invalidations >= 6);
});
