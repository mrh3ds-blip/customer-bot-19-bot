// @ts-nocheck
import "dotenv/config";
import express from "express";
import { promises as fs } from "fs";
import crypto from "crypto";

type StoredUser = { id: string; firstName?: string; username?: string; lastSeen: string };
type Ticket = { id: string; userId: string; text: string; status: "OPEN" | "ANSWERED" | "CLOSED"; createdAt: string; adminReply?: string };
type Item = { title: string; price?: string; description?: string; active: boolean };
type Settings = {
  businessName: string;
  welcomeMessage: string;
  supportContact: string;
  admins: string[];
  users: StoredUser[];
  tickets: Ticket[];
  items: Item[];
  broadcasts: { text: string; sentAt: string; count: number }[];
};

const BUSINESS_NAME = "تنیتاستس";
const WELCOME_MESSAGE = "تیدیدژدزد";
const SUPPORT_CONTACT = "تیدیددیدیدی";
const TEMPLATE_CODE = "BALE_RESERVATION";
const FEATURES = [
  "اتصال وبهوک بله",
  "تقویم رزرو و نوبت‌دهی",
  "گزارش‌گیری",
  "چند ادمین",
  "پرداخت کارت‌به‌کارت و تایید رسید"
];
const DETAIL_LINES = [
  "{",
  "\"mode\": \"options\",",
  "\"template\": \"BALE_RESERVATION\",",
  "\"platform\": \"BALE\",",
  "\"flags\": [",
  "\"adminPanel\",",
  "\"reports\",",
  "\"payments\",",
  "\"broadcast\"",
  "],",
  "\"flagTitles\": [",
  "\"🧰 پنل مدیریت\",",
  "\"📊 گزارش‌گیری\",",
  "\"💳 پرداخت\",",
  "\"📣 پیام همگانی\"",
  "],",
  "\"categories\": [],",
  "\"contentModel\": \"FREE\",",
  "\"autoDeleteSeconds\": 0,",
  "\"raw\": \"قالب: رزرو / نوبت‌دهی بله\\nپلتفرم: 💬 بازوی بله\\nامکانات انتخاب‌شده: 🧰 پنل مدیریت، 📊 گزارش‌گیری، 💳 پرداخت، 📣 پیام همگانی\"",
  "}"
];

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = Number(process.env.PORT || 10000);
const BALE_TOKEN = String(process.env.BALE_BOT_TOKEN || process.env.CUSTOMER_BOT_TOKEN || "").trim();
const BALE_ADMIN_ID = String(process.env.BALE_ADMIN_ID || "AUTO").trim();
const BALE_BOT_USERNAME = String(process.env.BALE_BOT_USERNAME || "").replace(/^@/, "").trim();
const BASE_URL = String(process.env.BASE_URL || "").replace(/\/+$/, "");
const WEBHOOK_SECRET = String(process.env.BALE_WEBHOOK_SECRET || crypto.createHash("sha256").update(BALE_TOKEN || "bale").digest("hex").slice(0, 24));
const ADMIN_SETUP_KEY = String(process.env.BALE_ADMIN_SETUP_KEY || "").trim();
const SETTINGS_FILE = process.env.SETTINGS_FILE || "./data/bale-settings.json";
const BALE_API_ROOT = "https://tapi.bale.ai";

async function ensureDir() {
  await fs.mkdir(SETTINGS_FILE.split("/").slice(0, -1).join("/") || ".", { recursive: true });
}

function defaultSettings(): Settings {
  const admins = BALE_ADMIN_ID && BALE_ADMIN_ID !== "AUTO" ? [BALE_ADMIN_ID] : [];
  const items = DETAIL_LINES.slice(0, 20).map((line) => {
    const parts = line.split("|").map((p) => p.trim());
    return { title: parts[0] || line, price: parts[1] || undefined, description: parts.slice(2).join(" | ") || undefined, active: true };
  });
  return { businessName: BUSINESS_NAME, welcomeMessage: WELCOME_MESSAGE, supportContact: SUPPORT_CONTACT, admins, users: [], tickets: [], items, broadcasts: [] };
}

async function loadSettings(): Promise<Settings> {
  try {
    const raw = await fs.readFile(SETTINGS_FILE, "utf8");
    return { ...defaultSettings(), ...JSON.parse(raw) };
  } catch {
    const initial = defaultSettings();
    await saveSettings(initial);
    return initial;
  }
}

async function saveSettings(settings: Settings) {
  await ensureDir();
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf8");
}

async function baleApi(method: string, payload: Record<string, any> = {}) {
  if (!BALE_TOKEN) throw new Error("BALE_BOT_TOKEN تنظیم نشده است.");
  const response = await fetch(BALE_API_ROOT + "/bot" + BALE_TOKEN + "/" + method, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error((data && data.description) || ("Bale API error: " + response.status));
  }
  return data.result;
}

async function sendMessage(chatId: string | number, text: string, replyMarkup?: any) {
  const payload: Record<string, any> = { chat_id: chatId, text };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  try { return await baleApi("sendMessage", payload); } catch (error) { console.error("sendMessage failed", error); }
}

function userFromUpdate(update: any) {
  const msg = update.message || update.edited_message || update.callback_query?.message;
  const from = update.message?.from || update.callback_query?.from || msg?.from || {};
  const chat = msg?.chat || update.message?.chat || {};
  const id = String(from.id || chat.id || "");
  return { id, chatId: String(chat.id || id), firstName: from.first_name || from.firstName || "", username: from.username || "" };
}

function textFromUpdate(update: any) {
  return String(update.message?.text || update.callback_query?.data || "").trim();
}

function isAdmin(settings: Settings, userId: string) {
  return settings.admins.map(String).includes(String(userId));
}

function mainMenu(admin: boolean) {
  const lines = [
    "منوی بازو:",
    "/start شروع",
    "/help راهنما",
    "/support متن پیام  ارسال پیام پشتیبانی",
  ];
  if (TEMPLATE_CODE.includes("SHOP")) lines.push("/items مشاهده محصولات");
  if (admin) {
    lines.push("", "مدیریت:", "/admin پنل مدیریت", "/stats آمار", "/broadcast متن  ارسال همگانی", "/welcome متن  تغییر خوش‌آمد", "/item عنوان | قیمت | توضیح  افزودن محصول", "/reply TICKET_ID متن  پاسخ تیکت");
  }
  return lines.join("\n");
}

async function rememberUser(settings: Settings, user: { id: string; firstName?: string; username?: string }) {
  if (!user.id) return;
  const now = new Date().toISOString();
  const existing = settings.users.find((u) => u.id === user.id);
  if (existing) {
    existing.firstName = user.firstName || existing.firstName;
    existing.username = user.username || existing.username;
    existing.lastSeen = now;
  } else {
    settings.users.push({ id: user.id, firstName: user.firstName, username: user.username, lastSeen: now });
  }
}

async function handleText(update: any) {
  const settings = await loadSettings();
  const user = userFromUpdate(update);
  const text = textFromUpdate(update);
  if (!user.id || !user.chatId) return;
  await rememberUser(settings, user);

  const admin = isAdmin(settings, user.id);

  if (text.startsWith("/claim")) {
    const key = text.replace(/^\/claim\s*/i, "").trim();
    if (!ADMIN_SETUP_KEY || key !== ADMIN_SETUP_KEY) {
      await sendMessage(user.chatId, "کد فعال‌سازی مدیریت درست نیست.");
      return;
    }
    if (!settings.admins.includes(user.id)) settings.admins.push(user.id);
    await saveSettings(settings);
    await sendMessage(user.chatId, "مدیریت بازوی بله برای این حساب فعال شد ✅\n\n" + mainMenu(true));
    return;
  }

  if (text === "/start" || text === "شروع") {
    await saveSettings(settings);
    await sendMessage(user.chatId, settings.welcomeMessage + "\n\n" + mainMenu(admin));
    return;
  }

  if (text === "/help" || text === "راهنما") {
    await sendMessage(user.chatId, "راهنمای استفاده از " + settings.businessName + ":\n" + mainMenu(admin) + "\n\nپشتیبانی: " + settings.supportContact);
    return;
  }

  if (text === "/id" || text === "آیدی من") {
    await sendMessage(user.chatId, "شناسه بله شما:\n" + user.id);
    return;
  }

  if (text === "/items" || text === "محصولات") {
    if (!settings.items.length) {
      await sendMessage(user.chatId, "هنوز محصولی ثبت نشده است.");
      return;
    }
    const list = settings.items.filter((i) => i.active).map((item, index) => String(index + 1) + ". " + item.title + (item.price ? " - " + item.price : "") + (item.description ? "\n" + item.description : "")).join("\n\n");
    await sendMessage(user.chatId, "محصولات/خدمات:\n\n" + list);
    return;
  }

  if (admin) {
    if (text === "/admin") {
      await sendMessage(user.chatId, "پنل مدیریت " + settings.businessName + " ✅\n\n" + mainMenu(true));
      return;
    }
    if (text === "/stats") {
      await sendMessage(user.chatId, "آمار بازو:\nکاربران: " + settings.users.length + "\nتیکت‌ها: " + settings.tickets.length + "\nمحصولات: " + settings.items.length + "\nقالب: " + TEMPLATE_CODE + "\nامکانات: " + (FEATURES.length ? FEATURES.join("، ") : "ندارد"));
      return;
    }
    if (text.startsWith("/broadcast ")) {
      const msg = text.replace(/^\/broadcast\s+/i, "").trim();
      let count = 0;
      for (const u of settings.users) {
        if (u.id !== user.id) {
          await sendMessage(u.id, msg);
          count++;
        }
      }
      settings.broadcasts.push({ text: msg, sentAt: new Date().toISOString(), count });
      await saveSettings(settings);
      await sendMessage(user.chatId, "پیام همگانی ارسال شد ✅\nتعداد: " + count);
      return;
    }
    if (text.startsWith("/welcome ")) {
      settings.welcomeMessage = text.replace(/^\/welcome\s+/i, "").trim();
      await saveSettings(settings);
      await sendMessage(user.chatId, "متن خوش‌آمد تغییر کرد ✅");
      return;
    }
    if (text.startsWith("/item ")) {
      const raw = text.replace(/^\/item\s+/i, "").trim();
      const parts = raw.split("|").map((p) => p.trim());
      settings.items.push({ title: parts[0] || raw, price: parts[1] || undefined, description: parts.slice(2).join(" | ") || undefined, active: true });
      await saveSettings(settings);
      await sendMessage(user.chatId, "محصول/خدمت اضافه شد ✅");
      return;
    }
    if (text.startsWith("/reply ")) {
      const rest = text.replace(/^\/reply\s+/i, "");
      const [ticketId, ...replyParts] = rest.split(/\s+/);
      const reply = replyParts.join(" ").trim();
      const ticket = settings.tickets.find((t) => t.id === ticketId);
      if (!ticket || !reply) {
        await sendMessage(user.chatId, "فرمت درست: /reply TICKET_ID متن پاسخ");
        return;
      }
      ticket.status = "ANSWERED";
      ticket.adminReply = reply;
      await saveSettings(settings);
      await sendMessage(ticket.userId, "پاسخ پشتیبانی:\n" + reply);
      await sendMessage(user.chatId, "پاسخ ارسال شد ✅");
      return;
    }
  }

  if (text.startsWith("/support ") || !text.startsWith("/")) {
    const body = text.startsWith("/support ") ? text.replace(/^\/support\s+/i, "").trim() : text;
    const ticketId = "T" + Date.now().toString().slice(-8);
    settings.tickets.push({ id: ticketId, userId: user.id, text: body, status: "OPEN", createdAt: new Date().toISOString() });
    await saveSettings(settings);
    await sendMessage(user.chatId, "پیام شما ثبت شد ✅\nکد پیگیری: " + ticketId);
    for (const adminId of settings.admins) {
      await sendMessage(adminId, "تیکت جدید " + ticketId + "\nاز کاربر: " + user.id + "\n\n" + body + "\n\nبرای پاسخ:\n/reply " + ticketId + " متن پاسخ");
    }
    return;
  }

  await sendMessage(user.chatId, "دستور شناخته نشد. /help را بفرست.");
}

app.get("/health", (_req, res) => res.json({ ok: true, platform: "BALE", bot: BALE_BOT_USERNAME || null, hasToken: Boolean(BALE_TOKEN), baseUrl: BASE_URL || null }));
app.get("/", (_req, res) => res.type("html").send("<h1>" + BUSINESS_NAME + "</h1><p>بازوی بله فعال است.</p><p>Health: <a href='/health'>/health</a></p>"));
app.get("/bale/setup", (_req, res) => res.type("text").send("برای مدیریت بازو داخل بله /start بزنید. اگر مدیریت خودکار فعال است، دستور /claim را با کد تحویل‌شده ارسال کنید."));
app.post("/bale/webhook/" + WEBHOOK_SECRET, async (req, res) => {
  res.json({ ok: true });
  try { await handleText(req.body); } catch (error) { console.error("Bale webhook handling failed", error); }
});

async function setupWebhook() {
  if (!BASE_URL || !BALE_TOKEN) return;
  const url = BASE_URL + "/bale/webhook/" + WEBHOOK_SECRET;
  try {
    await baleApi("setWebhook", { url });
    console.log("Bale webhook set:", url);
  } catch (error) {
    console.error("Bale setWebhook failed", error);
  }
}

app.listen(PORT, async () => {
  console.log("Bale bot service listening on", PORT);
  await setupWebhook();
});
