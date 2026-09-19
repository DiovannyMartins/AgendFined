"use client";

import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { toggleService } from "@/lib/services/actions";

export function ServiceToggle({ id, isActive }: { id: string; isActive: boolean }) {
  const [checked, setChecked] = useState(isActive);
  const [, startTransition] = useTransition();

  return (
    <Switch
      checked={checked}
      onCheckedChange={(next) => {
        setChecked(next);
        startTransition(() => {
          void toggleService(id, next);
        });
      }}
      aria-label="Ativar serviço"
    />
  );
}
