import { supabase } from "@/lib/supabaseClient";

export async function commercialRpc<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase
    .rpc(name, args)
    .abortSignal(AbortSignal.timeout(15000))
    .retry(false);
  if (error) throw new Error(error.message);
  return data as T;
}
