"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { appOrigin, logout, requireActor } from "@/lib/owed/auth";
import { DomainError } from "@/lib/owed/domain";
import { acceptInvite, approveRole, closeGuarantee, closeRole, createRole, flagGuarantee, fundRole, inviteCandidate } from "@/lib/owed/roles";

const field = (form: FormData, key: string): string => String(form.get(key) ?? "");
const id = (form: FormData, key = "id"): string => z.uuid().parse(field(form, key));

async function action(run: () => Promise<string>): Promise<never> {
  let target: string;
  try { target = await run(); }
  catch (error) {
    if (error instanceof DomainError) target = `/?error=${encodeURIComponent(error.message)}`;
    else if (error instanceof z.ZodError) target = "/?error=Check+the+form+fields+and+try+again.";
    else throw new Error("Owed could not save this change. Try again or contact the operator.");
  }
  redirect(target);
}

export async function createRoleAction(form: FormData): Promise<never> {
  const user = await requireActor();
  return action(async () => {
    const roleId = await createRole(user, {
      title: field(form, "title"), employerName: field(form, "employerName"),
      guaranteeCents: field(form, "guaranteeCents"), capacity: field(form, "capacity"),
      deadline: `${field(form, "deadline")}:00.000Z`,
    });
    return `/employer/roles/${roleId}`;
  });
}

export async function fundRoleAction(form: FormData): Promise<never> {
  const user = await requireActor();
  return action(async () => { const roleId = id(form); await fundRole(user, roleId, appOrigin()); return `/employer/roles/${roleId}`; });
}

export async function approveRoleAction(form: FormData): Promise<never> {
  const user = await requireActor();
  return action(async () => { const roleId = id(form); await approveRole(user, roleId, field(form, "orderId")); return `/employer/roles/${roleId}`; });
}

export async function inviteAction(form: FormData): Promise<never> {
  const user = await requireActor();
  return action(async () => {
    const roleId = id(form);
    const token = await inviteCandidate(user, roleId, field(form, "label"), field(form, "paypalEmail"));
    return `/employer/roles/${roleId}?invitation=${token}`;
  });
}

export async function acceptAction(form: FormData): Promise<never> {
  const user = await requireActor();
  return action(async () => { await acceptInvite(user, z.string().regex(/^[\w-]{43}$/).parse(field(form, "token"))); return "/candidate"; });
}

export async function closeGuaranteeAction(form: FormData): Promise<never> {
  const user = await requireActor();
  return action(async () => {
    await closeGuarantee(user, id(form), { status: field(form, "status"),
      newDeadline: field(form, "newDeadline") ? `${field(form, "newDeadline")}:00.000Z` : undefined });
    return "/employer";
  });
}

export async function closeRoleAction(form: FormData): Promise<never> {
  const user = await requireActor();
  return action(async () => { const roleId = id(form); await closeRole(user, roleId); return `/employer/roles/${roleId}`; });
}

export async function flagAction(form: FormData): Promise<never> {
  const user = await requireActor();
  return action(async () => { await flagGuarantee(user, id(form)); return "/candidate"; });
}

export async function logoutAction(): Promise<never> { await logout(); redirect("/"); }
