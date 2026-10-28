import assert from "node:assert/strict";
import test from "node:test";
import { DomainError, roleInput } from "../src/lib/owed/domain";
import { createRoleFailure } from "../src/lib/owed/role-form-state";
import type { RoleFormValues } from "../src/lib/owed/role-form-state";

const values: RoleFormValues = {
  title: "",
  employerName: "Northwind Studio",
  places: "3",
  amount: "25",
  deadline: "2026-11-04T12:00",
};

test("role creation field errors name the role title and keep entered values", () => {
  const parsed = roleInput.safeParse({
    title: values.title,
    employerName: values.employerName,
    guaranteeCents: "2500",
    capacity: values.places,
    deadline: `${values.deadline}:00.000Z`,
  });
  assert.equal(parsed.success, false);
  if (parsed.success) return;

  const state = createRoleFailure(parsed.error, values);
  assert.deepEqual(state.errors, ["Enter the role title."]);
  assert.deepEqual(state.values, values);
});

test("role deadline errors use plain language and keep entered values", () => {
  const state = createRoleFailure(new DomainError("Choose a future deadline within 21 days.", 400), values);
  assert.deepEqual(state.errors, ["Choose a reply deadline within 21 days."]);
  assert.deepEqual(state.values, values);
});
