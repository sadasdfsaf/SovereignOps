import assert from "node:assert/strict";
import test from "node:test";

import {
  InMemoryDeviceEnrollmentRepository,
  findDeviceEnrollment,
  listActiveDevices,
  registerDevice,
  removeDevice,
  suspendDevice,
  updateDeviceLastSeen,
  validateDeviceEnrollmentInput,
} from "../src/devices.ts";
import {
  InMemoryInviteRepository,
  acceptInvite,
  createInvite,
  expireInvites,
  findInvite,
  hashInviteToken,
  isInviteExpired,
  redactInviteToken,
  validateInviteExpiration,
} from "../src/invites.ts";

const registeredAt = "2026-04-27T00:00:00.000Z";

function deviceInput(overrides = {}) {
  return {
    workspaceId: "wsp_alpha",
    deviceId: "dev_laptop",
    publicKeyRef: "keyref_alpha_laptop",
    displayName: "Laptop",
    registeredAt,
    ...overrides,
  };
}

function inviteInput(overrides = {}) {
  return {
    workspaceId: "wsp_alpha",
    inviteId: "inv_alpha",
    token: "invite-token-alpha-0001",
    createdAt: "2026-04-27T00:00:00.000Z",
    expiresAt: "2026-04-28T00:00:00.000Z",
    ...overrides,
  };
}

test("registers devices immutably and isolates workspaces", () => {
  const empty = [];
  const alpha = registerDevice(empty, deviceInput());
  const crossWorkspace = registerDevice(alpha, deviceInput({ workspaceId: "wsp_beta" }));
  const devices = registerDevice(
    crossWorkspace,
    deviceInput({ deviceId: "dev_tablet", publicKeyRef: "keyref_alpha_tablet", displayName: "Tablet" }),
  );

  assert.equal(empty.length, 0);
  assert.deepEqual(
    listActiveDevices(devices, "wsp_alpha").map((device) => device.deviceId),
    ["dev_laptop", "dev_tablet"],
  );
  assert.deepEqual(
    listActiveDevices(devices, "wsp_beta").map((device) => device.deviceId),
    ["dev_laptop"],
  );
  assert.throws(() => registerDevice(devices, deviceInput()), /already exists/);
});

test("validates device enrollment input and status transitions", () => {
  const validation = validateDeviceEnrollmentInput(
    deviceInput({ workspaceId: "alpha", lastSeenAt: "2026-04-26T23:00:00.000Z" }),
  );
  assert.equal(validation.ok, false);
  assert.equal(validation.issues.some((issue) => issue.path === "workspaceId"), true);
  assert.equal(validation.issues.some((issue) => issue.path === "lastSeenAt"), true);

  const devices = registerDevice([], deviceInput());
  const seen = updateDeviceLastSeen(
    devices,
    "wsp_alpha",
    "dev_laptop",
    "2026-04-27T00:05:00.000Z",
  );
  assert.equal(findDeviceEnrollment(devices, "wsp_alpha", "dev_laptop").lastSeenAt, registeredAt);
  assert.equal(
    findDeviceEnrollment(seen, "wsp_alpha", "dev_laptop").lastSeenAt,
    "2026-04-27T00:05:00.000Z",
  );

  const suspended = suspendDevice(seen, "wsp_alpha", "dev_laptop");
  assert.equal(findDeviceEnrollment(suspended, "wsp_alpha", "dev_laptop").status, "suspended");
  assert.deepEqual(listActiveDevices(suspended, "wsp_alpha"), []);
  assert.throws(
    () =>
      updateDeviceLastSeen(
        suspended,
        "wsp_alpha",
        "dev_laptop",
        "2026-04-27T00:06:00.000Z",
      ),
    /active devices/,
  );

  const removed = removeDevice(suspended, "wsp_alpha", "dev_laptop");
  assert.equal(findDeviceEnrollment(removed, "wsp_alpha", "dev_laptop").status, "removed");
  assert.throws(() => suspendDevice(removed, "wsp_alpha", "dev_laptop"), /removed devices/);
});

test("stores invite hashes and validates expiry timestamps", () => {
  const token = "invite-token-alpha-0001";
  const invites = createInvite([], inviteInput({ token }));
  const invite = findInvite(invites, "wsp_alpha", "inv_alpha");

  assert.equal(invite.tokenHash, hashInviteToken(token));
  assert.equal(Object.hasOwn(invite, "token"), false);
  assert.equal(redactInviteToken(token), "invi...0001");
  assert.equal(
    validateInviteExpiration({
      createdAt: "2026-04-28T00:00:00.000Z",
      expiresAt: "2026-04-27T00:00:00.000Z",
    }).ok,
    false,
  );
});

test("accepts invites by workspace and leaves matching ids in other workspaces pending", () => {
  const alphaToken = "invite-token-alpha-0001";
  const betaToken = "invite-token-beta-0001";
  const alpha = createInvite([], inviteInput({ token: alphaToken }));
  const invites = createInvite(
    alpha,
    inviteInput({
      workspaceId: "wsp_beta",
      token: betaToken,
    }),
  );

  const accepted = acceptInvite(invites, {
    workspaceId: "wsp_alpha",
    inviteId: "inv_alpha",
    token: alphaToken,
    acceptedAt: "2026-04-27T00:30:00.000Z",
    acceptedByDeviceId: "dev_laptop",
  });

  assert.equal(findInvite(accepted, "wsp_alpha", "inv_alpha").status, "accepted");
  assert.equal(findInvite(accepted, "wsp_alpha", "inv_alpha").acceptedByDeviceId, "dev_laptop");
  assert.equal(findInvite(accepted, "wsp_beta", "inv_alpha").status, "pending");
  assert.throws(
    () =>
      acceptInvite(invites, {
        workspaceId: "wsp_alpha",
        inviteId: "inv_alpha",
        token: "invite-token-wrong-0001",
        acceptedAt: "2026-04-27T00:30:00.000Z",
        acceptedByDeviceId: "dev_laptop",
      }),
    /does not match/,
  );
});

test("rejects expired invites and enforces single-use acceptance", () => {
  const expired = createInvite(
    [],
    inviteInput({
      inviteId: "inv_expired",
      token: "invite-token-expired-01",
      expiresAt: "2026-04-27T01:00:00.000Z",
    }),
  );

  assert.equal(
    isInviteExpired(
      findInvite(expired, "wsp_alpha", "inv_expired"),
      "2026-04-27T01:00:00.000Z",
    ),
    true,
  );
  assert.throws(
    () =>
      acceptInvite(expired, {
        workspaceId: "wsp_alpha",
        inviteId: "inv_expired",
        token: "invite-token-expired-01",
        acceptedAt: "2026-04-27T01:00:00.000Z",
        acceptedByDeviceId: "dev_laptop",
      }),
    /expired/,
  );
  assert.equal(
    findInvite(expireInvites(expired, "2026-04-27T01:00:00.000Z"), "wsp_alpha", "inv_expired")
      .status,
    "expired",
  );

  const acceptedOnce = acceptInvite(createInvite([], inviteInput()), {
    workspaceId: "wsp_alpha",
    inviteId: "inv_alpha",
    token: "invite-token-alpha-0001",
    acceptedAt: "2026-04-27T00:30:00.000Z",
    acceptedByDeviceId: "dev_laptop",
  });

  assert.throws(
    () =>
      acceptInvite(acceptedOnce, {
        workspaceId: "wsp_alpha",
        inviteId: "inv_alpha",
        token: "invite-token-alpha-0001",
        acceptedAt: "2026-04-27T00:31:00.000Z",
        acceptedByDeviceId: "dev_tablet",
      }),
    /single-use/,
  );
});

test("in-memory repositories clone state at their boundaries", () => {
  const devices = new InMemoryDeviceEnrollmentRepository();
  const registered = devices.register(deviceInput());
  registered.displayName = "Changed outside";
  assert.equal(devices.list("wsp_alpha")[0].displayName, "Laptop");

  const invites = createInvite([], inviteInput());
  const invite = findInvite(invites, "wsp_alpha", "inv_alpha");
  invite.status = "accepted";
  assert.equal(findInvite(invites, "wsp_alpha", "inv_alpha").status, "pending");

  const inviteRepo = new InMemoryInviteRepository();
  const created = inviteRepo.create(inviteInput({ inviteId: "inv_repo" }));
  created.status = "accepted";
  assert.equal(inviteRepo.list("wsp_alpha")[0].status, "pending");
});
