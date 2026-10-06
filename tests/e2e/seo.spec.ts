import { expect, test } from "@playwright/test";

test("public SEO endpoints are available", async ({ page, request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.ok()).toBeTruthy();
  const robotsText = await robots.text();
  expect(robotsText).toContain("Sitemap: https://agendfined.com.br/sitemap.xml");
  expect(robotsText).toContain("Disallow: /dashboard/");
  expect(robotsText).toContain("Disallow: /*/confirmacao");

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBeTruthy();
  const sitemapText = await sitemap.text();
  expect(sitemapText).toContain("https://agendfined.com.br/");
  expect(sitemapText).toContain("https://agendfined.com.br/privacidade");

  await page.goto("/");
  await expect(page).toHaveTitle(/AgendFined/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    /Receba agendamentos online/,
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://agendfined.com.br",
  );
});

test("private auth route is marked noindex", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});
