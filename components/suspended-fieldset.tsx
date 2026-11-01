import { cn } from "@/lib/utils";

// Wraps the painel forms a suspended negócio (ADR 0013) cannot use: a disabled
// fieldset disables every input and button inside it natively, so the forms
// stay visible (the dono sees the data) but read-only. The server and the
// database refuse the same writes; this only keeps the interface honest.
export function SuspendedFieldset({
  suspended,
  className,
  children,
}: {
  suspended: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset disabled={suspended} className={cn("min-w-0", suspended && "opacity-60", className)}>
      {children}
    </fieldset>
  );
}
