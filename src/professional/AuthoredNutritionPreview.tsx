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
        <table className="studio-menu-table w-full table-fixed text-start text-sm">
          <thead><tr><th scope="col" className="w-1/4 text-start">منو</th><th scope="col" className="text-start">مواد و مقدار مصرف</th></tr></thead>
          <tbody>{sectionMenus(section).map(menu => <tr key={menu.id} className="border-b border-current/20 align-top">
            <th scope="row" className="break-words py-2 pe-2 text-start">{menu.title}</th>
            <td className="break-words py-2">
              <ul className="space-y-2">{menu.lines.map((line, j) => <li key={j}>
                <strong>{line.name}</strong>
                <p className="whitespace-pre-wrap">{lineDescription(line)}</p>
              </li>)}</ul>
              <p className="mt-2">{nutritionMenuSummary(menu.lines)}</p>
            </td>
          </tr>)}</tbody>
        </table>
      </section>)}
    </section>)}
    {content.notes && <p className="whitespace-pre-wrap">{content.notes}</p>}
  </aside>;
}
