import { supabaseUrl } from "@/lib/server/db";
import { route } from "@/lib/server/handler";

// 실시간 구독용 공개 키 (anon/publishable 키는 브라우저 공개용이며 RLS 로 보호됨)
export const GET = route(async () => ({
  url: supabaseUrl() || null,
  key:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    null,
}));
