# 🚗 AbozorComfort — Инструкция по развёртыванию

## Структура проекта

```
abozorcomfort/
├── backend/
│   ├── server.js        ← Главный сервер (Express + PostgreSQL)
│   ├── db.js            ← Подключение к базе данных
│   ├── schema.sql       ← Создание таблиц и начальные данные
│   ├── package.json
│   ├── .env.example     ← Шаблон настроек
│   └── uploads/         ← Папка для загруженных фото (создаётся автоматически)
└── frontend/
    ├── index.html       ← Главная страница (ваш auto_dealership_cms.html)
    ├── css/style.css    ← Стили
    └── js/app.js        ← Логика фронтенда (обновлённая)
```

---

## 🖥️ Локальная разработка

### 1. Установить PostgreSQL
- Windows: https://www.postgresql.org/download/windows/
- Ubuntu: `sudo apt install postgresql postgresql-contrib`

### 2. Создать базу данных
```bash
# Войти в PostgreSQL
psql -U postgres

# В консоли psql:
CREATE DATABASE abozorcomfort;
\c abozorcomfort
\i /путь/к/schema.sql
\q
```

### 3. Настроить окружение
```bash
cd backend
cp .env.example .env
# Откройте .env и заполните DB_PASSWORD и другие настройки
```

### 4. Установить зависимости и запустить
```bash
cd backend
npm install
npm run dev     # разработка (с авто-перезагрузкой)
# или
npm start       # продакшн
```

### 5. Настроить фронтенд
В файле `frontend/js/app.js` строка 9:
```js
// При локальной разработке:
const API_BASE = 'http://localhost:3001';

// На сервере (фронт и бэк на одном домене):
const API_BASE = '';
```

Откройте `frontend/index.html` в браузере (или через Live Server).

---

## 🌐 Деплой на VPS (Ubuntu)

### 1. Установить Node.js и PostgreSQL
```bash
# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# PM2 (менеджер процессов)
sudo npm install -g pm2
```

### 2. Загрузить файлы на сервер
```bash
# С локального компьютера:
scp -r abozorcomfort/ user@ВАШ_IP:/var/www/abozorcomfort
```

### 3. Настроить базу данных на сервере
```bash
sudo -u postgres psql
CREATE USER abozor WITH PASSWORD 'сильный_пароль';
CREATE DATABASE abozorcomfort OWNER abozor;
GRANT ALL PRIVILEGES ON DATABASE abozorcomfort TO abozor;
\q

# Инициализировать таблицы
psql -U abozor -d abozorcomfort -f /var/www/abozorcomfort/backend/schema.sql
```

### 4. Настроить .env
```bash
cd /var/www/abozorcomfort/backend
cp .env.example .env
nano .env
# Заполнить: DB_HOST=localhost, DB_USER=abozor, DB_PASSWORD=сильный_пароль
# FRONTEND_URL=https://ваш-домен.uz
# Изменить ADMIN_PASSWORD на надёжный пароль!
```

### 5. Установить зависимости и запустить через PM2
```bash
cd /var/www/abozorcomfort/backend
npm install --production
pm2 start server.js --name abozorcomfort
pm2 save
pm2 startup
```

### 6. Настроить Nginx
```bash
sudo apt install nginx
sudo nano /etc/nginx/sites-available/abozorcomfort
```

Вставить конфигурацию:
```nginx
server {
    listen 80;
    server_name ваш-домен.uz www.ваш-домен.uz;

    # Статические файлы фронтенда
    location / {
        root /var/www/abozorcomfort/frontend;
        try_files $uri $uri/ /index.html;
    }

    # API запросы проксируются на Node.js
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Загруженные изображения
    location /uploads {
        proxy_pass http://localhost:3001;
    }

    client_max_body_size 10M;
}
```

```bash
sudo ln -s /etc/nginx/sites-available/abozorcomfort /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 7. SSL сертификат (HTTPS) — бесплатно
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d ваш-домен.uz -d www.ваш-домен.uz
```

---

## 🔑 API Endpoints

| Метод | URL | Доступ | Описание |
|-------|-----|--------|----------|
| POST | /api/auth/login | Публичный | Вход в систему |
| GET | /api/cars | Публичный | Получить каталог |
| GET | /api/cars/:id | Публичный | Одна машина |
| POST | /api/cars | Только admin | Добавить машину |
| PUT | /api/cars/:id | Только admin | Редактировать |
| DELETE | /api/cars/:id | Только admin | Удалить |
| POST | /api/cars/:id/upload | Только admin | Загрузить фото |
| POST | /api/requests | Публичный | Оставить заявку |
| GET | /api/requests | Только admin | Все заявки |
| PATCH | /api/requests/:id/status | Только admin | Изменить статус |
| DELETE | /api/requests/:id | Только admin | Удалить заявку |
| GET | /api/health | Публичный | Проверка сервера |

---

## ⚠️ Важно перед запуском в продакшн

1. **Измените пароль** — в .env задайте сложный `ADMIN_PASSWORD`
2. **Измените JWT_SECRET** — длинная случайная строка (минимум 32 символа)
3. **Ограничьте CORS** — в .env укажите точный домен в `FRONTEND_URL`
4. **Бэкапы** — настройте автоматическое резервное копирование PostgreSQL:
   ```bash
   # Добавить в crontab (ежедневно в 3:00)
   0 3 * * * pg_dump -U abozor abozorcomfort > /backups/db_$(date +%Y%m%d).sql
   ```

---

## 🛠️ Управление сервером

```bash
pm2 status              # статус
pm2 logs abozorcomfort  # логи
pm2 restart abozorcomfort  # перезапуск
pm2 stop abozorcomfort     # остановить
```
