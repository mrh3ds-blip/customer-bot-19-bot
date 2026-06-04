// @ts-nocheck
import "dotenv/config";
import express from "express";
import { promises as fs } from "fs";
import crypto from "crypto";

// Generated Bale bot - Phase 68
// Real menu-based Bale bot with clean customer/admin panels and resilient update parsing.

type StoredUser = { id: string; chatId: string; firstName?: string; username?: string; phone?: string; lastSeen: string; createdAt?: string };
type Ticket = { id: string; userId: string; chatId: string; text: string; status: "OPEN" | "ANSWERED" | "CLOSED"; createdAt: string; updatedAt?: string; adminReply?: string };
type Item = { id: string; title: string; price?: number; priceText?: string; description?: string; category?: string; link?: string; stock?: number; active: boolean; createdAt: string };
type ShopOrder = { id: string; userId: string; chatId: string; itemTitle: string; qty: number; contact: string; note?: string; total?: number; status: "NEW" | "CONFIRMED" | "DONE" | "CANCELED"; createdAt: string };
type FormResponse = { id: string; userId: string; chatId: string; questions: string[]; answers: string[]; status: "NEW" | "REVIEWED" | "ARCHIVED"; createdAt: string };
type Reservation = { id: string; userId: string; chatId: string; service: string; requestedTime: string; contact: string; status: "NEW" | "CONFIRMED" | "REJECTED" | "DONE" | "CANCELED"; createdAt: string };
type MediaItem = { id: string; title: string; category?: string; url?: string; description?: string; active: boolean; createdAt: string };
type BroadcastLog = { text: string; sentAt: string; count: number };
type Session = { mode: "SUPPORT" | "FORM" | "RESERVATION" | "ORDER" | "ADD_ITEM" | "ADD_MEDIA" | "SEARCH" | "EDIT_WELCOME" | "EDIT_ABOUT" | "BROADCAST" | "ADD_ADMIN" | "REPLY_TICKET" | "DELETE_USER" | "DELETE_ITEM"; step: number; answers: string[]; meta?: Record<string, string> };
type Settings = {
  businessName: string;
  welcomeMessage: string;
  supportContact: string;
  aboutText: string;
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
app.use(express.json({ limit: "8mb" }));

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
const menuChoices = new Map<string, string[]>();

function nowIso() { return new Date().toISOString(); }
function makeId(prefix: string) { return prefix + Date.now().toString().slice(-8) + Math.floor(Math.random() * 90 + 10); }
function cleanText(input: any) { return String(input || "").replace(/\r/g, "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim(); }
function compact(input: string) { return cleanText(input).replace(/[ \t]+/g, " ").trim(); }
function faToEnDigits(input: string) {
  return String(input || "").replace(/[۰-۹]/g, function(d) { return String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)); }).replace(/[٠-٩]/g, function(d) { return String("٠١٢٣٤٥٦٧٨٩".indexOf(d)); });
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
function splitLines(value: string) {
  return String(value || "").split(/\r?\n/).map(function(line) { return compact(line); }).filter(Boolean);
}
function parseItemLine(line: string): Item {
  const parts = String(line || "").split("|").map(function(p) { return compact(p); }).filter(Boolean);
  const title = parts[0] || compact(line) || "آیتم بدون نام";
  const price = parsePrice(parts[1] || "");
  const category = parts[2] || undefined;
  const stock = parsePrice(parts[3] || "");
  const description = parts.slice(4).join(" | ") || parts[3] || parts.slice(price ? 2 : 1).join(" | ") || undefined;
  return { id: makeId("I"), title: title, price: price, priceText: price ? formatToman(price) : parts[1], category: category, stock: stock, description: description, active: true, createdAt: nowIso() };
}
function parseMediaLine(line: string): MediaItem {
  const parts = String(line || "").split("|").map(function(p) { return compact(p); }).filter(Boolean);
  return { id: makeId("M"), title: parts[0] || "محتوای جدید", category: parts[1] || undefined, url: parts[2] || undefined, description: parts.slice(3).join(" | ") || parts[2] || undefined, active: true, createdAt: nowIso() };
}
function uniqueTexts(items: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items || []) {
    const value = compact(item);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}
function defaultItems(): Item[] {
  if (TEMPLATE_CODE === "BALE_FORM" || TEMPLATE_CODE === "BALE_RESERVATION" || TEMPLATE_CODE === "BALE_BROADCAST") return [];
  const fromSpec = Array.isArray(DETAIL_SPEC?.items) ? DETAIL_SPEC.items.map(function(x: any) { return String(x); }) : [];
  const lines = uniqueTexts(fromSpec.concat(DETAIL_LINES || []));
  if (lines.length) return lines.map(parseItemLine);
  const fallback: Record<string, string[]> = {
    BALE_SHOP: ["محصول نمونه | 250000 | عمومی | 10 | توضیحات محصول", "خدمت مشاوره | 300000 | خدمات | 0 | قابل رزرو و سفارش"],
    BALE_SUPPORT: ["سوال قبل از خرید | 0 | پشتیبانی | ثبت تیکت و پاسخگویی", "پیگیری سفارش | 0 | پشتیبانی | بررسی وضعیت درخواست"],
    BALE_MEDIA_GALLERY: ["نمونه محتوای آموزشی | 0 | آموزشی | توضیحات محتوای نمونه"],
    BALE_MEDIA: ["نمونه محتوای آموزشی | 0 | آموزشی | توضیحات محتوای نمونه"]
  };
  return (fallback[TEMPLATE_CODE] || fallback.BALE_SHOP).map(parseItemLine);
}
function defaultFormQuestions() {
  if (TEMPLATE_CODE !== "BALE_FORM") return ["نام و نام خانوادگی", "شماره تماس", "توضیحات درخواست"];
  const questions = uniqueTexts(DETAIL_LINES || []);
  return questions.length ? questions : ["نام و نام خانوادگی", "شماره تماس", "موضوع درخواست", "توضیحات تکمیلی"];
}
function defaultReservationServices() {
  if (TEMPLATE_CODE !== "BALE_RESERVATION") return ["مشاوره", "رزرو وقت", "پیگیری سفارش"];
  const services = uniqueTexts((DETAIL_LINES || []).map(function(line) { return String(line).split("|")[0].trim(); }));
  return services.length ? services : ["مشاوره", "رزرو وقت حضوری", "رزرو وقت آنلاین"];
}
function defaultMediaCategories() {
  if (Array.isArray(DETAIL_SPEC?.categories) && DETAIL_SPEC.categories.length) return uniqueTexts(DETAIL_SPEC.categories.map(function(x: any) { return String(x); }));
  if (TEMPLATE_CODE === "BALE_MEDIA_GALLERY") return ["فیلم", "عکس", "آموزشی", "سایر"];
  return [];
}
function defaultFaq() {
  return [
    "برای شروع از منوی اصلی استفاده کنید.",
    "برای ارتباط با پشتیبانی، گزینه ثبت تیکت را بزنید.",
    "برای سفارش یا رزرو، مشخصات و شماره تماس خود را کامل ارسال کنید."
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
    aboutText: BUSINESS_NAME + "\n" + WELCOME_MESSAGE,
    admins: admins,
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
      mediaCategories: Array.isArray(parsed.mediaCategories) ? parsed.mediaCategories : base.mediaCategories,
      mediaItems: Array.isArray(parsed.mediaItems) ? parsed.mediaItems : [],
      broadcasts: Array.isArray(parsed.broadcasts) ? parsed.broadcasts : [],
      faq: Array.isArray(parsed.faq) && parsed.faq.length ? parsed.faq : base.faq,
      quickReplies: Array.isArray(parsed.quickReplies) && parsed.quickReplies.length ? parsed.quickReplies : base.quickReplies
    };
  } catch {
    return defaultSettings();
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
  const data = await response.json().catch(function() { return {}; });
  if (!response.ok || data.ok === false) throw new Error((data && data.description) || ("Bale API error: " + response.status));
  return data.result;
}
function button(text: string) { return { text: text }; }
function keyboard(rows: string[][]) { return { keyboard: rows.map(function(row) { return row.map(button); }), resize_keyboard: true, one_time_keyboard: false }; }
function flattenRows(rows: string[][]) { return rows.reduce(function(acc: string[], row) { return acc.concat(row); }, []); }
function menuBody(title: string, rows: string[][]) {
  let i = 1;
  const lines: string[] = [title, "", "گزینه‌ها:"];
  for (const row of rows) {
    for (const label of row) {
      lines.push(String(i) + ") " + label);
      i++;
    }
  }
  lines.push("", "می‌توانید روی دکمه بزنید یا شماره گزینه را ارسال کنید.");
  return lines.join("\n");
}
async function sendMessage(chatId: string | number, text: string, replyMarkup?: any) {
  const clean = cleanText(text) || " ";
  const chunks: string[] = [];
  for (let i = 0; i < clean.length; i += 3500) chunks.push(clean.slice(i, i + 3500));
  for (let i = 0; i < chunks.length; i++) {
    const payload: Record<string, any> = { chat_id: chatId, text: chunks[i] };
    if (replyMarkup && i === chunks.length - 1) payload.reply_markup = replyMarkup;
    try { await baleApi("sendMessage", payload); } catch (error) { console.error("sendMessage failed", error); }
  }
}
async function sendMenu(userId: string, chatId: string | number, title: string, rows: string[][]) {
  menuChoices.set(userId, flattenRows(rows));
  await sendMessage(chatId, menuBody(title, rows), keyboard(rows));
}
function userRows(admin: boolean) {
  const rows: string[][] = [];
  rows.push(["🏠 منوی اصلی", "ℹ️ درباره ما"]);
  if (TEMPLATE_CODE === "BALE_SHOP") rows.push(["🛒 محصولات", "🧾 ثبت سفارش"]);
  else if (TEMPLATE_CODE === "BALE_FORM") rows.push(["📝 تکمیل فرم", "📞 پشتیبانی"]);
  else if (TEMPLATE_CODE === "BALE_RESERVATION") rows.push(["📅 رزرو وقت", "📞 پشتیبانی"]);
  else if (TEMPLATE_CODE === "BALE_MEDIA_GALLERY" || TEMPLATE_CODE === "BALE_MEDIA") rows.push(["🎬 آرشیو رسانه", "🔍 جستجو"]);
  else if (TEMPLATE_CODE === "BALE_BROADCAST") rows.push(["🔔 عضویت اطلاع‌رسانی", "📞 پشتیبانی"]);
  else rows.push(["🎫 ثبت تیکت", "📚 سوالات متداول"]);
  rows.push(["📞 پشتیبانی", "🆔 آیدی من"]);
  if (admin) rows.push(["⚙️ پنل مدیریت"]);
  return rows;
}
function adminRows() {
  return [
    ["📊 آمار", "👥 کاربران"],
    ["🎫 تیکت‌ها", "🧾 سفارش‌ها"],
    ["📝 فرم‌ها", "📅 رزروها"],
    ["➕ افزودن محصول", "🗑 حذف محصول"],
    ["🎬 افزودن رسانه", "📨 پیام همگانی"],
    ["✏️ تغییر خوش‌آمد", "➕ افزودن ادمین"],
    ["🗑 حذف کاربر", "🏠 منوی اصلی"]
  ];
}
async function sendUserMenu(user: any, settings: Settings, admin: boolean, title?: string) {
  const message = (title || ("به " + settings.businessName + " خوش آمدید.")) + "\n\n" + settings.welcomeMessage + "\n\nپشتیبانی: " + settings.supportContact;
  await sendMenu(user.id, user.chatId, message, userRows(admin));
}
async function sendAdminPanel(user: any, settings: Settings) {
  const text = "پنل مدیریت " + settings.businessName + " ✅\n\n" +
    "کاربران: " + settings.users.length + "\n" +
    "تیکت باز: " + settings.tickets.filter(function(t) { return t.status === "OPEN"; }).length + "\n" +
    "سفارش‌ها: " + settings.shopOrders.length + "\n" +
    "فرم‌ها: " + settings.formResponses.length + "\n" +
    "رزروها: " + settings.reservations.length + "\n\n" +
    "از دکمه‌ها یا شماره گزینه‌ها استفاده کنید.";
  await sendMenu(user.id, user.chatId, text, adminRows());
}
function pickMessage(update: any) {
  return update?.message || update?.edited_message || update?.data?.message || update?.result?.message || update?.callback_query?.message || update || {};
}
function userFromUpdate(update: any) {
  const msg = pickMessage(update);
  const from = msg.from || update?.from || update?.callback_query?.from || msg.sender || msg.user || {};
  const chat = msg.chat || update?.chat || from || {};
  const id = String(from.id || from.user_id || chat.id || chat.chat_id || msg.from_id || "");
  const chatId = String(chat.id || chat.chat_id || msg.chat_id || id || "");
  return { id: id, chatId: chatId, firstName: from.first_name || from.firstName || from.name || "", username: from.username || "" };
}
function textFromUpdate(update: any) {
  const msg = pickMessage(update);
  const candidates = [msg.text, msg.content, msg.caption, msg.body, msg.message, update?.text, update?.content, update?.callback_query?.data];
  for (const candidate of candidates) {
    const value = cleanText(candidate);
    if (value) return value;
  }
  return "";
}
function normalizeIncomingText(userId: string, text: string) {
  let value = compact(text);
  const numeric = faToEnDigits(value).replace(/[^0-9]/g, "");
  if (numeric && String(Number(numeric)) === numeric) {
    const choices = menuChoices.get(userId) || [];
    const index = Number(numeric) - 1;
    if (choices[index]) return choices[index];
  }
  return value;
}
function parseCommand(text: string) {
  const value = compact(text);
  if (!value.startsWith("/")) return null;
  const match = value.match(/^\/([^\s@]+)(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]*))?$/);
  if (!match) return null;
  return { name: "/" + String(match[1] || "").toLowerCase(), args: String(match[2] || "").trim() };
}
function isAdmin(settings: Settings, userId: string) { return settings.admins.map(String).includes(String(userId)); }
function labelIs(text: string, ...labels: string[]) { return labels.includes(compact(text)); }
async function rememberUser(settings: Settings, user: { id: string; chatId: string; firstName?: string; username?: string }) {
  if (!user.id) return;
  const existing = settings.users.find(function(u) { return String(u.id) === String(user.id); });
  if (existing) {
    existing.chatId = user.chatId || existing.chatId;
    existing.firstName = user.firstName || existing.firstName;
    existing.username = user.username || existing.username;
    existing.lastSeen = nowIso();
  } else {
    settings.users.push({ id: user.id, chatId: user.chatId, firstName: user.firstName, username: user.username, createdAt: nowIso(), lastSeen: nowIso() });
  }
}
function listUsers(settings: Settings) {
  if (!settings.users.length) return "هنوز کاربری ثبت نشده است.";
  return settings.users.slice(-30).reverse().map(function(u, index) {
    return String(index + 1) + ". " + (u.firstName || "بدون نام") + " | ID: " + u.id + (u.username ? " | @" + u.username : "") + "\nآخرین حضور: " + u.lastSeen;
  }).join("\n\n");
}
function listItems(settings: Settings) {
  const active = settings.items.filter(function(i) { return i.active; });
  if (!active.length) return "هنوز محصول/خدمتی ثبت نشده است.";
  return active.map(function(item, index) {
    return String(index + 1) + ". " + item.title + "\n" + formatToman(item.price) + (item.category ? "\nدسته: " + item.category : "") + (item.description ? "\n" + item.description : "") + (item.link ? "\nلینک: " + item.link : "");
  }).join("\n\n");
}
function listMedia(settings: Settings, query?: string) {
  const q = compact(query).toLowerCase();
  let items = settings.mediaItems.filter(function(i) { return i.active; });
  if (q) items = items.filter(function(i) { return (i.title + " " + (i.category || "") + " " + (i.description || "") + " " + (i.url || "")).toLowerCase().includes(q); });
  if (!items.length && settings.items.length) return listItems(settings);
  if (!items.length) return "هنوز رسانه‌ای ثبت نشده است.";
  return items.map(function(item, index) {
    return String(index + 1) + ". " + item.title + (item.category ? "\nدسته: " + item.category : "") + (item.description ? "\n" + item.description : "") + (item.url ? "\nلینک: " + item.url : "");
  }).join("\n\n");
}
async function notifyAdmins(settings: Settings, text: string) {
  for (const adminId of settings.admins) await sendMessage(adminId, text);
}
async function handleSession(settings: Settings, user: any, text: string, admin: boolean) {
  const session = sessions.get(user.id);
  if (!session) return false;
  if (labelIs(text, "لغو", "/cancel", "انصراف")) {
    sessions.delete(user.id);
    await sendUserMenu(user, settings, admin, "عملیات لغو شد.");
    return true;
  }
  if (session.mode === "SUPPORT") {
    const body = compact(text);
    if (!body) { await sendMessage(user.chatId, "متن پیام پشتیبانی را ارسال کنید."); return true; }
    const ticketId = makeId("T");
    settings.tickets.push({ id: ticketId, userId: user.id, chatId: user.chatId, text: body, status: "OPEN", createdAt: nowIso() });
    sessions.delete(user.id);
    await saveSettings(settings);
    await sendUserMenu(user, settings, admin, "پیام شما ثبت شد ✅\nکد پیگیری: " + ticketId);
    await notifyAdmins(settings, "تیکت جدید " + ticketId + "\nکاربر: " + user.id + "\n\n" + body + "\n\nپاسخ: /reply " + ticketId + " متن پاسخ");
    return true;
  }
  if (session.mode === "FORM") {
    const questions = settings.formQuestions.length ? settings.formQuestions : defaultFormQuestions();
    session.answers.push(text);
    if (session.answers.length < questions.length) { await sendMessage(user.chatId, "سوال " + String(session.answers.length + 1) + " از " + questions.length + ":\n" + questions[session.answers.length]); return true; }
    const id = makeId("F");
    settings.formResponses.push({ id: id, userId: user.id, chatId: user.chatId, questions: questions, answers: session.answers, status: "NEW", createdAt: nowIso() });
    sessions.delete(user.id);
    await saveSettings(settings);
    await sendUserMenu(user, settings, admin, "فرم شما ثبت شد ✅\nکد پیگیری: " + id);
    await notifyAdmins(settings, "فرم جدید " + id + "\nکاربر: " + user.id + "\n\n" + questions.map(function(q, i) { return q + ": " + (session.answers[i] || ""); }).join("\n"));
    return true;
  }
  if (session.mode === "RESERVATION") {
    session.answers.push(text);
    if (session.answers.length === 1) { await sendMessage(user.chatId, "زمان موردنظر را وارد کنید. مثال: شنبه ساعت ۱۷"); return true; }
    if (session.answers.length === 2) { await sendMessage(user.chatId, "شماره تماس یا راه ارتباطی را ارسال کنید."); return true; }
    const id = makeId("R");
    settings.reservations.push({ id: id, userId: user.id, chatId: user.chatId, service: session.answers[0], requestedTime: session.answers[1], contact: session.answers[2], status: "NEW", createdAt: nowIso() });
    sessions.delete(user.id);
    await saveSettings(settings);
    await sendUserMenu(user, settings, admin, "درخواست رزرو ثبت شد ✅\nکد پیگیری: " + id);
    await notifyAdmins(settings, "رزرو جدید " + id + "\nکاربر: " + user.id + "\nخدمت: " + session.answers[0] + "\nزمان: " + session.answers[1] + "\nتماس: " + session.answers[2]);
    return true;
  }
  if (session.mode === "ORDER") {
    session.answers.push(text);
    if (session.answers.length === 1) { await sendMessage(user.chatId, "تعداد یا توضیح سفارش را وارد کنید."); return true; }
    if (session.answers.length === 2) { await sendMessage(user.chatId, "شماره تماس یا راه ارتباطی را ارسال کنید."); return true; }
    const selected = session.answers[0];
    const qty = parsePrice(session.answers[1]) || 1;
    const item = settings.items.find(function(i, index) { return String(index + 1) === faToEnDigits(selected) || i.title.includes(selected); });
    const id = makeId("O");
    const total = item?.price ? item.price * qty : undefined;
    settings.shopOrders.push({ id: id, userId: user.id, chatId: user.chatId, itemTitle: item?.title || selected, qty: qty, contact: session.answers[2], note: session.answers[1], total: total, status: "NEW", createdAt: nowIso() });
    sessions.delete(user.id);
    await saveSettings(settings);
    await sendUserMenu(user, settings, admin, "سفارش شما ثبت شد ✅\nکد سفارش: " + id + (total ? "\nمبلغ تقریبی: " + formatToman(total) : ""));
    await notifyAdmins(settings, "سفارش جدید " + id + "\nکاربر: " + user.id + "\nآیتم: " + (item?.title || selected) + "\nتعداد/توضیح: " + session.answers[1] + "\nتماس: " + session.answers[2] + (total ? "\nمبلغ: " + formatToman(total) : ""));
    return true;
  }
  if (session.mode === "SEARCH") {
    sessions.delete(user.id);
    await sendUserMenu(user, settings, admin, "نتیجه جستجو:\n\n" + listMedia(settings, text));
    return true;
  }
  if (!admin) return false;
  if (session.mode === "ADD_ITEM") {
    settings.items.push(parseItemLine(text));
    sessions.delete(user.id);
    await saveSettings(settings);
    await sendAdminPanel(user, settings);
    await sendMessage(user.chatId, "محصول/خدمت اضافه شد ✅");
    return true;
  }
  if (session.mode === "ADD_MEDIA") {
    settings.mediaItems.push(parseMediaLine(text));
    sessions.delete(user.id);
    await saveSettings(settings);
    await sendAdminPanel(user, settings);
    await sendMessage(user.chatId, "رسانه/محتوا اضافه شد ✅");
    return true;
  }
  if (session.mode === "EDIT_WELCOME") {
    settings.welcomeMessage = text;
    sessions.delete(user.id);
    await saveSettings(settings);
    await sendAdminPanel(user, settings);
    return true;
  }
  if (session.mode === "EDIT_ABOUT") {
    settings.aboutText = text;
    sessions.delete(user.id);
    await saveSettings(settings);
    await sendAdminPanel(user, settings);
    return true;
  }
  if (session.mode === "BROADCAST") {
    let count = 0;
    for (const u of settings.users) {
      if (u.chatId !== user.chatId) { await sendMessage(u.chatId || u.id, text); count++; }
    }
    settings.broadcasts.push({ text: text, sentAt: nowIso(), count: count });
    sessions.delete(user.id);
    await saveSettings(settings);
    await sendAdminPanel(user, settings);
    await sendMessage(user.chatId, "پیام همگانی ارسال شد ✅\nتعداد: " + count);
    return true;
  }
  if (session.mode === "ADD_ADMIN") {
    const id = faToEnDigits(text).replace(/[^0-9]/g, "");
    if (!id) { await sendMessage(user.chatId, "شناسه عددی معتبر نیست. دوباره ارسال کنید."); return true; }
    if (!settings.admins.includes(id)) settings.admins.push(id);
    sessions.delete(user.id);
    await saveSettings(settings);
    await sendAdminPanel(user, settings);
    await sendMessage(user.chatId, "ادمین اضافه شد ✅\n" + id);
    return true;
  }
  if (session.mode === "REPLY_TICKET") {
    const ticketId = session.meta?.ticketId || session.answers[0];
    const ticket = settings.tickets.find(function(t) { return t.id === ticketId; });
    if (!ticket) { sessions.delete(user.id); await sendAdminPanel(user, settings); await sendMessage(user.chatId, "تیکت پیدا نشد."); return true; }
    ticket.status = "ANSWERED";
    ticket.adminReply = text;
    ticket.updatedAt = nowIso();
    sessions.delete(user.id);
    await saveSettings(settings);
    await sendMessage(ticket.chatId || ticket.userId, "پاسخ پشتیبانی:\n" + text);
    await sendAdminPanel(user, settings);
    await sendMessage(user.chatId, "پاسخ ارسال شد ✅");
    return true;
  }
  if (session.mode === "DELETE_USER") {
    const id = faToEnDigits(text).replace(/[^0-9]/g, "");
    const before = settings.users.length;
    settings.users = settings.users.filter(function(u) { return String(u.id) !== id; });
    sessions.delete(user.id);
    await saveSettings(settings);
    await sendAdminPanel(user, settings);
    await sendMessage(user.chatId, before === settings.users.length ? "کاربر پیدا نشد." : "کاربر حذف شد ✅");
    return true;
  }
  if (session.mode === "DELETE_ITEM") {
    const n = Number(faToEnDigits(text).replace(/[^0-9]/g, ""));
    if (!n || !settings.items[n - 1]) { await sendMessage(user.chatId, "شماره محصول معتبر نیست."); return true; }
    settings.items[n - 1].active = false;
    sessions.delete(user.id);
    await saveSettings(settings);
    await sendAdminPanel(user, settings);
    await sendMessage(user.chatId, "محصول/خدمت حذف شد ✅");
    return true;
  }
  return false;
}
async function handleUpdate(update: any) {
  const settings = await loadSettings();
  const rawUser = userFromUpdate(update);
  if (!rawUser.id || !rawUser.chatId) return;
  const rawText = textFromUpdate(update);
  const text = normalizeIncomingText(rawUser.id, rawText);
  const user = { ...rawUser };
  await rememberUser(settings, user);
  const admin = isAdmin(settings, user.id);
  const cmd = parseCommand(text);
  if (!text) { await saveSettings(settings); return; }
  if (cmd?.name === "/claim") {
    if (!ADMIN_SETUP_KEY || cmd.args !== ADMIN_SETUP_KEY) { await sendMessage(user.chatId, "کد فعال‌سازی مدیریت درست نیست."); return; }
    if (!settings.admins.includes(user.id)) settings.admins.push(user.id);
    sessions.delete(user.id);
    await saveSettings(settings);
    await sendAdminPanel(user, settings);
    await sendMessage(user.chatId, "مدیریت بازوی بله برای این حساب فعال شد ✅");
    return;
  }
  if (cmd?.name === "/cancel" || labelIs(text, "انصراف", "لغو")) {
    sessions.delete(user.id);
    await saveSettings(settings);
    await sendUserMenu(user, settings, admin, "عملیات لغو شد.");
    return;
  }
  if (await handleSession(settings, user, text, admin)) return;
  if (cmd?.name === "/start" || labelIs(text, "شروع", "🏠 منوی اصلی")) {
    await saveSettings(settings);
    await sendUserMenu(user, settings, admin);
    return;
  }
  if (cmd?.name === "/help" || labelIs(text, "راهنما")) {
    await saveSettings(settings);
    await sendUserMenu(user, settings, admin, "راهنما:\n/start شروع\n/admin پنل مدیریت\n/id آیدی من\n/support متن پیام\n/items محصولات/خدمات");
    return;
  }
  if (cmd?.name === "/id" || labelIs(text, "🆔 آیدی من", "آیدی من")) {
    await saveSettings(settings);
    await sendMessage(user.chatId, "شناسه بله شما:\n" + user.id);
    return;
  }
  if (labelIs(text, "ℹ️ درباره ما")) {
    await saveSettings(settings);
    await sendUserMenu(user, settings, admin, settings.aboutText || (settings.businessName + "\n" + settings.welcomeMessage));
    return;
  }
  if (cmd?.name === "/items" || labelIs(text, "🛒 محصولات", "محصولات", "🎬 آرشیو رسانه")) {
    await saveSettings(settings);
    await sendUserMenu(user, settings, admin, TEMPLATE_CODE === "BALE_MEDIA_GALLERY" || TEMPLATE_CODE === "BALE_MEDIA" ? "آرشیو رسانه:\n\n" + listMedia(settings) : "محصولات/خدمات:\n\n" + listItems(settings));
    return;
  }
  if (labelIs(text, "🔍 جستجو")) {
    sessions.set(user.id, { mode: "SEARCH", step: 0, answers: [] });
    await sendMessage(user.chatId, "عبارت جستجو را ارسال کنید. برای لغو /cancel را بفرستید.");
    return;
  }
  if (cmd?.name === "/support" || labelIs(text, "📞 پشتیبانی", "🎫 ثبت تیکت", "ثبت تیکت")) {
    const body = cmd?.args || "";
    sessions.set(user.id, { mode: "SUPPORT", step: 0, answers: [] });
    if (body) await handleSession(settings, user, body, admin); else await sendMessage(user.chatId, "متن پیام پشتیبانی را ارسال کنید. برای لغو /cancel را بفرستید.");
    return;
  }
  if (labelIs(text, "📚 سوالات متداول")) {
    await saveSettings(settings);
    await sendUserMenu(user, settings, admin, "سوالات متداول:\n\n" + settings.faq.map(function(x, i) { return String(i + 1) + ". " + x; }).join("\n\n"));
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
    await sendMessage(user.chatId, "خدمت موردنظر را ارسال کنید:\n" + settings.reservationServices.map(function(s, i) { return String(i + 1) + ". " + s; }).join("\n"));
    return;
  }
  if (labelIs(text, "🧾 ثبت سفارش")) {
    sessions.set(user.id, { mode: "ORDER", step: 0, answers: [] });
    await sendMessage(user.chatId, "برای ثبت سفارش، شماره یا نام محصول/خدمت را ارسال کنید:\n\n" + listItems(settings));
    return;
  }
  if (labelIs(text, "🔔 عضویت اطلاع‌رسانی")) {
    await saveSettings(settings);
    await sendUserMenu(user, settings, admin, "عضویت شما در اطلاع‌رسانی ثبت شد ✅");
    return;
  }
  if (admin && (cmd?.name === "/admin" || labelIs(text, "⚙️ پنل مدیریت"))) {
    await saveSettings(settings);
    await sendAdminPanel(user, settings);
    return;
  }
  if (admin && (cmd?.name === "/stats" || labelIs(text, "📊 آمار"))) {
    await saveSettings(settings);
    await sendAdminPanel(user, settings);
    await sendMessage(user.chatId, "آمار:\nکاربران: " + settings.users.length + "\nتیکت‌ها: " + settings.tickets.length + "\nسفارش‌ها: " + settings.shopOrders.length + "\nفرم‌ها: " + settings.formResponses.length + "\nرزروها: " + settings.reservations.length + "\nمحتوا/محصول: " + (settings.items.length + settings.mediaItems.length) + "\nقالب: " + TEMPLATE_CODE + "\nامکانات: " + (FEATURES.length ? FEATURES.join("، ") : "ندارد"));
    return;
  }
  if (admin && labelIs(text, "👥 کاربران")) {
    await saveSettings(settings);
    await sendAdminPanel(user, settings);
    await sendMessage(user.chatId, "کاربران:\n\n" + listUsers(settings));
    return;
  }
  if (admin && (cmd?.name === "/tickets" || labelIs(text, "🎫 تیکت‌ها"))) {
    await saveSettings(settings);
    const list = settings.tickets.slice(-10).reverse().map(function(t) { return t.id + " | " + t.status + " | " + t.userId + "\n" + t.text; }).join("\n\n") || "تیکتی ثبت نشده است.";
    await sendAdminPanel(user, settings);
    await sendMessage(user.chatId, "آخرین تیکت‌ها:\n\n" + list + "\n\nپاسخ: /reply TICKET_ID متن");
    return;
  }
  if (admin && (cmd?.name === "/orders" || labelIs(text, "🧾 سفارش‌ها"))) {
    await saveSettings(settings);
    const list = settings.shopOrders.slice(-10).reverse().map(function(o) { return o.id + " | " + o.status + " | " + o.itemTitle + " | " + o.contact; }).join("\n") || "سفارشی ثبت نشده است.";
    await sendAdminPanel(user, settings);
    await sendMessage(user.chatId, "آخرین سفارش‌ها:\n" + list);
    return;
  }
  if (admin && (cmd?.name === "/forms" || labelIs(text, "📝 فرم‌ها"))) {
    await saveSettings(settings);
    const list = settings.formResponses.slice(-10).reverse().map(function(f) { return f.id + " | " + f.userId + " | " + f.answers.join(" / "); }).join("\n") || "فرمی ثبت نشده است.";
    await sendAdminPanel(user, settings);
    await sendMessage(user.chatId, "آخرین فرم‌ها:\n" + list);
    return;
  }
  if (admin && (cmd?.name === "/reservations" || labelIs(text, "📅 رزروها"))) {
    await saveSettings(settings);
    const list = settings.reservations.slice(-10).reverse().map(function(r) { return r.id + " | " + r.status + " | " + r.service + " | " + r.requestedTime + " | " + r.contact; }).join("\n") || "رزروی ثبت نشده است.";
    await sendAdminPanel(user, settings);
    await sendMessage(user.chatId, "آخرین رزروها:\n" + list);
    return;
  }
  if (admin && (cmd?.name === "/broadcast" || labelIs(text, "📨 پیام همگانی"))) {
    const msg = cmd?.args || "";
    sessions.set(user.id, { mode: "BROADCAST", step: 0, answers: [] });
    if (msg) await handleSession(settings, user, msg, admin); else await sendMessage(user.chatId, "متن پیام همگانی را ارسال کنید. برای لغو /cancel را بفرستید.");
    return;
  }
  if (admin && (cmd?.name === "/welcome" || labelIs(text, "✏️ تغییر خوش‌آمد"))) {
    const msg = cmd?.args || "";
    if (msg) { settings.welcomeMessage = msg; await saveSettings(settings); await sendAdminPanel(user, settings); return; }
    sessions.set(user.id, { mode: "EDIT_WELCOME", step: 0, answers: [] });
    await sendMessage(user.chatId, "متن خوش‌آمد جدید را ارسال کنید.");
    return;
  }
  if (admin && (cmd?.name === "/item" || labelIs(text, "➕ افزودن محصول"))) {
    const line = cmd?.args || "";
    if (line) { settings.items.push(parseItemLine(line)); await saveSettings(settings); await sendAdminPanel(user, settings); return; }
    sessions.set(user.id, { mode: "ADD_ITEM", step: 0, answers: [] });
    await sendMessage(user.chatId, "محصول/خدمت را با این فرمت ارسال کنید:\nعنوان | قیمت | دسته | موجودی | توضیح");
    return;
  }
  if (admin && labelIs(text, "🗑 حذف محصول")) {
    sessions.set(user.id, { mode: "DELETE_ITEM", step: 0, answers: [] });
    await sendMessage(user.chatId, "شماره محصول/خدمت را برای حذف ارسال کنید:\n\n" + listItems(settings));
    return;
  }
  if (admin && labelIs(text, "🎬 افزودن رسانه")) {
    sessions.set(user.id, { mode: "ADD_MEDIA", step: 0, answers: [] });
    await sendMessage(user.chatId, "رسانه را با این فرمت ارسال کنید:\nعنوان | دسته | لینک | توضیح");
    return;
  }
  if (admin && cmd?.name === "/reply") {
    const parts = cmd.args.split(/\s+/).filter(Boolean);
    const ticketId = parts.shift() || "";
    const reply = parts.join(" ").trim();
    const ticket = settings.tickets.find(function(t) { return t.id === ticketId; });
    if (!ticket) { await sendMessage(user.chatId, "تیکت پیدا نشد."); return; }
    if (!reply) { sessions.set(user.id, { mode: "REPLY_TICKET", step: 0, answers: [ticketId], meta: { ticketId: ticketId } }); await sendMessage(user.chatId, "متن پاسخ تیکت " + ticketId + " را ارسال کنید."); return; }
    ticket.status = "ANSWERED";
    ticket.adminReply = reply;
    ticket.updatedAt = nowIso();
    await saveSettings(settings);
    await sendMessage(ticket.chatId || ticket.userId, "پاسخ پشتیبانی:\n" + reply);
    await sendAdminPanel(user, settings);
    return;
  }
  if (admin && (cmd?.name === "/addadmin" || labelIs(text, "➕ افزودن ادمین"))) {
    const id = faToEnDigits(cmd?.args || "").replace(/[^0-9]/g, "");
    if (id) { if (!settings.admins.includes(id)) settings.admins.push(id); await saveSettings(settings); await sendAdminPanel(user, settings); await sendMessage(user.chatId, "ادمین اضافه شد ✅\n" + id); return; }
    sessions.set(user.id, { mode: "ADD_ADMIN", step: 0, answers: [] });
    await sendMessage(user.chatId, "شناسه عددی ادمین جدید را ارسال کنید.");
    return;
  }
  if (admin && labelIs(text, "🗑 حذف کاربر")) {
    sessions.set(user.id, { mode: "DELETE_USER", step: 0, answers: [] });
    await sendMessage(user.chatId, "شناسه عددی کاربر را برای حذف ارسال کنید.\n\n" + listUsers(settings));
    return;
  }
  if (text && !text.startsWith("/")) {
    sessions.set(user.id, { mode: "SUPPORT", step: 0, answers: [] });
    await handleSession(settings, user, text, admin);
    return;
  }
  await saveSettings(settings);
  await sendUserMenu(user, settings, admin, "دستور شناخته نشد. از منوی زیر استفاده کنید.");
}
app.get("/health", function(_req, res) { res.json({ ok: true, platform: "BALE", phase: 68, template: TEMPLATE_CODE, bot: BALE_BOT_USERNAME || null, hasToken: Boolean(BALE_TOKEN), baseUrl: BASE_URL || null, webhookPath: "/bale/webhook/" + WEBHOOK_SECRET }); });
app.get("/", function(_req, res) { res.type("html").send("<h1>" + BUSINESS_NAME + "</h1><p>بازوی بله فعال است.</p><p>برای استفاده داخل بله /start را ارسال کنید.</p><p><a href='/health'>Health</a></p>"); });
app.get("/bale/setup", function(_req, res) { res.type("text").send("برای مدیریت بازو داخل بله /start بزنید. اگر مدیریت خودکار فعال است، دستور /claim را با کد تحویل‌شده ارسال کنید."); });
app.post("/bale/webhook/" + WEBHOOK_SECRET, async function(req, res) {
  res.json({ ok: true });
  try { await handleUpdate(req.body); } catch (error) { console.error("Bale webhook handling failed", error); }
});
async function setupWebhook() {
  if (!BASE_URL || !BALE_TOKEN) return;
  const url = BASE_URL + "/bale/webhook/" + WEBHOOK_SECRET;
  try {
    await baleApi("setWebhook", { url: url });
    console.log("Bale webhook set:", url);
  } catch (error) {
    console.error("Bale setWebhook failed", error);
  }
}
app.listen(PORT, async function() {
  console.log("Bale bot service listening on", PORT);
  await setupWebhook();
});
