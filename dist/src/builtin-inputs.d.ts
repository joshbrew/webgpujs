/** Event listeners for automatic mouse uniforms. They never replace application handlers. */
export declare class BuiltinInputs {
    mouseX: number;
    mouseY: number;
    clicked: number;
    private removers;
    constructor(canvas?: HTMLCanvasElement | OffscreenCanvas);
    dispose(): void;
}
export declare function resolution(canvas: HTMLCanvasElement | OffscreenCanvas, axis: "width" | "height"): number;
