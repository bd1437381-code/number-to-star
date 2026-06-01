import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.post("/telegram/photo", async (req, res) => {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  const chatId = process.env["TELEGRAM_CHAT_ID"];

  if (!token || !chatId) {
    res.status(503).json({ error: "Telegram not configured" });
    return;
  }

  const body = req.body as { photoBase64?: string; mimeType?: string; filename?: string; caption?: string };
  if (!body.photoBase64) {
    res.status(400).json({ error: "photoBase64 is required" });
    return;
  }

  try {
    const buffer = Buffer.from(body.photoBase64, "base64");
    const form = new FormData();
    form.append("chat_id", chatId);
    form.append("caption", body.caption ?? "📷 صورة جديدة من موقع محوّل الأرقام إلى نجوم");
    const blob = new Blob([buffer], { type: body.mimeType ?? "image/jpeg" });
    form.append("photo", blob, body.filename ?? "image.jpg");

    const url = `https://api.telegram.org/bot${token}/sendPhoto`;
    const response = await fetch(url, { method: "POST", body: form });
    const data = (await response.json()) as { ok: boolean; description?: string };

    if (!data.ok) {
      req.log.error({ data }, "Telegram sendPhoto error");
      res.status(502).json({ error: data.description ?? "Telegram error" });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to send photo to Telegram");
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/telegram/notify", async (req, res) => {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  const chatId = process.env["TELEGRAM_CHAT_ID"];

  if (!token || !chatId) {
    res.status(503).json({ error: "Telegram not configured" });
    return;
  }

  const { message } = req.body as { message?: string };
  if (!message || typeof message !== "string" || message.trim().length === 0) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message.trim(),
      }),
    });

    const data = (await response.json()) as { ok: boolean; description?: string };
    if (!data.ok) {
      req.log.error({ data }, "Telegram API error");
      res.status(502).json({ error: data.description ?? "Telegram error" });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to send Telegram message");
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
