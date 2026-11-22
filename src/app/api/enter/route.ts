import { hashPin, identOf, issueParticipantToken, verifyPin } from "@/lib/server/auth";
import { check, db, fail, getSettings, participantCount } from "@/lib/server/db";
import { body, route, str } from "@/lib/server/handler";

const MAX_FAILS = 5;
const LOCK_MS = 5 * 60 * 1000;

interface Row {
  id: string;
  dept: string;
  name: string;
  pin_hash: string;
  failed_logins: number;
  locked_until: string | null;
}

/** 참여 등록 + 재입장(로그인) 통합 */
export const POST = route(async (req) => {
  const b = await body(req);
  const dept = str(b.dept, 40);
  const name = str(b.name, 30);
  const pin = str(b.pin, 4);
  if (!dept) fail(400, "부서명을 입력하세요.");
  if (!name) fail(400, "이름을 입력하세요.");
  if (!/^\d{4}$/.test(pin)) fail(400, "비밀번호는 숫자 4자리입니다.");
  const ident = identOf(dept, name);

  const existing = check(
    await db()
      .from("participants")
      .select("id,dept,name,pin_hash,failed_logins,locked_until")
      .eq("ident", ident)
      .maybeSingle(),
  ) as Row | null;

  if (existing) {
    if (existing.locked_until && new Date(existing.locked_until).getTime() > Date.now()) {
      fail(429, "비밀번호를 여러 번 틀렸습니다. 5분 후 다시 시도하세요.");
    }
    if (!verifyPin(pin, existing.pin_hash)) {
      const fails = existing.failed_logins + 1;
      await db()
        .from("participants")
        .update(
          fails >= MAX_FAILS
            ? { failed_logins: 0, locked_until: new Date(Date.now() + LOCK_MS).toISOString() }
            : { failed_logins: fails },
        )
        .eq("id", existing.id);
      fail(401, `이미 등록된 참여자입니다. 비밀번호가 일치하지 않습니다. (${Math.min(fails, MAX_FAILS)}/${MAX_FAILS})`);
    }
    if (existing.failed_logins > 0 || existing.locked_until) {
      await db().from("participants").update({ failed_logins: 0, locked_until: null }).eq("id", existing.id);
    }
    return { token: issueParticipantToken(existing.id), created: false };
  }

  const settings = await getSettings();
  if (settings.status !== "open") {
    fail(403, settings.status === "ready" ? "아직 토토 참여가 시작되지 않았습니다." : "토토 참여가 마감되었습니다.");
  }
  if ((await participantCount()) >= settings.maxParticipants) {
    fail(403, `참여 인원이 가득 찼습니다. (최대 ${settings.maxParticipants}명)`);
  }
  if (b.confirm !== true) return { needsConfirm: true, dept, name };

  const ins = await db()
    .from("participants")
    .insert({ dept, name, ident, pin_hash: hashPin(pin) })
    .select("id")
    .single();
  if (ins.error) {
    if (ins.error.code === "23505") fail(409, "방금 같은 이름으로 등록되었습니다. 다시 입장해 주세요.");
    fail(500, `DB 오류: ${ins.error.message}`);
  }
  return { token: issueParticipantToken(ins.data.id), created: true };
});
