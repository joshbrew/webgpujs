/** Internal resource leases. Native handles remain borrowed unless created by this library. */
export type DisposableGPUResource = GPUBuffer | GPUTexture;
export declare class ResourceScope {
    private slots;
    set<T extends DisposableGPUResource>(key: string, resource: T, owned?: boolean): T;
    release(key: string): void;
    dispose(): void;
}
export type ResourceRecord = {
    buffer?: GPUBuffer;
    texture?: GPUTexture;
    sampler?: GPUSampler;
    externalTexture?: GPUExternalTexture;
    values?: Record<string, unknown>;
};
/** Each linked resource stays alive until its last helper releases it. */
export declare class ResourceRegistry {
    readonly records: Map<string, ResourceRecord>;
    private scope;
    private owners;
    private references;
    attach(owner: object, resources: Iterable<string>): void;
    detach(owner: object): void;
    private collect;
    buffer(id: string, record: ResourceRecord, buffer: GPUBuffer, owned?: boolean): void;
    texture(id: string, record: ResourceRecord, texture: GPUTexture, owned?: boolean): void;
}
type DeviceState = {
    lost?: GPUDeviceLostInfo;
};
export declare function deviceState(device: GPUDevice): DeviceState;
export declare function assertDeviceAvailable(device: GPUDevice): void;
/** Hold all handles before a batch update, so swaps never destroy a later input mid-update. */
export declare function withResourceInputs<T>(values: Iterable<unknown>, operation: () => T): T;
export {};
