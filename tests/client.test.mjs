import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createGas } from "./helpers/gas.mjs";
import {
  bootstrapResult,
  scriptRunner,
  mutation,
  UUID,
} from "./helpers/fixtures.mjs";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
function page(gas, google) {
  return new JSDOM(gas.render(), {
    url: "https://example.invalid",
    runScripts: "dangerously",
    beforeParse(window) {
      if (google) window.google = google;
    },
  });
}

test("asset loads through the allowed ID and decode failure restores the name", async () => {
  const requests = [];
  const gas = createGas({
    services: {
      bootstrap: bootstrapResult,
      getAsset: ({ assetId }) => ({
        data: {
          assetId,
          version: 1,
          mimeType: "image/webp",
          base64: "UklGRg==",
        },
      }),
    },
  });
  const dom = page(
    gas,
    scriptRunner((request) => {
      requests.push(request);
      return gas.call(request);
    }),
  );
  try {
    await tick();
    const img = dom.window.document.querySelector("#companion img");
    const name = dom.window.document.querySelector("#companion p");
    assert.equal(requests[1].payload.assetId, "A_C01");
    assert.equal(img.alt, "ひのこ");
    assert.equal(img.hidden, true);
    img.dispatchEvent(new dom.window.Event("load"));
    assert.equal(img.hidden, false);
    assert.equal(name.hidden, true);
    img.dispatchEvent(new dom.window.Event("error"));
    assert.equal(name.hidden, false);
    assert.equal(dom.window.document.querySelector("#companion img"), null);
    assert.equal(dom.window.document.querySelector("#summary").hidden, false);
  } finally {
    dom.window.close();
  }
});

test("unavailable assets keep the named fallback without retrying or hiding state", async () => {
  const gas = createGas({ services: { bootstrap: bootstrapResult } });
  let calls = 0;
  const dom = page(
    gas,
    scriptRunner((request) => {
      calls++;
      return gas.call(request);
    }),
  );
  try {
    await tick();
    assert.equal(calls, 2);
    assert.equal(
      dom.window.document.querySelector("#companion").textContent,
      "ひのこ",
    );
    assert.equal(dom.window.document.querySelector("#summary").hidden, false);
    assert.equal(dom.window.document.querySelector("#retry").hidden, true);
  } finally {
    dom.window.close();
  }
});

test("full mock bootstrap crosses the actual client/API boundary and renders as text", async () => {
  const result = bootstrapResult();
  result.data.player.displayName = '<img src=x onerror="window.injected=true">';
  const gas = createGas({
    services: {
      bootstrap: () => result,
      drawCharacter: () => ({ ...result, version: 1, replayed: true }),
    },
  });
  const dom = page(
    gas,
    scriptRunner((request) => gas.call(request)),
  );
  try {
    await tick();
    assert.equal(
      dom.window.document.querySelector("#status").textContent,
      "きろくをよめたよ",
    );
    assert.match(
      dom.window.document.querySelector("#summary").textContent,
      /<img/,
    );
    assert.equal(dom.window.document.querySelector("#summary img"), null);
    const response = await dom.window.App.api.call(mutation());
    assert.equal(response.version, 1);
    assert.equal(response.replayed, true);
    assert.equal(response.requestId, UUID);
  } finally {
    dom.window.close();
  }
});

test("business failure remains distinct and manual retry recovers without auto retry", async () => {
  const gas = createGas({ services: { bootstrap: bootstrapResult } });
  let fail = true,
    calls = 0;
  const dom = page(
    gas,
    scriptRunner((request) => {
      calls++;
      return fail
        ? {
            ok: false,
            requestId: null,
            error: {
              code: "DATA_INTEGRITY_ERROR",
              message: "PRIVATE",
              retryable: false,
              details: {},
            },
          }
        : gas.call(request);
    }),
  );
  try {
    await tick();
    assert.match(
      dom.window.document.querySelector("#status").textContent,
      /大人をよんでね/,
    );
    assert.equal(calls, 1);
    await assert.rejects(
      dom.window.App.api.bootstrap(),
      (error) =>
        error.kind === "business" && error.code === "DATA_INTEGRITY_ERROR",
    );
    assert.equal(
      dom.window.document.body.textContent.includes("PRIVATE"),
      false,
    );
    fail = false;
    const before = calls;
    dom.window.document.querySelector("#retry").click();
    dom.window.document.querySelector("#retry").click();
    await tick();
    assert.equal(calls, before + 2); // bootstrap + one optional asset request
    assert.equal(dom.window.document.querySelector("#summary").hidden, false);
  } finally {
    dom.window.close();
  }
});

test("transport failure masks exception text, including when GAS is unavailable", async () => {
  for (const google of [undefined, scriptRunner(() => null, { fail: true })]) {
    const dom = page(createGas(), google);
    try {
      await tick();
      await assert.rejects(
        dom.window.App.api.bootstrap(),
        (error) =>
          error.kind === "transport" &&
          error.code === "NETWORK_ERROR" &&
          !error.message.includes("PRIVATE"),
      );
      assert.equal(dom.window.document.querySelector("#retry").hidden, false);
      assert.equal(
        dom.window.document.querySelector("#panel").getAttribute("aria-busy"),
        "false",
      );
    } finally {
      dom.window.close();
    }
  }
});

test("loading state stays busy until RPC settles; malformed success is not shown", async () => {
  const callbacks = [];
  const google = scriptRunner(() => null);
  google.script.run.api = function () {
    callbacks.push(this.success);
  };
  const dom = page(createGas(), google);
  try {
    assert.equal(
      dom.window.document.querySelector("#panel").getAttribute("aria-busy"),
      "true",
    );
    assert.equal(dom.window.document.querySelector("#retry").disabled, true);
    callbacks[0]({ ok: true, replayed: false, data: {}, version: 0 });
    await tick();
    assert.equal(dom.window.document.querySelector("#summary").hidden, true);
    assert.equal(dom.window.document.querySelector("#retry").hidden, false);
  } finally {
    dom.window.close();
  }
});
