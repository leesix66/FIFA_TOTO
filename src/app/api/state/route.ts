import { loadPublicState } from "@/lib/server/db";
import { route } from "@/lib/server/handler";

export const GET = route(async (req) => {
  const v = new URL(req.url).searchParams.get("v");
  return loadPublicState(v);
});
