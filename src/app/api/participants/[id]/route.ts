import type { Picks } from "@/lib/bracket";
import { check, db, fail, getSettings } from "@/lib/server/db";
import { route } from "@/lib/server/handler";
import type { OtherPicks } from "@/lib/types";

/** 공개(revealed) 이후 다른 참여자의 예측 조회 */
export const GET = route(async (_req, ctx) => {
  const { id } = await ctx.params;
  const settings = await getSettings();
  if (!(settings.status === "closed" && settings.revealed)) fail(403, "아직 예측 내용이 공개되지 않았습니다.");
  const row = check(
    await db().from("participants").select("id,dept,name,picks").eq("id", id).maybeSingle(),
  ) as OtherPicks | null;
  if (!row) fail(404, "참여자를 찾을 수 없습니다.");
  return { ...row, picks: (row.picks ?? {}) as Picks } satisfies OtherPicks;
});
