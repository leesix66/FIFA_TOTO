import { identOf, requireDevice } from "@/lib/server/auth";
import { check, db, fail, getSettings, participantCount } from "@/lib/server/db";
import { body, route, str } from "@/lib/server/handler";

interface Row {
  id: string;
  dept: string;
  name: string;
  device_hash: string | null;
}

/**
 * 참여 등록. 참여자는 '기기'로 식별한다.
 * - 이 기기가 이미 등록돼 있으면 그 참여자를 그대로 사용
 * - 같은 부서·이름이 다른 기기에 묶여 있으면 거부 (관리자가 '기기 초기화'하면 새 기기로 다시 묶을 수 있음)
 */
export const POST = route(async (req) => {
  const device = requireDevice(req);
  const b = await body(req);
  const dept = str(b.dept, 40);
  const name = str(b.name, 30);
  if (!dept) fail(400, "부서명을 입력하세요.");
  if (!name) fail(400, "이름을 입력하세요.");
  const ident = identOf(dept, name);

  const mine = check(
    await db().from("participants").select("id,dept,name,device_hash").eq("device_hash", device).maybeSingle(),
  ) as Row | null;
  if (mine) {
    if (identOf(mine.dept, mine.name) === ident) return { created: false };
    fail(409, `이 기기는 이미 '${mine.dept} ${mine.name}'(으)로 참여했습니다. 한 기기에서는 한 명만 참여할 수 있어요.`);
  }

  const existing = check(
    await db().from("participants").select("id,dept,name,device_hash").eq("ident", ident).maybeSingle(),
  ) as Row | null;
  if (existing) {
    if (existing.device_hash) {
      fail(403, "이미 다른 기기에서 등록된 참여자입니다. 처음 등록한 기기에서 접속하거나, 관리자에게 '기기 초기화'를 요청하세요.");
    }
    // 관리자가 기기 초기화한 참여자 → 이 기기로 다시 연결
    const upd = await db()
      .from("participants")
      .update({ device_hash: device })
      .eq("id", existing.id)
      .is("device_hash", null)
      .select("id");
    if (upd.error) fail(500, `DB 오류: ${upd.error.message}`);
    if (!upd.data?.length) fail(409, "방금 다른 기기에서 연결되었습니다.");
    return { created: false, relinked: true };
  }

  const settings = await getSettings();
  if (settings.status !== "open") {
    fail(403, settings.status === "ready" ? "아직 토토 참여가 시작되지 않았습니다." : "토토 참여가 마감되었습니다.");
  }
  if ((await participantCount()) >= settings.maxParticipants) {
    fail(403, `참여 인원이 가득 찼습니다. (최대 ${settings.maxParticipants}명)`);
  }
  if (b.confirm !== true) return { needsConfirm: true, dept, name };

  const ins = await db().from("participants").insert({ dept, name, ident, device_hash: device }).select("id").single();
  if (ins.error) {
    if (ins.error.code === "23505") fail(409, "이미 등록된 참여자이거나, 이 기기로 이미 참여했습니다. 새로고침해 주세요.");
    fail(500, `DB 오류: ${ins.error.message}`);
  }
  return { created: true };
});
