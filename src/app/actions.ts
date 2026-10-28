"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { appOrigin, logout, requireActor } from "@/lib/owed/auth";
import { DomainError } from "@/lib/owed/domain";
import { createRoleFailure } from "@/lib/owed/role-form-state";
import type { CreateRoleState, RoleFormValues } from "@/lib/owed/role-form-state";
import { draftClosure, reviewClosure } from "@/lib/owed/closure-ai";
import { acceptInvite, approveRole, closeGuarantee, closeRole, closureContext, closureDraft, correctInvitationEmail, createRole, discardClosureDraft, flagGuarantee, fundRole, inviteCandidate, storeClosureDraft } from "@/lib/owed/roles";

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

export async function createRoleAction(_state: CreateRoleState, form: FormData): Promise<CreateRoleState> {
  const user = await requireActor();
  const values: RoleFormValues = {
    title: field(form, "title"),
    employerName: field(form, "employerName"),
    places: field(form, "capacity"),
    amount: field(form, "guaranteeUsd"),
    deadline: field(form, "deadline"),
  };
  let roleId: string;
  try {
    roleId = await createRole(user, {
      title: values.title,
      employerName: values.employerName,
      guaranteeCents: field(form, "guaranteeCents"),
      capacity: values.places,
      deadline: `${values.deadline}:00.000Z`,
    });
  } catch (error) {
    return createRoleFailure(error, values);
  }
  redirect(`/employer/roles/${roleId}`);
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

export async function correctInvitationAction(form: FormData): Promise<never> {
  const user = await requireActor();
  return action(async () => {
    const replacement = await correctInvitationEmail(user, id(form), field(form, "previousEmail"), field(form, "paypalEmail"));
    return `/employer/roles/${replacement.roleId}?invitation=${replacement.token}`;
  });
}

export async function acceptAction(form: FormData): Promise<never> {
  const user = await requireActor();
  return action(async () => { await acceptInvite(user, z.string().regex(/^[\w-]{43}$/).parse(field(form, "token"))); return "/candidate"; });
}

export async function logoutToInviteAction(form: FormData): Promise<never> {
  const token = z.string().regex(/^[\w-]{43}$/).parse(field(form, "token"));
  await logout();
  redirect(`/invite/${token}`);
}

export async function closeGuaranteeAction(form: FormData): Promise<never> {
  const user = await requireActor();
  return action(async () => {
    await closeGuarantee(user, id(form), { status: field(form, "status"),
      newDeadline: field(form, "newDeadline") ? `${field(form, "newDeadline")}:00.000Z` : undefined });
    return "/employer";
  });
}

const closureFields = (form: FormData) => ({ status: field(form, "status"),
  newDeadline: field(form, "newDeadline") ? `${field(form, "newDeadline")}:00.000Z` : undefined });

export async function draftClosureAction(form: FormData): Promise<never> {
  const user = await requireActor();
  return action(async () => {
    const guaranteeId = id(form);
    const ctx = await closureContext(user, guaranteeId, closureFields(form));
    const { message, review } = await draftClosure(ctx);
    await storeClosureDraft(user, guaranteeId, ctx, message, review);
    revalidatePath(`/employer/roles/${ctx.roleId}`);
    return `/employer/roles/${ctx.roleId}?draft=${guaranteeId}`;
  });
}

export async function sendClosureDraftAction(form: FormData): Promise<never> {
  const user = await requireActor();
  return action(async () => {
    const guaranteeId = id(form);
    const draft = await closureDraft(user, guaranteeId);
    if (!draft) throw new DomainError("Draft not found. Draft the message again.", 404);
    const message = z.string().trim().min(1).max(1200).parse(field(form, "message"));
    const ctx = await closureContext(user, guaranteeId, { status: draft.status, newDeadline: draft.new_deadline?.toISOString() });
    const checked = await reviewClosure(ctx, message);
    const unchanged = message === draft.message;
    const review = unchanged && draft.review.flags.length ? { ...checked, flags: [...new Set([...draft.review.flags, ...checked.flags])] } : checked;
    const acknowledged = field(form, "acknowledged") === "yes" && unchanged;
    if (review.blocking.length || (review.flags.length && !acknowledged)) {
      await storeClosureDraft(user, guaranteeId, ctx, message, review);
      revalidatePath(`/employer/roles/${ctx.roleId}`);
    return `/employer/roles/${ctx.roleId}?draft=${guaranteeId}`;
    }
    await closeGuarantee(user, guaranteeId, { status: ctx.status, newDeadline: ctx.newDeadline?.toISOString(), message }, review);
    return "/employer";
  });
}

export async function discardClosureDraftAction(form: FormData): Promise<never> {
  const user = await requireActor();
  return action(async () => `/employer/roles/${await discardClosureDraft(user, id(form))}`);
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
