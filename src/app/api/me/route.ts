import { sanitizePicks, type Picks } from "@/lib/bracket";
import { requireParticipant } from "@/lib/server/auth";
import { check, db, fail, getMatches, getSettings, modesOf } from "@/lib/server/db";
import { body, route } from "@/lib/server/handler";
import type { Me } from "@/lib/types";

async function loadMe(id: string): Promise<Me> {
  const row = check(
    await db().from("participants").select("id,dept,name,picks,updated_at").eq("id", id).maybeSingle(),
  ) as { id: string; dept: string; name: string; picks: Picks; updated_at: string } | null;
  if (!row) fail(401, "참여자 정보를 찾을 수 없습니다. 다시 입장해 주세요.");
  return { id: row.id, dept: row.dept, name: row.name, picks: row.picks ?? {}, updatedAt: row.updated_at };
}

export const GET = route(async (req) => loadMe(requireParticipant(req)));

export const PUT = route(async (req) => {
  const id = requireParticipant(req);
  const b = await body<{ picks?: Picks }>(req);
  const [settings, matches] = await Promise.all([getSettings(), getMatches()]);
  if (settings.status !== "open") fail(403, "참여 기간이 아니어서 저장할 수 없습니다.");
  const picks = sanitizePicks(settings, modesOf(matches), b.picks ?? {});
  check(
    await db().from("participants").update({ picks, updated_at: new Date().toISOString() }).eq("id", id).select("id"),
  );
  return loadMe(id);
});
