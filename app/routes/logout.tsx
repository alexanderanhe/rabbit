import { redirect } from "react-router";
import type { Route } from "./+types/logout";
import { destroySession, getSession } from "../services/auth.server";

export async function action({ request }: Route.ActionArgs) {
  const session = await getSession(request.headers.get("Cookie"));
  return redirect("/", { headers: { "Set-Cookie": await destroySession(session) } });
}
