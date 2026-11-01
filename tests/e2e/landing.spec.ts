import { expect, test } from "@playwright/test";

test("landing page shows hero and CTAs", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1 }).filter({ hasText: "24 horas por dia" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Entrar" }).first()).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Do primeiro clique à reserva.", exact: true }),
  ).toBeVisible();
});

test("landing page exposes a usable keyboard skip link", async ({ page }) => {
  await page.goto("/");

  const skipLink = page.getByRole("link", { name: "Pular para o conteúdo" });
  await skipLink.focus();
  await expect(skipLink).toBeFocused();
  await skipLink.press("Enter");
  await expect(page.locator("#main-content")).toBeVisible();
});

test("landing shows the single plan with the teste grátis", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Um plano, tudo incluído.", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Plano AgendFined", exact: true })).toBeVisible();
  await expect(page.getByText("R$ 19,90", { exact: true })).toBeVisible();
  await expect(
    page.getByText("30 dias grátis, sem cartão · depois R$ 19,90/mês · cancele quando quiser", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Relatórios", { exact: true })).toBeVisible();
  await expect(page.getByText("Lembretes automáticos", { exact: true })).toBeVisible();
  await expect(page.getByText("Gestão da lista de espera", { exact: true })).toBeVisible();
  await expect(page.getByText("Exportação Google Calendar/.ics", { exact: true })).toBeVisible();
  await expect(page.getByText("Grátis", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/PROFISSIONAL/)).toHaveCount(0);
  const cta = page.locator("#planos").getByRole("link", { name: "Começar teste grátis" });
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute("href", "/cadastro");
});

test("landing footer Sobre link points to an existing section", async ({ page }) => {
  await page.goto("/");
  const aboutLink = page.getByRole("link", { name: "Sobre", exact: true });
  await expect(aboutLink).toHaveAttribute("href", "/#sobre");
  await aboutLink.click();
  await expect(page).toHaveURL(/\/#sobre$/);
  await expect(page.locator("#sobre")).toBeVisible();
});

test("auth and legal pages render", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText("Acesse seu painel do AgendFined.")).toBeVisible();
  await page.goto("/cadastro");
  await expect(page.getByText("Teste o AgendFined completo por 30 dias, grátis e sem cartão.")).toBeVisible();
  await page.goto("/privacidade");
  await expect(page.getByRole("heading", { name: "Política de Privacidade" })).toBeVisible();
  await page.goto("/termos");
  await expect(page.getByRole("heading", { name: "Termos de Uso" })).toBeVisible();
});

test("dashboard redirects to login when unauthenticated", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});
