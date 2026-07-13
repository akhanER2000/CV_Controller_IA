/**
 * ¿Está configurado Supabase? Las NEXT_PUBLIC_* se inline​an en build, así que
 * esto vale igual en cliente y servidor. Si no hay claves, la app corre en modo
 * LOCAL (localStorage, sin login). Si las hay, se activa el registro/login.
 */
export const supabaseEnabled = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
