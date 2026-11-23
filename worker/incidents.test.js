
import { test } from "node:test";
import assert from "node:assert/strict";
import { processIncident } from "./incidents.js";

function createMockEnvironment() {
  const state = {
    incident: null,
    inserts: 0,
    updates: 0
  };

  const env = {
    DB: {
      prepare(sql) {
        return {
          values: [],

          bind(...values) {
            this.values = values;
            return this;
          },

          async first() {
            if (sql.includes("SELECT id") && sql.includes("FROM incidents")) {
              return state.incident && state.incident.status !== "resolved"
                ? { id: state.incident.id }
                : null;
            }
            throw new Error("Unexpected first() query");
          },

          async run() {
            if (sql.includes("INSERT INTO incidents")) {
              state.inserts++;
              state.incident = {
                id: state.inserts,
                organizationId: this.values[0],
                serviceId: this.values[1],
                title: this.values[2],
                severity: "high",
                status: "investigating"
              };
              return { success: true };
            }

            if (sql.includes("UPDATE incidents")) {
              state.updates++;
              if (state.incident?.id === this.values[0]) {
                state.incident.status = "resolved";
                state.incident.resolvedAt = true;
              }
              return { success: true };
            }

            throw new Error("Unexpected run() query");
          }
        };
      }
    }
  };

  return { env, state };
}

const service = { id: 7, name: "Test Service" };
const organizationId = 3;

test("creates an incident when a valid service fails", async () => {
  const { env, state } = createMockEnvironment();

  await processIncident(env, service, organizationId, true, "failure");

  assert.equal(state.inserts, 1);
  assert.equal(state.incident.status, "investigating");
  assert.equal(state.incident.severity, "high");
  assert.equal(state.incident.serviceId, service.id);
});

test("does not create duplicate active incidents", async () => {
  const { env, state } = createMockEnvironment();

  state.incident = {
    id: 1,
    status: "investigating"
  };

  await processIncident(env, service, organizationId, true, "failure");

  assert.equal(state.inserts, 0);
  assert.equal(state.incident.status, "investigating");
});

test("resolves an active incident after successful recovery", async () => {
  const { env, state } = createMockEnvironment();

  state.incident = {
    id: 1,
    status: "investigating"
  };

  await processIncident(env, service, organizationId, true, "success");

  assert.equal(state.updates, 1);
  assert.equal(state.incident.status, "resolved");
  assert.equal(state.incident.resolvedAt, true);
});

test("does not create incidents for rejected monitoring URLs", async () => {
  const { env, state } = createMockEnvironment();

  await processIncident(env, service, organizationId, false, "failure");

  assert.equal(state.inserts, 0);
  assert.equal(state.incident, null);
});
