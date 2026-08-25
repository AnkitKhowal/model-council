import assert from "node:assert/strict";
import test from "node:test";

process.env.DEMO_MODE = "false";
delete process.env.DIGITALOCEAN_INFERENCE_KEY;

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("gateway-fallback-test", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

function request(path, body) {
  return worker.fetch(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("missing live selector credentials degrade to transparent routing rules", async () => {
  const response = await request("/api/recommend", {
    prompt: "Design an API and analyze its production security tradeoffs.",
  });
  assert.equal(response.status, 200);

  const recommendation = await response.json();
  assert.equal(recommendation.mode, "live");
  assert.equal(recommendation.method, "rules");
  assert.match(recommendation.notice, /unavailable.*routing rules/i);
  assert.equal(recommendation.selections.length, 3);
  assert.equal(new Set(recommendation.selections.map((selection) => selection.modelId)).size, 3);
});
