import { expect, test, type Page } from "@playwright/test";
const user = "10000000-0000-4000-8000-000000000001";
const orgA = "20000000-0000-4000-8000-000000000001";
const orgB = "20000000-0000-4000-8000-000000000002";
// Browser flow tests intentionally stub the transport, NOT authorization.
// The real SQL suite checks authorization with non-superuser DB roles.
async function setup(
  page: Page,
  { allowed = true, role = "owner", two = false, empty = false } = {},
) {
  const organizations = empty
    ? []
    : [
        { id: orgA, name: "کلینیک آزمایشی", mode: "sandbox", status: "active" },
        ...(two
          ? [
              {
                id: orgB,
                name: "آزمایش دوم",
                mode: "sandbox",
                status: "active",
              },
            ]
          : []),
      ];
  const cases: Record<string, object[]> = { [orgA]: [], [orgB]: [] };
  const requestKeys: string[] = [];
  let failAfterCommit = false;
  await page.addInitScript(
    ({ user }) => {
      const payload = btoa(
        JSON.stringify({
          sub: user,
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      );
      localStorage.setItem(
        "sb-pro-test-auth-token",
        JSON.stringify({
          access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.test`,
          refresh_token: "synthetic",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          token_type: "bearer",
          user: { id: user, phone: "989000000000" },
        }),
      );
    },
    { user },
  );
  await page.route("https://pro-test.supabase.co/**", async (route) => {
    const url = new URL(route.request().url());
    const body = route.request().postDataJSON();
    let data: unknown = [];
    if (url.pathname.endsWith("/pro_pilot_status")) data = allowed;
    else if (url.pathname.endsWith("/pro_create_sandbox_organization")) {
      organizations.push({
        id: orgA,
        name: "کلینیک آزمایشی",
        mode: "sandbox",
        status: "active",
      });
      data = organizations[0];
    } else if (url.pathname.endsWith("/pro_create_sandbox_patient")) {
      const key = body.p_request_key;
      requestKeys.push(key);
      const list = cases[body.p_organization_id];
      if (!list.some((x: any) => x.id === key))
        list.push({
          id: key,
          organization_id: body.p_organization_id,
          case_code: `TEST-${key}`,
          created_at: "2026-10-19T12:00:00Z",
        });
      if (failAfterCommit) {
        failAfterCommit = false;
        await route.abort("failed");
        return;
      }
      data = list.find((x: any) => x.id === key);
    } else if (url.pathname.endsWith("/pro_organizations"))
      data = organizations;
    else if (url.pathname.endsWith("/pro_memberships"))
      data = organizations.map((o) => ({
        organization_id: o.id,
        user_id: user,
        roles: [role],
        status: "active",
      }));
    else if (url.pathname.endsWith("/pro_sandbox_patients"))
      data =
        cases[
          (url.searchParams.get("organization_id") || "").replace("eq.", "")
        ];
    await route.fulfill({ json: data });
  });
  return {
    requestKeys,
    failNextResponse: () => {
      failAfterCommit = true;
    },
    revoke: () => {
      allowed = false;
    },
  };
}
test("invited owner creates workspace and a synthetic case", async ({
  page,
}, testInfo) => {
  await setup(page, { empty: true });
  await page.goto("/");
  await page.getByRole("button", { name: "ساخت محیط آزمایش" }).click();
  await page
    .getByRole("button", { name: "پروندهٔ آزمایشی", exact: true })
    .click();
  await expect(page.getByText("مراجع مصنوعی", { exact: true })).toHaveCount(1);
  expect(
    await page
      .locator("body")
      .evaluate((el) => el.scrollWidth <= window.innerWidth),
  ).toBe(true);
  if (process.env.PRO_CAPTURE_QA === "true") {
    await page.screenshot({
      path: testInfo.outputPath("workspace-light.png"),
      fullPage: true,
    });
    await page.locator("html").evaluate((el) => el.classList.add("dark"));
    await page.screenshot({
      path: testInfo.outputPath("workspace-dark.png"),
      fullPage: true,
    });
  }
});
test("lost response then reload retry keeps request id and avoids duplicate", async ({
  page,
}) => {
  const transport = await setup(page);
  await page.goto("/");
  transport.failNextResponse();
  await page
    .getByRole("button", { name: "پروندهٔ آزمایشی", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "پروندهٔ آزمایشی", exact: true })
    .click();
  await expect(page.getByText("مراجع مصنوعی", { exact: true })).toHaveCount(1);
  expect(transport.requestKeys).toHaveLength(2);
  expect(transport.requestKeys[0]).toBe(transport.requestKeys[1]);
});
test("switching workspaces clears prior cases and revoked access clears workspace", async ({
  page,
}) => {
  const transport = await setup(page, { two: true });
  await page.goto("/");
  await page
    .getByRole("button", { name: "پروندهٔ آزمایشی", exact: true })
    .click();
  await expect(page.getByText("مراجع مصنوعی", { exact: true })).toHaveCount(1);
  await page
    .getByRole("combobox", { name: "انتخاب سازمان" })
    .selectOption(orgB);
  await expect(page.getByText("مراجع مصنوعی", { exact: true })).toHaveCount(0);
  transport.revoke();
  await page.getByRole("button", { name: "دریافت مجدد" }).click();
  await expect(page.getByText("دسترسی آزمایش لازم است")).toBeVisible();
  await expect(page.getByRole("combobox")).toHaveCount(0);
});
test("practitioner has no reception create action", async ({ page }) => {
  await setup(page, { role: "practitioner" });
  await page.goto("/");
  await expect(page.getByRole("combobox")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "پروندهٔ آزمایشی", exact: true }),
  ).toHaveCount(0);
});
test("verified session alone cannot enter an uninvited workspace", async ({
  page,
}) => {
  await setup(page, { allowed: false });
  await page.goto("/");
  await expect(page.getByText("دسترسی آزمایش لازم است")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "ساخت محیط آزمایش" }),
  ).toHaveCount(0);
});
