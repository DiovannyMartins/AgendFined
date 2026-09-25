"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { removeMember, setMemberRole } from "@/lib/team/actions";
import type { BusinessRole } from "@/lib/business/queries";

type Member = { user_id: string; role: BusinessRole };

export function TeamManagement({ userId, role, members }: { userId: string; role: BusinessRole; members: Member[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [memberId, setMemberId] = useState("");
  const [newRole, setNewRole] = useState<BusinessRole>("user");
  const [message, setMessage] = useState("");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    startTransition(async () => {
      const result = await setMemberRole(memberId.trim(), newRole);
      if (result.ok) { setMemberId(""); router.refresh(); }
      else setMessage(result.message);
    });
  }

  function remove(userIdToRemove: string) {
    if (!window.confirm("Remover este membro do negócio?")) return;
    setMessage("");
    startTransition(async () => {
      const result = await removeMember(userIdToRemove);
      if (result.ok) router.refresh();
      else setMessage(result.message);
    });
  }

  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">Equipe</h2>
      <p className="text-sm text-muted-foreground">Seu papel: {role}. Seu ID de usuário: <code className="break-all">{userId}</code></p>
      {role === "admin" && (
        <>
          <p className="text-sm text-muted-foreground">Peça ao membro para criar uma conta e compartilhar o ID exibido nesta página.</p>
          <form onSubmit={submit} className="flex flex-wrap gap-2">
            <Input aria-label="ID de usuário do membro" placeholder="ID de usuário do membro" value={memberId} onChange={(event) => setMemberId(event.target.value)} className="min-w-64 flex-1" required />
            <select aria-label="Papel" value={newRole} onChange={(event) => setNewRole(event.target.value as BusinessRole)} className="rounded-md border bg-background px-3">
              <option value="user">user · leitura</option>
              <option value="editor">editor · agenda e clientes</option>
              <option value="admin">admin · equipe e cobrança</option>
            </select>
            <Button type="submit" disabled={pending}>Salvar membro</Button>
          </form>
          <ul className="space-y-2">
            {members.map((member) => (
              <li key={member.user_id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
                <span className="break-all"><code>{member.user_id}</code> · {member.role}</span>
                <Button variant="outline" size="sm" onClick={() => remove(member.user_id)} disabled={pending}>Remover</Button>
              </li>
            ))}
          </ul>
        </>
      )}
      {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
    </section>
  );
}
