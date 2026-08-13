import { useEffect, useRef, useState } from "react";
import { Form, Link, redirect, useNavigation, useRevalidator } from "react-router";
import { ObjectId } from "mongodb";
import type { Route } from "./+types/account";
import { commitSession, getCurrentUser, getSession, hashPassword, normalizeEmail, verifyPassword } from "../services/auth.server";
import { consumeLoginChallenge, consumeRegistrationChallenge, createAuthChallenge, verifyAuthCode } from "../services/auth-challenge.server";
import { sendVerificationCode } from "../services/email.server";
import { getAuthChallengesCollection, getTimersCollection, getUsersCollection } from "../services/mongo.server";
import "../account.css";

type AuthStep = "start" | "register-code" | "register-password" | "login-code";
type ActionResult = { error?: string; step: AuthStep; mode?: "login" | "register"; email?: string; name?: string; maskedEmail?: string; challengeId?: string; completionToken?: string };

export function meta() {
  return [{ title: "Account · Carrot Timer" }];
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 2)}${"•".repeat(Math.max(2, Math.min(6, local.length - 2)))}@${domain}`;
}

function validEmail(email: string) {
  return /^\S+@\S+\.\S+$/.test(email);
}

async function startChallenge(params: { email: string; purpose: "register" | "login"; name?: string; userId?: ObjectId }) {
  const result = await createAuthChallenge(params);
  if (!result.ok) return { error: `Please wait ${result.retryAfterSeconds} seconds before requesting another code.` } as const;
  try {
    await sendVerificationCode({ to: params.email, code: result.code, purpose: params.purpose });
    return { challengeId: result.challengeId } as const;
  } catch {
    await (await getAuthChallengesCollection()).deleteOne({ challengeId: result.challengeId });
    return { error: "We could not send the code. Please try again in a moment." } as const;
  }
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getCurrentUser(request);
  if (!user) return { user: null, timers: [] };
  const timers = await (await getTimersCollection()).find({ userId: new ObjectId(user.id) }).sort({ createdAt: -1 }).limit(50).toArray();
  return {
    user,
    timers: timers.map((timer) => ({ id: timer.timerId, title: timer.title, duration: timer.duration, status: timer.status, endAt: timer.endAt.toISOString(), createdAt: timer.createdAt.toISOString() })),
  };
}

export async function action({ request }: Route.ActionArgs): Promise<Response | ActionResult> {
  const form = await request.formData();
  const intent = String(form.get("intent") || "");
  const email = normalizeEmail(String(form.get("email") || ""));
  const name = String(form.get("name") || "").trim().replace(/\s+/g, " ");
  const users = await getUsersCollection();

  if (intent === "register-start") {
    if (name.length < 2 || name.length > 80) return { step: "start", mode: "register", error: "Enter your name (2–80 characters).", email, name };
    if (!validEmail(email)) return { step: "start", mode: "register", error: "Enter a valid email address.", email, name };
    if (await users.findOne({ email })) return { step: "start", mode: "register", error: "An account with this email already exists.", email, name };
    const sent = await startChallenge({ email, name, purpose: "register" });
    if ("error" in sent) return { step: "start", mode: "register", error: sent.error, email, name };
    return { step: "register-code", email, name, maskedEmail: maskEmail(email), challengeId: sent.challengeId };
  }

  if (intent === "register-verify") {
    const challengeId = String(form.get("challengeId") || "");
    const verified = await verifyAuthCode(challengeId, String(form.get("code") || "").trim(), "register");
    if (!verified) return { step: "register-code", challengeId, maskedEmail: String(form.get("maskedEmail") || "your email"), error: "That code is invalid or expired." };
    return { step: "register-password", challengeId, completionToken: verified.completionToken, email: verified.challenge.email, name: verified.challenge.name };
  }

  if (intent === "register-complete") {
    const challengeId = String(form.get("challengeId") || "");
    const completionToken = String(form.get("completionToken") || "");
    const password = String(form.get("password") || "");
    const passwordConfirm = String(form.get("passwordConfirm") || "");
    if (password.length < 10) return { step: "register-password", challengeId, completionToken, error: "Use at least 10 characters for your password." };
    if (password !== passwordConfirm) return { step: "register-password", challengeId, completionToken, error: "Passwords do not match." };
    const challenge = await consumeRegistrationChallenge(challengeId, completionToken);
    if (!challenge?.name) return { step: "start", mode: "register", error: "This registration expired. Please start again." };
    const now = new Date();
    let userId: ObjectId;
    try {
      const result = await users.insertOne({ name: challenge.name, email: challenge.email, passwordHash: await hashPassword(password), emailVerifiedAt: now, createdAt: now, updatedAt: now });
      userId = result.insertedId;
    } catch {
      return { step: "start", mode: "login", email: challenge.email, error: "This account already exists. Sign in instead." };
    }
    const session = await getSession(request.headers.get("Cookie"));
    session.set("userId", userId.toHexString());
    return redirect("/account", { headers: { "Set-Cookie": await commitSession(session) } });
  }

  if (intent === "login-start") {
    const password = String(form.get("password") || "");
    if (!validEmail(email) || !password) return { step: "start", mode: "login", email, error: "Enter your email and password." };
    const user = await users.findOne({ email });
    if (!user || !(await verifyPassword(password, user.passwordHash))) return { step: "start", mode: "login", email, error: "Email or password is incorrect." };
    const sent = await startChallenge({ email, purpose: "login", userId: user._id });
    if ("error" in sent) return { step: "start", mode: "login", email, error: sent.error };
    return { step: "login-code", email, maskedEmail: maskEmail(email), challengeId: sent.challengeId };
  }

  if (intent === "login-verify") {
    const challengeId = String(form.get("challengeId") || "");
    const verified = await verifyAuthCode(challengeId, String(form.get("code") || "").trim(), "login");
    if (!verified) return { step: "login-code", challengeId, maskedEmail: String(form.get("maskedEmail") || "your email"), error: "That code is invalid or expired." };
    const challenge = await consumeLoginChallenge(challengeId, verified.completionToken);
    if (!challenge?.userId) return { step: "start", mode: "login", error: "This sign-in expired. Please start again." };
    const session = await getSession(request.headers.get("Cookie"));
    session.set("userId", challenge.userId.toHexString());
    return redirect("/account", { headers: { "Set-Cookie": await commitSession(session) } });
  }

  return { step: "start", mode: "login", error: "Please start again." };
}

function CodeForm({ actionData, intent }: { actionData: ActionResult; intent: "register-verify" | "login-verify" }) {
  return <>
    <p className="account-intro">We sent a 6-digit code to <strong>{actionData.maskedEmail}</strong>.</p>
    {actionData.error && <p className="auth-error" role="alert">{actionData.error}</p>}
    <Form method="post" className="auth-form">
      <input type="hidden" name="challengeId" value={actionData.challengeId} />
      <input type="hidden" name="maskedEmail" value={actionData.maskedEmail} />
      <label>Verification code<input className="code-input" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} autoFocus required /></label>
      <button className="auth-primary" name="intent" value={intent}>Verify code</button>
    </Form>
    <Link className="auth-restart" to="/account">Use another email</Link>
  </>;
}

export default function Account({ loaderData, actionData }: Route.ComponentProps) {
  const result = actionData as ActionResult | undefined;
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const [mode, setMode] = useState<"login" | "register">(result?.mode || "login");
  const claimed = useRef(false);

  useEffect(() => {
    if (!loaderData.user || claimed.current) return;
    claimed.current = true;
    const timers = Object.keys(localStorage).filter((key) => key.startsWith("carrot-timer:") && !key.includes("wake-lock") && !key.includes("notified")).flatMap((key) => {
      try {
        const timer = JSON.parse(localStorage.getItem(key) || "null") as { id?: string; token?: string };
        return timer?.id && timer?.token ? [{ id: timer.id, token: timer.token }] : [];
      } catch { return []; }
    });
    if (!timers.length) return;
    void fetch("/api/account/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ timers }) })
      .then((response) => { if (response.ok) revalidator.revalidate(); })
      .catch(() => undefined);
  }, [loaderData.user, revalidator]);

  if (!loaderData.user) {
    const step = result?.step || "start";
    return <main className="account-shell"><section className="account-card auth-card">
      <Link className="account-back" to="/">← Back to timer</Link>
      <p className="account-kicker">CARROT TIMER ACCOUNT</p>
      <h1>{step === "register-password" ? <>One last<br /><em>step.</em></> : step.includes("code") ? <>Check your<br /><em>inbox.</em></> : <>Keep every<br /><em>timer close.</em></>}</h1>

      {step === "register-code" && result ? <CodeForm actionData={result} intent="register-verify" /> :
       step === "login-code" && result ? <CodeForm actionData={result} intent="login-verify" /> :
       step === "register-password" && result ? <>
         <p className="account-intro">Email verified. Choose a password to finish creating your account.</p>
         {result.error && <p className="auth-error" role="alert">{result.error}</p>}
         <Form method="post" className="auth-form">
           <input type="hidden" name="challengeId" value={result.challengeId} /><input type="hidden" name="completionToken" value={result.completionToken} />
           <label>Password<input type="password" name="password" minLength={10} autoComplete="new-password" autoFocus required /></label>
           <label>Confirm password<input type="password" name="passwordConfirm" minLength={10} autoComplete="new-password" required /></label>
           <button className="auth-primary" name="intent" value="register-complete">Create account</button>
         </Form>
       </> : <>
         <div className="auth-tabs" role="tablist"><button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Sign in</button><button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>Create account</button></div>
         <p className="account-intro">{mode === "login" ? "Enter your password, then confirm this sign-in with a code sent to your email." : "Start with your name and email. You will verify your email before choosing a password."}</p>
         {result?.error && <p className="auth-error" role="alert">{result.error}</p>}
         <Form method="post" className="auth-form">
           {mode === "register" && <label>Name<input name="name" defaultValue={result?.name} autoComplete="name" minLength={2} maxLength={80} required /></label>}
           <label>Email<input type="email" name="email" defaultValue={result?.email} autoComplete="email" required /></label>
           {mode === "login" && <label>Password<input type="password" name="password" autoComplete="current-password" required /></label>}
           <button className="auth-primary" name="intent" value={mode === "login" ? "login-start" : "register-start"}>{navigation.state === "submitting" ? "Please wait…" : mode === "login" ? "Continue" : "Email me a code"}</button>
         </Form>
       </>}
    </section></main>;
  }

  return <main className="account-shell"><section className="account-card dashboard-card">
    <header className="account-header"><div><p className="account-kicker">YOUR ACCOUNT</p><h1>{loaderData.user.name || loaderData.user.email}</h1><p className="account-email">{loaderData.user.email}</p></div><div><Link to="/">New timer</Link><Form action="/logout" method="post"><button>Sign out</button></Form></div></header>
    <div className="history-heading"><h2>Timer history</h2><span>{loaderData.timers.length}</span></div>
    <div className="timer-history">{loaderData.timers.length === 0 ? <div className="empty-history"><strong>No timers yet</strong><p>Create a timer and it will appear here automatically.</p><Link to="/">Start a timer</Link></div> : loaderData.timers.map((timer) => <Link to={`/timer/${timer.id}`} className="history-item" key={timer.id}><div><strong>{timer.title}</strong><small>{new Date(timer.createdAt).toLocaleString()}</small></div><span>{Math.round(timer.duration / 60)} min</span><i className={`status-${timer.status}`}>{timer.status}</i></Link>)}</div>
  </section></main>;
}
