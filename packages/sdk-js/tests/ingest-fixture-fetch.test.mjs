import assert from "node:assert/strict";
import test from "node:test";

import {
  ApiHttpError,
  toApiResult,
} from "../src/client.ts";
import {
  IngestSearchClient,
  createIngestSearchClient,
} from "../src/ingestClient.ts";
import {
  baseUrlFromIngestFixtureBundle,
  createIngestFixtureClient,
  createIngestFixtureClientHarness,
  createIngestFixtureFetch,
  loadIngestFixtureBundle,
} from "../src/ingestFixtureFetch.ts";

test("loads the checked-in fixture bundle and derives the client base URL", () => {
  const bundle = loadIngestFixtureBundle();

  assert.equal(bundle.schemaVersion, "ingest-search-api-requests.v1");
  assert.equal(bundle.requests.length, 6);
  assert.equal(baseUrlFromIngestFixtureBundle(bundle), "http://127.0.0.1:7317/v1/");
});

test("serves matching fixture responses for every recorded request", async () => {
  const bundle = loadIngestFixtureBundle();
  const fetch = createIngestFixtureFetch(bundle);

  for (const entry of bundle.requests) {
    const response = await fetch(urlFor(bundle, entry), {
      method: entry.route.method,
      body: JSON.stringify(entry.request.body),
    });

    assert.equal(response.ok, true);
    assert.equal(response.status, entry.response.status);
    assert.equal(response.statusText, "OK");
    assert.equal(response.headers?.get("content-type"), "application/json");
    assert.deepEqual(await response.json(), entry.response.body);
    assert.equal(await response.text(), JSON.stringify(entry.response.body));
  }

  assert.deepEqual(
    fetch.calls.map((call) => [call.method, call.path, call.matchedRequestId, call.status]),
    bundle.requests.map((entry) => [
      entry.route.method,
      entry.route.path,
      entry.id,
      entry.response.status,
    ]),
  );
});

test("returns typed fixture errors for unmatched paths and methods", async () => {
  const bundle = loadIngestFixtureBundle();
  const fetch = createIngestFixtureFetch(bundle);

  const missingPath = await fetch("http://127.0.0.1:7317/v1/not-recorded", {
    method: "POST",
    body: JSON.stringify({ workspaceId: "wsp_ingest_demo" }),
  });
  const missingPathBody = await missingPath.json();

  assert.equal(missingPath.ok, false);
  assert.equal(missingPath.status, 404);
  assert.equal(missingPathBody.error.code, "ingest_fixture_request_not_found");
  assert.equal(missingPathBody.error.details.path, "/v1/not-recorded");

  const methodMismatch = await fetch("http://127.0.0.1:7317/v1/search/query", {
    method: "GET",
  });
  const methodMismatchBody = await methodMismatch.json();

  assert.equal(methodMismatch.status, 405);
  assert.equal(methodMismatchBody.error.code, "ingest_fixture_method_mismatch");
  assert.deepEqual(methodMismatchBody.error.details.allowedMethods, ["POST"]);
});

test("reports request body drift on matched routes", async () => {
  const bundle = loadIngestFixtureBundle();
  const fetch = createIngestFixtureFetch(bundle);
  const entry = fixtureRequest(bundle, "api_search_query");
  const body = structuredClone(entry.request.body);
  body.query = "different";

  const response = await fetch(urlFor(bundle, entry), {
    method: entry.route.method,
    body: JSON.stringify(body),
  });
  const responseBody = await response.json();

  assert.equal(response.status, 422);
  assert.equal(responseBody.error.code, "ingest_fixture_body_mismatch");
  assert.equal(responseBody.error.details.candidateRequestIds[0], "api_search_query");
  assert.match(responseBody.error.details.mismatches[0].mismatch, /query/);
  assert.equal(fetch.calls[0].matchedRequestId, undefined);
  assert.equal(fetch.calls[0].status, 422);
});

test("keeps fixture, response, clone, and call boundaries isolated", async () => {
  const sourceBundle = loadIngestFixtureBundle();
  const mutableBundle = structuredClone(sourceBundle);
  const entry = fixtureRequest(mutableBundle, "api_ingest_normalize");
  const fetch = createIngestFixtureFetch(mutableBundle);

  entry.response.body.normalizedText = "mutated after fetch creation";

  const response = await fetch(urlFor(sourceBundle, fixtureRequest(sourceBundle, "api_ingest_normalize")), {
    method: "POST",
    body: JSON.stringify(fixtureRequest(sourceBundle, "api_ingest_normalize").request.body),
  });
  const firstJson = await response.json();
  firstJson.normalizedText = "mutated response body";
  const secondJson = await response.json();
  const clonedJson = await response.clone().json();
  clonedJson.normalizedText = "mutated clone body";

  assert.equal(secondJson.normalizedText, fixtureRequest(sourceBundle, "api_ingest_normalize").response.body.normalizedText);
  assert.equal((await response.json()).normalizedText, fixtureRequest(sourceBundle, "api_ingest_normalize").response.body.normalizedText);
  assert.throws(
    () => {
      fetch.calls[0].status = 500;
    },
    TypeError,
  );
});

test("drives IngestSearchClient through fixture fetch without network access", async () => {
  const bundle = loadIngestFixtureBundle();
  const fetch = createIngestFixtureFetch(bundle);
  const client = createIngestSearchClient({
    baseUrl: baseUrlFromIngestFixtureBundle(bundle),
    fetch,
  });

  assert.equal(client instanceof IngestSearchClient, true);
  assert.deepEqual(
    await client.normalize(requestBody(bundle, "api_ingest_normalize")),
    responseBody(bundle, "api_ingest_normalize"),
  );
  assert.deepEqual(
    await client.ingestStructured(requestBody(bundle, "api_ingest_structured_csv")),
    responseBody(bundle, "api_ingest_structured_csv"),
  );
  assert.deepEqual(
    await client.scanRepository(requestBody(bundle, "api_ingest_repository_scan")),
    responseBody(bundle, "api_ingest_repository_scan"),
  );
  assert.deepEqual(
    await client.search(requestBody(bundle, "api_search_query")),
    responseBody(bundle, "api_search_query"),
  );
  assert.deepEqual(
    await client.createQuarantineCases(requestBody(bundle, "api_quarantine_cases")),
    responseBody(bundle, "api_quarantine_cases"),
  );
  assert.deepEqual(
    await client.decideQuarantineCase({
      caseId: "qtn_csv_beta_status",
      ...requestBody(bundle, "api_quarantine_decision"),
    }),
    responseBody(bundle, "api_quarantine_decision"),
  );

  assert.deepEqual(fetch.calls.map((call) => call.matchedRequestId), [
    "api_ingest_normalize",
    "api_ingest_structured_csv",
    "api_ingest_repository_scan",
    "api_search_query",
    "api_quarantine_cases",
    "api_quarantine_decision",
  ]);
});

test("builds clients and harnesses with fixture helpers", async () => {
  const bundle = loadIngestFixtureBundle();
  const harness = createIngestFixtureClientHarness(bundle);
  const client = createIngestFixtureClient(bundle);

  assert.equal(harness.client instanceof IngestSearchClient, true);
  assert.equal(harness.baseUrl, "http://127.0.0.1:7317/v1/");

  assert.deepEqual(
    await harness.client.search(requestBody(bundle, "api_search_query")),
    responseBody(bundle, "api_search_query"),
  );
  assert.deepEqual(
    await client.normalize(requestBody(bundle, "api_ingest_normalize")),
    responseBody(bundle, "api_ingest_normalize"),
  );
});

test("surfaces fixture drift as a client HTTP error", async () => {
  const bundle = loadIngestFixtureBundle();
  const driftedBundle = structuredClone(bundle);
  fixtureRequest(driftedBundle, "api_search_query").request.body.query = "different";
  const client = createIngestFixtureClient(driftedBundle);

  const result = await toApiResult(client.search(requestBody(bundle, "api_search_query")));

  assert.equal(result.ok, false);
  assert.equal(result.error instanceof ApiHttpError, true);
  assert.equal(result.error.status, 422);
  assert.equal(result.error.apiCode, "ingest_fixture_body_mismatch");
});

function fixtureRequest(bundle, id) {
  const entry = bundle.requests.find((request) => request.id === id);
  assert.notEqual(entry, undefined);
  return entry;
}

function requestBody(bundle, id) {
  return structuredClone(fixtureRequest(bundle, id).request.body);
}

function responseBody(bundle, id) {
  return structuredClone(fixtureRequest(bundle, id).response.body);
}

function urlFor(bundle, entry) {
  return new URL(entry.route.path, bundle.apiBase).href;
}
