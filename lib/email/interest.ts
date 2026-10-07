const SUPPORT_EMAIL = "agendfined@outlook.com";

type SendResult = { sent: true } | { sent: false; reason: "not_configured" | "provider_error" };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

export async function sendInterestSubmissionEmails(email: string): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return { sent: false, reason: "not_configured" };

  const safeEmail = escapeHtml(email);
  const messages = [
    {
      to: [SUPPORT_EMAIL],
      subject: "Novo interesse no AgendFined",
      reply_to: email,
      text: [
        "Novo interesse no AgendFined.",
        "",
        `E-mail: ${email}`,
        "",
        "A pessoa autorizou o contato sobre novidades e o lançamento.",
      ].join("\n"),
      html: `<p>Novo interesse no AgendFined.</p><p><strong>E-mail:</strong> ${safeEmail}</p><p>A pessoa autorizou o contato sobre novidades e o lançamento.</p>`,
    },
    {
      to: [email],
      subject: "Recebemos seu interesse no AgendFined",
      text: [
        "Recebemos seu interesse no AgendFined.",
        "",
        "Entraremos em contato quando houver novidades relevantes sobre o lançamento.",
        "Não enviaremos campanhas recorrentes sem uma nova autorização.",
      ].join("\n"),
      html: "<p>Recebemos seu interesse no AgendFined.</p><p>Entraremos em contato quando houver novidades relevantes sobre o lançamento.</p><p>Não enviaremos campanhas recorrentes sem uma nova autorização.</p>",
    },
  ];

  try {
    for (const message of messages) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from, ...message }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) return { sent: false, reason: "provider_error" };
    }
    return { sent: true };
  } catch {
    return { sent: false, reason: "provider_error" };
  }
}
