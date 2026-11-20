const base = new URL(process.argv[2] || "http://localhost");
const token = process.env.BOT_TOKEN;
const secret = process.env.WEBHOOK_SECRET;
if (base.protocol !== "https:" || !token || !secret) {
  console.error("Укажите адрес HTTPS и переменные BOT_TOKEN и WEBHOOK_SECRET.");
  process.exit(1);
}
try {
  const response = await fetch("https://api.telegram.org/bot" + token + "/setWebhook", {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({
      url:new URL("/api/telegram", base).href, secret_token:secret,
      allowed_updates:["message","pre_checkout_query"]
    })
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error("HTTP " + response.status);
  console.log("Webhook подключён.");
} catch {
  console.error("Telegram не принял настройки webhook. Проверьте адрес и секреты.");
  process.exitCode = 1;
}
