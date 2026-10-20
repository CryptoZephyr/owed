import { notFound } from "next/navigation";
import { z } from "zod";
import { requireActor } from "@/lib/owed/auth";
import { query } from "@/lib/owed/db";
import { approveRoleAction } from "../../../../actions";

export default async function ApprovePage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ token?: string }>;
}) {
  const user = await requireActor();
  const { id } = await params;
  const { token } = await searchParams;
  if (!z.uuid().safeParse(id).success || !token) notFound();
  const role = (await query<{ title: string }>("select title from owed.roles where id=$1 and employer_id=$2 and order_id=$3", [id, user.id, token]))[0];
  if (!role) notFound();
  return <main><h1>Confirm the hold for {role.title}</h1><p>PayPal returned you to Owed. Confirm to authorize this role&apos;s hold. No candidate is charged now.</p>
    <form action={approveRoleAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="orderId" value={token} /><button type="submit">Authorize role hold</button></form>
  </main>;
}
