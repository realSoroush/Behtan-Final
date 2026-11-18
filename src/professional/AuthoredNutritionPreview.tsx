import type { AuthoredContent } from './authoredPlan';
import { authoredNutritionDays, lineDescription, nutritionMenuSummary, sectionMenus } from './studioModel';

export function AuthoredNutritionPreview({ content, showTitle = true }: { content: AuthoredContent; showTitle?: boolean }) {
  return <aside className="authored-live-preview space-y-4" aria-label="برنامه غذایی اختصاصی">
    {showTitle && <h3 className="font-bold">{content.title}</h3>}
    <p>از هر وعده فقط یک منو انتخاب شود.</p>
    {authoredNutritionDays(content).map(day => <section key={day.key} className="space-y-3">
      <h4 className="font-bold">{day.label}</h4>
      <p className="text-sm">جمع منوهای اول · {day.primarySummary}</p>
      {day.sections.map((section, i) => <section key={i} className="space-y-2">
        <h5 className="font-semibold">{section.title}</h5>
        {sectionMenus(section).map(menu => <details key={menu.id} open={menu.id === 'primary'} className="rounded-lg border border-current/20 p-3 text-sm">
          <summary className="cursor-pointer font-semibold">{menu.title}</summary>
          <ul className="mt-2 space-y-2">{menu.lines.map((line, j) => <li key={j}>
            <strong>{line.name}</strong>
            <p className="whitespace-pre-wrap">{lineDescription(line)}</p>
          </li>)}</ul>
          <p className="mt-2">{nutritionMenuSummary(menu.lines)}</p>
        </details>)}
      </section>)}
    </section>)}
    {content.notes && <p className="whitespace-pre-wrap">{content.notes}</p>}
  </aside>;
}
