import type { Actor } from "@/lib/owed/domain";
import { logoutAction } from "@/app/actions";
import { Button } from "./Button";
import { HeaderNav } from "./HeaderNav";
import { Lockup } from "./Lockup";
import s from "./header.module.css";

export function Header({ user }: { user: Actor | null }) {
  return <header className={s.header}>
    <div className={s.inner}>
      <Lockup />
      <HeaderNav />
      {user && <div className={s.account}>
        <form action={logoutAction} className={s.signout}><span className={s.name}>{user.name}</span><Button variant="quiet">Sign out</Button></form>
      </div>}
    </div>
    <p className={s.sandbox}><span className={s.inner}>PayPal sandbox. No real money moves.</span></p>
  </header>;
}
