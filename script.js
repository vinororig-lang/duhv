// ========== КОНФИГУРАЦИЯ ==========
const SERVER_URL = 'https://ваш-рендер-проект.onrender.com'; // Заменишь после деплоя
let autoRefreshInterval = null;
let countdown = 30;

// ========== ЭЛЕМЕНТЫ ==========
const postsContainer = document.getElementById('posts-container');
const totalPostsEl = document.getElementById('total-posts');
const refreshBtn = document.getElementById('refresh-btn');
const countdownEl = document.getElementById('countdown');

// ========== ЗАГРУЗКА ПОСТОВ ==========
async function loadPosts() {
    try {
        showLoading();
        
        const response = await fetch(`${SERVER_URL}/api/posts`);
        const data = await response.json();
        
        if (data.status === 'success') {
            renderPosts(data.posts);
            updateStats(data.count);
            updateLastUpdate(data.last_update);
            hideStatusMessage();
        } else {
            throw new Error(data.error || 'Неизвестная ошибка');
        }
        
    } catch (error) {
        console.error('Ошибка загрузки:', error);
        showError('Не удалось загрузить посты. Проверьте подключение к серверу.');
        loadFallbackPosts();
    }
}

// ========== ОТОБРАЖЕНИЕ ПОСТОВ С ФИЧЕЙ ==========
function renderPosts(posts) {
    if (!posts || posts.length === 0) {
        postsContainer.innerHTML = `
            <div class="no-posts">
                <i class="fas fa-inbox"></i>
                <h3>Пока нет постов</h3>
                <p>Как только в канале появится новый пост, он отобразится здесь</p>
                <p style="margin-top: 15px; color: var(--yellow);">
                    <i class="fab fa-telegram"></i> Подпишись на канал: 
                    <a href="https://t.me/oprosokolopolit" target="_blank" class="telegram-link">
                        @oprosokolopolit
                    </a>
                </p>
            </div>
        `;
        return;
    }
    
    postsContainer.innerHTML = '';
    
    posts.forEach((post, index) => {
        const card = createPostCard(post, index);
        postsContainer.appendChild(card);
    });
}

// ========== СОЗДАНИЕ КАРТОЧКИ ПОСТА С ФИЧЕЙ ==========
function createPostCard(post, index) {
    const card = document.createElement('div');
    card.className = 'post-card';
    card.style.animationDelay = `${index * 0.1}s`;
    
    // Определяем тип
    let typeIcon = 'fas fa-font';
    let typeClass = 'type-text';
    let typeText = 'Текст';
    
    if (post.type === 'photo') {
        typeIcon = 'fas fa-image';
        typeClass = 'type-media';
        typeText = 'Фото';
    } else if (post.type === 'video') {
        typeIcon = 'fas fa-video';
        typeClass = 'type-media';
        typeText = 'Видео';
    } else if (post.type === 'document') {
        typeIcon = 'fas fa-file';
        typeClass = 'type-text';
        typeText = 'Документ';
    }
    
    // Проверяем длину текста для кнопки "Читать далее"
    const content = post.content || '';
    const isLongText = content.length > 300;
    const displayContent = isLongText ? content.substring(0, 300) + '...' : content;
    
    // Форматируем контент
    const formattedContent = formatPostContent(displayContent);
    
    // Создаем HTML карточки
    card.innerHTML = `
        <div class="post-header">
            <div class="post-date">
                <i class="far fa-clock"></i> ${post.date}
            </div>
            <span class="post-type ${typeClass}">
                <i class="${typeIcon}"></i> ${typeText}
            </span>
        </div>
        
        <div class="post-content">
            ${formattedContent}
            ${isLongText ? `<div class="full-content" id="full-${post.id}">${formatPostContent(content)}</div>` : ''}
        </div>
        
        <div class="post-actions">
            <!-- КНОПКА ПЕРЕЙТИ К ПОСТУ В ТЕЛЕГРАМ -->
            <a href="${post.telegram_link || `https://t.me/oprosokolopolit/${post.id}`}" 
               target="_blank" 
               class="telegram-btn tooltip">
                <i class="fab fa-telegram"></i>
                📤 Перейти к посту
                <span class="tooltiptext">Откроет оригинал поста в Telegram</span>
            </a>
            
            <!-- КНОПКА ЧИТАТЬ ДАЛЕЕ (если текст длинный) -->
            ${isLongText ? `
                <button class="read-more-btn" onclick="toggleFullContent('${post.id}')" id="btn-${post.id}">
                    <i class="fas fa-book-open"></i> 📖 Читать далее
                </button>
            ` : ''}
            
            <!-- КНОПКА КОПИРОВАТЬ -->
            <button class="read-more-btn" onclick="copyToClipboard('${post.id}', '${post.content.replace(/'/g, "\\'")}')">
                <i class="far fa-copy"></i> Копировать
            </button>
        </div>
        
        <div class="post-footer">
            <div class="post-id">ID: #${post.id}</div>
            <div class="post-stats">
                <span><i class="far fa-eye"></i> 0</span>
                <span><i class="far fa-heart"></i> 0</span>
            </div>
        </div>
    `;
    
    return card;
}

// ========== ФУНКЦИИ ДЛЯ ФИЧИ ==========

// Показать/скрыть полный текст
function toggleFullContent(postId) {
    const fullContent = document.getElementById(`full-${postId}`);
    const button = document.getElementById(`btn-${postId}`);
    
    if (fullContent.style.display === 'block') {
        fullContent.style.display = 'none';
        button.innerHTML = '<i class="fas fa-book-open"></i> 📖 Читать далее';
    } else {
        fullContent.style.display = 'block';
        button.innerHTML = '<i class="fas fa-book"></i> 📕 Скрыть';
        
        // Плавная прокрутка к развернутому контенту
        fullContent.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// Копировать текст поста
function copyToClipboard(postId, text) {
    navigator.clipboard.writeText(text)
        .then(() => {
            showNotification(`Текст поста #${postId} скопирован в буфер!`);
        })
        .catch(err => {
            console.error('Ошибка копирования:', err);
            showNotification('Не удалось скопировать текст', 'error');
        });
}

// Показать уведомление
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
        ${message}
    `;
    
    document.body.appendChild(notification);
    
    // Анимация появления
    setTimeout(() => notification.classList.add('show'), 10);
    
    // Удаление через 3 секунды
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========

// Форматирование контента (ссылки, переносы)
function formatPostContent(content) {
    if (!content) return '<em>Сообщение без текста</em>';
    
    // Обработка ссылок
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const formatted = content
        .replace(urlRegex, url => `<a href="${url}" target="_blank" class="post-link">${url}</a>`)
        .replace(/\n/g, '<br>');
    
    return formatted;
}

// Обновление статистики
function updateStats(count) {
    const current = parseInt(totalPostsEl.textContent) || 0;
    totalPostsEl.textContent = count;
    
    // Анимация счетчика
    if (count > current) {
        totalPostsEl.classList.add('pulse');
        setTimeout(() => totalPostsEl.classList.remove('pulse'), 1000);
    }
}

// Обновление времени последнего обновления
function updateLastUpdate(timestamp) {
    const timeEl = document.querySelector('.last-update');
    if (!timeEl) return;
    
    const date = new Date(timestamp);
    timeEl.textContent = date.toLocaleString('ru-RU');
}

// ========== СИСТЕМА АВТООБНОВЛЕНИЯ ==========

// Запуск автообновления
function startAutoRefresh() {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    
    autoRefreshInterval = setInterval(() => {
        countdown--;
        countdownEl.textContent = countdown;
        
        if (countdown <= 0) {
            loadPosts();
            countdown = 30;
            countdownEl.textContent = countdown;
        }
    }, 1000);
}

// Ручное обновление
refreshBtn.addEventListener('click', () => {
    const icon = refreshBtn.querySelector('i');
    icon.className = 'fas fa-sync fa-spin';
    refreshBtn.disabled = true;
    
    loadPosts();
    
    setTimeout(() => {
        icon.className = 'fas fa-redo';
        refreshBtn.disabled = false;
        countdown = 30;
        countdownEl.textContent = countdown;
        showNotification('Посты успешно обновлены!');
    }, 1000);
});

// ========== ИНИЦИАЛИЗАЦИЯ ==========

// Загружаем посты при старте
document.addEventListener('DOMContentLoaded', () => {
    loadPosts();
    startAutoRefresh();
    
    // Запускаем автообновление каждые 30 секунд
    setInterval(loadPosts, 30000);
});

// ========== ЗАГЛУШКИ ДЛЯ ТЕСТА ==========

function showLoading() {
    postsContainer.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            <p>Загружаем посты с сервера...</p>
        </div>
    `;
}

function showError(message) {
    postsContainer.innerHTML = `
        <div class="error-message">
            <i class="fas fa-exclamation-triangle"></i>
            <h3>Ошибка загрузки</h3>
            <p>${message}</p>
            <button onclick="loadPosts()" style="margin-top: 15px; padding: 10px 20px;">
                <i class="fas fa-redo"></i> Повторить попытку
            </button>
        </div>
    `;
}

function hideStatusMessage() {
    // Можно добавить скрытие статусных сообщений
}

function loadFallbackPosts() {
    const fallbackPosts = [
        {
            id: 999,
            date: new Date().toLocaleString('ru-RU'),
            content: 'Это демонстрационный пост. Реальные посты появятся после подключения сервера.',
            type: 'text',
            telegram_link: 'https://t.me/oprosokolopolit'
        }
    ];
    renderPosts(fallbackPosts);
}

// ========== ДОБАВЛЯЕМ CSS ДЛЯ УВЕДОМЛЕНИЙ ==========
const style = document.createElement('style');
style.textContent = `
    .notification {
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 10px;
        background: var(--black);
        color: white;
        border-left: 4px solid var(--blue);
        box-shadow: 0 5px 15px rgba(0,0,0,0.3);
        z-index: 1000;
        transform: translateX(120%);
        transition: transform 0.3s ease;
        max-width: 300px;
    }
    
    .notification.show {
        transform: translateX(0);
    }
    
    .notification.success {
        border-left-color: #4CD964;
    }
    
    .notification.error {
        border-left-color: var(--red);
    }
    
    .notification i {
        margin-right: 10px;
    }
    
    .stat-number.pulse {
        animation: pulse 0.5s ease;
    }
    
    @keyframes pulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.1); }
        100% { transform: scale(1); }
    }
`;
document.head.appendChild(style);