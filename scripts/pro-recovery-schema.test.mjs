import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {constraintMetadataSql} from './pro-recovery-schema.mjs';
const source=new PGlite(),restored=new PGlite();
let checks=0;
const same=(a,b)=>{assert.deepEqual(a,b);checks++;};
const different=(a,b)=>{assert.notDeepEqual(a,b);checks++;};
const expression="cardinality(roles) between 1 and 3 and roles <@ array['owner','assistant','practitioner'] and array_position(roles,null) is null";
const oldSql="select pg_get_constraintdef(oid) def from pg_constraint where conrelid='public.recovery_probe'::regclass and conname='roles_check'";
const metadata=async db=>(await db.query(constraintMetadataSql)).rows;
async function change(expression){await restored.exec(`alter table public.recovery_probe drop constraint roles_check;alter table public.recovery_probe add constraint roles_check check (${expression});`);}
try{
 for(const db of [source,restored])await db.exec('create schema auth;create schema pro_private;create table public.recovery_probe(roles text[],label text);');
 await source.exec(`alter table public.recovery_probe add constraint roles_check check (${expression});`);
 const sourceText=(await source.query(oldSql)).rows;
 // Reparse the exact SQL emitted for the original CHECK, as pg_restore does.
 await restored.exec(`alter table public.recovery_probe add constraint roles_check ${sourceText[0].def};`);
 different((await restored.query(oldSql)).rows,sourceText);
 same(await metadata(restored),await metadata(source));
 await change(expression.replace('1 and 3','1 and 4'));
 different(await metadata(restored),await metadata(source));
 await change(expression.replace(' and roles <@',' or roles <@'));
 different(await metadata(restored),await metadata(source));
 await change(expression.replace('is null','is not null'));
 different(await metadata(restored),await metadata(source));
 await change("label = 'a(b)' and (cardinality(roles) >= 1 or cardinality(roles) <= 3)");
 const grouped=await metadata(restored);
 await change("(label = 'a(b)' and cardinality(roles) >= 1) or cardinality(roles) <= 3");
 different(await metadata(restored),grouped);
 await change("label = 'a(b)' and (cardinality(roles) >= 1 or cardinality(roles) <= 3)");
 await restored.exec("alter table public.recovery_probe rename constraint roles_check to renamed_check");
 different(await metadata(restored),grouped);
 await restored.exec('alter table public.recovery_probe drop constraint renamed_check');
 different(await metadata(restored),grouped);
 console.log(`PASS: ${checks} recovery schema assertions; dump/reparse accepted, changed bounds, Boolean precedence, null checks, names and missing constraints rejected`);
}finally{await Promise.all([source.close(),restored.close()]);}
