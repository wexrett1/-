const PRICE = 199;
const MONTH = 2592000;
const now = () => Math.floor(Date.now() / 1000);
const utf8 = new TextEncoder();
const json = (body, status = 200) => Response.json(body, {status, headers: {"Cache-Control": "no-store"}});

async function sign(key, text) {
  const secret = await crypto.subtle.importKey("raw", key, {name:"HMAC", hash:"SHA-256"}, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", secret, utf8.encode(text)));
}
function equal(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i++) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}
async function telegramUser(raw, token) {
  if (!token || typeof raw !== "string" || raw.length > 8192) return null;
  const data = new URLSearchParams(raw);
  const hash = data.get("hash");
  const issued = Number(data.get("auth_date"));
  if (!hash || new Set(data.keys()).size !== [...data.keys()].length ||
      !Number.isSafeInteger(issued) || issued > now() + 60 || issued < now() - 86400) return null;
  data.delete("hash");
  data.sort();
  const canonical = [...data].map(([key, value]) => key + "=" + value).join("\n");
  const bytes = await sign(await sign(utf8.encode("WebAppData"), token), canonical);
  const expected = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  if (!equal(hash, expected)) return null;
  try {
    const {id} = JSON.parse(data.get("user"));
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  } catch { return null; }
}
async function bot(env, method, args) {
  const response = await fetch("https://api.telegram.org/bot" + env.BOT_TOKEN + "/" + method, {
    method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(args)
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error("Telegram API request failed");
  return result.result;
}
async function subscription(db, user) {
  return db.prepare("SELECT MAX(expires_at) AS expires FROM payments WHERE user_id = ? AND refunded = 0")
    .bind(user).first("expires");
}
async function orderFor(db, payload, user, amount, currency) {
  if (currency !== "XTR" || typeof payload !== "string") return null;
  return db.prepare("SELECT * FROM orders WHERE id = ? AND user_id = ? AND amount = ?")
    .bind(payload, user, amount).first();
}
async function webhook(request, env) {
  if (!env.WEBHOOK_SECRET || !equal(request.headers.get("X-Telegram-Bot-Api-Secret-Token"), env.WEBHOOK_SECRET)) {
    return json({error:"Forbidden"}, 403);
  }
  const update = await request.json();
  const db = env.DB;
  const check = update.pre_checkout_query;
  if (check) {
    const user = check.from.id;
    const order = await orderFor(db, check.invoice_payload, user, check.total_amount, check.currency);
    let approved = false;
    if (order?.checkout === check.id) approved = true;
    else if (order && order.created_at > now() - 3600) {
      const time = now();
      const result = await db.prepare(
        "UPDATE orders SET checkout = ?, checked_at = ? WHERE id = ? AND (checkout IS NULL OR checked_at < ?) " +
        "AND NOT EXISTS (SELECT 1 FROM orders WHERE user_id = ? AND id != ? AND checked_at >= ?) " +
        "AND NOT EXISTS (SELECT 1 FROM payments WHERE user_id = ? AND refunded = 0 AND expires_at > ?)"
      ).bind(check.id, time, order.id, time - 600, user, order.id, time - 600, user, time).run();
      approved = result.meta.changes === 1;
    }
    await bot(env, "answerPreCheckoutQuery", approved ? {pre_checkout_query_id: check.id, ok:true} :
      {pre_checkout_query_id: check.id, ok:false, error_message:"Проверьте активную подписку или заново откройте окно оплаты."});
    return json({ok:true});
  }
  const message = update.message;
  if (message?.successful_payment) {
    const pay = message.successful_payment;
    const user = message.from.id;
    const order = await orderFor(db, pay.invoice_payload, user, pay.total_amount, pay.currency);
    if (order?.checkout && pay.is_recurring && Number.isSafeInteger(pay.subscription_expiration_date)) {
      await db.prepare(
        "INSERT INTO payments (charge, user_id, expires_at, refunded) VALUES (?, ?, ?, 0) " +
        "ON CONFLICT(charge) DO UPDATE SET expires_at = excluded.expires_at WHERE payments.user_id = excluded.user_id"
      ).bind(pay.telegram_payment_charge_id, user, pay.subscription_expiration_date).run();
    }
  }
  if (message?.refunded_payment) {
    const pay = message.refunded_payment;
    const order = await env.DB.prepare("SELECT user_id FROM orders WHERE id = ? AND amount = ?")
      .bind(pay.invoice_payload, pay.total_amount).first();
    if (order && pay.currency === "XTR") {
      await db.prepare("INSERT INTO payments (charge, user_id, expires_at, refunded) VALUES (?, ?, 0, 1) " +
        "ON CONFLICT(charge) DO UPDATE SET refunded = 1 WHERE payments.user_id = excluded.user_id")
        .bind(pay.telegram_payment_charge_id, order.user_id).run();
    }
  }
  if (message?.chat?.type === "private" && /^\/start(?:@\w+)?(?:\s|$)/.test(message.text ?? "")) {
    await bot(env, "sendMessage", {
      chat_id: message.chat.id, text: "Откройте билеты ПДД, уроки и пробный экзамен.",
      reply_markup: {inline_keyboard: [[{text:"Открыть Маршрут ПДД", web_app:{url:new URL(request.url).origin}}]]}
    });
  }
  if (/^\/paysupport(?:@\w+)?(?:\s|$)/.test(message?.text ?? "")) {
    await bot(env, "sendMessage", {chat_id: message.chat.id,
      text: "По вопросам подписки и возвратов напишите " + env.SUPPORT_CONTACT + "."});
  }
  return json({ok:true});
}
export default {
  async fetch(request, env) {
    const {pathname, origin} = new URL(request.url);
    if (!pathname.startsWith("/api/") && pathname !== "/config.js") return env.ASSETS.fetch(request);
    if (pathname === "/config.js") return new Response('export const config = {apiBase:"",siteOnly:false};', {
      headers: {"Content-Type":"application/javascript; charset=utf-8"}
    });
    if (request.method !== "POST") return json({error:"Method not allowed"}, 405);
    const enabled = Boolean(env.BOT_TOKEN && env.WEBHOOK_SECRET && env.SUPPORT_CONTACT && env.DB);
    try {
      if (pathname === "/api/telegram") return enabled ? await webhook(request, env) : json({error:"Disabled"}, 503);
      if (request.headers.has("Origin") && request.headers.get("Origin") !== origin) return json({error:"Forbidden"}, 403);
      if (pathname !== "/api/status" && pathname !== "/api/invoice") return json({error:"Not found"}, 404);
      const {initData} = await request.json();
      const user = enabled ? await telegramUser(initData, env.BOT_TOKEN) : null;
      const active = user ? (await subscription(env.DB, user)) > now() : false;
      if (pathname === "/api/status") return json({active, enabled, price:PRICE});
      if (!enabled || !user) return json({error:"Telegram authorization required"}, 401);
      if (active) return json({error:"Already active"}, 409);
      const id = "pro_" + crypto.randomUUID().replaceAll("-", "");
      await env.DB.prepare("INSERT INTO orders (id, user_id, amount, created_at) VALUES (?, ?, ?, ?)")
        .bind(id, user, PRICE, now()).run();
      const url = await bot(env, "createInvoiceLink", {
        title:"Маршрут Pro", description:"Персональный план и повторение ошибок на 30 дней.",
        payload:id, currency:"XTR", prices:[{label:"Pro на 30 дней", amount:PRICE}], subscription_period:MONTH
      });
      return json({url});
    } catch {
      return json({error:"Service unavailable"}, 503);
    }
  }
};
