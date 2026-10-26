// Test data comes from the same validated master, never bundled in dist.
import { createSheetGas } from "./sheets.mjs";
export function bootstrapResult() {
  const r = createSheetGas().call({ op: "bootstrap", payload: {} });
  return { version: r.version, data: r.data };
}
export const DATASET = bootstrapResult().data.datasetId;

export const UUID = "68bc9177-bae2-4b17-ae17-b2cabf5cdf72";
export function mutation(op = "drawCharacter", payload = {}) {
  return {
    op,
    requestId: UUID,
    expectedVersion: 0,
    datasetId: DATASET,
    payload,
  };
}

export function scriptRunner(call, { fail = false } = {}) {
  const chain = {
    withSuccessHandler(fn) {
      this.success = fn;
      return this;
    },
    withFailureHandler(fn) {
      this.failure = fn;
      return this;
    },
    api(request) {
      const success = this.success,
        failure = this.failure;
      queueMicrotask(() => {
        if (fail) failure(new Error("PRIVATE_PROVIDER_MESSAGE"));
        else {
          try {
            success(call(request));
          } catch (error) {
            failure(error);
          }
        }
      });
    },
  };
  return { script: { run: chain } };
}
