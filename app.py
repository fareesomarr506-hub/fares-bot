import json
import logging
import os
import re
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Dict, Optional, Tuple

import requests
from requests.adapters import HTTPAdapter
from telegram import Update
from telegram.constants import ParseMode
from telegram.ext import (
    ApplicationBuilder,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)
from urllib3.util.retry import Retry

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
)
logger = logging.getLogger("fares_render_bot")

BOT_TOKEN = os.getenv("8409762345:AAFo05jz8ICmkjJ098FSrGt8MGov4nWFPJo", "").strip()
PAIR_API_URL = os.getenv("PAIR_API_URL", "https://fares-bot.onrender.com/pair").strip()
PAIR_API_METHOD = os.getenv("PAIR_API_METHOD", "GET").strip().upper()
PAIR_API_NUMBER_FIELD = os.getenv("PAIR_API_NUMBER_FIELD", "phone").strip()
PAIR_API_RESPONSE_FIELD = os.getenv("PAIR_API_RESPONSE_FIELD", "code").strip()
REQUEST_TIMEOUT = int(os.getenv("REQUEST_TIMEOUT", "30"))
MAX_RETRIES = int(os.getenv("MAX_RETRIES", "3"))
PORT = int(os.getenv("PORT", "10000"))

if not BOT_TOKEN:
    raise RuntimeError("BOT_TOKEN is required")


def build_session() -> requests.Session:
    session = requests.Session()
    retry = Retry(
        total=MAX_RETRIES,
        connect=MAX_RETRIES,
        read=MAX_RETRIES,
        backoff_factor=1,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET", "POST"],
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    session.headers.update(
        {
            "Accept": "application/json",
            "User-Agent": "Fares-Telegram-Bridge/1.0",
        }
    )
    return session


HTTP = build_session()


def clean_phone_number(phone_number: str) -> str:
    return re.sub(r"\D", "", phone_number or "")


def extract_code_from_payload(payload: Any) -> Optional[str]:
    if isinstance(payload, dict):
        for key in [PAIR_API_RESPONSE_FIELD, "pairingCode", "pair_code", "pairCode", "code"]:
            value = payload.get(key)
            if value:
                return str(value).strip()
    if isinstance(payload, str):
        match = re.search(r"\b[A-Z0-9]{6,12}\b", payload.upper())
        if match:
            return match.group(0)
    return None


def request_pair_code(phone_number: str) -> Tuple[Optional[str], str]:
    clean_number = clean_phone_number(phone_number)
    if not re.fullmatch(r"\d{8,15}", clean_number):
        return None, "رقم الهاتف لازم يكون من 8 إلى 15 رقم ويشمل رمز الدولة."

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            if PAIR_API_METHOD == "GET":
                response = HTTP.get(
                    PAIR_API_URL,
                    params={PAIR_API_NUMBER_FIELD: clean_number},
                    timeout=REQUEST_TIMEOUT,
                )
            else:
                response = HTTP.post(
                    PAIR_API_URL,
                    json={PAIR_API_NUMBER_FIELD: clean_number},
                    timeout=REQUEST_TIMEOUT,
                )

            body_text = response.text.strip()
            content_type = (response.headers.get("content-type") or "").lower()
            logger.info(
                "Pair API attempt=%s status=%s body=%s",
                attempt,
                response.status_code,
                body_text[:400],
            )

            if response.status_code >= 500:
                if attempt < MAX_RETRIES:
                    time.sleep(attempt)
                    continue
                return None, "السيرفر رجّع خطأ داخلي مؤقت. جرّب مرة ثانية بعد لحظات."

            if "application/json" in content_type:
                payload = response.json()
            else:
                payload = body_text

            code = extract_code_from_payload(payload)
            if code:
                return code, ""

            if isinstance(payload, dict):
                error_msg = payload.get("error") or payload.get("message") or "ما تمش العثور على كود صالح."
                return None, str(error_msg)

            return None, "الرد من السيرفر مش متوافق أو ما فيهوش كود صالح."

        except requests.RequestException as exc:
            logger.error("Network error on attempt %s: %s", attempt, exc)
            if attempt < MAX_RETRIES:
                time.sleep(attempt)
                continue
            return None, "تعذر الاتصال بسيرفر توليد الكود."
        except Exception as exc:
            logger.exception("Unexpected error requesting pair code: %s", exc)
            return None, "حصل خطأ غير متوقع أثناء طلب الكود."

    return None, "فشل غير معروف أثناء طلب الكود."


class HealthHandler(BaseHTTPRequestHandler):
    def _send_json(self, status_code: int, payload: Dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path in ["/", "/health", "/status"]:
            self._send_json(
                200,
                {
                    "ok": True,
                    "service": "fares-telegram-bridge",
                    "pair_api_url": PAIR_API_URL,
                    "pair_api_method": PAIR_API_METHOD,
                    "number_field": PAIR_API_NUMBER_FIELD,
                },
            )
        else:
            self._send_json(404, {"ok": False, "error": "Not Found"})

    def log_message(self, format: str, *args):
        logger.info("HTTP %s - %s", self.address_string(), format % args)


def start_health_server() -> None:
    server = ThreadingHTTPServer(("0.0.0.0", PORT), HealthHandler)
    logger.info("Health server listening on port %s", PORT)
    server.serve_forever()


async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    text = (
        "👋 أهلاً بك في FARES BOT\n\n"
        "أرسل رقم واتساب مع رمز الدولة بدون + أو مسافات.\n"
        "مثال: 9677XXXXXXX\n\n"
        "سأرسل لك كود الربط مباشرة من السيرفر."
    )
    await update.effective_message.reply_text(text)


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    text = (
        "ℹ️ الاستخدام:\n"
        "1) أرسل الرقم مع رمز الدولة.\n"
        "2) استلم كود الربط.\n"
        "3) من واتساب: الأجهزة المرتبطة > ربط جهاز > الربط برقم الهاتف.\n"
        "4) أدخل الكود بسرعة لأنه مؤقت.\n\n"
        "لو فشل أول طلب، أرسل الرقم مرة ثانية لأن السيرفر قد يرجع خطأ مؤقت."
    )
    await update.effective_message.reply_text(text)


async def health_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    try:
        response = HTTP.get(PAIR_API_URL, timeout=20)
        if response.status_code == 400 and "أدخل الرقم" in response.text:
            msg = "✅ خدمة /pair شغالة، وبتنتظر فقط رقم الهاتف."
        elif response.status_code == 200:
            msg = "✅ خدمة /pair شغالة."
        else:
            msg = f"⚠️ الخدمة ردّت بحالة {response.status_code}."
    except Exception as exc:
        msg = f"❌ تعذر الوصول للخدمة: {exc}"
    await update.effective_message.reply_text(msg)


async def text_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    text = (update.effective_message.text or "").strip()
    phone = clean_phone_number(text)

    if not re.fullmatch(r"\d{8,15}", phone):
        await update.effective_message.reply_text(
            "⚠️ ابعت رقم صحيح مع رمز الدولة، مثال: 9677XXXXXXX"
        )
        return

    waiting = await update.effective_message.reply_text("🔄 جاري طلب كود الربط من السيرفر...")
    code, error_message = request_pair_code(phone)

    if code:
        msg = (
            "✅ تم توليد كود الربط بنجاح\n\n"
            f"🔢 الكود: `{code}`\n\n"
            "📱 افتح واتساب ثم:\n"
            "الأجهزة المرتبطة > ربط جهاز > الربط برقم الهاتف\n\n"
            "⏱️ لو انتهت صلاحية الكود، اطلب كود جديد فوراً."
        )
        await waiting.edit_text(msg, parse_mode=ParseMode.MARKDOWN)
    else:
        await waiting.edit_text(f"❌ فشل الحصول على الكود:\n{error_message}")


async def unknown_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.effective_message.reply_text("الأمر غير معروف. استخدم /start أو /help أو /health")


def main() -> None:
    threading.Thread(target=start_health_server, daemon=True).start()

    app = ApplicationBuilder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start_command))
    app.add_handler(CommandHandler("help", help_command))
    app.add_handler(CommandHandler("health", health_command))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, text_handler))
    app.add_handler(MessageHandler(filters.COMMAND, unknown_command))

    logger.info("Starting Telegram polling bot")
    app.run_polling(drop_pending_updates=True, allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
