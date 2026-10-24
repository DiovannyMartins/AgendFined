"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  beginTotpEnrollment,
  generateMfaRecoveryCodes,
  redeemMfaRecoveryCode,
  removeTotp,
  verifyTotp,
} from "@/lib/auth/actions";

export function MfaPanel({
  factorId,
  verified,
  recoveryCodesLeft,
  returnTo,
}: {
  factorId: string | null;
  verified: boolean;
  // null when the count could not be read; omitted outside the active state.
  recoveryCodesLeft?: number | null;
  returnTo: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [enrollment, setEnrollment] = useState<{ factorId: string; qrCode: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [activated, setActivated] = useState(false);
  const [removing, setRemoving] = useState(false);
  // Códigos de recuperação (#169): shown once, and the activation only
  // finishes after the dono says they were saved.
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [codesSaved, setCodesSaved] = useState(false);
  const [codesCopied, setCodesCopied] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [recovered, setRecovered] = useState(false);
  // The session stays aal2 after the factor is removed, so "active" needs both
  // a verified factor and the session level (#149).
  const active = Boolean(factorId) && verified;
  const challenge = Boolean(factorId) && !verified && !recovered;

  function enroll() {
    setError("");
    startTransition(async () => {
      const result = await beginTotpEnrollment();
      if (result.ok) setEnrollment(result.data);
      else setError(result.message);
    });
  }

  async function loadRecoveryCodes() {
    const result = await generateMfaRecoveryCodes();
    if (result.ok) {
      setRecoveryCodes(result.data.codes);
      setCodesSaved(false);
      setCodesCopied(false);
    } else setError(result.message);
  }

  function generateCodes() {
    setError("");
    startTransition(loadRecoveryCodes);
  }

  function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    startTransition(async () => {
      const result = await verifyTotp(enrollment?.factorId ?? factorId ?? "", code);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      // A new authenticator says so and hands over the códigos de recuperação
      // before moving on (#149, #169); answering the login challenge goes
      // straight back to where the owner was going. No refresh here: with
      // ?next= the page sends an aal2 session away, skipping the codes.
      if (enrollment) {
        setEnrollment(null);
        setCode("");
        setActivated(true);
        setRecovered(false);
        await loadRecoveryCodes();
        return;
      }
      router.push(returnTo);
      router.refresh();
    });
  }

  function finishCodes() {
    setRecoveryCodes(null);
    if (activated) router.push(returnTo);
    router.refresh();
  }

  async function copyCodes() {
    if (!recoveryCodes) return;
    try {
      await navigator.clipboard.writeText(recoveryCodes.join("\n"));
      setCodesCopied(true);
    } catch {
      setError("Não foi possível copiar. Anote os códigos manualmente.");
    }
  }

  function redeem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    startTransition(async () => {
      const result = await redeemMfaRecoveryCode(recoveryCode);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setRecovering(false);
      setRecoveryCode("");
      setRecovered(true);
      router.refresh();
    });
  }

  function remove() {
    if (!factorId) return;
    setError("");
    startTransition(async () => {
      const result = await removeTotp(factorId);
      setRemoving(false);
      if (result.ok) {
        setActivated(false);
        router.refresh();
      } else setError(result.message);
    });
  }

  const description = activated
    ? "Pronto: a partir de agora, o login também pede o código do aplicativo autenticador."
    : active
      ? "A autenticação em duas etapas está ativa nesta conta."
      : challenge
        ? recovering
          ? "Digite um dos códigos de recuperação que você guardou ao ativar o autenticador."
          : "Digite o código do aplicativo autenticador para continuar."
        : "Proteja sua conta com um aplicativo autenticador.";

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Autenticação em duas etapas</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {activated && (
          <div role="status" className="rounded-lg border border-emerald-600/30 bg-emerald-600/10 p-3 text-sm">
            <p className="font-medium">Autenticação em duas etapas ativada.</p>
          </div>
        )}
        {recovered && !factorId && !enrollment && !activated && (
          <div role="status" className="rounded-lg border border-amber-600/30 bg-amber-500/10 p-3 text-sm">
            Você entrou com um código de recuperação e a autenticação em duas etapas foi desativada. Ative um novo
            autenticador para proteger a conta outra vez.
          </div>
        )}
        {!factorId && !enrollment && !activated && <Button onClick={enroll} disabled={pending}>Ativar autenticador</Button>}
        {enrollment && (
          <div className="space-y-3">
            {/* QR code is generated by Supabase Auth and shown only to the account owner. */}
            <img src={enrollment.qrCode} alt="Código QR para configurar o autenticador" className="size-48 bg-white p-2" />
            <p className="text-sm">Ou digite esta chave no aplicativo: <code className="break-all">{enrollment.secret}</code></p>
          </div>
        )}
        {recoveryCodes ? (
          <div className="space-y-3 rounded-lg border p-4">
            <p className="text-sm font-medium">Guarde seus códigos de recuperação</p>
            <p className="text-sm text-muted-foreground">
              Se você perder o celular, cada código permite entrar uma vez e desativa o autenticador. Eles aparecem só
              agora: guarde num gerenciador de senhas ou em papel, longe do celular.
            </p>
            <ul aria-label="Códigos de recuperação" className="grid grid-cols-2 gap-2 font-mono text-sm">
              {recoveryCodes.map((recovery) => (
                <li key={recovery} className="rounded bg-muted px-2 py-1 text-center">{recovery}</li>
              ))}
            </ul>
            <Button type="button" variant="outline" size="sm" onClick={copyCodes}>
              {codesCopied ? "Códigos copiados!" : "Copiar códigos"}
            </Button>
            <div className="flex items-start gap-2 text-sm">
              <input
                id="recovery-codes-saved"
                type="checkbox"
                checked={codesSaved}
                onChange={(event) => setCodesSaved(event.target.checked)}
                className="mt-0.5 size-4 shrink-0"
              />
              <label htmlFor="recovery-codes-saved">Guardei os códigos de recuperação em um lugar seguro</label>
            </div>
            <Button type="button" onClick={finishCodes} disabled={!codesSaved}>
              Continuar
            </Button>
          </div>
        ) : (
          activated && !codesSaved && !pending && (
            <Button type="button" onClick={generateCodes}>Gerar códigos de recuperação</Button>
          )
        )}
        {active && !activated && !recoveryCodes && (
          <div className="space-y-3 rounded-lg border p-4 text-sm">
            <p className="font-medium">Códigos de recuperação</p>
            <p className="text-muted-foreground">
              {recoveryCodesLeft === 0
                ? "Você ainda não tem códigos de recuperação. Gere agora para não ficar sem acesso se perder o celular."
                : typeof recoveryCodesLeft === "number"
                  ? `${recoveryCodesLeft} ${recoveryCodesLeft === 1 ? "código de recuperação disponível" : "códigos de recuperação disponíveis"}. Gerar novos invalida os anteriores.`
                  : "Os códigos de recuperação permitem entrar se você perder o celular. Gerar novos invalida os anteriores."}
            </p>
            <Button type="button" variant="outline" onClick={generateCodes} disabled={pending}>
              {recoveryCodesLeft === 0 ? "Gerar códigos de recuperação" : "Gerar novos códigos"}
            </Button>
          </div>
        )}
        {active && !recoveryCodes && (
          <Button variant="outline" onClick={() => setRemoving(true)} disabled={pending}>
            Remover autenticador
          </Button>
        )}
        {(enrollment || (challenge && !recovering)) && (
          <form onSubmit={verify} className="space-y-3">
            <label htmlFor="totp-code" className="text-sm font-medium">Código de 6 dígitos</label>
            <Input id="totp-code" value={code} onChange={(event) => setCode(event.target.value.trim())} inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" required />
            <Button type="submit" disabled={pending}>{pending ? "Validando..." : "Confirmar código"}</Button>
          </form>
        )}
        {challenge && recovering && (
          <form onSubmit={redeem} className="space-y-3">
            <label htmlFor="recovery-code" className="text-sm font-medium">Código de recuperação</label>
            <Input id="recovery-code" value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="XXXXX-XXXXX" maxLength={16} required />
            <p className="text-xs text-muted-foreground">
              O código desativa a autenticação em duas etapas. Depois de entrar, ative um novo autenticador.
            </p>
            <Button type="submit" disabled={pending}>{pending ? "Validando..." : "Usar código de recuperação"}</Button>
          </form>
        )}
        {challenge && (
          <button
            type="button"
            onClick={() => {
              setError("");
              setRecovering(!recovering);
            }}
            className="block text-sm font-medium text-muted-foreground hover:text-foreground hover:underline"
          >
            {recovering ? "Usar o código do autenticador" : "Perdi o acesso ao autenticador"}
          </button>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </CardContent>
      {/* Same confirmation dialog as the other destructive actions (#149). */}
      <Dialog open={removing} onOpenChange={setRemoving}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover autenticador</DialogTitle>
            <DialogDescription>
              O login volta a pedir só e-mail e senha, e os códigos de recuperação deixam de valer. Você pode ativar
              outro autenticador depois.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={remove} disabled={pending}>
              {pending ? "Removendo..." : "Remover autenticador"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
