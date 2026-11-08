import assert from 'node:assert/strict';
import {Client} from 'pg';
const connectionString=process.env.PRO_TEST_DATABASE_URL;
if(!connectionString)throw Error('Disposable database required');
const url=new URL(connectionString);assert(['localhost','127.0.0.1'].includes(url.hostname));assert.equal(url.pathname,'/behtan_pro_test');
const db=new Client({connectionString});await db.connect();
try{
  assert.equal((await db.query('select current_database() name')).rows[0].name,'behtan_pro_test');
  await db.query("create role authenticator login password 'synthetic-postgrest-only' noinherit; grant anon,authenticated,service_role to authenticator");
  // Supabase's service role has default table grants; the disposable fixture
  // explicitly supplies these rather than changing production migrations.
  await db.query('grant usage on schema public,auth to service_role; grant select,insert,update,delete on all tables in schema public,auth to service_role');
  console.log('Synthetic PostgREST authenticator ready');
}finally{await db.end();}
