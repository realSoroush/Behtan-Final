// PostgreSQL may flatten nested AND nodes when parsing pg_dump output (e.g.
// BETWEEN becomes >= AND <=). Its own pretty deparser removes redundant
// parentheses while preserving precedence, literals, operators and bounds.
export const constraintMetadataSql = "select conrelid::regclass::text rel,conname,pg_get_constraintdef(oid,true) def,convalidated from pg_constraint where connamespace in ('public'::regnamespace,'auth'::regnamespace,'pro_private'::regnamespace) order by 1,2";
