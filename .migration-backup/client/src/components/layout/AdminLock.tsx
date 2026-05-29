import { ReactNode } from "react";

interface AdminLockProps {
  children: ReactNode;
}

export function AdminLock({ children }: AdminLockProps) {
  return <>{children}</>;
}
