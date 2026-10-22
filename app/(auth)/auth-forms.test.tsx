import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SignupForm } from "./cadastro/signup-form";
import { LoginForm } from "./login/login-form";
import { ForgotPasswordForm } from "./recuperar-senha/forgot-password-form";
import { UpdatePasswordForm } from "./redefinir-senha/update-password-form";

vi.mock("@/lib/auth/actions", () => ({
  login: vi.fn(),
  signup: vi.fn(),
  requestPasswordReset: vi.fn(),
  resendSignupConfirmation: vi.fn(),
  updatePassword: vi.fn(),
}));
vi.mock("@/components/turnstile-widget", () => ({ TurnstileWidget: () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));

// Antes da hidratação o <form> é HTML puro: sem method, o navegador envia via
// GET e as credenciais vão parar na URL (histórico, logs da CDN, tela).
function serverRenderedForm(element: ReactElement) {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(element);
  const form = container.querySelector("form");
  if (!form) throw new Error("formulário não renderizado");
  return form;
}

describe("formulários de autenticação antes da hidratação", () => {
  it.each([
    ["login", <LoginForm key="login" />],
    ["cadastro", <SignupForm key="cadastro" />],
    ["recuperar senha", <ForgotPasswordForm key="recuperar" />],
    ["redefinir senha", <UpdatePasswordForm key="redefinir" />],
  ])("%s envia via POST, nunca pela URL", (_, element) => {
    expect(serverRenderedForm(element).getAttribute("method")).toBe("post");
  });
});
