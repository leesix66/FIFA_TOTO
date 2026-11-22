import { sanitizePicks, type Picks } from "@/lib/bracket";
import { deviceHashFrom, requireDevice } from "@/lib/server/auth";
import { check, db, fail, getMatches, getSettings, modesOf } from "@/lib/server/db";
import { body, route } from "@/lib/server/handler";
import type { Me } from "@/lib/types";

async function loadMe(device: string): Promise<Me | null> {
  const row = check(
    await db().from("participants").select("id,dept,name,picks,updated_at").eq("device_hash", device).maybeSingle(),
  ) as { id: string; dept: string; name: string; picks: Picks; updated_at: string } | null;
  if (!row) return null;
  return { id: row.id, dept: row.dept, name: row.name, picks: row.picks ?? {}, updatedAt: row.updated_at };
}

/** 이 기기로 등록된 참여자 (없으면 me: null) */
export const GET = route(async (req) => {
  const device = deviceHashFrom(req);
  return { me: device ? await loadMe(device) : null };
});

export const PUT = route(async (req) => {
  const device = requireDevice(req);
  const b = await body<{ picks?: Picks }>(req);
  const [settings, matches] = await Promise.all([getSettings(), getMatches()]);
  if (settings.status !== "open") fail(403, "참여 기간이 아니어서 저장할 수 없습니다.");
  const picks = sanitizePicks(settings, modesOf(matches), b.picks ?? {});
  const upd = check(
    await db()
      .from("participants")
      .update({ picks, updated_at: new Date().toISOString() })
      .eq("device_hash", device)
      .select("id"),
  ) as { id: string }[] | null;
  if (!upd?.length) fail(403, "이 기기로 등록된 참여자가 없습니다. 관리자가 기기를 초기화했다면 다시 입장해 주세요.");
  return { me: await loadMe(device) };
});
