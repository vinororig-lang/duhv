import os
import json
import asyncio
import aiohttp
import logging
from datetime import datetime
from telegram import Update
from telegram.ext import Application, MessageHandler, filters, ContextTypes
from flask import Flask, jsonify
from dotenv import load_dotenv
import threading

# ========== НАСТРОЙКА ЛОГГИРОВАНИЯ ==========
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# ========== ЗАГРУЗКА КОНФИГУРАЦИИ ==========
load_dotenv()

TOKEN = os.getenv('BOT_TOKEN')
CHANNEL_ID = os.getenv('CHANNEL_ID')
GITHUB_TOKEN = os.getenv('GITHUB_TOKEN')
GITHUB_REPO = os.getenv('GITHUB_REPO')

# ========== FLASK СЕРВЕР ==========
app = Flask(__name__)

# Кеш постов
posts_cache = []
last_update = datetime.now()

@app.route('/')
def home():
    return '''
    <!DOCTYPE html>
    <html>
    <head>
        <title>Вопрос Эпохи Бот - API</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; background: #1C1C1E; color: white; }
            .container { max-width: 800px; margin: 0 auto; }
            h1 { color: #FF3B30; }
            .card { background: rgba(255,255,255,0.05); padding: 20px; border-radius: 10px; margin: 20px 0; }
            .endpoint { color: #007AFF; font-family: monospace; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🤖 Вопрос Эпохи Бот - API Сервер</h1>
            <div class="card">
                <h2>📡 Доступные эндпоинты:</h2>
                <p><span class="endpoint">GET /api/posts</span> - получить все посты</p>
                <p><span class="endpoint">GET /api/stats</span> - статистика</p>
                <p><span class="endpoint">GET /health</span> - проверка работы</p>
            </div>
            <div class="card">
                <h3>📊 Статистика:</h3>
                <p>Постов в кеше: <strong>''' + str(len(posts_cache)) + '''</strong></p>
                <p>Последнее обновление: <strong>''' + last_update.strftime('%d.%m.%Y %H:%M:%S') + '''</strong></p>
                <p>Канал: <strong>''' + CHANNEL_ID + '''</strong></p>
            </div>
        </div>
    </body>
    </html>
    '''

@app.route('/api/posts')
def get_posts():
    """Отдаем посты для сайта"""
    try:
        return jsonify({
            'status': 'success',
            'count': len(posts_cache),
            'last_update': last_update.isoformat(),
            'posts': posts_cache
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/stats')
def get_stats():
    """Статистика"""
    return jsonify({
        'total_posts': len(posts_cache),
        'last_update': last_update.strftime('%d.%m.%Y %H:%M:%S'),
        'channel': CHANNEL_ID
    })

@app.route('/health')
def health():
    """Проверка здоровья сервера"""
    return jsonify({'status': 'ok', 'timestamp': datetime.now().isoformat()})

# ========== TELEGRAM БОТ ==========
async def save_to_github(post_data):
    """Сохраняем пост в GitHub"""
    if not GITHUB_TOKEN:
        logger.warning("GITHUB_TOKEN не настроен, пропускаем сохранение")
        return False
    
    try:
        url = f"https://api.github.com/repos/{GITHUB_REPO}/contents/data/posts.json"
        
        headers = {
            "Authorization": f"token {GITHUB_TOKEN}",
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "VoprosEpohiBot"
        }
        
        # Получаем текущий файл
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers) as response:
                existing_posts = []
                sha = None
                
                if response.status == 200:
                    data = await response.json()
                    import base64
                    content = base64.b64decode(data["content"]).decode('utf-8')
                    existing_posts = json.loads(content)
                    sha = data["sha"]
                
                # Добавляем новый пост
                existing_posts.insert(0, post_data)
                if len(existing_posts) > 100:
                    existing_posts = existing_posts[:100]
                
                # Кодируем обратно
                new_content = json.dumps(existing_posts, ensure_ascii=False, indent=2)
                new_content_b64 = base64.b64encode(new_content.encode()).decode()
                
                # Обновляем файл
                payload = {
                    "message": f"Добавлен пост #{post_data['id']}",
                    "content": new_content_b64,
                    "sha": sha
                }
                
                async with session.put(url, headers=headers, json=payload) as put_response:
                    if put_response.status in [200, 201]:
                        logger.info(f"✅ Пост #{post_data['id']} сохранен в GitHub")
                        return True
                    else:
                        logger.error(f"❌ Ошибка GitHub: {put_response.status}")
                        return False
                        
    except Exception as e:
        logger.error(f"❌ Ошибка сохранения в GitHub: {e}")
        return False

async def handle_channel_post(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик постов из канала"""
    global posts_cache, last_update
    
    message = update.channel_post
    if not message:
        return
    
    try:
        # Форматируем пост
        post_data = {
            'id': message.message_id,
            'date': message.date.strftime('%d.%m.%Y %H:%M'),
            'timestamp': int(message.date.timestamp()),
            'channel': CHANNEL_ID,
            'type': 'text',
            'content': '',
            'telegram_link': f"https://t.me/{CHANNEL_ID.lstrip('@')}/{message.message_id}"
        }
        
        if message.text:
            post_data['content'] = message.text
            post_data['type'] = 'text'
        elif message.caption:
            post_data['content'] = message.caption
            post_data['type'] = 'text'
        elif message.photo:
            post_data['content'] = message.caption or '🖼️ Фото'
            post_data['type'] = 'photo'
        elif message.video:
            post_data['content'] = message.caption or '🎬 Видео'
            post_data['type'] = 'video'
        elif message.document:
            post_data['content'] = f"📎 {message.document.file_name}"
            post_data['type'] = 'document'
        else:
            post_data['content'] = '📌 Сообщение'
            post_data['type'] = 'unknown'
        
        # Сохраняем в кеш
        posts_cache.insert(0, post_data)
        if len(posts_cache) > 50:
            posts_cache = posts_cache[:50]
        
        last_update = datetime.now()
        
        # Логируем
        logger.info(f"📨 Новый пост #{post_data['id']}")
        
        # Сохраняем в GitHub
        asyncio.create_task(save_to_github(post_data))
        
        logger.info(f"📊 Статистика: {len(posts_cache)} постов в кеше")
        
    except Exception as e:
        logger.error(f"❌ Ошибка обработки поста: {e}")

async def load_existing_posts():
    """Загружаем существующие посты из GitHub при старте"""
    global posts_cache
    
    if not GITHUB_TOKEN:
        logger.warning("GitHub токен не настроен, пропускаем загрузку")
        return
    
    try:
        url = f"https://api.github.com/repos/{GITHUB_REPO}/contents/data/posts.json"
        headers = {
            "Authorization": f"token {GITHUB_TOKEN}",
            "Accept": "application/vnd.github.v3+json"
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers) as response:
                if response.status == 200:
                    data = await response.json()
                    import base64
                    content = base64.b64decode(data["content"]).decode('utf-8')
                    loaded_posts = json.loads(content)
                    
                    # Добавляем telegram_link если нет
                    for post in loaded_posts:
                        if 'telegram_link' not in post:
                            post['telegram_link'] = f"https://t.me/{CHANNEL_ID.lstrip('@')}/{post['id']}"
                    
                    posts_cache = loaded_posts
                    logger.info(f"✅ Загружено {len(posts_cache)} постов из GitHub")
                else:
                    logger.warning("Файл с постами не найден, начинаем с чистого листа")
                    
    except Exception as e:
        logger.error(f"❌ Ошибка загрузки постов: {e}")

async def start_bot():
    """Запуск Telegram бота"""
    logger.info("🤖 Запуск Telegram бота...")
    
    try:
        # Создаем приложение
        application = Application.builder().token(TOKEN).build()
        
        # Добавляем обработчик
        application.add_handler(MessageHandler(filters.ChatType.CHANNEL, handle_channel_post))
        
        # Загружаем существующие посты
        await load_existing_posts()
        
        logger.info(f"✅ Бот запущен. Канал: {CHANNEL_ID}")
        logger.info("📡 Ожидание постов...")
        
        # Запускаем polling
        await application.run_polling()
        
    except Exception as e:
        logger.error(f"💥 Критическая ошибка бота: {e}")

def run_flask():
    """Запуск Flask сервера"""
    logger.info("🌐 Запуск Flask сервера...")
    port = int(os.getenv('PORT', 10000))
    app.run(host='0.0.0.0', port=port, debug=False)

async def main():
    """Основная функция"""
    logger.info("=" * 60)
    logger.info("🚀 ЗАПУСК СИСТЕМЫ 'ВОПРОС ЭПОХИ БОТ'")
    logger.info("=" * 60)
    
    # Запускаем Flask в отдельном потоке
    flask_thread = threading.Thread(target=run_flask, daemon=True)
    flask_thread.start()
    
    # Ждем немного перед запуском бота
    await asyncio.sleep(2)
    
    # Запускаем бота
    await start_bot()

if __name__ == '__main__':
    asyncio.run(main())