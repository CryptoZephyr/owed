import { notFound } from "next/navigation";
import { z } from "zod";
import { requireActor } from "@/lib/owed/auth";
import { query } from "@/lib/owed/db";
import { money } from "@/lib/present";
import { formatDeadline } from "@/lib/format";
import { Button } from "@/components/Button";
import { Line, Receipt } from "@/components/Receipt";
import { PlainFooter } from "@/components/Footer";
import { approveRoleAction } from "../../../../actions";

export default async function ApprovePage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ token?: string }>;
}) {
  const user = await requireActor();
  const { id } = await params;
  const { token } = await searchParams;
  if (!z.uuid().safeParse(id).success || !token) notFound();
  const role = (await query<{ title: string; hold_cents: number; capacity: number; guarantee_cents: number; deadline: Date }>(
    "select title,hold_cents,capacity,guarantee_cents,deadline from owed.roles where id=$1 and employer_id=$2 and order_id=$3", [id, user.id, token]))[0];
  if (!role) notFound();
  return <>
    <main>
      <div className="page-head"><h1>Confirm the hold for {role.title}</h1>
        <p className="secondary measure">PayPal sent you back to Owed. Confirm to authorize the hold. No candidate is charged now.</p></div>
      <div className="stack-24" style={{ maxWidth: 560 }}>
        <Receipt label="Hold">
          <Line label="Places" value={role.capacity} />
          <Line label="Guarantee per place" value={money(role.guarantee_cents)} />
          <Line label="Reply due" value={formatDeadline(role.deadline)} />
          <Line label="Total hold" value={money(role.hold_cents)} total />
        </Receipt>
        <form action={approveRoleAction} className="actions"><input type="hidden" name="id" value={id} /><input type="hidden" name="orderId" value={token} />
          <Button>Authorize the hold</Button></form>
      </div>
    </main>
    <PlainFooter />
  </>;
}
