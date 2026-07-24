import express from "express";
import cors from "cors";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { query, withTransaction } from "./db.js";
import { login, requireAuth, optionalAuth } from "./auth.js";
import {
  normalizeMobile,
  normalizeEmail,
  signCustomerToken,
  signOrderToken,
  verifyOrderToken,
  requireCustomer,
  optionalCustomer,
} from "./customerAuth.js";
import {
  generateOtp,
  hashOtp,
  otpDevEcho,
  OTP_TTL_MINUTES,
  OTP_MAX_ATTEMPTS,
  OTP_REQUEST_CAP,
} from "./otp.js";
import { sendOrderEmails, sendContactEmail, sendOtpEmail } from "./mailer.js";
import {
  sendOtpWhatsApp,
  whatsappOtpEnabled,
  whatsappRouter,
} from "./whatsapp.js";
import { beginGoogleAuth, finishGoogleAuth, googleEnabled } from "./google.js";
import { scraperRouter } from "./scraper.js";
import {
  whishEnabled,
  createPayment as whishCreatePayment,
  getCollectStatus as whishStatus,
} from "./whish.js";
import { notificationsRouter } from "./notifications/router.js";
import { emitEvent } from "./notifications/service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.resolve(
  process.env.UPLOAD_DIR || path.join(__dirname, "..", "uploads"),
);
const PUBLIC_URL = (process.env.PUBLIC_URL || "http://localhost:8081").replace(
  /\/$/,
  "",
);
const STORE_URL = (process.env.STORE_URL || "http://localhost:5180").replace(
  /\/$/,
  "",
);
const PUBLIC_API_URL = (process.env.PUBLIC_API_URL || PUBLIC_URL).replace(
  /\/$/,
  "",
);
const STORE_PUBLIC_URL = (process.env.STORE_PUBLIC_URL || STORE_URL).replace(
  /\/$/,
  "",
);
const APP_RETURN_SCHEMES = (
  process.env.APP_RETURN_SCHEMES || "ascompany,exp,exps"
)
  .split(",")
  .map((s) => s.trim().toLowerCase().replace(/:$/, ""))
  .filter(Boolean);

function appReturnUrl(url) {
  if (!url) return "";
  try {
    const u = new URL(String(url));
    const scheme = u.protocol.replace(/:$/, "").toLowerCase();
    return APP_RETURN_SCHEMES.includes(scheme)
      ? u.toString().replace(/\/$/, "")
      : "";
  } catch {
    return "";
  }
}
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const app = express();

const origins = (process.env.CORS_ORIGIN || "*")
  .split(",")
  .map((s) => s.trim());
app.use(cors({ origin: origins.includes("*") ? true : origins }));
app.use(
  express.json({
    limit: "2mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);
app.use("/uploads", express.static(UPLOAD_DIR));

const ah = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const slugify = (s) =>
  String(s)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const categoryJson = (r) => ({
  id: r.id,
  name: r.name,
  slug: r.slug,
  tagline: r.tagline || "",
  imageUrl: r.image_url || "",
  parentId: r.parent_id ?? null,
  sort: r.sort,
  visible: r.visible,
  showInNav: r.show_in_nav,
});

const brandJson = (r) => ({
  id: r.id,
  name: r.name,
  slug: r.slug,
  imageUrl: r.image_url || "",
  sort: r.sort,
  visible: r.visible,
});

const salePrice = (base, pct) => Math.round(Number(base) * (100 - pct)) / 100;

const productJson = (r) => {
  const pct = Number(r.sale_percent) || 0;
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    tagline: r.tagline || "",
    description: r.description || "",
    specs: Array.isArray(r.specs) ? r.specs : [],
    price: pct ? salePrice(r.price, pct) : r.price,
    oldPrice: pct ? Number(r.price) : r.old_price,
    salePercent: pct || null,
    categoryId: r.category_id,
    category: r.category_name || "",
    categorySlug: r.category_slug || "",
    brandId: r.brand_id,
    brand: r.brand_name || "",
    sourceUrl: r.source_url || "",
    colors: Array.isArray(r.colors) ? r.colors : [],
    stock: r.stock,
    isNew: r.is_new,
    featured: r.featured,
    visible: r.visible,
    sort: r.sort,
    image: r.image || (Array.isArray(r.images) ? r.images[0] : "") || "",
    images: Array.isArray(r.images) ? r.images : [],
  };
};

const LOGIN_BUTTON_WEIGHTS = ["normal", "medium", "semibold"];

const settingsJson = (r) => ({
  storeName: r.store_name || "AS Store",
  announcement: {
    enabled: r.announcement_enabled,
    text: r.announcement_text || "",
  },
  contact: {
    email: r.contact_email || "",
    phone: r.contact_phone || "",
    whatsapp: r.contact_whatsapp || "",
    address: r.contact_address || "",
  },
  socials: r.socials || {},
  navLinks: Array.isArray(r.nav_links) ? r.nav_links : [],
  footerGroups: Array.isArray(r.footer_groups) ? r.footer_groups : [],
  showcaseBg: r.showcase_bg || "#000000",
  navLogoSize: r.nav_logo_size ?? 20,
  navLogoSizeMobile: r.nav_logo_size_mobile ?? 18,
  homeNew: {
    enabled: r.home_new_enabled ?? true,
    eyebrow: r.home_new_eyebrow ?? "Just landed",
    heading: r.home_new_heading ?? "New in.",
    source: r.home_new_source || "newest",
    categoryId: r.home_new_category_id ?? null,
    count: r.home_new_count ?? 8,
  },
  loginButton: {
    label: r.login_button_label ?? "Continue with email",
    logo: r.login_button_logo || "",
    weight: r.login_button_weight || "medium",
  },
  published: r.published ?? false,
  updatedAt: r.updated_at,
});

const pageJson = (r) => ({
  id: r.id,
  slug: r.slug,
  title: r.title,
  body: r.body || "",
  visible: r.visible,
  sort: r.sort,
  updatedAt: r.updated_at,
});

const customerJson = (r) => ({
  id: r.id,
  name: r.name || "",
  mobile: r.mobile || "",
  email: r.email || "",
  phone: r.phone || "",
  address: r.address || "",
  addresses: Array.isArray(r.addresses) ? r.addresses : [],
  createdAt: r.created_at,
});

// Sanitize a saved-address book: trim/limit fields, drop empty rows, cap the
// count, and guarantee exactly one default.
const genAddrId = () =>
  "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
function normalizeAddresses(input) {
  const cleaned = (Array.isArray(input) ? input : [])
    .slice(0, 20)
    .map((a) => ({
      id: (String(a?.id || "").trim() || genAddrId()).slice(0, 40),
      title: String(a?.title || "")
        .trim()
        .slice(0, 60),
      fullName: String(a?.fullName || "")
        .trim()
        .slice(0, 120),
      phone: String(a?.phone || "")
        .trim()
        .slice(0, 40),
      address: String(a?.address || "")
        .trim()
        .slice(0, 300),
      city: String(a?.city || "")
        .trim()
        .slice(0, 120),
      isDefault: Boolean(a?.isDefault),
    }))
    .filter((a) => a.address);
  if (cleaned.length) {
    let d = cleaned.findIndex((a) => a.isDefault);
    if (d < 0) d = 0;
    cleaned.forEach((a, i) => (a.isDefault = i === d));
  }
  return cleaned;
}

const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "shipped",
  "delivered",
  "cancelled",
];

const orderItemJson = (r) => ({
  id: r.id,
  productId: r.product_id,
  name: r.name || "",
  price: r.price,
  qty: r.qty,
  image: r.image || "",
});

const orderJson = (r) => ({
  id: r.id,
  status: r.status,
  fullName: r.full_name || "",
  phone: r.phone || "",
  email: r.email || "",
  address: r.address || "",
  city: r.city || "",
  notes: r.notes || "",
  subtotal: r.subtotal,
  paymentMethod: r.payment_method || "cod",
  paymentStatus: r.payment_status || "unpaid",
  currency: r.currency || "USD",
  collectUrl: r.whish_collect_url || "", // hosted Whish page, for resuming an unpaid payment
  customerId: r.customer_id,
  customerEmail: r.customer_email, // present on admin queries
  itemCount: r.item_count, // present on list queries
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

async function loadOrderDetail(id) {
  const { rows } = await query(
    `SELECT o.*, c.email AS customer_email
     FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
     WHERE o.id = $1`,
    [id],
  );
  if (!rows[0]) return null;
  const { rows: items } = await query(
    `SELECT * FROM order_items WHERE order_id = $1 ORDER BY id`,
    [id],
  );
  return { ...orderJson(rows[0]), items: items.map(orderItemJson) };
}

const sectionJson = (r) => ({
  id: r.id,
  type: r.type,
  eyebrow: r.eyebrow || "",
  heading: r.heading || "",
  subheading: r.subheading || "",
  body: r.body || "",
  imageUrl: r.image_url || "",
  bg: r.bg || "",
  textTheme: r.text_theme || "auto",
  settings: r.settings && typeof r.settings === "object" ? r.settings : {},
  visible: r.visible,
  sort: r.sort,
});

const SECTION_COLS = {
  type: "type",
  eyebrow: "eyebrow",
  heading: "heading",
  subheading: "subheading",
  body: "body",
  imageUrl: "image_url",
  bg: "bg",
  textTheme: "text_theme",
  settings: "settings",
  visible: "visible",
  sort: "sort",
};

const SALE_JOIN = `
  LEFT JOIN LATERAL (
    SELECT s.percent FROM sales s
    WHERE s.active
      AND (s.starts_at IS NULL OR s.starts_at <= now())
      AND (s.ends_at   IS NULL OR s.ends_at   >  now())
      AND (s.scope = 'all'
        OR (s.scope = 'category' AND s.category_id = p.category_id)
        OR (s.scope = 'brand'    AND s.brand_id    = p.brand_id)
        OR (s.scope = 'products' AND s.product_ids @> to_jsonb(p.id)))
    ORDER BY s.percent DESC LIMIT 1
  ) sale ON true`;

// Shared SELECT fragments.
const LIST_SELECT = `
  SELECT p.*, c.name AS category_name, c.slug AS category_slug, b.name AS brand_name,
    sale.percent AS sale_percent,
    (SELECT pi.url FROM product_images pi WHERE pi.product_id = p.id
       ORDER BY pi.sort, pi.id LIMIT 1) AS image
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN brands b ON b.id = p.brand_id
  ${SALE_JOIN}`;

const DETAIL_SELECT = `
  SELECT p.*, c.name AS category_name, c.slug AS category_slug, b.name AS brand_name,
    sale.percent AS sale_percent,
    COALESCE((SELECT json_agg(pi.url ORDER BY pi.sort, pi.id)
              FROM product_images pi WHERE pi.product_id = p.id), '[]') AS images
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN brands b ON b.id = p.brand_id
  ${SALE_JOIN}`;

// Columns that admin create/update accept, mapped from camelCase body keys.
const PRODUCT_COLS = {
  name: "name",
  slug: "slug",
  tagline: "tagline",
  description: "description",
  specs: "specs",
  price: "price",
  oldPrice: "old_price",
  categoryId: "category_id",
  brandId: "brand_id",
  colors: "colors",
  stock: "stock",
  isNew: "is_new",
  featured: "featured",
  visible: "visible",
  sort: "sort",
};

// ========================= Health =========================
app.get("/api/health", (req, res) => res.json({ ok: true }));

app.post(
  "/api/contact",
  ah(async (req, res) => {
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim();
    const phone = String(req.body?.phone || "").trim();
    const message = String(req.body?.message || "").trim();

    if (!name || !message)
      return res
        .status(400)
        .json({ error: "Please add your name and a message." });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res
        .status(400)
        .json({ error: "Please enter a valid email address." });
    if (!email && !phone)
      return res
        .status(400)
        .json({ error: "Add an email or phone number so we can reply." });
    if (message.length > 4000)
      return res.status(400).json({ error: "Message is too long." });

    try {
      const { delivered } = await sendContactEmail({
        name,
        email,
        phone,
        message,
      });
      res.json({ ok: true, delivered });
    } catch (e) {
      console.error("[contact] send failed:", e?.message || e);
      res.status(502).json({
        error: "We couldn't send your message. Please try WhatsApp instead.",
      });
    }
  }),
);

// ========================= Auth =========================
app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  const token = login(email || "", password || "");
  if (!token)
    return res.status(401).json({ error: "Invalid email or password" });
  res.json({ token, admin: { email } });
});
app.get("/api/auth/me", requireAuth, (req, res) =>
  res.json({ email: req.admin.email }),
);

const otpChannels = () => [
  "email",
  ...(whatsappOtpEnabled() ? ["whatsapp"] : []),
];

function otpTarget(body) {
  const channel = String(body?.channel || "email").toLowerCase();
  if (channel === "whatsapp") {
    const mobile = normalizeMobile(body?.mobile ?? body?.identifier);
    return mobile ? { channel, identifier: mobile } : null;
  }
  const email = normalizeEmail(body?.email ?? body?.identifier);
  return email ? { channel: "email", identifier: email } : null;
}

const badTargetMessage = (body) =>
  String(body?.channel || "").toLowerCase() === "whatsapp"
    ? "Enter a valid mobile number"
    : "Enter a valid email address";

async function issueOtp(target) {
  const code = generateOtp();
  await query(
    `INSERT INTO otp_codes (mobile, code_hash, expires_at)
     VALUES ($1,$2, now() + make_interval(mins => $3))`,
    [target.identifier, hashOtp(target.identifier, code), OTP_TTL_MINUTES],
  );
  if (target.channel === "whatsapp")
    await sendOtpWhatsApp(target.identifier, code);
  else await sendOtpEmail(target.identifier, code);
  return code;
}

async function otpRateLimited(identifier) {
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM otp_codes
     WHERE mobile = $1 AND created_at > now() - interval '15 minutes'`,
    [identifier],
  );
  return rows[0].n >= OTP_REQUEST_CAP;
}

async function consumeOtp(target, code) {
  const { rows } = await query(
    `SELECT * FROM otp_codes
     WHERE mobile = $1 AND consumed = false AND expires_at > now()
     ORDER BY id DESC LIMIT 1`,
    [target.identifier],
  );
  const otp = rows[0];
  if (!otp || otp.attempts >= OTP_MAX_ATTEMPTS)
    return "Code expired — request a new one";
  if (otp.code_hash !== hashOtp(target.identifier, code)) {
    await query(`UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1`, [
      otp.id,
    ]);
    return "Incorrect code";
  }
  await query(`UPDATE otp_codes SET consumed = true WHERE id = $1`, [otp.id]);
  return "";
}

const missingChannel = (c) =>
  !c.email ? "email" : !c.mobile ? "whatsapp" : null;

async function findOrCreateCustomerByMobile(mobile, seed = {}) {
  const { rows } = await query(`SELECT * FROM customers WHERE mobile = $1`, [
    mobile,
  ]);
  if (rows[0]) return { customer: rows[0], created: false };
  const { rows: made } = await query(
    `INSERT INTO customers (name, mobile, email, phone, address)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [
      (seed.name || "").trim(),
      mobile,
      seed.email || null,
      seed.phone || mobile,
      seed.address || "",
    ],
  );
  return { customer: made[0], created: true };
}

async function findOrCreateCustomerByEmail(email, seed = {}) {
  const { rows } = await query(
    `SELECT * FROM customers WHERE lower(email) = $1 ORDER BY id DESC LIMIT 1`,
    [email],
  );
  if (rows[0]) return { customer: rows[0], created: false };
  const { rows: made } = await query(
    `INSERT INTO customers (name, email, phone, address)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [(seed.name || "").trim(), email, seed.phone || "", seed.address || ""],
  );
  return { customer: made[0], created: true };
}

async function fillProfile(customer, profile) {
  const name = String(profile?.name || "")
    .trim()
    .slice(0, 120);
  const address = String(profile?.address || "")
    .trim()
    .slice(0, 400);
  const mobile = normalizeMobile(profile?.mobile);
  const phone = String(profile?.mobile || profile?.phone || "")
    .trim()
    .slice(0, 40);
  if (!name && !address && !phone && !mobile) return customer;

  const { rows } = await query(
    `UPDATE customers SET
       name    = COALESCE(NULLIF(name, ''), $2),
       phone   = COALESCE(NULLIF(phone, ''), $3),
       address = COALESCE(NULLIF(address, ''), $4)
     WHERE id = $1 RETURNING *`,
    [customer.id, name, phone, address],
  );
  let row = rows[0] || customer;

  if (mobile && !row.mobile) {
    try {
      const { rows: claimed } = await query(
        `UPDATE customers SET mobile = $2 WHERE id = $1 AND mobile IS NULL RETURNING *`,
        [row.id, mobile],
      );
      if (claimed[0]) row = claimed[0];
    } catch (e) {
      if (e?.code !== "23505") throw e;
      console.warn(
        `[account] mobile ${mobile} is already on another account — kept as phone only`,
      );
    }
  }
  return row;
}

app.get("/api/account/auth/methods", (_req, res) =>
  res.json({ google: googleEnabled(), otpChannels: otpChannels() }),
);

app.get(
  "/api/account/google/start",
  ah(async (req, res) => {
    if (!googleEnabled())
      return res.redirect(`${STORE_URL}/login?error=google`);
    res.redirect(
      beginGoogleAuth(res, req.query.next, appReturnUrl(req.query.appReturn)),
    );
  }),
);

app.get(
  "/api/account/google/callback",
  ah(async (req, res) => {
    let profile;
    try {
      profile = await finishGoogleAuth(req, res);
    } catch (e) {
      console.error("[google] sign-in failed:", e?.message || e);
      const to = appReturnUrl(e.appReturn);
      if (to) return res.redirect(`${to}?error=google`);
      return res.redirect(`${STORE_URL}/login?error=google`);
    }

    const { customer } = await findOrCreateCustomerByEmail(profile.email);
    const row = await fillProfile(customer, { name: profile.name });
    const token = signCustomerToken(row);
    const to = appReturnUrl(profile.appReturn);
    if (to)
      return res.redirect(
        `${to}?${new URLSearchParams({ token, next: profile.next })}`,
      );
    const params = new URLSearchParams({ token, next: profile.next });
    res.redirect(`${STORE_URL}/auth/google#${params}`);
  }),
);

async function linkIdentifier(customerId, target) {
  const col = target.channel === "whatsapp" ? "mobile" : "email";
  const label = col === "mobile" ? "mobile number" : "email address";
  return withTransaction(async (client) => {
    const { rows: mine } = await client.query(
      `SELECT * FROM customers WHERE id = $1`,
      [customerId],
    );
    const me = mine[0];
    if (!me) return { error: "Account not found" };
    const current = String(me[col] || "").toLowerCase();
    if (current && current !== target.identifier) {
      return { error: `This account already uses a different ${label}.` };
    }

    const { rows: others } = await client.query(
      col === "mobile"
        ? `SELECT * FROM customers WHERE mobile = $1 AND id <> $2 ORDER BY id ASC`
        : `SELECT * FROM customers WHERE lower(email) = $1 AND id <> $2 ORDER BY id ASC`,
      [target.identifier, customerId],
    );
    const other = others[0];

    // Nobody else holds this identifier — just claim it.
    if (!other) {
      const { rows } = await client.query(
        `UPDATE customers SET ${col} = $1 WHERE id = $2 RETURNING *`,
        [target.identifier, customerId],
      );
      return { customer: rows[0] };
    }

    const [keep, drop] = me.id < other.id ? [me, other] : [other, me];
    await client.query(
      `UPDATE orders SET customer_id = $1 WHERE customer_id = $2`,
      [keep.id, drop.id],
    );
    await client.query(`DELETE FROM customers WHERE id = $1`, [drop.id]);
    const { rows } = await client.query(
      `UPDATE customers SET
         name      = COALESCE(NULLIF(name, ''), $2),
         mobile    = COALESCE(mobile, $3),
         email     = COALESCE(email, $4),
         phone     = COALESCE(NULLIF(phone, ''), $5),
         address   = COALESCE(NULLIF(address, ''), $6),
         addresses = COALESCE(NULLIF(addresses, '[]'::jsonb), $7::jsonb)
       WHERE id = $1 RETURNING *`,
      [
        keep.id,
        drop.name || "",
        drop.mobile,
        drop.email,
        drop.phone || "",
        drop.address || "",
        JSON.stringify(drop.addresses || []),
      ],
    );
    return { customer: rows[0] };
  });
}

app.post(
  "/api/account/otp/request",
  ah(async (req, res) => {
    const target = otpTarget(req.body);
    if (!target)
      return res.status(400).json({ error: badTargetMessage(req.body) });
    if (!otpChannels().includes(target.channel)) {
      return res
        .status(400)
        .json({ error: "WhatsApp sign-in isn’t available right now" });
    }
    if (await otpRateLimited(target.identifier)) {
      return res.status(429).json({
        error: "Too many codes requested — try again in a few minutes",
      });
    }

    let code;
    try {
      code = await issueOtp(target);
    } catch (e) {
      console.error(`[otp] ${target.channel} send failed:`, e?.message || e);
      return res
        .status(502)
        .json({ error: "We couldn't send your code. Please try again." });
    }
    res.json({
      ok: true,
      channel: target.channel,
      identifier: target.identifier,
      ...(otpDevEcho() ? { devCode: code } : {}),
    });
  }),
);

app.post(
  "/api/account/otp/verify",
  ah(async (req, res) => {
    const target = otpTarget(req.body);
    const code = String(req.body?.code || "").trim();
    if (!target || !code)
      return res
        .status(400)
        .json({ error: "Identifier and code are required" });

    const error = await consumeOtp(target, code);
    if (error) return res.status(400).json({ error });

    const { customer } =
      target.channel === "whatsapp"
        ? await findOrCreateCustomerByMobile(target.identifier)
        : await findOrCreateCustomerByEmail(target.identifier);
    const row = req.body?.profile
      ? await fillProfile(customer, req.body.profile)
      : customer;

    res.json({
      token: signCustomerToken(row),
      customer: customerJson(row),
      linkChannel: otpChannels().includes(missingChannel(row))
        ? missingChannel(row)
        : null,
    });
  }),
);

app.post(
  "/api/account/link/request",
  requireCustomer,
  ah(async (req, res) => {
    const target = otpTarget(req.body);
    if (!target)
      return res.status(400).json({ error: badTargetMessage(req.body) });
    if (!otpChannels().includes(target.channel)) {
      return res
        .status(400)
        .json({ error: "That sign-in method isn’t available right now" });
    }
    if (await otpRateLimited(target.identifier)) {
      return res.status(429).json({
        error: "Too many codes requested — try again in a few minutes",
      });
    }

    let code;
    try {
      code = await issueOtp(target);
    } catch (e) {
      console.error(`[link] ${target.channel} send failed:`, e?.message || e);
      return res
        .status(502)
        .json({ error: "We couldn't send your code. Please try again." });
    }
    res.json({
      ok: true,
      channel: target.channel,
      ...(otpDevEcho() ? { devCode: code } : {}),
    });
  }),
);

app.post(
  "/api/account/link/verify",
  requireCustomer,
  ah(async (req, res) => {
    const target = otpTarget(req.body);
    const code = String(req.body?.code || "").trim();
    if (!target || !code)
      return res
        .status(400)
        .json({ error: "Identifier and code are required" });

    const error = await consumeOtp(target, code);
    if (error) return res.status(400).json({ error });

    const { customer, error: linkError } = await linkIdentifier(
      req.customerId,
      target,
    );
    if (linkError) return res.status(400).json({ error: linkError });
    res.json({
      token: signCustomerToken(customer),
      customer: customerJson(customer),
    });
  }),
);

app.get(
  "/api/account/me",
  requireCustomer,
  ah(async (req, res) => {
    const { rows } = await query(`SELECT * FROM customers WHERE id = $1`, [
      req.customerId,
    ]);
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(customerJson(rows[0]));
  }),
);

app.put(
  "/api/account",
  requireCustomer,
  ah(async (req, res) => {
    const b = req.body || {};
    const { rows } = await query(
      `UPDATE customers SET
         name = COALESCE($2, name), phone = COALESCE($3, phone),
         address = COALESCE($4, address), email = COALESCE($5, email)
       WHERE id = $1 RETURNING *`,
      [
        req.customerId,
        b.name ?? null,
        b.phone ?? null,
        b.address ?? null,
        b.email ?? null,
      ],
    );
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(customerJson(rows[0]));
  }),
);

// Saved address book. GET returns the list; PUT replaces it wholesale (the
// client edits the array and saves it) and returns the updated customer.
app.get(
  "/api/account/addresses",
  requireCustomer,
  ah(async (req, res) => {
    const { rows } = await query(
      `SELECT addresses FROM customers WHERE id = $1`,
      [req.customerId],
    );
    res.json(Array.isArray(rows[0]?.addresses) ? rows[0].addresses : []);
  }),
);

app.put(
  "/api/account/addresses",
  requireCustomer,
  ah(async (req, res) => {
    const addresses = normalizeAddresses(req.body?.addresses);
    const { rows } = await query(
      `UPDATE customers SET addresses = $2::jsonb WHERE id = $1 RETURNING *`,
      [req.customerId, JSON.stringify(addresses)],
    );
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(customerJson(rows[0]));
  }),
);

const MAX_ITEM_QTY = 2;

app.get("/api/payment/methods", (_req, res) =>
  res.json({ cod: true, whish: whishEnabled() }),
);

app.post(
  "/api/orders",
  optionalCustomer,
  ah(async (req, res) => {
    const b = req.body || {};
    const cleaned = (Array.isArray(b.items) ? b.items : [])
      .map((i) => ({
        productId: Number(i.productId),
        qty: Math.min(
          MAX_ITEM_QTY,
          Math.max(1, Math.floor(Number(i.qty) || 1)),
        ),
      }))
      .filter((i) => i.productId);
    if (!cleaned.length)
      return res.status(400).json({ error: "Your bag is empty" });

    const fullName = (b.fullName || "").trim();
    const phone = (b.phone || "").trim();
    const address = (b.address || "").trim();
    const email = (b.email || "").trim();
    if (!fullName || !phone || !address) {
      return res
        .status(400)
        .json({ error: "Name, mobile number and address are required" });
    }

    // Resolve the account: a signed-in customer, else find-or-create by mobile.
    let customerId = req.customerId;
    if (!customerId) {
      const mobile = normalizeMobile(phone);
      if (!mobile)
        return res.status(400).json({ error: "Enter a valid mobile number" });
      const { customer } = await findOrCreateCustomerByMobile(mobile, {
        name: fullName,
        email,
        phone,
        address,
      });
      customerId = customer.id;
    }

    const ids = cleaned.map((i) => i.productId);
    const { rows: prods } = await query(
      `SELECT p.id, p.name, p.price, sale.percent AS sale_percent,
        (SELECT pi.url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort, pi.id LIMIT 1) AS image
       FROM products p ${SALE_JOIN} WHERE p.id = ANY($1)`,
      [ids],
    );
    const byId = new Map(prods.map((p) => [p.id, p]));
    const items = [];
    let subtotal = 0;
    for (const it of cleaned) {
      const p = byId.get(it.productId);
      if (!p) continue;
      const pct = Number(p.sale_percent) || 0;
      const price = pct ? salePrice(p.price, pct) : Number(p.price) || 0;
      subtotal += price * it.qty;
      items.push({
        productId: p.id,
        name: p.name,
        price,
        qty: it.qty,
        image: p.image || "",
      });
    }
    if (!items.length)
      return res
        .status(400)
        .json({ error: "None of those items are available" });

    const paymentMethod = b.paymentMethod === "whish" ? "whish" : "cod";
    if (paymentMethod === "whish" && !whishEnabled()) {
      return res
        .status(400)
        .json({ error: "Online payment is unavailable right now" });
    }

    const { rows } = await query(
      `INSERT INTO orders (customer_id, status, full_name, phone, email, address, city, notes, subtotal, payment_method, payment_status, currency)
       VALUES ($1,'pending',$2,$3,$4,$5,$6,$7,$8,$9,'unpaid','USD') RETURNING id`,
      [
        customerId,
        fullName,
        phone,
        email,
        address,
        b.city || "",
        b.notes || "",
        subtotal,
        paymentMethod,
      ],
    );
    const orderId = rows[0].id;
    for (const it of items) {
      await query(
        `INSERT INTO order_items (order_id, product_id, name, price, qty, image)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [orderId, it.productId, it.name, it.price, it.qty, it.image],
      );
    }
    if (b.saveAddress) {
      await query(
        `UPDATE customers SET name = COALESCE(NULLIF($2,''), name), phone = $3, address = $4,
           email = COALESCE(NULLIF($5,''), email)
         WHERE id = $1`,
        [customerId, fullName, phone, address, email],
      );
    }
    // Transactional outbox: the notification worker turns this into the
    // "order received" message. Never blocks or fails the order.
    await emitEvent(
      "order_created",
      {
        orderId,
        customerId,
        name: fullName,
        itemCount: items.reduce((n, it) => n + it.qty, 0),
        total: subtotal,
      },
      `order:${orderId}:created`,
    ).catch((e) => console.error("[notify] emit order_created:", e?.message || e));

    const trackToken = signOrderToken(orderId);
    if (paymentMethod === "whish") {
      console.log(
        `[whish] order #${orderId} created (unpaid), starting payment: subtotal=${subtotal} USD`,
      );
      const appReturn = appReturnUrl(b.returnUrl);
      const bridge = (result) =>
        `${PUBLIC_API_URL}/api/orders/whish/return?ext=${orderId}&result=${result}` +
        `&t=${encodeURIComponent(trackToken)}&to=${encodeURIComponent(appReturn)}`;
      if (appReturn)
        console.log(
          `[whish] order #${orderId} is an app payment → returning to ${appReturn}`,
        );
      try {
        const { collectUrl } = await whishCreatePayment({
          amount: subtotal,
          currency: "USD",
          externalId: orderId,
          invoice: `AS Store order #${orderId}`,
          successCallbackUrl: `${PUBLIC_API_URL}/api/orders/whish/callback?ext=${orderId}`,
          failureCallbackUrl: `${PUBLIC_API_URL}/api/orders/whish/callback?ext=${orderId}`,
          successRedirectUrl: appReturn
            ? bridge("success")
            : `${STORE_PUBLIC_URL}/account/orders/${orderId}?placed=1&t=${encodeURIComponent(trackToken)}`,
          failureRedirectUrl: appReturn
            ? bridge("failure")
            : `${STORE_PUBLIC_URL}/account/orders/${orderId}?failed=1&t=${encodeURIComponent(trackToken)}`,
        });
        await query(
          `UPDATE orders SET whish_external_id = $2, whish_collect_url = $3 WHERE id = $1`,
          [orderId, String(orderId), collectUrl],
        );
        console.log(
          `[whish] order #${orderId} → redirecting customer to ${collectUrl}`,
        );
        const detail = await loadOrderDetail(orderId);
        return res.status(201).json({ ...detail, trackToken, collectUrl });
      } catch (e) {
        console.error("[whish] create failed:", e?.message || e);
        await query(`UPDATE orders SET status = 'cancelled' WHERE id = $1`, [
          orderId,
        ]);
        return res.status(502).json({
          error: "Could not start the online payment. Please try again.",
        });
      }
    }

    const detail = await loadOrderDetail(orderId);
    sendOrderEmails(detail, trackToken).catch((e) =>
      console.error("[mail]", e?.message || e),
    );
    res.status(201).json({ ...detail, trackToken });
  }),
);

async function markWhishPaid(orderId) {
  const { rows } = await query(
    `UPDATE orders SET payment_status = 'paid', status = 'confirmed'
     WHERE id = $1 AND payment_method = 'whish' AND payment_status <> 'paid'
     RETURNING id`,
    [orderId],
  );
  if (!rows[0]) {
    console.log(
      `[whish] order #${orderId} already settled — skipping (idempotent)`,
    );
    return false;
  }
  console.log(
    `[whish] order #${orderId} → marked PAID + confirmed, sending emails`,
  );
  const detail = await loadOrderDetail(orderId);
  sendOrderEmails(detail, signOrderToken(orderId)).catch((e) =>
    console.error("[mail]", e?.message || e),
  );
  await emitEvent(
    "payment_paid",
    { orderId: detail.id, customerId: detail.customerId, total: detail.subtotal },
    `order:${detail.id}:paid`,
  ).catch((e) => console.error("[notify] emit payment_paid:", e?.message || e));
  return true;
}

async function reconcileWhishOrder(order) {
  if (order.paymentMethod !== "whish" || order.paymentStatus === "paid")
    return order;
  console.log(
    `[whish] reconcile order #${order.id} (currently ${order.paymentStatus})`,
  );
  try {
    const { collectStatus } = await whishStatus({
      externalId: order.id,
      currency: order.currency || "USD",
    });
    if (collectStatus === "success") await markWhishPaid(order.id);
    else
      console.log(
        `[whish] order #${order.id} not paid yet (collectStatus=${collectStatus}) — leaving unpaid`,
      );
  } catch (e) {
    console.error("[whish] status check failed:", e?.message || e);
  }
  return loadOrderDetail(order.id);
}

app.get(
  "/api/orders/whish/callback",
  ah(async (req, res) => {
    const ext = Number(req.query.ext);
    console.log(
      `[whish] CALLBACK received: ext=${req.query.ext} query=${JSON.stringify(req.query)}`,
    );
    if (ext) {
      const order = await loadOrderDetail(ext);
      if (order) await reconcileWhishOrder(order);
      else console.log(`[whish] callback: no order found for ext=${ext}`);
    }
    res.json({ ok: true });
  }),
);

app.get(
  "/api/orders/whish/return",
  ah(async (req, res) => {
    const ext = Number(req.query.ext);
    const token = String(req.query.t || "");
    const to = appReturnUrl(req.query.to);
    console.log(
      `[whish] RETURN ext=${req.query.ext} result=${req.query.result} to=${to || "(none)"}`,
    );
    let paid = false;
    if (ext) {
      const order = await loadOrderDetail(ext);
      if (order) {
        const fresh = await reconcileWhishOrder(order);
        paid = fresh?.paymentStatus === "paid";
      }
    }
    const q = `${paid ? "placed=1" : "failed=1"}&t=${encodeURIComponent(token)}`;
    if (!to)
      return res.redirect(`${STORE_PUBLIC_URL}/account/orders/${ext}?${q}`);
    res.redirect(`${to}/${ext}?${q}`);
  }),
);

app.post(
  "/api/orders/:id/reconcile",
  optionalCustomer,
  ah(async (req, res) => {
    const order = await loadOrderDetail(req.params.id);
    if (!order) return res.status(404).json({ error: "Not found" });
    const token = req.query.token || req.body?.token;
    const owner = req.customerId && order.customerId === req.customerId;
    const tokenOk =
      token && String(verifyOrderToken(token)) === String(order.id);
    if (!owner && !tokenOk) return res.status(404).json({ error: "Not found" });
    res.json(await reconcileWhishOrder(order));
  }),
);

app.get(
  "/api/orders/track/:id",
  ah(async (req, res) => {
    const allowedId = verifyOrderToken(req.query.token);
    if (!allowedId || String(allowedId) !== String(req.params.id)) {
      return res.status(404).json({ error: "Not found" });
    }
    const order = await loadOrderDetail(req.params.id);
    if (!order) return res.status(404).json({ error: "Not found" });
    res.json(order);
  }),
);

app.get(
  "/api/orders",
  requireCustomer,
  ah(async (req, res) => {
    const { rows } = await query(
      `SELECT o.*, (SELECT count(*) FROM order_items oi WHERE oi.order_id = o.id)::int AS item_count
       FROM orders o WHERE o.customer_id = $1 ORDER BY o.id DESC`,
      [req.customerId],
    );
    res.json(rows.map(orderJson));
  }),
);

app.get(
  "/api/orders/:id",
  requireCustomer,
  ah(async (req, res) => {
    const order = await loadOrderDetail(req.params.id);
    if (!order || order.customerId !== req.customerId)
      return res.status(404).json({ error: "Not found" });
    res.json(order);
  }),
);

// ---- Admin order management ----
app.get(
  "/api/admin/orders",
  requireAuth,
  ah(async (req, res) => {
    const where = [];
    const params = [];
    if (req.query.status && ORDER_STATUSES.includes(req.query.status)) {
      params.push(req.query.status);
      where.push(`o.status = $${params.length}`);
    }
    const { rows } = await query(
      `SELECT o.*, c.email AS customer_email,
        (SELECT count(*) FROM order_items oi WHERE oi.order_id = o.id)::int AS item_count
       FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY o.id DESC`,
      params,
    );
    res.json(rows.map(orderJson));
  }),
);

app.get(
  "/api/admin/orders/:id",
  requireAuth,
  ah(async (req, res) => {
    const order = await loadOrderDetail(req.params.id);
    if (!order) return res.status(404).json({ error: "Not found" });
    res.json(order);
  }),
);

app.put(
  "/api/admin/orders/:id",
  requireAuth,
  ah(async (req, res) => {
    const status = req.body?.status;
    if (!ORDER_STATUSES.includes(status))
      return res.status(400).json({ error: "Invalid status" });
    // Only a real transition emits a notification event (idempotent anyway via
    // the dedupe key, but this avoids no-op outbox rows).
    const { rows } = await query(
      `UPDATE orders SET status = $2 WHERE id = $1 AND status <> $2
       RETURNING id, customer_id, status`,
      [req.params.id, status],
    );
    if (rows[0]) {
      await emitEvent(
        "order_status_changed",
        { orderId: rows[0].id, customerId: rows[0].customer_id, status },
        `order:${rows[0].id}:status:${status}`,
      ).catch((e) =>
        console.error("[notify] emit order_status_changed:", e?.message || e),
      );
    }
    const detail = await loadOrderDetail(req.params.id);
    if (!detail) return res.status(404).json({ error: "Not found" });
    res.json(detail);
  }),
);

app.delete(
  "/api/admin/orders/:id",
  requireAuth,
  ah(async (req, res) => {
    const { rows } = await query(
      `DELETE FROM orders WHERE id = $1 RETURNING id`,
      [req.params.id],
    );
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    res.status(204).end();
  }),
);

app.get(
  "/api/categories",
  optionalAuth,
  ah(async (req, res) => {
    const all = req.admin && req.query.all === "1";
    const { rows } = await query(
      `SELECT * FROM categories ${all ? "" : "WHERE visible = true"} ORDER BY sort, id`,
    );
    res.json(rows.map(categoryJson));
  }),
);

app.post(
  "/api/categories",
  requireAuth,
  ah(async (req, res) => {
    const b = req.body || {};
    const name = (b.name || "").trim();
    if (!name) return res.status(400).json({ error: "name is required" });
    const slug = (b.slug || "").trim() || slugify(name);
    const { rows } = await query(
      `INSERT INTO categories (name, slug, tagline, image_url, parent_id, sort, visible, show_in_nav)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        name,
        slug,
        b.tagline || "",
        b.imageUrl || "",
        b.parentId ?? null,
        b.sort ?? 0,
        b.visible ?? true,
        b.showInNav ?? false,
      ],
    );
    res.status(201).json(categoryJson(rows[0]));
  }),
);

app.put(
  "/api/categories/:id",
  requireAuth,
  ah(async (req, res) => {
    const b = req.body || {};
    if (b.parentId != null && String(b.parentId) === String(req.params.id)) {
      return res
        .status(400)
        .json({ error: "A category cannot be its own parent" });
    }
    const setsParent = Object.prototype.hasOwnProperty.call(b, "parentId");
    const { rows } = await query(
      `UPDATE categories SET
         name        = COALESCE($2, name),
         slug        = COALESCE($3, slug),
         tagline     = COALESCE($4, tagline),
         image_url   = COALESCE($5, image_url),
         sort        = COALESCE($6, sort),
         visible     = COALESCE($7, visible),
         show_in_nav = COALESCE($8, show_in_nav),
         parent_id   = CASE WHEN $10 THEN $9 ELSE parent_id END
       WHERE id = $1 RETURNING *`,
      [
        req.params.id,
        b.name ?? null,
        b.slug ?? null,
        b.tagline ?? null,
        b.imageUrl ?? null,
        b.sort ?? null,
        b.visible ?? null,
        b.showInNav ?? null,
        b.parentId ?? null,
        setsParent,
      ],
    );
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(categoryJson(rows[0]));
  }),
);

app.delete(
  "/api/categories/:id",
  requireAuth,
  ah(async (req, res) => {
    await query(`DELETE FROM categories WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  }),
);

app.get(
  "/api/products",
  optionalAuth,
  ah(async (req, res) => {
    const where = [];
    const params = [];
    const includeHidden = req.admin && req.query.all === "1";
    if (!includeHidden) where.push("p.visible = true");
    if (req.query.category) {
      params.push(req.query.category);
      const n = params.length;
      where.push(
        `(c.slug = $${n} OR c.parent_id = (SELECT id FROM categories WHERE slug = $${n}))`,
      );
    }
    if (req.query.featured === "1" || req.query.featured === "true") {
      where.push("p.featured = true");
    }
    if (req.query.search) {
      params.push(`%${req.query.search}%`);
      const n = params.length;
      where.push(
        `(p.name ILIKE $${n} OR b.name ILIKE $${n} OR c.name ILIKE $${n} OR p.tagline ILIKE $${n})`,
      );
    }
    let sql = `${LIST_SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY p.sort, p.id`;
    if (req.query.limit) {
      params.push(Number(req.query.limit) || 24);
      sql += ` LIMIT $${params.length}`;
    }
    const { rows } = await query(sql, params);
    res.json(rows.map(productJson));
  }),
);

app.get(
  "/api/products/id/:id",
  ah(async (req, res) => {
    const { rows } = await query(`${DETAIL_SELECT} WHERE p.id = $1`, [
      req.params.id,
    ]);
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(productJson(rows[0]));
  }),
);

app.get(
  "/api/products/:slug",
  ah(async (req, res) => {
    const { rows } = await query(`${DETAIL_SELECT} WHERE p.slug = $1`, [
      req.params.slug,
    ]);
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(productJson(rows[0]));
  }),
);

app.post(
  "/api/products",
  requireAuth,
  ah(async (req, res) => {
    const b = req.body || {};
    const name = (b.name || "").trim();
    if (!name) return res.status(400).json({ error: "name is required" });
    const slug = (b.slug || "").trim() || slugify(name);
    const { rows } = await query(
      `INSERT INTO products
         (name, slug, tagline, description, specs, price, old_price, category_id, brand_id,
          colors, stock, is_new, featured, visible, sort)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        name,
        slug,
        b.tagline || "",
        b.description || "",
        JSON.stringify(Array.isArray(b.specs) ? b.specs : []),
        b.price ?? 0,
        b.oldPrice ?? null,
        b.categoryId ?? null,
        b.brandId ?? null,
        JSON.stringify(Array.isArray(b.colors) ? b.colors : []),
        b.stock ?? 0,
        b.isNew ?? false,
        b.featured ?? false,
        b.visible ?? true,
        b.sort ?? 0,
      ],
    );
    if (Array.isArray(b.images)) {
      for (let i = 0; i < b.images.length; i++) {
        const url =
          typeof b.images[i] === "string" ? b.images[i] : b.images[i]?.url;
        if (url) {
          await query(
            `INSERT INTO product_images (product_id, url, alt, sort)
             VALUES ($1,$2,$3,$4) ON CONFLICT (product_id, url) DO NOTHING`,
            [rows[0].id, url, name, i],
          );
        }
      }
    }
    const { rows: full } = await query(`${DETAIL_SELECT} WHERE p.id = $1`, [
      rows[0].id,
    ]);
    res.status(201).json(productJson(full[0]));
  }),
);

app.put(
  "/api/products/:id",
  requireAuth,
  ah(async (req, res) => {
    const b = req.body || {};
    const sets = [];
    const params = [req.params.id];
    for (const [key, col] of Object.entries(PRODUCT_COLS)) {
      if (!(key in b)) continue;
      if (key === "colors" || key === "specs") {
        params.push(JSON.stringify(Array.isArray(b[key]) ? b[key] : []));
        sets.push(`${col} = $${params.length}::jsonb`);
      } else {
        params.push(b[key]);
        sets.push(`${col} = $${params.length}`);
      }
    }
    if (sets.length === 0)
      return res.status(400).json({ error: "No fields to update" });
    const { rows } = await query(
      `UPDATE products SET ${sets.join(", ")} WHERE id = $1 RETURNING id`,
      params,
    );
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    const { rows: full } = await query(`${DETAIL_SELECT} WHERE p.id = $1`, [
      rows[0].id,
    ]);
    res.json(productJson(full[0]));
  }),
);

app.delete(
  "/api/products/:id",
  requireAuth,
  ah(async (req, res) => {
    await query(`DELETE FROM products WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  }),
);

// ---- Product images ----
app.get(
  "/api/products/:id/images",
  requireAuth,
  ah(async (req, res) => {
    const { rows } = await query(
      `SELECT id, url, alt, sort FROM product_images WHERE product_id = $1 ORDER BY sort, id`,
      [req.params.id],
    );
    res.json(
      rows.map((r) => ({ id: r.id, url: r.url, alt: r.alt, sort: r.sort })),
    );
  }),
);

app.post(
  "/api/products/:id/images",
  requireAuth,
  ah(async (req, res) => {
    const b = req.body || {};
    if (!b.url) return res.status(400).json({ error: "url is required" });
    const { rows } = await query(
      `INSERT INTO product_images (product_id, url, alt, sort)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (product_id, url) DO UPDATE SET alt = EXCLUDED.alt, sort = EXCLUDED.sort
       RETURNING *`,
      [req.params.id, b.url, b.alt || "", b.sort ?? 0],
    );
    res.status(201).json({
      id: rows[0].id,
      url: rows[0].url,
      alt: rows[0].alt,
      sort: rows[0].sort,
    });
  }),
);

app.delete(
  "/api/products/:id/images/:imageId",
  requireAuth,
  ah(async (req, res) => {
    await query(
      `DELETE FROM product_images WHERE id = $1 AND product_id = $2`,
      [req.params.imageId, req.params.id],
    );
    res.json({ ok: true });
  }),
);

// ========================= Brands =========================
app.get(
  "/api/brands",
  optionalAuth,
  ah(async (req, res) => {
    const all = req.admin && req.query.all === "1";
    const { rows } = await query(
      `SELECT * FROM brands ${all ? "" : "WHERE visible = true"} ORDER BY sort, name`,
    );
    res.json(rows.map(brandJson));
  }),
);

app.post(
  "/api/brands",
  requireAuth,
  ah(async (req, res) => {
    const b = req.body || {};
    const name = (b.name || "").trim();
    if (!name) return res.status(400).json({ error: "name is required" });
    const slug = (b.slug || "").trim() || slugify(name);
    const { rows } = await query(
      `INSERT INTO brands (name, slug, image_url, sort, visible)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, slug, b.imageUrl || "", b.sort ?? 0, b.visible ?? true],
    );
    res.status(201).json(brandJson(rows[0]));
  }),
);

app.put(
  "/api/brands/:id",
  requireAuth,
  ah(async (req, res) => {
    const b = req.body || {};
    const { rows } = await query(
      `UPDATE brands SET
         name      = COALESCE($2, name),
         slug      = COALESCE($3, slug),
         image_url = COALESCE($4, image_url),
         sort      = COALESCE($5, sort),
         visible   = COALESCE($6, visible)
       WHERE id = $1 RETURNING *`,
      [
        req.params.id,
        b.name ?? null,
        b.slug ?? null,
        b.imageUrl ?? null,
        b.sort ?? null,
        b.visible ?? null,
      ],
    );
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(brandJson(rows[0]));
  }),
);

app.delete(
  "/api/brands/:id",
  requireAuth,
  ah(async (req, res) => {
    await query(`DELETE FROM brands WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  }),
);

const SALE_SCOPES = ["all", "category", "brand", "products"];

const saleJson = (r) => ({
  id: r.id,
  name: r.name,
  percent: r.percent,
  scope: r.scope,
  categoryId: r.category_id,
  brandId: r.brand_id,
  productIds: Array.isArray(r.product_ids) ? r.product_ids : [],
  startsAt: r.starts_at,
  endsAt: r.ends_at,
  active: r.active,
  createdAt: r.created_at,
});

// Validate + normalize a sale payload; returns { error } or the clean values.
function cleanSale(b, { partial = false } = {}) {
  const out = {};
  if (!partial || "name" in b) {
    out.name = (b.name || "").trim();
    if (!out.name) return { error: "name is required" };
  }
  if (!partial || "percent" in b) {
    const pct = Math.round(Number(b.percent));
    if (!Number.isFinite(pct) || pct < 1 || pct > 90) {
      return { error: "percent must be between 1 and 90" };
    }
    out.percent = pct;
  }
  if (!partial || "scope" in b) {
    if (!SALE_SCOPES.includes(b.scope)) return { error: "Invalid scope" };
    out.scope = b.scope;
  }
  if ("categoryId" in b) out.categoryId = b.categoryId || null;
  if ("brandId" in b) out.brandId = b.brandId || null;
  if ("productIds" in b) {
    out.productIds = (Array.isArray(b.productIds) ? b.productIds : [])
      .map(Number)
      .filter(Boolean);
  }
  if ("startsAt" in b) out.startsAt = b.startsAt || null;
  if ("endsAt" in b) out.endsAt = b.endsAt || null;
  if ("active" in b) out.active = Boolean(b.active);
  return { values: out };
}

app.get(
  "/api/sales",
  requireAuth,
  ah(async (req, res) => {
    const { rows } = await query(`SELECT * FROM sales ORDER BY id DESC`);
    res.json(rows.map(saleJson));
  }),
);

app.post(
  "/api/sales",
  requireAuth,
  ah(async (req, res) => {
    const { error, values: v } = cleanSale(req.body || {});
    if (error) return res.status(400).json({ error });
    const { rows } = await query(
      `INSERT INTO sales (name, percent, scope, category_id, brand_id, product_ids, starts_at, ends_at, active)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9) RETURNING *`,
      [
        v.name,
        v.percent,
        v.scope,
        v.categoryId ?? null,
        v.brandId ?? null,
        JSON.stringify(v.productIds ?? []),
        v.startsAt ?? null,
        v.endsAt ?? null,
        v.active ?? true,
      ],
    );
    res.status(201).json(saleJson(rows[0]));
  }),
);

app.put(
  "/api/sales/:id",
  requireAuth,
  ah(async (req, res) => {
    const { error, values: v } = cleanSale(req.body || {}, { partial: true });
    if (error) return res.status(400).json({ error });
    const cols = {
      name: "name",
      percent: "percent",
      scope: "scope",
      categoryId: "category_id",
      brandId: "brand_id",
      productIds: "product_ids",
      startsAt: "starts_at",
      endsAt: "ends_at",
      active: "active",
    };
    const sets = [];
    const params = [req.params.id];
    for (const [key, col] of Object.entries(cols)) {
      if (!(key in v)) continue;
      if (key === "productIds") {
        params.push(JSON.stringify(v.productIds));
        sets.push(`${col} = $${params.length}::jsonb`);
      } else {
        params.push(v[key]);
        sets.push(`${col} = $${params.length}`);
      }
    }
    if (sets.length === 0)
      return res.status(400).json({ error: "No fields to update" });
    const { rows } = await query(
      `UPDATE sales SET ${sets.join(", ")} WHERE id = $1 RETURNING *`,
      params,
    );
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(saleJson(rows[0]));
  }),
);

app.delete(
  "/api/sales/:id",
  requireAuth,
  ah(async (req, res) => {
    await query(`DELETE FROM sales WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  }),
);

// ========================= Settings =========================
app.get(
  "/api/settings",
  ah(async (req, res) => {
    await query(
      `INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`,
    );
    const { rows } = await query(`SELECT * FROM settings WHERE id = 1`);
    res.json(settingsJson(rows[0]));
  }),
);

app.put(
  "/api/settings",
  requireAuth,
  ah(async (req, res) => {
    const b = req.body || {};
    await query(
      `INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`,
    );
    const { rows } = await query(
      `UPDATE settings SET
         store_name           = COALESCE($1, store_name),
         announcement_enabled = COALESCE($2, announcement_enabled),
         announcement_text    = COALESCE($3, announcement_text),
         contact_email        = COALESCE($4, contact_email),
         contact_phone        = COALESCE($5, contact_phone),
         contact_whatsapp     = COALESCE($6, contact_whatsapp),
         contact_address      = COALESCE($7, contact_address),
         socials              = COALESCE($8::jsonb, socials),
         nav_links            = COALESCE($9::jsonb, nav_links),
         footer_groups        = COALESCE($10::jsonb, footer_groups),
         showcase_bg          = COALESCE($11, showcase_bg),
         nav_logo_size        = COALESCE($12, nav_logo_size),
         published            = COALESCE($13, published),
         nav_logo_size_mobile = COALESCE($14, nav_logo_size_mobile),
         home_new_enabled     = COALESCE($15, home_new_enabled),
         home_new_eyebrow     = COALESCE($16, home_new_eyebrow),
         home_new_heading     = COALESCE($17, home_new_heading),
         home_new_source      = COALESCE($18, home_new_source),
         home_new_category_id = CASE WHEN $19::boolean THEN $20 ELSE home_new_category_id END,
         home_new_count       = COALESCE($21, home_new_count),
         login_button_label   = COALESCE($22, login_button_label),
         login_button_logo    = COALESCE($23, login_button_logo),
         login_button_weight  = COALESCE($24, login_button_weight)
       WHERE id = 1 RETURNING *`,
      [
        b.storeName ?? null,
        b.announcement?.enabled ?? null,
        b.announcement?.text ?? null,
        b.contact?.email ?? null,
        b.contact?.phone ?? null,
        b.contact?.whatsapp ?? null,
        b.contact?.address ?? null,
        b.socials ? JSON.stringify(b.socials) : null,
        b.navLinks ? JSON.stringify(b.navLinks) : null,
        b.footerGroups ? JSON.stringify(b.footerGroups) : null,
        b.showcaseBg ?? null,
        b.navLogoSize ?? null,
        b.published ?? null,
        b.navLogoSizeMobile ?? null,
        b.homeNew?.enabled ?? null,
        b.homeNew?.eyebrow ?? null,
        b.homeNew?.heading ?? null,
        b.homeNew?.source ?? null,
        // $19 = whether homeNew.categoryId was provided (so null can clear it);
        // $20 = the value (may be null).
        b.homeNew && "categoryId" in b.homeNew,
        b.homeNew?.categoryId ?? null,
        b.homeNew?.count ?? null,
        b.loginButton?.label ?? null,
        b.loginButton?.logo ?? null,
        // Whitelisted: this class name goes straight into the button's markup.
        LOGIN_BUTTON_WEIGHTS.includes(b.loginButton?.weight)
          ? b.loginButton.weight
          : null,
      ],
    );
    res.json(settingsJson(rows[0]));
  }),
);

// ========================= Pages =========================
app.get(
  "/api/pages",
  optionalAuth,
  ah(async (req, res) => {
    const all = req.admin && req.query.all === "1";
    const { rows } = await query(
      `SELECT * FROM pages ${all ? "" : "WHERE visible = true"} ORDER BY sort, id`,
    );
    res.json(rows.map(pageJson));
  }),
);

app.get(
  "/api/pages/:slug",
  ah(async (req, res) => {
    const { rows } = await query(`SELECT * FROM pages WHERE slug = $1`, [
      req.params.slug,
    ]);
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(pageJson(rows[0]));
  }),
);

app.post(
  "/api/pages",
  requireAuth,
  ah(async (req, res) => {
    const b = req.body || {};
    const title = (b.title || "").trim();
    if (!title) return res.status(400).json({ error: "title is required" });
    const slug = (b.slug || "").trim() || slugify(title);
    const { rows } = await query(
      `INSERT INTO pages (slug, title, body, visible, sort)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [slug, title, b.body || "", b.visible ?? true, b.sort ?? 0],
    );
    res.status(201).json(pageJson(rows[0]));
  }),
);

app.put(
  "/api/pages/:id",
  requireAuth,
  ah(async (req, res) => {
    const b = req.body || {};
    const { rows } = await query(
      `UPDATE pages SET
         slug    = COALESCE($2, slug),
         title   = COALESCE($3, title),
         body    = COALESCE($4, body),
         visible = COALESCE($5, visible),
         sort    = COALESCE($6, sort)
       WHERE id = $1 RETURNING *`,
      [
        req.params.id,
        b.slug ?? null,
        b.title ?? null,
        b.body ?? null,
        b.visible ?? null,
        b.sort ?? null,
      ],
    );
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(pageJson(rows[0]));
  }),
);

app.delete(
  "/api/pages/:id",
  requireAuth,
  ah(async (req, res) => {
    await query(`DELETE FROM pages WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  }),
);

// ========================= Homepage sections =========================
// Public: visible blocks in order. Authed + ?all=1 includes hidden ones.
app.get(
  "/api/homepage-sections",
  optionalAuth,
  ah(async (req, res) => {
    const all = req.admin && req.query.all === "1";
    const { rows } = await query(
      `SELECT * FROM homepage_sections ${all ? "" : "WHERE visible = true"} ORDER BY sort, id`,
    );
    res.json(rows.map(sectionJson));
  }),
);

app.post(
  "/api/homepage-sections",
  requireAuth,
  ah(async (req, res) => {
    const b = req.body || {};
    const type = (b.type || "").trim();
    if (!type) return res.status(400).json({ error: "type is required" });
    // New blocks go to the end unless a sort is given.
    const { rows: mx } = await query(
      `SELECT COALESCE(MAX(sort), 0) + 1 AS next FROM homepage_sections`,
    );
    const { rows } = await query(
      `INSERT INTO homepage_sections
         (type, eyebrow, heading, subheading, body, image_url, bg, text_theme, settings, visible, sort)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11) RETURNING *`,
      [
        type,
        b.eyebrow || "",
        b.heading || "",
        b.subheading || "",
        b.body || "",
        b.imageUrl || "",
        b.bg || "",
        b.textTheme || "auto",
        JSON.stringify(
          b.settings && typeof b.settings === "object" ? b.settings : {},
        ),
        b.visible ?? true,
        b.sort ?? mx[0].next,
      ],
    );
    res.status(201).json(sectionJson(rows[0]));
  }),
);

// Reorder: body { ids: [...] } -> sort follows array order. Defined as its own
// path so it never collides with PUT /:id.
app.post(
  "/api/homepage-sections/reorder",
  requireAuth,
  ah(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    for (let i = 0; i < ids.length; i++) {
      await query(`UPDATE homepage_sections SET sort = $2 WHERE id = $1`, [
        ids[i],
        i + 1,
      ]);
    }
    const { rows } = await query(
      `SELECT * FROM homepage_sections ORDER BY sort, id`,
    );
    res.json(rows.map(sectionJson));
  }),
);

app.put(
  "/api/homepage-sections/:id",
  requireAuth,
  ah(async (req, res) => {
    const b = req.body || {};
    const sets = [];
    const params = [req.params.id];
    for (const [key, col] of Object.entries(SECTION_COLS)) {
      if (!(key in b)) continue;
      if (key === "settings") {
        params.push(
          JSON.stringify(
            b.settings && typeof b.settings === "object" ? b.settings : {},
          ),
        );
        sets.push(`settings = $${params.length}::jsonb`);
      } else {
        params.push(b[key]);
        sets.push(`${col} = $${params.length}`);
      }
    }
    if (sets.length === 0)
      return res.status(400).json({ error: "No fields to update" });
    const { rows } = await query(
      `UPDATE homepage_sections SET ${sets.join(", ")} WHERE id = $1 RETURNING *`,
      params,
    );
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(sectionJson(rows[0]));
  }),
);

app.delete(
  "/api/homepage-sections/:id",
  requireAuth,
  ah(async (req, res) => {
    await query(`DELETE FROM homepage_sections WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  }),
);

// ========================= Uploads =========================
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = slugify(path.basename(file.originalname, ext)) || "image";
    cb(null, `${Date.now()}-${base}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 8 * 1024 * 1024 } });

app.post("/api/uploads", requireAuth, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  res.status(201).json({ url: `${PUBLIC_URL}/uploads/${req.file.filename}` });
});

app.use(whatsappRouter);
app.use(scraperRouter);
app.use(notificationsRouter);

// ========================= Errors =========================
app.use((err, _req, res, _next) => {
  console.error(err);
  if (err.code === "23505")
    return res.status(409).json({ error: "Duplicate (slug already exists)" });
  res.status(500).json({ error: "Server error" });
});
