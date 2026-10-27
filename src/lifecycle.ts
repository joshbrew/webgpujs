/** Internal resource leases. Native handles remain borrowed unless created by this library. */
export type DisposableGPUResource = GPUBuffer | GPUTexture;
type Lease = { owned: boolean; users: number };
const leases = new WeakMap<DisposableGPUResource, Lease>();

export class ResourceScope {
  private slots = new Map<string, DisposableGPUResource>();

  set<T extends DisposableGPUResource>(
    key: string,
    resource: T,
    owned = false,
  ): T {
    const previous = this.slots.get(key);
    if (previous === resource) return resource;
    // Acquire first: the same allocation can move between slots without being destroyed.
    if (resource) {
      const lease = leases.get(resource) || { owned: false, users: 0 };
      lease.owned ||= owned;
      lease.users++;
      leases.set(resource, lease);
      this.slots.set(key, resource);
    } else this.slots.delete(key);
    if (previous) {
      const lease = leases.get(previous);
      if (lease && --lease.users === 0) {
        leases.delete(previous);
        if (lease.owned) previous.destroy();
      }
    }
    return resource;
  }

  release(key: string) {
    this.set(key, undefined);
  }
  dispose() {
    for (const key of this.slots.keys()) this.release(key);
  }
}

export type ResourceRecord = {
  buffer?: GPUBuffer;
  texture?: GPUTexture;
  sampler?: GPUSampler;
  externalTexture?: GPUExternalTexture;
  values?: Record<string, unknown>;
};

/** Each linked resource stays alive until its last helper releases it. */
export class ResourceRegistry {
  readonly records = new Map<string, ResourceRecord>();
  private scope = new ResourceScope();
  private owners = new Map<object, Set<string>>();
  private references = new Map<string, number>();

  attach(owner: object, resources: Iterable<string>) {
    const previous = this.owners.get(owner) || new Set<string>();
    const next = new Set(resources);
    this.owners.set(owner, next);
    for (const id of next)
      if (!previous.has(id))
        this.references.set(id, (this.references.get(id) || 0) + 1);
    for (const id of previous) if (!next.has(id)) this.collect(id);
  }
  detach(owner: object) {
    const previous = this.owners.get(owner);
    this.owners.delete(owner);
    for (const id of previous || []) this.collect(id);
  }
  private collect(id: string) {
    const count = (this.references.get(id) || 0) - 1;
    if (count > 0) {
      this.references.set(id, count);
      return;
    }
    this.references.delete(id);
    this.scope.release(id + ":buffer");
    this.scope.release(id + ":texture");
    this.records.delete(id);
  }
  buffer(id: string, record: ResourceRecord, buffer: GPUBuffer, owned = false) {
    record.buffer = this.scope.set(id + ":buffer", buffer, owned);
  }
  texture(
    id: string,
    record: ResourceRecord,
    texture: GPUTexture,
    owned = false,
  ) {
    record.texture = this.scope.set(id + ":texture", texture, owned);
  }
}

type DeviceState = { lost?: GPUDeviceLostInfo };
const devices = new WeakMap<GPUDevice, DeviceState>();
export function deviceState(device: GPUDevice): DeviceState {
  let state = devices.get(device);
  if (!state) {
    state = {};
    devices.set(device, state);
    device.lost?.then((info) => {
      state.lost = info;
    });
  }
  return state;
}
export function assertDeviceAvailable(device: GPUDevice) {
  const lost = deviceState(device).lost;
  if (lost)
    throw new Error(
      `WebGPU device lost (${lost.reason}): ${lost.message || "create pipelines with a new GPUDevice"}`,
    );
}

/** Hold all handles before a batch update, so swaps never destroy a later input mid-update. */
export function withResourceInputs<T>(
  values: Iterable<unknown>,
  operation: () => T,
): T {
  let scope: ResourceScope,
    index = 0;
  for (const value of values) {
    const candidate = value as { texture?: unknown; vertices?: unknown };
    for (const handle of [value, candidate?.texture, candidate?.vertices]) {
      const resource = handle as DisposableGPUResource;
      if (
        resource &&
        typeof resource.destroy === "function" &&
        (typeof (resource as GPUBuffer).mapAsync === "function" ||
          typeof (resource as GPUTexture).createView === "function")
      )
        (scope ||= new ResourceScope()).set(String(index++), resource);
    }
  }
  try {
    return operation();
  } finally {
    scope?.dispose();
  }
}
