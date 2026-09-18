import { expect, test } from "@playwright/test";

test("landing page shows hero and CTAs", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1 }).filter({ hasText: "24 horas por dia" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Entrar" }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Como funciona", exact: true })).toBeVisible();
});

test("landing shows the two plans with price and privileges", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Dois planos para o seu negócio", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Grátis", { exact: true })).toBeVisible();
  await expect(page.getByText("R$ 0", { exact: true })).toBeVisible();
  await expect(page.getByText("PROFISSIONAL", { exact: true })).toBeVisible();
  await expect(page.getByText("R$ 1", { exact: true })).toBeVisible();
  await expect(page.getByText("Relatórios", { exact: true })).toBeVisible();
  await expect(page.getByText("Lembretes automáticos", { exact: true })).toBeVisible();
  await expect(page.getByText("Gestão da lista de espera", { exact: true })).toBeVisible();
  await expect(page.getByText("Exportação Google Calendar/.ics", { exact: true })).toBeVisible();
  const proCta = page.getByRole("link", { name: /Assinar PROFISSIONAL/i });
  await expect(proCta).toBeVisible();
  await expect(proCta).toHaveAttribute("href", "/cadastro");
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
  await expect(page.getByText("Comece a receber reservas grátis.")).toBeVisible();
  await page.goto("/privacidade");
  await expect(page.getByRole("heading", { name: "Política de Privacidade" })).toBeVisible();
  await page.goto("/termos");
  await expect(page.getByRole("heading", { name: "Termos de Uso" })).toBeVisible();
});

test("dashboard redirects to login when unauthenticated", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});
