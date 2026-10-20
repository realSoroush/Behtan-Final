import { expect, test, type Page } from "@playwright/test";
const user = "10000000-0000-4000-8000-000000000001",
  org = "20000000-0000-4000-8000-000000000001",
  record = "30000000-0000-4000-8000-000000000001";
const base = {
  gender: "female",
  birth_date: "1992-04-23",
  height_cm: 155,
  weight_kg: 85,
  goal: "weight_loss",
  activity_level: "sedentary",
  workout_days: 0,
  training_type: "none",
  protein_budget: "economic",
  vegetarian_status: "none",
  allergies: [],
  medical_conditions: [],
  pregnancy_status: "not_pregnant",
  eating_disorder_status: "none",
  medications_present: false,
  injuries_present: false,
  safety_confirmed: true,
  screening_version: 1,
};
async function setup(
  page: Page,
  { role = "owner", clinical = true, empty = false, needsSetup = false } = {},
) {
  let allowed = true,
    failSave = false,
    staleSave = false,
    invalidSave = false,
    assigned = clinical && !needsSetup,
    processing = clinical && !needsSetup;
  const records = empty
    ? []
    : [
        {
          id: record,
          organization_id: org,
          case_code: "CASE-SYNTHETIC-001",
          created_at: "2026-10-20T10:00:00Z",
        },
      ];
  const history: any[] =
    clinical && !needsSetup
      ? [
          {
            revision: 1,
            answers: { ...base },
            recorded_at: "2026-10-20T10:00:00Z",
            recorded_by: user,
          },
        ]
      : [];
  const keys: string[] = [];
  const saved = new Map<string, any>();
  await page.addInitScript(
    ({ user }) => {
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const payload = btoa(JSON.stringify({ sub: user, exp }));
      localStorage.setItem(
        "sb-pro-test-auth-token",
        JSON.stringify({
          access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.test`,
          refresh_token: "synthetic",
          expires_at: exp,
          token_type: "bearer",
          user: { id: user, phone: "989000000000" },
        }),
      );
    },
    { user },
  );
  await page.route("https://pro-test.supabase.co/**", async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname,
      body = route.request().postDataJSON();
    let data: unknown = [];
    if (path.endsWith("/pro_pilot_status")) data = allowed;
    else if (path.endsWith("/pro_organizations"))
      data = allowed
        ? [
            {
              id: org,
              name: "کلینیک آزمایشی",
              mode: "sandbox",
              status: "active",
            },
          ]
        : [];
    else if (path.endsWith("/pro_memberships"))
      data = [
        {
          organization_id: org,
          user_id: user,
          roles: role === "owner" ? ["owner", "practitioner"] : [role],
          status: "active",
        },
      ];
    else if (path.endsWith("/pro_case_records")) data = records;
    else if (path.endsWith("/pro_create_case")) {
      records.push({
        id: record,
        organization_id: org,
        case_code: "CASE-SYNTHETIC-001",
        created_at: "2026-10-20T10:00:00Z",
      });
      data = records[0];
    } else if (path.endsWith("/pro_case_access")) {
      if (!allowed) {
        await route.fulfill({
          status: 403,
          json: { message: "PRO_ACCESS_DENIED" },
        });
        return;
      }
      data = {
        can_edit: clinical && assigned && processing,
        can_manage: role === "owner",
        has_processing: processing,
      };
    } else if (path.endsWith("/pro_case_assignments"))
      data = assigned ? [{ practitioner_id: user, status: "active" }] : [];
    else if (
      path.endsWith("/pro_case_permission_events") ||
      path.endsWith("/pro_case_permission_summary")
    )
      data = processing
        ? [
            {
              id: "consent-1",
              purpose: "processing",
              decision: "grant",
              expires_at: "2099-01-01T00:00:00Z",
              sequence: 1,
              occurred_at: "2026-10-20T10:00:00Z",
            },
          ]
        : [];
    else if (path.endsWith("/pro_assign_case")) {
      assigned = body.p_active;
      data = null;
    } else if (path.endsWith("/pro_simulate_case_permission")) {
      if (body.p_purpose === "processing")
        processing = body.p_decision === "grant";
      data = null;
    } else if (path.endsWith("/pro_intake_revisions"))
      data = clinical && allowed && processing && assigned ? history : [];
    else if (path.endsWith("/pro_save_intake")) {
      keys.push(body.p_key);
      if (invalidSave) {
        invalidSave = false;
        await route.fulfill({
          status: 400,
          json: { message: "PRO_INVALID_INTAKE" },
        });
        return;
      }
      if (staleSave) {
        staleSave = false;
        await route.fulfill({
          status: 409,
          json: { message: "PRO_STALE_REVISION" },
        });
        return;
      }
      if (!saved.has(body.p_key)) {
        const revision = {
          revision: history.length + 1,
          answers: body.p_answers,
          recorded_at: "2026-10-20T11:00:00Z",
          recorded_by: user,
        };
        saved.set(body.p_key, revision);
        history.unshift(revision);
      }
      if (failSave) {
        failSave = false;
        await route.abort("failed");
        return;
      }
      data = saved.get(body.p_key);
    }
    await route.fulfill({ json: data });
  });
  return {
    history,
    keys,
    failNext: () => {
      failSave = true;
    },
    invalidNext: () => {
      invalidSave = true;
    },
    staleNext: () => {
      staleSave = true;
    },
    revokeClinical: () => {
      assigned = false;
    },
    revoke: () => {
      allowed = false;
    },
  };
}
async function enter(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "پرونده‌ها و اطلاعات ورودی", exact: true })
    .click();
}
async function open(page: Page) {
  await enter(page);
  await page.getByRole("button", { name: "بازکردن پرونده" }).click();
}
async function editWeight(page: Page, weight = "84") {
  await page.getByRole("spinbutton", { name: "وزن (کیلوگرم)" }).fill(weight);
  await page.getByRole("tab", { name: "ایمنی پزشکی" }).click();
  await page
    .getByRole("checkbox", {
      name: "پاسخ‌های ایمنی این سناریوی مصنوعی را بررسی کردم.",
    })
    .check();
}
test("case form saves a new immutable revision and history is read-only", async ({
  page,
}, testInfo) => {
  const state = await setup(page);
  await open(page);
  await editWeight(page);
  await page.getByRole("button", { name: "ذخیرهٔ اطلاعات آزمایشی" }).click();
  await expect(page.getByText("نسخهٔ جدید ذخیره شد.")).toBeVisible();
  expect(state.history).toHaveLength(2);
  expect(state.history[1].answers.weight_kg).toBe(85);
  if (process.env.PRO_CAPTURE_QA === "true") {
    await page.screenshot({
      path: testInfo.outputPath("case-light.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "تغییر به تم تیره" }).click();
    await page.screenshot({
      path: testInfo.outputPath("case-dark.png"),
      fullPage: true,
    });
  }
  await page
    .getByRole("combobox", { name: "تاریخچهٔ اطلاعات" })
    .selectOption("1");
  await expect(
    page.getByRole("spinbutton", { name: "وزن (کیلوگرم)" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("spinbutton", { name: "وزن (کیلوگرم)" }),
  ).toHaveValue("85");
  expect(
    await page
      .locator("body")
      .evaluate((el) => el.scrollWidth <= window.innerWidth),
  ).toBe(true);
});
test("network loss retains the same save request, no duplicate revision", async ({
  page,
}) => {
  const state = await setup(page);
  await open(page);
  await editWeight(page);
  state.failNext();
  await page.getByRole("button", { name: "ذخیرهٔ اطلاعات آزمایشی" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "تلاش مجدد همان ذخیره" }).click();
  await expect(page.getByText("نسخهٔ جدید ذخیره شد.")).toBeVisible();
  expect(state.keys).toHaveLength(2);
  expect(state.keys[0]).toBe(state.keys[1]);
  expect(state.history).toHaveLength(2);
});
test("stale update fails visibly and requires loading latest before editing", async ({
  page,
}) => {
  const state = await setup(page);
  await open(page);
  await editWeight(page);
  state.staleNext();
  await page.getByRole("button", { name: "ذخیرهٔ اطلاعات آزمایشی" }).click();
  await expect(page.getByRole("alert")).toContainText("بازنویسی نشد");
  expect(state.history).toHaveLength(1);
  await page
    .getByRole("button", { name: "دریافت آخرین نسخه", exact: true })
    .click();
  await expect(
    page.getByRole("spinbutton", { name: "وزن (کیلوگرم)" }),
  ).toHaveValue("85");
});
test("assistant can create a reception record but cannot open clinical form", async ({
  page,
}) => {
  await setup(page, { role: "assistant", clinical: false, empty: true });
  await enter(page);
  await page.getByRole("button", { name: "ساخت پروندهٔ جدید" }).click();
  await page.getByRole("button", { name: "بازکردن پرونده" }).click();
  await expect(page.getByText("اطلاعات سلامت در دسترس نیست")).toBeVisible();
  await expect(
    page.getByRole("spinbutton", { name: "وزن (کیلوگرم)" }),
  ).toHaveCount(0);
  await expect(page.getByText("تخصیص متخصص و مجوزهای آزمایش")).toHaveCount(0);
});
test("revoking processing permission removes health form and history", async ({
  page,
}) => {
  await setup(page);
  await open(page);
  await page.getByText("تخصیص متخصص و مجوزهای آزمایش", { exact: true }).click();
  await page
    .getByRole("button", { name: "لغو پردازش اطلاعات", exact: true })
    .click();
  await expect(page.getByText("اطلاعات سلامت در دسترس نیست")).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "تاریخچهٔ اطلاعات" }),
  ).toHaveCount(0);
});
test("hard stop is shown, storing intake does not promise diet generation", async ({
  page,
}) => {
  await setup(page);
  await open(page);
  await page.getByRole("tab", { name: "ایمنی پزشکی" }).click();
  await page.getByRole("checkbox", { name: "دیابت", exact: true }).check();
  await page
    .getByRole("checkbox", {
      name: "پاسخ‌های ایمنی این سناریوی مصنوعی را بررسی کردم.",
    })
    .check();
  await expect(
    page.getByText("ساخت خودکار برنامه برای این شرایط مجاز نیست."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "تولید برنامه", exact: true }),
  ).toHaveCount(0);
});
test("access loss on window focus clears health fields", async ({ page }) => {
  const state = await setup(page);
  await open(page);
  await expect(
    page.getByRole("spinbutton", { name: "وزن (کیلوگرم)" }),
  ).toBeVisible();
  state.revoke();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByText("دسترسی آزمایش لازم است")).toBeVisible();
  await expect(
    page.getByRole("spinbutton", { name: "وزن (کیلوگرم)" }),
  ).toHaveCount(0);
});

test("owner with sandbox capability explicitly assigns and grants processing before opening intake", async ({
  page,
}) => {
  await setup(page, { needsSetup: true });
  await open(page);
  await expect(page.getByText("اطلاعات سلامت در دسترس نیست")).toBeVisible();
  await page.getByRole("combobox", { name: "متخصص آزمایش" }).selectOption(user);
  await page.getByRole("button", { name: "تخصیص پرونده", exact: true }).click();
  await page
    .getByRole("button", { name: "اعطای آزمایشی پردازش اطلاعات", exact: true })
    .click();
  await expect(
    page.getByRole("spinbutton", { name: "وزن (کیلوگرم)" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "ذخیرهٔ اطلاعات آزمایشی" }),
  ).toBeDisabled();
});
test("server validation error leaves inputs editable for correction", async ({
  page,
}) => {
  const state = await setup(page);
  await open(page);
  await editWeight(page);
  state.invalidNext();
  await page.getByRole("button", { name: "ذخیرهٔ اطلاعات آزمایشی" }).click();
  await expect(page.getByRole("alert")).toContainText("پاسخ‌ها معتبر نیستند");
  await page.getByRole("tab", { name: "مشخصات جسمی" }).click();
  await expect(
    page.getByRole("spinbutton", { name: "وزن (کیلوگرم)" }),
  ).toBeEnabled();
  expect(state.history).toHaveLength(1);
});

test("periodic access check closes an expired or revoked clinical view without a refresh", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-20T12:00:00Z") });
  const state = await setup(page);
  await open(page);
  await expect(
    page.getByRole("spinbutton", { name: "وزن (کیلوگرم)" }),
  ).toBeVisible();
  state.revokeClinical();
  await page.clock.fastForward(31000);
  await expect(page.getByText("اطلاعات سلامت در دسترس نیست")).toBeVisible();
  await expect(
    page.getByRole("spinbutton", { name: "وزن (کیلوگرم)" }),
  ).toHaveCount(0);
});
