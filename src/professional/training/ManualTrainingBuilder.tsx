import { useRef, useState } from 'react';
import { ArrowUp, ArrowDown, GripVertical, Plus, Trash2 } from 'lucide-react';
import { PanelSelect } from '@/components/ui/PanelSelect';
import type { AuthoredContent, AuthoredLine } from '../authoredPlan';
import { trainingGroups, trainingLine, groupLabel, normalizedSearch, lineDescription, fa, moveItem, type GroupKind } from '../studioModel';
import { EXERCISE_GROUPS, MANUAL_EXERCISES } from './exerciseLibrary';
import './manual-training.css';
export { MANUAL_EXERCISES };
type Drag = { section: number; line: number } | { name: string };
export function ManualTrainingBuilder({ content, mutate }: { content: AuthoredContent; mutate: (fn: (d: AuthoredContent) => void) => void }) {
  const [day, setDay] = useState(0), [search, setSearch] = useState(''), [category, setCategory] = useState('همه'), [subcategory, setSubcategory] = useState('همه');
  const [target, setTarget] = useState(''), [newKind, setNewKind] = useState<GroupKind>(1), [notice, setNotice] = useState('');
  const drag = useRef<Drag | null>(null);
  const current = Math.min(day, content.sections.length - 1), session = content.sections[current];
  const groups = trainingGroups(session), selected = groups.find(g => g.id === target) || groups[groups.length - 1];
  const parents = ['همه', ...new Set(EXERCISE_GROUPS.map(g => g.parent))];
  const visible = EXERCISE_GROUPS.filter(g => (category === 'همه' || g.parent === category) && (subcategory === 'همه' || subcategory === g.name)).map(g => ({ ...g, exercises: g.exercises.filter(n => normalizedSearch(n).includes(normalizedSearch(search))) })).filter(g => g.exercises.length);
  function add(name: string, group = selected) {
    if (!group) { mutate(d => d.sections[current].lines.push(trainingLine(name))); return; }
    const free = group.indices.find(i => !session.lines[i].name.trim());
    if (free === undefined) { setNotice('گروه انتخاب‌شده کامل است؛ یک گروه جدید بسازید یا گروه دیگری را انتخاب کنید.'); return; }
    mutate(d => { d.sections[current].lines[free].name = name; }); setNotice('');
  }
  function addGroup() {
    if (session.lines.length + newKind > 30) return;
    const id = crypto.randomUUID();
    mutate(d => { for (let i = 0; i < newKind; i++) d.sections[current].lines.push(trainingLine('', newKind, id)); });
    setTarget(id); setNotice('');
  }
  function moveGroup(from: number, to: number) {
    const ordered = groups.map(g => g.indices.map(i => session.lines[i]));
    moveItem(ordered, from, to); mutate(d => { d.sections[current].lines = ordered.flat(); });
  }
  function drop(to: number) {
    const from = drag.current; drag.current = null;
    if (!from) return;
    if ('name' in from) { add(from.name, groups.find(g => g.indices.includes(to))); return; }
    if (from.section !== current || from.line === to) return;
    const sourceGroup = groups.find(g => g.indices.includes(from.line)), toGroup = groups.find(g => g.indices.includes(to));
    if (!sourceGroup || !toGroup) return;
    mutate(d => {
      const lines = d.sections[current].lines;
      // Swapping slots preserves each group's capacity and identity, including cross-group moves.
      const a = lines[from.line], b = lines[to], aGroup = a.training!, bGroup = b.training!;
      lines[to] = { ...a, training: { ...aGroup, group: bGroup.group, kind: bGroup.kind } };
      lines[from.line] = { ...b, training: { ...bGroup, group: aGroup.group, kind: aGroup.kind } };
    });
  }
  return <div className="manual-training studio-training">
    <div className="manual-toolbar"><label>تعداد روزهای برنامه<PanelSelect aria-label="تعداد روزهای برنامه" value={content.sections.length} onChange={e => {
      const count = Number(e.target.value);
      if (count < content.sections.length && !window.confirm('جلسات انتهایی و حرکات آن‌ها حذف شوند؟')) return;
      mutate(d => { while (d.sections.length < count) d.sections.push({ title: `جلسه ${d.sections.length + 1}`, lines: [trainingLine()] }); d.sections = d.sections.slice(0, count); });
      setDay(0); setTarget('');
    }}>{Array.from({ length: Math.max(7, content.sections.length) }, (_, i) => i + 1).map(n => <option key={n} value={n}>{fa(n)} روز</option>)}</PanelSelect></label><p>جلسه را انتخاب کنید، گروه بسازید و حرکت‌ها را از بانک اضافه کنید.</p></div>
    <nav className="manual-days" aria-label="جلسات تمرین">{content.sections.map((s, i) => <button type="button" key={i} aria-pressed={current === i} onClick={() => { setDay(i); setTarget(''); }}>{s.title || `جلسه ${fa(i + 1)}`}</button>)}</nav>
    {notice && <p role="status" className="studio-notice">{notice}</p>}
    <div className="studio-columns">
      <aside className="studio-bank manual-library"><h4>بانک حرکات</h4><small>{fa(MANUAL_EXERCISES.length)} نام یکتا · دسته‌بندی عضلات</small>
        <input type="search" aria-label="جستجوی حرکت" placeholder="نام حرکت…" value={search} onChange={e => setSearch(e.target.value)} />
        <div className="studio-categories" aria-label="عضله">{parents.map(c => <button type="button" key={c} aria-pressed={category === c} onClick={() => { setCategory(c); setSubcategory('همه'); }}>{c}</button>)}</div>
        {category !== 'همه' && <label>زیرگروه عضلانی<PanelSelect aria-label="زیرگروه عضلانی" value={subcategory} onChange={e => setSubcategory(e.target.value)}><option>همه</option>{EXERCISE_GROUPS.filter(g => g.parent === category).map(g => <option key={g.name}>{g.name}</option>)}</PanelSelect></label>}
        <div className="studio-bank-list">{visible.map(g => <section key={g.parent + g.name}><h5>{g.parent} / {g.name}</h5>{g.exercises.map(n => <button type="button" key={n} draggable onDragStart={e => { drag.current = { name: n }; e.dataTransfer.setData('text/plain', n); }} onDragEnd={() => { drag.current = null; }} onClick={() => add(n)}><span>{n}</span><Plus size={16} /></button>)}</section>)}{!visible.length && <p className="studio-empty">حرکتی پیدا نشد.</p>}</div>
        <button type="button" onClick={() => add('حرکت اختصاصی مربی')}>+ حرکت اختصاصی</button>
      </aside>
      <section className="studio-editor manual-session"><div className="studio-row"><h4>جلسه {fa(current + 1)}</h4><span className="studio-pill">{fa(session.lines.filter(l => l.name.trim()).length)} حرکت</span></div>
        <label>نام جلسه<input aria-label="نام جلسه تمرین" maxLength={100} value={session.title} onChange={e => mutate(d => { d.sections[current].title = e.target.value; })} /></label>
        <div className="studio-row studio-group-actions"><label>نوع گروه<PanelSelect aria-label="نوع گروه جدید" value={newKind} onChange={e => setNewKind(Number(e.target.value) as GroupKind)}>{[1, 2, 3].map(k => <option key={k} value={k}>{groupLabel(k)}</option>)}</PanelSelect></label><button type="button" disabled={session.lines.length + newKind > 30} onClick={addGroup}><Plus size={16} />گروه جدید</button></div>
        <p className="studio-help">گروه مقصد را انتخاب کنید؛ سپس حرکت اضافه کنید. کشیدن بین دو جایگاه، حرکت‌ها را جابه‌جا می‌کند.</p>
        {groups.map((g, gi) => <section key={g.id} className={'studio-training-group' + (selected?.id === g.id ? ' is-selected' : '')} aria-label={`گروه تمرینی ${gi + 1}`} onClick={() => setTarget(g.id)}>
          <div className="studio-row"><button type="button" aria-pressed={selected?.id === g.id} onClick={() => setTarget(g.id)}>{groupLabel(g.kind)} {fa(gi + 1)}</button><span className="studio-group-order"><button type="button" aria-label={`بالا بردن گروه ${gi + 1}`} disabled={gi === 0} onClick={() => moveGroup(gi, gi - 1)}><ArrowUp size={15} /></button><button type="button" aria-label={`پایین بردن گروه ${gi + 1}`} disabled={gi === groups.length - 1} onClick={() => moveGroup(gi, gi + 1)}><ArrowDown size={15} /></button><button type="button" aria-label={`حذف گروه ${gi + 1}`} onClick={() => { if (g.indices.some(i => session.lines[i].name) && !window.confirm('گروه و همه حرکت‌های آن حذف شوند؟')) return; mutate(d => { d.sections[current].lines = d.sections[current].lines.filter((_, i) => !g.indices.includes(i)); }); }}><Trash2 size={15} /></button></span></div>
          <label className="studio-group-kind">نوع گروه<PanelSelect aria-label={`نوع گروه ${gi + 1}`} value={g.kind} onChange={e => {
            const kind = Number(e.target.value) as GroupKind;
            if (kind < g.kind && g.indices.slice(kind).some(i => session.lines[i].name.trim()) && !window.confirm('حرکت‌های اضافه از این گروه حذف شوند؟')) return;
            if (session.lines.length + kind - g.kind > 30) { setNotice('حداکثر ۳۰ حرکت در هر جلسه.'); return; }
            mutate(d => { const lines = d.sections[current].lines, next: AuthoredLine[] = g.indices.slice(0, kind).map(i => ({ ...lines[i], training: { ...lines[i].training!, kind } })); while (next.length < kind) next.push(trainingLine('', kind, g.id)); lines.splice(g.indices[0], g.indices.length, ...next); });
          }}>{[1, 2, 3].map(k => <option key={k} value={k}>{groupLabel(k)}</option>)}</PanelSelect></label>
          {g.indices.map((j, position) => { const line = session.lines[j], dose = line.training!; return <article className="manual-exercise" key={position} data-line-index={j} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); e.stopPropagation(); drop(j); }}>
            <header><span className="manual-grip" title="برای جابه‌جایی بکش" draggable onDragStart={e => { drag.current = { section: current, line: j }; e.dataTransfer.setData('text/plain', String(j)); }} onDragEnd={() => { drag.current = null; }}><GripVertical size={17} /></span><input aria-label={`نام حرکت ${j + 1}`} maxLength={300} value={line.name} placeholder="حرکت را از بانک اضافه کن" onChange={e => mutate(d => { d.sections[current].lines[j].name = e.target.value; })} /></header>
            <div className="manual-dose">{([['sets', 'ست', 1, 20], ['reps', 'تکرار', 1, 300], ['rest', 'استراحت (ثانیه)', 0, 1800]] as const).map(([k, label, min, max]) => <label key={k}>{label}<input aria-label={`${label} حرکت ${j + 1}`} type="number" min={min} max={max} step={1} value={Number.isNaN(dose[k]) ? '' : dose[k]} onChange={e => mutate(d => { d.sections[current].lines[j].training![k] = e.target.value === '' ? NaN : Number(e.target.value); })} /></label>)}</div>
            <label>دستور مربی<textarea aria-label={`دستور حرکت ${j + 1}`} maxLength={2000} rows={2} value={line.details} onChange={e => mutate(d => { d.sections[current].lines[j].details = e.target.value; })} /></label>
            <footer><small>{g.kind > 1 ? 'مرتبط با حرکت‌های همین گروه' : 'اجرای مستقل'}</small><button type="button" aria-label={`بالا بردن حرکت ${j + 1}`} disabled={position === 0} onClick={() => { drag.current = { section: current, line: j }; drop(g.indices[position - 1]); }}><ArrowUp size={16} /></button><button type="button" aria-label={`پایین بردن حرکت ${j + 1}`} disabled={position === g.indices.length - 1} onClick={() => { drag.current = { section: current, line: j }; drop(g.indices[position + 1]); }}><ArrowDown size={16} /></button><button type="button" aria-label={`حذف حرکت ${j + 1}`} onClick={() => mutate(d => { d.sections[current].lines[j] = trainingLine('', g.kind, g.id); })}><Trash2 size={16} /></button></footer>
          </article>; })}
        </section>)}
        {!groups.length && <p className="studio-empty">یک گروه بسازید و حرکت‌ها را اضافه کنید.</p>}
      </section>
      <AuthoredLivePreview content={{ ...content, sections: [session] }} />
    </div>
  </div>;
}
export function AuthoredLivePreview({ content, name, saved = false }: { content: AuthoredContent; name?: string; saved?: boolean }) {
  return <aside className="authored-live-preview" aria-label="پیش‌نمایش زنده برنامه"><small>{saved ? 'نسخه ثبت‌شده' : 'خروجی زنده · تغییرات را ثبت کنید'}</small><h3>{content.title}</h3>{name && <p>{name}</p>}{content.sections.map((s, i) => <section key={i}><h4>{s.title}</h4>{trainingGroups(s).map((g, gi) => <div className="studio-preview-group" key={g.id}>{s.lines[g.indices[0]]?.training && <small>{groupLabel(g.kind)} {fa(gi + 1)}</small>}{g.indices.map(j => { const l = s.lines[j]; return l.name ? <p key={j}><strong>{l.name}</strong><span>{lineDescription(l)}</span></p> : <p key={j}><small>جایگاه خالی</small></p>; })}</div>)}</section>)}<p>{content.notes}</p></aside>;
}
