import assert from 'node:assert/strict';
import {Client} from 'pg';
import {constraintMetadataSql} from './pro-recovery-schema.mjs';
// Read-only verification of two disposable databases created by CI. No restore,
// migration, SQL write or production connection is performed by this script.
const sourceUrl=process.env.PRO_TEST_DATABASE_URL, restoredUrl=process.env.PRO_RESTORE_DATABASE_URL;
if(!sourceUrl||!restoredUrl)throw new Error('Disposable source and restored database URLs are required');
const source=new Client({connectionString:sourceUrl}),restored=new Client({connectionString:restoredUrl});
const quote=s=>'"'+s.replaceAll('"','""')+'"';
try{
 await source.connect();await restored.connect();
 assert.equal((await source.query('select current_database() n')).rows[0].n,'behtan_pro_test');
 assert.equal((await restored.query('select current_database() n')).rows[0].n,'behtan_pro_restore_test');
 const list="select schemaname,tablename from pg_tables where schemaname in ('public','auth','pro_private') order by schemaname,tablename";
 const tables=(await source.query(list)).rows;assert.deepEqual((await restored.query(list)).rows,tables);
 for(const {schemaname,tablename} of tables){
  const sql=`select count(*)::integer n,coalesce(md5(string_agg(to_jsonb(t)::text,E'\\n' order by to_jsonb(t)::text)),md5('')) digest from ${quote(schemaname)}.${quote(tablename)} t`;
  assert.deepEqual((await restored.query(sql)).rows,(await source.query(sql)).rows,`Restored rows differ: ${schemaname}.${tablename}`);
 }
 for(const sql of [
  "select schemaname,sequencename,start_value,min_value,max_value,increment_by,cache_size,last_value from pg_sequences where schemaname in ('public','auth','pro_private') order by 1,2",
  "select n.nspname,c.relname,r.rolname,has_table_privilege(r.rolname,c.oid,'SELECT') s,has_table_privilege(r.rolname,c.oid,'INSERT') i,has_table_privilege(r.rolname,c.oid,'UPDATE') u,has_table_privilege(r.rolname,c.oid,'DELETE') d from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join pg_roles r where c.relkind='r' and n.nspname in ('public','auth','pro_private') and r.rolname in ('anon','authenticated','service_role') order by 1,2,3",
  "select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,r.rolname,has_function_privilege(r.rolname,p.oid,'EXECUTE') allowed from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join pg_roles r where n.nspname in ('public','auth','pro_private') and r.rolname in ('anon','authenticated','service_role') order by 1,2,3,4",
  "select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname in ('public','pro_private') order by schemaname,tablename,policyname",
  "select n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth','pro_private') and c.relkind='r' order by 1,2",
  "select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,pg_get_functiondef(p.oid) def from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','auth','pro_private') order by 1,2,3",
  constraintMetadataSql,
 ])assert.deepEqual((await restored.query(sql)).rows,(await source.query(sql)).rows,'Restored security/schema metadata differ');
 console.log(`PASS: restored ${tables.length} synthetic tables match source rows; RLS, policies, functions and constraints match`);
}finally{await Promise.all([source.end(),restored.end()]);}
