import assert from "node:assert/strict";

import {
  InMemoryLocalStore,
  createInMemoryLocalStore,
} from "../src/localStore.ts";

async function testPutGetAndWorkspaceScope() {
  const store = createInMemoryLocalStore();

  await store.put({
    workspaceId: "wsp_alpha",
    collection: "records",
    id: "shared",
    value: { title: "Alpha note", tags: ["one"] },
    updatedAt: "2026-04-27T00:00:00.000Z",
  });
  await store.put({
    workspaceId: "wsp_beta",
    collection: "records",
    id: "shared",
    value: { title: "Beta note", tags: ["two"] },
    updatedAt: "2026-04-27T00:00:01.000Z",
  });

  const alpha = await store.get({
    workspaceId: "wsp_alpha",
    collection: "records",
    id: "shared",
  });
  const beta = await store.get({
    workspaceId: "wsp_beta",
    collection: "records",
    id: "shared",
  });

  assert.equal(alpha?.value.title, "Alpha note");
  assert.equal(beta?.value.title, "Beta note");
  assert.equal(alpha?.updatedAt, "2026-04-27T00:00:00.000Z");
}

async function testListSeparatesCollectionsAndWorkspaces() {
  const store = new InMemoryLocalStore();

  await store.put({
    workspaceId: "wsp_alpha",
    collection: "events",
    id: "evt_1",
    value: { type: "created", objectId: "obj_one" },
  });
  await store.put({
    workspaceId: "wsp_alpha",
    collection: "records",
    id: "obj_one",
    value: { body: "First record" },
  });
  await store.put({
    workspaceId: "wsp_beta",
    collection: "events",
    id: "evt_2",
    value: { type: "created", objectId: "obj_two" },
  });

  const alphaEvents = await store.list({
    workspaceId: "wsp_alpha",
    collection: "events",
  });
  const alphaRecords = await store.list({
    workspaceId: "wsp_alpha",
    collection: "records",
  });

  assert.deepEqual(
    alphaEvents.map((entry) => entry.id),
    ["evt_1"],
  );
  assert.deepEqual(
    alphaRecords.map((entry) => entry.id),
    ["obj_one"],
  );
}

async function testDeleteIsScoped() {
  const store = createInMemoryLocalStore();

  await store.put({
    workspaceId: "wsp_alpha",
    collection: "records",
    id: "obj_shared",
    value: { body: "Alpha" },
  });
  await store.put({
    workspaceId: "wsp_beta",
    collection: "records",
    id: "obj_shared",
    value: { body: "Beta" },
  });

  assert.equal(
    await store.delete({
      workspaceId: "wsp_alpha",
      collection: "records",
      id: "obj_shared",
    }),
    true,
  );
  assert.equal(
    await store.delete({
      workspaceId: "wsp_alpha",
      collection: "records",
      id: "obj_shared",
    }),
    false,
  );

  assert.equal(
    await store.get({
      workspaceId: "wsp_alpha",
      collection: "records",
      id: "obj_shared",
    }),
    undefined,
  );
  assert.equal(
    (
      await store.get({
        workspaceId: "wsp_beta",
        collection: "records",
        id: "obj_shared",
      })
    )?.value.body,
    "Beta",
  );
}

async function testDefensiveCopies() {
  const store = createInMemoryLocalStore();
  const source = { nested: { count: 1 }, list: ["first"] };

  const saved = await store.put({
    workspaceId: "wsp_alpha",
    collection: "records",
    id: "obj_copy",
    value: source,
  });

  source.nested.count = 2;
  source.list.push("source-change");
  saved.value.nested.count = 3;
  saved.value.list.push("saved-change");

  const firstRead = await store.get({
    workspaceId: "wsp_alpha",
    collection: "records",
    id: "obj_copy",
  });
  assert.equal(firstRead?.value.nested.count, 1);
  assert.deepEqual(firstRead?.value.list, ["first"]);

  firstRead.value.nested.count = 4;
  firstRead.value.list.push("read-change");

  const secondRead = await store.get({
    workspaceId: "wsp_alpha",
    collection: "records",
    id: "obj_copy",
  });
  assert.equal(secondRead?.value.nested.count, 1);
  assert.deepEqual(secondRead?.value.list, ["first"]);

  const listed = await store.list({
    workspaceId: "wsp_alpha",
    collection: "records",
  });
  listed[0].value.nested.count = 5;

  const afterListMutation = await store.get({
    workspaceId: "wsp_alpha",
    collection: "records",
    id: "obj_copy",
  });
  assert.equal(afterListMutation?.value.nested.count, 1);
}

async function testValidation() {
  const store = createInMemoryLocalStore();

  await assert.rejects(
    () =>
      store.put({
        workspaceId: "alpha",
        collection: "records",
        id: "obj_bad",
        value: { body: "Invalid scope" },
      }),
    /workspaceId/,
  );
  await assert.rejects(
    () =>
      store.put({
        workspaceId: "wsp_alpha",
        collection: "records",
        id: "   ",
        value: { body: "Invalid id" },
      }),
    /id is required/,
  );
}

await testPutGetAndWorkspaceScope();
await testListSeparatesCollectionsAndWorkspaces();
await testDeleteIsScoped();
await testDefensiveCopies();
await testValidation();

console.log("localStore tests passed");
