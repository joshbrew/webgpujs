/** Event listeners for automatic mouse uniforms. They never replace application handlers. */
export class BuiltinInputs {
  mouseX = 0;
  mouseY = 0;
  clicked = 0;
  private removers: (() => void)[] = [];
  constructor(canvas?: HTMLCanvasElement | OffscreenCanvas) {
    const target: EventTarget =
      canvas || (typeof window !== "undefined" ? window : undefined);
    if (!target?.addEventListener)
      throw new Error(
        "Automatic pointer uniforms require an event-capable canvas or window",
      );
    const listen = (target: EventTarget, name: string, fn: EventListener) => {
      target.addEventListener(name, fn);
      this.removers.push(() => target.removeEventListener(name, fn));
    };
    listen(target, "pointermove", ((event: PointerEvent) => {
      this.mouseX = event.offsetX;
      this.mouseY = event.offsetY;
    }) as EventListener);
    listen(target, "pointerdown", (() => {
      this.clicked = 1;
    }) as EventListener);
    const release = () => {
      this.clicked = 0;
    };
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
      listen(target, name, release);
    if (typeof window !== "undefined" && target !== window)
      listen(window, "pointerup", release);
  }
  dispose() {
    for (const remove of this.removers) remove();
    this.removers = [];
  }
}

export function resolution(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  axis: "width" | "height",
) {
  if (canvas) return canvas[axis];
  if (typeof window !== "undefined")
    return axis === "width" ? window.innerWidth : window.innerHeight;
  throw new Error(
    "Automatic resolution uniforms require a canvas; use explicit dimension parameters for compute",
  );
}
