import { Router, type IRouter } from "express";
import multer from "multer";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.post("/telegram/photo", upload.single("photo"), async (req, res) => {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  const chatId = process.env["TELEGRAM_CHAT_ID"];

  if (!token || !chatId) {
    res.status(503).json({ error: "Telegram not configured" });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: "photo file is required" });
    return;
  }

  try {
    // Use native Node.js 24 FormData
    const form = new FormData();
    form.append("chat_id", chatId);
    form.append("caption", (req.body as { caption?: string })?.caption ?? "📷 صورة جديدة من موقع محوّل الأرقام إلى نجوم");

    const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
    form.append("photo", blob, req.file.originalname || "image.jpg");

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
        parse_mode: "HTML",
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
