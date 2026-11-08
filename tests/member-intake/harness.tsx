// Test-only surface: exercise the production hook over real HTTP/PostgREST.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {useMemberMealSchedule} from '../../src/hooks/useMemberMealSchedule';
import type {Meal} from '../../src/types';
const fixture = (window as unknown as { intakeFixture: { user: string; day: string; context: string; revision: string; profileContext: string; extraId: string; meal: Meal } }).intakeFixture;
function Harness() {
  const state=useMemberMealSchedule(fixture.user,fixture.day,fixture.context,fixture.revision,fixture.profileContext);
  const run=(kind:'record'|'undo-record'|'skip'|'undo-skip')=>{
    void state.changeIntake(kind==='record'?{kind,slot:'breakfast',meal:fixture.meal}:{kind,slot:'breakfast'}).catch(()=>{});
  };
  return <><output data-testid="revision">{state.day?.intakeRevision}</output>
    <output data-testid="recorded">{String(Boolean(state.displayDay?.checkins.breakfast))}</output>
    <output data-testid="skipped">{String(Boolean(state.displayDay?.skipped.includes('breakfast')))}</output>
    <output data-testid="extras">{state.day?.extras.length}</output>
    <output data-testid="pending">{String(state.saving)}</output>
    <output role="alert">{state.error}</output>
    {(['record','undo-record','skip','undo-skip'] as const).map(kind=><button key={kind} disabled={!state.day||state.saving||Boolean(state.error)} onClick={()=>run(kind)}>{kind}</button>)}
    <button disabled={!state.day||state.saving||Boolean(state.error)} onClick={()=>void state.changeIntake({kind:'extra-add',slot:'breakfast',meal:{...fixture.meal,source:'manual'}},fixture.extraId).catch(()=>{})}>extra-add</button>
    <button onClick={()=>void state.retry().catch(()=>{})}>reload state</button>
  </>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
