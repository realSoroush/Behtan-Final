/** RFC 4122 v4 IDs with secure randomness, including HTTP LAN preview contexts. */
export function createUuid(
  source: Pick<Crypto,'getRandomValues'> & Partial<Pick<Crypto,'randomUUID'>> = globalThis.crypto,
):string {
  if(typeof source.randomUUID==='function')return source.randomUUID();
  const bytes=source.getRandomValues(new Uint8Array(16));
  bytes[6]=(bytes[6]&0x0f)|0x40;
  bytes[8]=(bytes[8]&0x3f)|0x80;
  const h=Array.from(bytes,b=>b.toString(16).padStart(2,'0'));
  return h.slice(0,4).join('')+'-'+h.slice(4,6).join('')+'-'+h.slice(6,8).join('')+'-'+h.slice(8,10).join('')+'-'+h.slice(10).join('');
}
