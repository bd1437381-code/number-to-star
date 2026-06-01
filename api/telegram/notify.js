export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return res.status(503).json({ error: "Telegram not configured" });
  }

  const { message } = req.body ?? {};
  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "message required" });
  }

  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message.trim() }),
    }
  );

  const data = await response.json();
  if (!data.ok) return res.status(502).json({ error: data.description });

  res.json({ ok: true });
}
