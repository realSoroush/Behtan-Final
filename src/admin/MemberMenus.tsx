import { PanelSelect } from '@/components/ui/PanelSelect';
import { useEffect, useState } from "react";
import { memberRpc } from "../member/api";
interface Template {
  id: string;
  display_name: string;
  slot: string;
  updated_at: string;
  is_active: boolean;
}
interface Catalog {
  templates: Template[];
  slots: {
    template_id: string;
    primary_food_item_id: string;
    fixed_units: number | null;
  }[];
  foods: { id: string; name: string; unit: string; min: number; max: number }[];
}
const mealNames: Record<string, string> = {
  breakfast: "صبحانه",
  morning_snack: "میان‌وعده صبح",
  lunch: "ناهار",
  afternoon_snack: "میان‌وعده عصر",
  dinner: "شام",
  night_snack: "میان‌وعده شب",
  post_workout: "پس از تمرین",
};
export function MemberMenus() {
  const [catalog, setCatalog] = useState<Catalog | null>(null),
    [selected, setSelected] = useState<Template | null>(null),
    [name, setName] = useState(""),
    [id, setId] = useState(""),
    [slot, setSlot] = useState("lunch"),
    [active, setActive] = useState(true),
    [items, setItems] = useState<{ food: string; fixed: number | null }[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [query, setQuery] = useState("");
  const load = async () => {
    try {
      setCatalog(await memberRpc<Catalog>("admin_member_menus"));
    } catch {
      setError("دریافت منوها انجام نشد.");
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const open = (t: Template | null) => {
    setSelected(t);
    setName(t?.display_name ?? "");
    setId(t?.id ?? "menu_" + crypto.randomUUID().replace(/-/g, ""));
    setSlot(t?.slot ?? "lunch");
    setActive(t?.is_active ?? true);
    setItems(
      t
        ? catalog!.slots
            .filter((s) => s.template_id === t.id)
            .map((s) => ({
              food: s.primary_food_item_id,
              fixed: s.fixed_units === null ? null : Number(s.fixed_units),
            }))
        : [],
    );
    setError("");
  };
  return (
    <section className="admin-card admin-menu-editor space-y-4">
      <h2>منوهای به‌تن</h2>
      <p>
        ترکیب و مقدار منو قابل ویرایش است. اطلاعات استاندارد کالری و ماکروی مواد
        تغییر نمی‌کند. تغییر منو روی برنامه‌های جدید اثر دارد؛ غذاهای ثبت‌شده
        ثابت می‌مانند.
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="admin-tools">
        <input
          placeholder="جستجوی منو"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button onClick={() => open(null)}>منوی جدید</button>
      </div>
      <div className="admin-tools">
        <PanelSelect
          aria-label="انتخاب منو"
          value={selected?.id ?? ""}
          onChange={(e) => {
            const t = catalog?.templates.find((t) => t.id === e.target.value);
            if (t) open(t);
          }}
        >
          <option value="">انتخاب منو…</option>
          {catalog?.templates
            .filter((t) => t.display_name.includes(query))
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.display_name} · {mealNames[t.slot]}
                {t.is_active ? "" : " · غیرفعال"}
              </option>
            ))}
        </PanelSelect>
      </div>
      {id && catalog && (
        <form
          className="admin-menu-form space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await memberRpc("admin_save_member_menu", {
                p_id: id,
                p_name: name,
                p_slot: slot,
                p_expected: selected?.updated_at ?? null,
                p_items: items,
                p_active: active,
              });
              await load();
              setId("");
              setSelected(null);
            } catch {
              setError(
                "ذخیره نشد؛ نام، مقدارها یا نسخه منو را بررسی کن. برای تعارض، منو را دوباره انتخاب کن.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            نام منو
            <input
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            وعده
            <PanelSelect value={slot} onChange={(e) => setSlot(e.target.value)}>
              {Object.entries(mealNames).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </PanelSelect>
          </label>
          <label>
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            فعال در تولید برنامه
          </label>
          {items.map((item, i) => (
            <div className="admin-tools admin-menu-ingredient" key={i}>
              <PanelSelect
                aria-label={"ماده " + (i + 1)}
                value={item.food}
                onChange={(e) =>
                  setItems((old) =>
                    old.map((x, j) =>
                      i === j ? { ...x, food: e.target.value } : x,
                    ),
                  )
                }
              >
                {catalog.foods.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} · {f.unit}
                  </option>
                ))}
              </PanelSelect>
              <label>
                <input
                  type="checkbox"
                  checked={item.fixed === null}
                  onChange={(e) =>
                    setItems((old) =>
                      old.map((x, j) =>
                        j === i
                          ? { ...x, fixed: e.target.checked ? null : 1 }
                          : x,
                      ),
                    )
                  }
                />
                مقدار متناسب با هدف کاربر
              </label>
              {item.fixed !== null && (
                <input
                  type="number"
                  step=".001"
                  aria-label="واحد ثابت"
                  value={item.fixed}
                  min={Number(
                    catalog.foods.find((f) => f.id === item.food)?.min ?? 0.001,
                  )}
                  max={Number(
                    catalog.foods.find((f) => f.id === item.food)?.max ?? 100,
                  )}
                  onChange={(e) =>
                    setItems((old) =>
                      old.map((x, j) =>
                        j === i ? { ...x, fixed: Number(e.target.value) } : x,
                      ),
                    )
                  }
                />
              )}
              <button
                type="button"
                onClick={() => setItems((old) => old.filter((_, j) => i !== j))}
              >
                حذف ماده
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={items.length >= 12}
            onClick={() =>
              setItems((old) => [
                ...old,
                { food: catalog.foods[0].id, fixed: null },
              ])
            }
          >
            افزودن ماده غذایی
          </button>
          <button disabled={busy || !items.length}>
            {busy ? "در حال ذخیره…" : "ذخیره منو"}
          </button>
        </form>
      )}
    </section>
  );
}
