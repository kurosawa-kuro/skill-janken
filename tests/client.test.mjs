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
      window.TextEncoder = TextEncoder;
      if (google) window.google = google;
    },
  });
}

test("game starts with one bootstrap and CSS companions, without asset or AI RPC", async () => {
  const gas = createGas({ services: { bootstrap: bootstrapResult } }),
    requests = [];
  const dom = page(
    gas,
    scriptRunner((r) => {
      requests.push(r.op);
      return gas.call(r);
    }),
  );
  try {
    await tick();
    assert.deepEqual(requests, ["bootstrap"]);
    assert.equal(dom.window.document.querySelectorAll("img").length, 0);
    assert.match(
      dom.window.document.querySelector("#view").textContent,
      /ひのこ/,
    );
    assert.equal(dom.window.document.querySelector("#summary").hidden, false);
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
    assert.equal(calls, before + 1); // one bootstrap only
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

test("battle selection stays local and only explicit confirmation sends one mutation", async () => {
  const requests = [],
    gas = createGas({ services: { bootstrap: bootstrapResult } }),
    google = scriptRunner(() => null);
  google.script.run.api = function (request) {
    requests.push(request);
    const success = this.success;
    if (request.op === "bootstrap")
      queueMicrotask(() => success(gas.call(request)));
    // Keep the mutation in flight to check the entire form's busy state.
  };
  const dom = page(gas, google);
  try {
    await tick();
    const doc = dom.window.document;
    doc.querySelector('[data-view="battle"]').click();
    assert.equal(doc.activeElement.id, "view-title");
    assert.equal(doc.querySelector("#character-C02").disabled, true);
    assert.equal(doc.querySelector("#battle-submit").disabled, true);
    doc.querySelector("#hand-rock").click();
    assert.equal(
      doc.querySelector("#hand-rock").getAttribute("aria-pressed"),
      "true",
    );
    assert.equal(doc.querySelector("#battle-submit").disabled, false);
    const skill = doc.querySelector('input[name="skill"][value="S02"]');
    skill.checked = true;
    skill.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    assert.equal(requests.length, 1);
    doc.querySelector("#battle-submit").click();
    doc.querySelector("#battle-submit").click();
    await tick();
    assert.equal(requests.length, 2);
    assert.equal(requests[1].op, "playRound");
    assert.deepEqual(JSON.parse(JSON.stringify(requests[1].payload)), {
      characterId: "C01",
      skillId: "S02",
      hand: "rock",
    });
    assert.equal(doc.querySelector("#battle-submit").disabled, true);
    assert.equal(doc.querySelector("#hand-paper").disabled, true);
    assert.equal(skill.disabled, true);
    assert.equal(doc.querySelector("#panel").getAttribute("aria-busy"), "true");
  } finally {
    dom.window.close();
  }
});
