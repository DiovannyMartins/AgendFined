"use client";

import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { toggleService } from "@/lib/services/actions";

export function ServiceToggle({ id, name, isActive }: { id: string; name: string; isActive: boolean }) {
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
      // Every row has a switch; the name tells a screen reader which one.
      aria-label={`Ativar ${name}`}
    />
  );
}
