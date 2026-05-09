import { expect, test } from "@playwright/test";

test.describe("/demo demo-flow transplant", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test("loads the executive briefing shell", async ({ page }) => {
    await page.goto("/demo");

    await expect(
      page.getByRole("heading", { name: "Good afternoon, Brandon." }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Executive Briefing" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Audit Log" })).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Send the follow-up to Alex Morgan before noon.",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Approve & send/i }),
    ).toBeVisible();
  });

  test("opens a brief and can approve it into the audit log", async ({ page }) => {
    await page.goto("/demo");

    await page.getByRole("link", { name: /Expand/i }).click();
    await expect(
      page.getByRole("link", { name: /Back to Executive Briefing/i }),
    ).toBeVisible();
    await expect(
      page.getByText("SOURCE TRAIL", { exact: true }),
    ).toBeVisible();

    await page.getByRole("button", { name: /Approve & send/i }).click();
    await expect(
      page.getByRole("heading", { name: "Approve & send" }),
    ).toBeVisible();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^Approve & send$/i })
      .click();

    await expect(
      page.getByRole("heading", { name: "Audit Log" }),
    ).toBeVisible();
    await expect(page.getByText(/Alex Morgan/i).first()).toBeVisible();
  });
});
