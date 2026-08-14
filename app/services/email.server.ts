import { Resend } from "resend";

let client: Resend | undefined;

function getClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");
  client ??= new Resend(apiKey);
  return client;
}

export async function sendVerificationCode(params: { to: string; code: string; purpose: "register" | "login" }) {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) throw new Error("RESEND_FROM_EMAIL is not configured");
  const subject = params.purpose === "register" ? "Verify your Rabbit Timer email" : "Your Rabbit Timer sign-in code";
  const intro = params.purpose === "register" ? "Finish creating your Rabbit Timer account" : "Finish signing in to Rabbit Timer";
  const { error } = await getClient().emails.send({
    from,
    to: params.to,
    subject,
    text: `${intro}. Your code is ${params.code}. It expires in 10 minutes. If you did not request this, you can ignore this email.`,
    html: `<div style="font-family:system-ui,sans-serif;color:#211d1a"><p>${intro}:</p><p style="font-size:32px;font-weight:800;letter-spacing:8px">${params.code}</p><p>This code expires in 10 minutes. If you did not request this, you can ignore this email.</p></div>`,
  });
  if (error) throw new Error("Email delivery failed");
}
