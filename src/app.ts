// @ts-nocheck
import "dotenv/config";
import express from "express";
import { promises as fs } from "fs";
import crypto from "crypto";

// Generated Bale bot - Phase 67
// This template is intentionally feature-complete enough for real customer use:
// shop orders, support tickets, forms, reservations, media catalogue, broadcast and admin panel.

type StoredUser = { id: string; chatId: string; firstName?: string; username?: string; lastSeen: string };
type Ticket = { id: string; userId: string; chatId: string; text: string; status: "OPEN" | "ANSWERED" | "CLOSED"; createdAt: string; updatedAt?: string; adminReply?: string };
type Item = { id: string; title: string; price?: number; priceText?: string; description?: string; category?: string; stock?: number; active: boolean; createdAt: string };
type ShopOrder = { id: string; userId: string; chatId: string; itemTitle: string; qty: number; contact: string; note?: string; total?: number; status: "NEW" | "CONFIRMED" | "DONE" | "CANCELED"; createdAt: string };
type FormResponse = { id: string; userId: string; chatId: string; questions: string[]; answers: string[]; status: "NEW" | "REVIEWED" | "ARCHIVED"; createdAt: string };
type Reservation = { id: string; userId: string; chatId: string; service: string; requestedTime: string; contact: string; status: "NEW" | "CONFIRMED" | "REJECTED" | "DONE" | "CANCELED"; createdAt: string };
type MediaItem = { id: string; title: string; category?: string; fileId?: string; fileType?: string; description?: string; active: boolean; createdAt: string };
type BroadcastLog = { text: string; sentAt: string; count: number };
type Session = { mode: "SUPPORT" | "FORM" | "RESERVATION" | "ORDER" | "ADD_ITEM" | "ADD_MEDIA" | "SEARCH" | "EDIT_WELCOME" | "BROADCAST" | "ADD_ADMIN" | "REPLY_TICKET"; step: number; answers: string[]; meta?: Record<string, string> };
type Settings = {
  businessName: string;
  welcomeMessage: string;
  supportContact: string;
  admins: string[];
  users: StoredUser[];
  tickets: Ticket[];
  items: Item[];
  shopOrders: ShopOrder[];
  formQuestions: string[];
  formResponses: FormResponse[];
  reservationServices: string[];
  reservations: Reservation[];
  mediaCategories: string[];
  mediaItems: MediaItem[];
  broadcasts: BroadcastLog[];
  faq: string[];
  quickReplies: string[];
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
const FEATURE_CODES = [
  "BALE_WEBHOOK",
  "APPOINTMENT_CALENDAR",
  "REPORTS",
  "MULTI_ADMIN",
  "CARD_TO_CARD"
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
const DETAIL_SPEC = {
  "mode": "options",
  "template": "BALE_RESERVATION",
  "platform": "BALE",
  "flags": [
    "adminPanel",
    "reports",
    "payments",
    "broadcast"
  ],
  "flagTitles": [
    "🧰 پنل مدیریت",
    "📊 گزارش‌گیری",
    "💳 پرداخت",
    "📣 پیام همگانی"
  ],
  "categories": [],
  "contentModel": "FREE",
  "autoDeleteSeconds": 0,
  "raw": "قالب: رزرو / نوبت‌دهی بله\nپلتفرم: 💬 بازوی بله\nامکانات انتخاب‌شده: 🧰 پنل مدیریت، 📊 گزارش‌گیری، 💳 پرداخت، 📣 پیام همگانی"
};

const app = express();
app.use(express.json({ limit: "5mb" }));

const PORT = Number(process.env.PORT || 10000);
const BALE_TOKEN = String(process.env.BALE_BOT_TOKEN || process.env.CUSTOMER_BOT_TOKEN || "").trim();
const BALE_ADMIN_ID = String(process.env.BALE_ADMIN_ID || "AUTO").trim();
const BALE_BOT_USERNAME = String(process.env.BALE_BOT_USERNAME || "").replace(/^@/, "").trim();
const BASE_URL = String(process.env.BASE_URL || "").replace(/\/+$/, "");
const WEBHOOK_SECRET = String(process.env.BALE_WEBHOOK_SECRET || crypto.createHash("sha256").update(BALE_TOKEN || "bale").digest("hex").slice(0, 24));
const ADMIN_SETUP_KEY = String(process.env.BALE_ADMIN_SETUP_KEY || "").trim();
const SETTINGS_FILE = process.env.SETTINGS_FILE || "./data/bale-settings.json";
const BALE_API_ROOT = "https://tapi.bale.ai";

const sessions = new Map<string, Session>();

function nowIso() { return new Date().toISOString(); }
function makeId(prefix: string) { return prefix + Date.now().toString().slice(-8) + Math.floor(Math.random() * 90 + 10); }

function faToEnDigits(input: string) {
  return String(input || "")
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

function parsePrice(input: string): number | undefined {
  const normalized = faToEnDigits(input).replace(/[^0-9]/g, "");
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function formatToman(amount?: number) {
  if (!amount || amount <= 0) return "قیمت ثبت نشده";
  return new Intl.NumberFormat("fa-IR").format(amount) + " تومان";
}

function parseItemLine(line: string): Item {
  const parts = String(line || "").split("|").map((p) => p.trim()).filter(Boolean);
  const title = parts[0] || String(line || "آیتم بدون نام").trim();
  const price = parsePrice(parts[1] || "");
  const category = parts[2] || undefined;
  const stock = parsePrice(parts[3] || "");
  const description = parts.slice(stock ? 4 : 3).join(" | ") || parts.slice(price ? 2 : 1).join(" | ") || undefined;
  return { id: makeId("I"), title, price, priceText: price ? formatToman(price) : parts[1], category, stock, description, active: true, createdAt: nowIso() };
}

function uniqueTexts(items: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items || []) {
    const value = String(item || "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function defaultItems(): Item[] {
  if (TEMPLATE_CODE === "BALE_FORM" || TEMPLATE_CODE === "BALE_RESERVATION" || TEMPLATE_CODE === "BALE_BROADCAST") return [];
  const fromSpec = Array.isArray(DETAIL_SPEC?.items) ? DETAIL_SPEC.items.map((x: any) => String(x)) : [];
  const lines = uniqueTexts([...fromSpec, ...DETAIL_LINES]);
  if (lines.length) return lines.map(parseItemLine);
  const fallback: Record<string, string[]> = {
    BALE_SHOP: ["محصول نمونه | 250000 | عمومی | 10 | توضیحات محصول", "خدمت مشاوره | 300000 | خدمات | 0 | قابل رزرو و سفارش"],
    BALE_SUPPORT: ["سوال قبل از خرید", "پیگیری سفارش", "پشتیبانی فنی"],
    BALE_MEDIA_GALLERY: ["نمونه محتوای آموزشی | 0 | آموزشی | توضیحات محتوای نمونه"],
    BALE_MEDIA: ["نمونه محتوای آموزشی | 0 | آموزشی | توضیحات محتوای نمونه"]
  };
  return (fallback[TEMPLATE_CODE] || fallback.BALE_SHOP).map(parseItemLine);
}

function defaultFormQuestions() {
  if (TEMPLATE_CODE !== "BALE_FORM") return ["نام و نام خانوادگی", "شماره تماس", "توضیحات درخواست"];
  const questions = uniqueTexts(DETAIL_LINES);
  return questions.length ? questions : ["نام و نام خانوادگی", "شماره تماس", "موضوع درخواست", "توضیحات تکمیلی"];
}

function defaultReservationServices() {
  if (TEMPLATE_CODE !== "BALE_RESERVATION") return ["مشاوره", "رزرو وقت", "پیگیری سفارش"];
  const services = uniqueTexts(DETAIL_LINES.map((line) => line.split("|")[0].trim()));
  return services.length ? services : ["مشاوره", "رزرو وقت حضوری", "رزرو وقت آنلاین"];
}

function defaultMediaCategories() {
  if (Array.isArray(DETAIL_SPEC?.categories) && DETAIL_SPEC.categories.length) return uniqueTexts(DETAIL_SPEC.categories.map((x: any) => String(x)));
  if (TEMPLATE_CODE === "BALE_MEDIA_GALLERY") return ["فیلم", "عکس", "آموزشی", "سایر"];
  return [];
}

function defaultFaq() {
  return [
    "قیمت‌ها و خدمات را از منوی محصولات/خدمات مشاهده کنید.",
    "برای ارتباط با پشتیبانی، گزینه ثبت تیکت را بزنید.",
    "اگر پرداخت یا سفارش دارید، مشخصات و رسید را در پیام پشتیبانی ارسال کنید."
  ];
}

async function ensureDir() {
  const dir = SETTINGS_FILE.split("/").slice(0, -1).join("/");
  if (dir) await fs.mkdir(dir, { recursive: true });
}

function defaultSettings(): Settings {
  const admins = BALE_ADMIN_ID && BALE_ADMIN_ID !== "AUTO" ? [BALE_ADMIN_ID] : [];
  return {
    businessName: BUSINESS_NAME,
    welcomeMessage: WELCOME_MESSAGE,
    supportContact: SUPPORT_CONTACT,
    admins,
    users: [],
    tickets: [],
    items: defaultItems(),
    shopOrders: [],
    formQuestions: defaultFormQuestions(),
    formResponses: [],
    reservationServices: defaultReservationServices(),
    reservations: [],
    mediaCategories: defaultMediaCategories(),
    mediaItems: [],
    broadcasts: [],
    faq: defaultFaq(),
    quickReplies: ["درخواست شما دریافت شد و در حال بررسی است.", "لطفاً شماره تماس و جزئیات بیشتر را ارسال کنید.", "پاسخ شما ثبت شد؛ اگر سوال دیگری دارید پیام بدهید."]
  };
}

async function loadSettings(): Promise<Settings> {
  try {
    const raw = await fs.readFile(SETTINGS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const base = defaultSettings();
    return {
      ...base,
      ...parsed,
      admins: Array.isArray(parsed.admins) ? parsed.admins.map(String) : base.admins,
      users: Array.isArray(parsed.users) ? parsed.users : [],
      tickets: Array.isArray(parsed.tickets) ? parsed.tickets : [],
      items: Array.isArray(parsed.items) && parsed.items.length ? parsed.items : base.items,
      shopOrders: Array.isArray(parsed.shopOrders) ? parsed.shopOrders : [],
      formQuestions: Array.isArray(parsed.formQuestions) && parsed.formQuestions.length ? parsed.formQuestions : base.formQuestions,
      formResponses: Array.isArray(parsed.formResponses) ? parsed.formResponses : [],
      reservationServices: Array.isArray(parsed.reservationServices) && parsed.reservationServices.length ? parsed.reservationServices : base.reservationServices,
      reservations: Array.isArray(parsed.reservations) ? parsed.reservations : [],
      mediaCategories: Array.isArray(parsed.mediaCategories) && parsed.mediaCategories.length ? parsed.mediaCategories : base.mediaCategories,
      mediaItems: Array.isArray(parsed.mediaItems) ? parsed.mediaItems : [],
      broadcasts: Array.isArray(parsed.broadcasts) ? parsed.broadcasts : [],
      faq: Array.isArray(parsed.faq) && parsed.faq.length ? parsed.faq : base.faq,
      quickReplies: Array.isArray(parsed.quickReplies) && parsed.quickReplies.length ? parsed.quickReplies : base.quickReplies
    };
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
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error((data && data.description) || ("Bale API error: " + response.status));
  return data.result;
}

async function sendMessage(chatId: string | number, text: string, replyMarkup?: any) {
  const payload: Record<string, any> = { chat_id: chatId, text };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  try { return await baleApi("sendMessage", payload); } catch (error) { console.error("sendMessage failed", error); }
}

function button(text: string) { return { text }; }
function keyboard(rows: string[][]) { return { keyboard: rows.map((row) => row.map(button)), resize_keyboard: true }; }

function userMenuKeyboard(admin: boolean) {
  const rows: string[][] = [];
  rows.push(["🏠 منوی اصلی", "ℹ️ درباره ما"]);
  if (TEMPLATE_CODE === "BALE_SHOP") rows.push(["🛒 محصولات", "🧾 ثبت سفارش"]);
  else if (TEMPLATE_CODE === "BALE_FORM") rows.push(["📝 تکمیل فرم"]);
  else if (TEMPLATE_CODE === "BALE_RESERVATION") rows.push(["📅 رزرو وقت"]);
  else if (TEMPLATE_CODE === "BALE_MEDIA_GALLERY") rows.push(["🎬 آرشیو رسانه", "🔍 جستجو"]);
  else if (TEMPLATE_CODE === "BALE_BROADCAST") rows.push(["🔔 عضویت اطلاع‌رسانی"]);
  else rows.push(["🎫 ثبت تیکت", "📚 سوالات متداول"]);
  rows.push(["📞 پشتیبانی", "🆔 آیدی من"]);
  if (admin) rows.push(["⚙️ پنل مدیریت"]);
  return keyboard(rows);
}

function adminMenuKeyboard() {
  return keyboard([
    ["📊 آمار", "📨 پیام همگانی"],
    ["🎫 تیکت‌ها", "🧾 سفارش‌ها"],
    ["📝 فرم‌ها", "📅 رزروها"],
    ["➕ افزودن محصول", "🎬 افزودن رسانه"],
    ["✏️ تغییر خوش‌آمد", "➕ افزودن ادمین"],
    ["🏠 منوی اصلی"]
  ]);
}

function userFromUpdate(update: any) {
  const msg = update.message || update.edited_message || update.callback_query?.message || {};
  const from = update.message?.from || update.callback_query?.from || msg.from || {};
  const chat = msg.chat || update.message?.chat || {};
  const id = String(from.id || chat.id || "");
  return { id, chatId: String(chat.id || id), firstName: from.first_name || from.firstName || "", username: from.username || "" };
}

function textFromUpdate(update: any) {
  return String(update.message?.text || update.message?.caption || update.callback_query?.data || "").trim();
}

function fileFromUpdate(update: any) {
  const msg = update.message || {};
  if (Array.isArray(msg.photo) && msg.photo.length) return { fileId: msg.photo[msg.photo.length - 1].file_id, type: "photo" };
  if (msg.video?.file_id) return { fileId: msg.video.file_id, type: "video" };
  if (msg.document?.file_id) return { fileId: msg.document.file_id, type: "document" };
  return null;
}

function parseCommand(text: string) {
  const value = String(text || "").trim();
  if (!value.startsWith("/")) return null;
  const match = value.match(/^\/([^\s@]+)(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]*))?$/);
  if (!match) return null;
  return { name: "/" + String(match[1] || "").toLowerCase(), args: String(match[2] || "").trim() };
}

function isAdmin(settings: Settings, userId: string) { return settings.admins.map(String).includes(String(userId)); }
function labelIs(text: string, ...labels: string[]) { return labels.includes(String(text || "").trim()); }

async function rememberUser(settings: Settings, user: { id: string; chatId: string; firstName?: string; username?: string }) {
  if (!user.id) return;
  const existing = settings.users.find((u) => String(u.id) === String(user.id));
  if (existing) {
    existing.chatId = user.chatId || existing.chatId;
    existing.firstName = user.firstName || existing.firstName;
    existing.username = user.username || existing.username;
    existing.lastSeen = nowIso();
  } else {
    settings.users.push({ id: user.id, chatId: user.chatId, firstName: user.firstName, username: user.username, lastSeen: nowIso() });
  }
}

function businessIntro(settings: Settings) {
  const features = FEATURES.length ? "\nامکانات فعال: " + FEATURES.join("، ") : "";
  return "به " + settings.businessName + " خوش آمدید.\n" + settings.welcomeMessage + features;
}

function listItems(settings: Settings) {
  const active = settings.items.filter((i) => i.active);
  if (!active.length) return "هنوز محصول/خدمتی ثبت نشده است.";
  return active.map((item, index) => {
    return String(index + 1) + ". " + item.title + "\n" + formatToman(item.price) + (item.category ? "\nدسته: " + item.category : "") + (item.description ? "\n" + item.description : "");
  }).join("\n\n");
}

function listMedia(settings: Settings, query?: string) {
  const q = String(query || "").trim().toLowerCase();
  let items = settings.mediaItems.filter((i) => i.active);
  if (q) items = items.filter((i) => (i.title + " " + (i.category || "") + " " + (i.description || "")).toLowerCase().includes(q));
  if (!items.length && settings.items.length) {
    return settings.items.filter((i) => i.active).map((item, index) => String(index + 1) + ". " + item.title + (item.description ? "\n" + item.description : "")).join("\n\n");
  }
  if (!items.length) return "هنوز رسانه‌ای ثبت نشده است.";
  return items.map((item, index) => String(index + 1) + ". " + item.title + (item.category ? "\nدسته: " + item.category : "") + (item.description ? "\n" + item.description : "")).join("\n\n");
}

async function notifyAdmins(settings: Settings, text: string) {
  for (const adminId of settings.admins) await sendMessage(adminId, text);
}

async function sendMainMenu(chatId: string, settings: Settings, admin: boolean) {
  await sendMessage(chatId, businessIntro(settings) + "\n\nاز منوی پایین انتخاب کنید.", userMenuKeyboard(admin));
}

async function showAdminPanel(chatId: string, settings: Settings) {
  await sendMessage(chatId,
    "پنل مدیریت " + settings.businessName + " ✅\n\n" +
    "کاربران: " + settings.users.length + "\n" +
    "تیکت باز: " + settings.tickets.filter((t) => t.status === "OPEN").length + "\n" +
    "سفارش‌ها: " + settings.shopOrders.length + "\n" +
    "فرم‌ها: " + settings.formResponses.length + "\n" +
    "رزروها: " + settings.reservations.length + "\n\n" +
    "دستورات سریع:\n" +
    "/broadcast متن\n/welcome متن\n/item عنوان | قیمت | توضیح\n/reply TICKET_ID متن\n/addadmin ID",
    adminMenuKeyboard()
  );
}

async function handleSession(settings: Settings, user: any, text: string, admin: boolean, update: any) {
  const session = sessions.get(user.id);
  if (!session) return false;
  if (labelIs(text, "لغو", "/cancel")) {
    sessions.delete(user.id);
    await sendMessage(user.chatId, "عملیات لغو شد.", userMenuKeyboard(admin));
    return true;
  }

  if (session.mode === "SUPPORT") {
    const body = text.trim();
    if (!body) { await sendMessage(user.chatId, "متن پیام پشتیبانی را ارسال کنید."); return true; }
    const ticketId = makeId("T");
    settings.tickets.push({ id: ticketId, userId: user.id, chatId: user.chatId, text: body, status: "OPEN", createdAt: nowIso() });
    sessions.delete(user.id);
    await saveSettings(settings);
    await sendMessage(user.chatId, "پیام شما ثبت شد ✅\nکد پیگیری: " + ticketId, userMenuKeyboard(admin));
    await notifyAdmins(settings, "تیکت جدید " + ticketId + "\nاز کاربر: " + user.id + "\n\n" + body + "\n\nپاسخ:\n/reply " + ticketId + " متن پاسخ");
    return true;
  }

  if (session.mode === "FORM") {
    const questions = settings.formQuestions.length ? settings.formQuestions : defaultFormQuestions();
    session.answers.push(text);
    if (session.answers.length < questions.length) {
      await sendMessage(user.chatId, "سوال " + String(session.answers.length + 1) + " از " + questions.length + ":\n" + questions[session.answers.length]);
      return true;
    }
    const id = makeId("F");
    settings.formResponses.push({ id, userId: user.id, chatId: user.chatId, questions, answers: session.answers, status: "NEW", createdAt: nowIso() });
    sessions.delete(user.id);
    await saveSettings(settings);
    await sendMessage(user.chatId, "فرم شما ثبت شد ✅\nکد پیگیری: " + id, userMenuKeyboard(admin));
    await notifyAdmins(settings, "فرم جدید " + id + "\nاز کاربر: " + user.id + "\n\n" + questions.map((q, i) => q + ": " + (session.answers[i] || "")).join("\n"));
    return true;
  }

  if (session.mode === "RESERVATION") {
    session.answers.push(text);
    if (session.answers.length === 1) { await sendMessage(user.chatId, "زمان موردنظر را وارد کنید. مثال: شنبه ساعت ۱۷"); return true; }
    if (session.answers.length === 2) { await sendMessage(user.chatId, "شماره تماس یا راه ارتباطی را ارسال کنید."); return true; }
    const id = makeId("R");
    settings.reservations.push({ id, userId: user.id, chatId: user.chatId, service: session.answers[0], requestedTime: session.answers[1], contact: session.answers[2], status: "NEW", createdAt: nowIso() });
    sessions.delete(user.id);
    await saveSettings(settings);
    await sendMessage(user.chatId, "درخواست رزرو ثبت شد ✅\nکد پیگیری: " + id, userMenuKeyboard(admin));
    await notifyAdmins(settings, "رزرو جدید " + id + "\nکاربر: " + user.id + "\nخدمت: " + session.answers[0] + "\nزمان: " + session.answers[1] + "\nتماس: " + session.answers[2]);
    return true;
  }

  if (session.mode === "ORDER") {
    session.answers.push(text);
    if (session.answers.length === 1) { await sendMessage(user.chatId, "تعداد یا توضیح سفارش را وارد کنید."); return true; }
    if (session.answers.length === 2) { await sendMessage(user.chatId, "شماره تماس یا راه ارتباطی را ارسال کنید."); return true; }
    const selected = session.answers[0];
    const qty = parsePrice(session.answers[1]) || 1;
    const item = settings.items.find((i, index) => String(index + 1) === faToEnDigits(selected) || i.title.includes(selected));
    const id = makeId("O");
    const total = item?.price ? item.price * qty : undefined;
    settings.shopOrders.push({ id, userId: user.id, chatId: user.chatId, itemTitle: item?.title || selected, qty, contact: session.answers[2], note: session.answers[1], total, status: "NEW", createdAt: nowIso() });
    sessions.delete(user.id);
    await saveSettings(settings);
    await sendMessage(user.chatId, "سفارش شما ثبت شد ✅\nکد سفارش: " + id + (total ? "\nمبلغ تقریبی: " + formatToman(total) : ""), userMenuKeyboard(admin));
    await notifyAdmins(settings, "سفارش جدید " + id + "\nکاربر: " + user.id + "\nآیتم: " + (item?.title || selected) + "\nتعداد/توضیح: " + session.answers[1] + "\nتماس: " + session.answers[2] + (total ? "\nمبلغ: " + formatToman(total) : ""));
    return true;
  }

  if (session.mode === "SEARCH") {
    sessions.delete(user.id);
    await saveSettings(settings);
    await sendMessage(user.chatId, "نتیجه جستجو:\n\n" + listMedia(settings, text), userMenuKeyboard(admin));
    return true;
  }

  if (!admin) return false;

  if (session.mode === "ADD_ITEM") {
    settings.items.push(parseItemLine(text));
    sessions.delete(user.id);
    await saveSettings(settings);
    await sendMessage(user.chatId, "محصول/خدمت اضافه شد ✅", adminMenuKeyboard());
    return true;
  }

  if (session.mode === "ADD_MEDIA") {
    const file = fileFromUpdate(update);
    const parts = text.split("|").map((p) => p.trim());
    settings.mediaItems.push({ id: makeId("M"), title: parts[0] || "رسانه جدید", category: parts[1] || undefined, description: parts.slice(2).join(" | ") || undefined, fileId: file?.fileId, fileType: file?.type, active: true, createdAt: nowIso() });
    sessions.delete(user.id);
    await saveSettings(settings);
    await sendMessage(user.chatId, "رسانه/محتوا اضافه شد ✅", adminMenuKeyboard());
    return true;
  }

  if (session.mode === "EDIT_WELCOME") {
    settings.welcomeMessage = text.trim();
    sessions.delete(user.id);
    await saveSettings(settings);
    await sendMessage(user.chatId, "متن خوش‌آمد تغییر کرد ✅", adminMenuKeyboard());
    return true;
  }

  if (session.mode === "BROADCAST") {
    let count = 0;
    for (const u of settings.users) {
      if (u.chatId !== user.chatId) { await sendMessage(u.chatId || u.id, text); count++; }
    }
    settings.broadcasts.push({ text, sentAt: nowIso(), count });
    sessions.delete(user.id);
    await saveSettings(settings);
    await sendMessage(user.chatId, "پیام همگانی ارسال شد ✅\nتعداد: " + count, adminMenuKeyboard());
    return true;
  }

  if (session.mode === "ADD_ADMIN") {
    const id = faToEnDigits(text).replace(/[^0-9]/g, "");
    if (!id) { await sendMessage(user.chatId, "شناسه عددی معتبر نیست. دوباره ارسال کنید."); return true; }
    if (!settings.admins.includes(id)) settings.admins.push(id);
    sessions.delete(user.id);
    await saveSettings(settings);
    await sendMessage(user.chatId, "ادمین اضافه شد ✅\n" + id, adminMenuKeyboard());
    return true;
  }

  if (session.mode === "REPLY_TICKET") {
    const ticketId = session.meta?.ticketId || session.answers[0];
    const ticket = settings.tickets.find((t) => t.id === ticketId);
    if (!ticket) { sessions.delete(user.id); await sendMessage(user.chatId, "تیکت پیدا نشد.", adminMenuKeyboard()); return true; }
    ticket.status = "ANSWERED";
    ticket.adminReply = text;
    ticket.updatedAt = nowIso();
    sessions.delete(user.id);
    await saveSettings(settings);
    await sendMessage(ticket.chatId || ticket.userId, "پاسخ پشتیبانی:\n" + text);
    await sendMessage(user.chatId, "پاسخ ارسال شد ✅", adminMenuKeyboard());
    return true;
  }

  return false;
}

async function handleText(update: any) {
  const settings = await loadSettings();
  const user = userFromUpdate(update);
  const text = textFromUpdate(update);
  if (!user.id || !user.chatId) return;
  await rememberUser(settings, user);
  const admin = isAdmin(settings, user.id);
  const cmd = parseCommand(text);

  if (text === "" && !fileFromUpdate(update)) { await saveSettings(settings); return; }

  if (cmd?.name === "/claim") {
    if (!ADMIN_SETUP_KEY || cmd.args !== ADMIN_SETUP_KEY) { await sendMessage(user.chatId, "کد فعال‌سازی مدیریت درست نیست."); return; }
    if (!settings.admins.includes(user.id)) settings.admins.push(user.id);
    sessions.delete(user.id);
    await saveSettings(settings);
    await sendMessage(user.chatId, "مدیریت بازوی بله برای این حساب فعال شد ✅", adminMenuKeyboard());
    return;
  }

  if (cmd?.name === "/cancel") {
    sessions.delete(user.id);
    await saveSettings(settings);
    await sendMessage(user.chatId, "عملیات لغو شد.", userMenuKeyboard(admin));
    return;
  }

  if (await handleSession(settings, user, text, admin, update)) return;

  if (cmd?.name === "/start" || labelIs(text, "شروع", "🏠 منوی اصلی")) {
    await saveSettings(settings);
    await sendMainMenu(user.chatId, settings, admin);
    return;
  }

  if (cmd?.name === "/help" || labelIs(text, "راهنما")) {
    await saveSettings(settings);
    await sendMessage(user.chatId, "راهنمای " + settings.businessName + ":\n\n/start شروع\n/help راهنما\n/id آیدی من\n/support متن پیام پشتیبانی\n/items محصولات/خدمات\n\nپشتیبانی: " + settings.supportContact, userMenuKeyboard(admin));
    return;
  }

  if (cmd?.name === "/id" || labelIs(text, "🆔 آیدی من", "آیدی من")) {
    await saveSettings(settings);
    await sendMessage(user.chatId, "شناسه بله شما:\n" + user.id);
    return;
  }

  if (labelIs(text, "ℹ️ درباره ما")) {
    await saveSettings(settings);
    await sendMessage(user.chatId, settings.businessName + "\n\n" + settings.welcomeMessage + "\n\nپشتیبانی: " + settings.supportContact, userMenuKeyboard(admin));
    return;
  }

  if (cmd?.name === "/items" || labelIs(text, "🛒 محصولات", "محصولات", "🎬 آرشیو رسانه")) {
    await saveSettings(settings);
    if (TEMPLATE_CODE === "BALE_MEDIA_GALLERY") await sendMessage(user.chatId, "آرشیو رسانه:\n\n" + listMedia(settings), userMenuKeyboard(admin));
    else await sendMessage(user.chatId, "محصولات/خدمات:\n\n" + listItems(settings), userMenuKeyboard(admin));
    return;
  }

  if (labelIs(text, "🔍 جستجو")) {
    sessions.set(user.id, { mode: "SEARCH", step: 0, answers: [] });
    await sendMessage(user.chatId, "عبارت جستجو را ارسال کنید. اگر نمی‌خواهید جستجو کنید /cancel را بفرستید.");
    return;
  }

  if (cmd?.name === "/support" || labelIs(text, "📞 پشتیبانی", "🎫 ثبت تیکت", "ثبت تیکت")) {
    const body = cmd?.args || "";
    if (body) {
      sessions.set(user.id, { mode: "SUPPORT", step: 0, answers: [] });
      await handleSession(settings, user, body, admin, update);
      return;
    }
    sessions.set(user.id, { mode: "SUPPORT", step: 0, answers: [] });
    await sendMessage(user.chatId, "متن پیام پشتیبانی را ارسال کنید. برای لغو /cancel را بفرستید.");
    return;
  }

  if (labelIs(text, "📚 سوالات متداول")) {
    await saveSettings(settings);
    await sendMessage(user.chatId, "سوالات متداول:\n\n" + settings.faq.map((x, i) => String(i + 1) + ". " + x).join("\n\n"), userMenuKeyboard(admin));
    return;
  }

  if (labelIs(text, "📝 تکمیل فرم")) {
    const questions = settings.formQuestions.length ? settings.formQuestions : defaultFormQuestions();
    sessions.set(user.id, { mode: "FORM", step: 0, answers: [] });
    await sendMessage(user.chatId, "فرم شروع شد. برای لغو /cancel را بفرستید.\n\nسوال 1 از " + questions.length + ":\n" + questions[0]);
    return;
  }

  if (labelIs(text, "📅 رزرو وقت")) {
    sessions.set(user.id, { mode: "RESERVATION", step: 0, answers: [] });
    await sendMessage(user.chatId, "خدمت موردنظر را ارسال یا انتخاب کنید:\n" + settings.reservationServices.map((s, i) => String(i + 1) + ". " + s).join("\n"));
    return;
  }

  if (labelIs(text, "🧾 ثبت سفارش")) {
    sessions.set(user.id, { mode: "ORDER", step: 0, answers: [] });
    await sendMessage(user.chatId, "برای ثبت سفارش، شماره یا نام محصول/خدمت را ارسال کنید:\n\n" + listItems(settings));
    return;
  }

  if (labelIs(text, "🔔 عضویت اطلاع‌رسانی")) {
    await saveSettings(settings);
    await sendMessage(user.chatId, "عضویت شما در اطلاع‌رسانی ثبت شد ✅\nاز این به بعد پیام‌های مهم برای شما ارسال می‌شود.", userMenuKeyboard(admin));
    return;
  }

  if (admin && (cmd?.name === "/admin" || labelIs(text, "⚙️ پنل مدیریت"))) {
    await saveSettings(settings);
    await showAdminPanel(user.chatId, settings);
    return;
  }

  if (admin && (cmd?.name === "/stats" || labelIs(text, "📊 آمار"))) {
    await saveSettings(settings);
    await sendMessage(user.chatId,
      "آمار بازو:\n" +
      "کاربران: " + settings.users.length + "\n" +
      "تیکت‌ها: " + settings.tickets.length + "\n" +
      "سفارش‌ها: " + settings.shopOrders.length + "\n" +
      "فرم‌ها: " + settings.formResponses.length + "\n" +
      "رزروها: " + settings.reservations.length + "\n" +
      "محصول/محتوا: " + (settings.items.length + settings.mediaItems.length) + "\n" +
      "قالب: " + TEMPLATE_CODE + "\n" +
      "امکانات: " + (FEATURES.length ? FEATURES.join("، ") : "ندارد"), adminMenuKeyboard());
    return;
  }

  if (admin && (cmd?.name === "/tickets" || labelIs(text, "🎫 تیکت‌ها"))) {
    await saveSettings(settings);
    const list = settings.tickets.slice(-10).reverse().map((t) => t.id + " | " + t.status + " | " + t.userId + "\n" + t.text).join("\n\n") || "تیکتی ثبت نشده است.";
    await sendMessage(user.chatId, "آخرین تیکت‌ها:\n\n" + list + "\n\nپاسخ: /reply TICKET_ID متن", adminMenuKeyboard());
    return;
  }

  if (admin && (cmd?.name === "/orders" || labelIs(text, "🧾 سفارش‌ها"))) {
    await saveSettings(settings);
    const list = settings.shopOrders.slice(-10).reverse().map((o) => o.id + " | " + o.status + " | " + o.itemTitle + " | " + o.contact).join("\n") || "سفارشی ثبت نشده است.";
    await sendMessage(user.chatId, "آخرین سفارش‌ها:\n" + list, adminMenuKeyboard());
    return;
  }

  if (admin && (cmd?.name === "/forms" || labelIs(text, "📝 فرم‌ها"))) {
    await saveSettings(settings);
    const list = settings.formResponses.slice(-10).reverse().map((f) => f.id + " | " + f.userId + " | " + f.answers.join(" / ")).join("\n") || "فرمی ثبت نشده است.";
    await sendMessage(user.chatId, "آخرین فرم‌ها:\n" + list, adminMenuKeyboard());
    return;
  }

  if (admin && (cmd?.name === "/reservations" || labelIs(text, "📅 رزروها"))) {
    await saveSettings(settings);
    const list = settings.reservations.slice(-10).reverse().map((r) => r.id + " | " + r.status + " | " + r.service + " | " + r.requestedTime + " | " + r.contact).join("\n") || "رزروی ثبت نشده است.";
    await sendMessage(user.chatId, "آخرین رزروها:\n" + list, adminMenuKeyboard());
    return;
  }

  if (admin && (cmd?.name === "/broadcast" || labelIs(text, "📨 پیام همگانی"))) {
    const msg = cmd?.args || "";
    if (msg) { sessions.set(user.id, { mode: "BROADCAST", step: 0, answers: [] }); await handleSession(settings, user, msg, admin, update); return; }
    sessions.set(user.id, { mode: "BROADCAST", step: 0, answers: [] });
    await sendMessage(user.chatId, "متن پیام همگانی را ارسال کنید. برای لغو /cancel را بفرستید.");
    return;
  }

  if (admin && (cmd?.name === "/welcome" || labelIs(text, "✏️ تغییر خوش‌آمد"))) {
    const msg = cmd?.args || "";
    if (msg) { settings.welcomeMessage = msg; await saveSettings(settings); await sendMessage(user.chatId, "متن خوش‌آمد تغییر کرد ✅", adminMenuKeyboard()); return; }
    sessions.set(user.id, { mode: "EDIT_WELCOME", step: 0, answers: [] });
    await sendMessage(user.chatId, "متن خوش‌آمد جدید را ارسال کنید.");
    return;
  }

  if (admin && (cmd?.name === "/item" || labelIs(text, "➕ افزودن محصول"))) {
    const line = cmd?.args || "";
    if (line) { settings.items.push(parseItemLine(line)); await saveSettings(settings); await sendMessage(user.chatId, "محصول/خدمت اضافه شد ✅", adminMenuKeyboard()); return; }
    sessions.set(user.id, { mode: "ADD_ITEM", step: 0, answers: [] });
    await sendMessage(user.chatId, "محصول را با این فرمت ارسال کنید:\nعنوان | قیمت | دسته | موجودی | توضیح");
    return;
  }

  if (admin && labelIs(text, "🎬 افزودن رسانه")) {
    sessions.set(user.id, { mode: "ADD_MEDIA", step: 0, answers: [] });
    await sendMessage(user.chatId, "عنوان رسانه را بفرستید. اگر فایل/عکس هم می‌فرستید در کپشن بنویسید:\nعنوان | دسته | توضیح");
    return;
  }

  if (admin && (cmd?.name === "/reply")) {
    const [ticketId, ...replyParts] = cmd.args.split(/\s+/);
    const reply = replyParts.join(" ").trim();
    const ticket = settings.tickets.find((t) => t.id === ticketId);
    if (!ticket) { await sendMessage(user.chatId, "تیکت پیدا نشد."); return; }
    if (!reply) { sessions.set(user.id, { mode: "REPLY_TICKET", step: 0, answers: [ticketId], meta: { ticketId } }); await sendMessage(user.chatId, "متن پاسخ تیکت " + ticketId + " را ارسال کنید."); return; }
    ticket.status = "ANSWERED";
    ticket.adminReply = reply;
    ticket.updatedAt = nowIso();
    await saveSettings(settings);
    await sendMessage(ticket.chatId || ticket.userId, "پاسخ پشتیبانی:\n" + reply);
    await sendMessage(user.chatId, "پاسخ ارسال شد ✅", adminMenuKeyboard());
    return;
  }

  if (admin && (cmd?.name === "/addadmin" || labelIs(text, "➕ افزودن ادمین"))) {
    const id = faToEnDigits(cmd?.args || "").replace(/[^0-9]/g, "");
    if (id) { if (!settings.admins.includes(id)) settings.admins.push(id); await saveSettings(settings); await sendMessage(user.chatId, "ادمین اضافه شد ✅\n" + id, adminMenuKeyboard()); return; }
    sessions.set(user.id, { mode: "ADD_ADMIN", step: 0, answers: [] });
    await sendMessage(user.chatId, "شناسه عددی ادمین جدید را ارسال کنید.");
    return;
  }

  if (text && !text.startsWith("/")) {
    sessions.set(user.id, { mode: "SUPPORT", step: 0, answers: [] });
    await handleSession(settings, user, text, admin, update);
    return;
  }

  await saveSettings(settings);
  await sendMessage(user.chatId, "دستور شناخته نشد. از منوی پایین استفاده کنید یا /help را بفرستید.", userMenuKeyboard(admin));
}

app.get("/health", (_req, res) => res.json({ ok: true, platform: "BALE", template: TEMPLATE_CODE, bot: BALE_BOT_USERNAME || null, hasToken: Boolean(BALE_TOKEN), baseUrl: BASE_URL || null, webhookPath: "/bale/webhook/" + WEBHOOK_SECRET }));
app.get("/", (_req, res) => res.type("html").send("<h1>" + BUSINESS_NAME + "</h1><p>بازوی بله فعال است.</p><p>برای استفاده داخل بله /start را ارسال کنید.</p><p><a href='/health'>Health</a></p>"));
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
