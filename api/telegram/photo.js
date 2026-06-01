export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return res.status(503).json({ error: "Telegram not configured" });
  }

  const { photoBase64, mimeType, filename, caption } = req.body ?? {};
  if (!photoBase64) {
    return res.status(400).json({ error: "photoBase64 required" });
  }

  const buffer = Buffer.from(photoBase64, "base64");
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("caption", caption ?? "📷 صورة جديدة من موقع محوّل الأرقام إلى نجوم");
  form.append(
    "photo",
    new Blob([buffer], { type: mimeType ?? "image/jpeg" }),
    filename ?? "photo.jpg"
  );

  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendPhoto`,
    { method: "POST", body: form }
  );

  const data = await response.json();
  if (!data.ok) return res.status(502).json({ error: data.description });

  res.json({ ok: true });
}
