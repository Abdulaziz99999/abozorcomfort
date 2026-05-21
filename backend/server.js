// backend/server.js — Главный сервер AbozorComfort
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

// =============================================
// MIDDLEWARES
// =============================================

app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Статические файлы (загруженные изображения)
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// Раздача фронтенда (если файлы в папке ../frontend)
const frontendDir = path.join(__dirname, '../frontend');
if (fs.existsSync(frontendDir)) {
    app.use(express.static(frontendDir));
}

// =============================================
// ЗАГРУЗКА ИЗОБРАЖЕНИЙ
// =============================================

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `car_${Date.now()}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|webp/;
        if (allowed.test(path.extname(file.originalname).toLowerCase())) {
            cb(null, true);
        } else {
            cb(new Error('Разрешены только изображения: jpg, png, webp'));
        }
    }
});

// =============================================
// AUTH MIDDLEWARE
// =============================================

function authRequired(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Токен отсутствует' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Токен недействителен' });
        req.user = user;
        next();
    });
}

// =============================================
// ИНИЦИАЛИЗАЦИЯ ADMIN-ПОЛЬЗОВАТЕЛЯ
// =============================================

async function initAdminUser() {
    try {
        const { rows } = await db.query('SELECT id FROM users WHERE login = $1', [
            process.env.ADMIN_LOGIN || 'admin'
        ]);
        if (!rows.length) {
            const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', 10);
            await db.query(
                'INSERT INTO users (login, password_hash, role) VALUES ($1, $2, $3)',
                [process.env.ADMIN_LOGIN || 'admin', hash, 'admin']
            );
            console.log('✅ Администратор создан:', process.env.ADMIN_LOGIN || 'admin');
        }
    } catch (err) {
        console.error('Ошибка создания admin:', err.message);
    }
}

// =============================================
// AUTH ROUTES
// =============================================

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { login, password } = req.body;
        if (!login || !password)
            return res.status(400).json({ error: 'Заполните логин и пароль' });

        const { rows } = await db.query('SELECT * FROM users WHERE login = $1', [login]);
        if (!rows.length)
            return res.status(401).json({ error: 'Неверный логин или пароль' });

        const user = rows[0];
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid)
            return res.status(401).json({ error: 'Неверный логин или пароль' });

        const token = jwt.sign(
            { id: user.id, login: user.login, role: user.role },
            JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.json({ token, login: user.login, role: user.role });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// POST /api/auth/change-password (только для авторизованных)
app.post('/api/auth/change-password', authRequired, async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
        const user = rows[0];

        const valid = await bcrypt.compare(oldPassword, user.password_hash);
        if (!valid) return res.status(401).json({ error: 'Старый пароль неверен' });

        const hash = await bcrypt.hash(newPassword, 10);
        await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// =============================================
// CARS ROUTES
// =============================================

// GET /api/cars — получить все машины (публичный)
app.get('/api/cars', async (req, res) => {
    try {
        const { type, status, search } = req.query;
        let query = 'SELECT * FROM cars WHERE 1=1';
        const params = [];
        let i = 1;

        if (type && type !== 'all') {
            if (type === 'instock') {
                query += ` AND status = $${i++}`;
                params.push('instock');
            } else {
                query += ` AND type = $${i++}`;
                params.push(type);
            }
        }
        if (search) {
            query += ` AND (LOWER(brand || ' ' || model || ' ' || COALESCE(tags,'')) LIKE $${i++})`;
            params.push(`%${search.toLowerCase()}%`);
        }

        query += ' ORDER BY sort_order ASC, created_at DESC';

        const { rows } = await db.query(query, params);

        // Приводим к формату, который ожидает фронтенд
        const cars = rows.map(row => ({
            id: row.id,
            brand: row.brand,
            model: row.model,
            type: row.type,
            status: row.status,
            price: parseFloat(row.price),
            year: row.year,
            img: row.img || '',
            desc: row.description || '',
            specs: row.specs || '',
            tags: row.tags || '',
            isNew: row.is_new
        }));

        res.json(cars);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения каталога' });
    }
});

// GET /api/cars/:id — одна машина
app.get('/api/cars/:id', async (req, res) => {
    try {
        const { rows } = await db.query('SELECT * FROM cars WHERE id = $1', [req.params.id]);
        if (!rows.length) return res.status(404).json({ error: 'Автомобиль не найден' });

        const row = rows[0];
        res.json({
            id: row.id, brand: row.brand, model: row.model,
            type: row.type, status: row.status,
            price: parseFloat(row.price), year: row.year,
            img: row.img || '', desc: row.description || '',
            specs: row.specs || '', tags: row.tags || '',
            isNew: row.is_new
        });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// POST /api/cars — добавить машину (только admin)
app.post('/api/cars', authRequired, async (req, res) => {
    try {
        const { brand, model, type, status, price, year, img, desc, specs, tags, isNew } = req.body;
        if (!brand || !model || !price)
            return res.status(400).json({ error: 'Марка, модель и цена обязательны' });

        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

        const { rows } = await db.query(
            `INSERT INTO cars (id, brand, model, type, status, price, year, img, description, specs, tags, is_new)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             RETURNING *`,
            [id, brand, model, type || 'electric', status || 'instock',
             parseFloat(price), parseInt(year) || new Date().getFullYear(),
             img || '', desc || '', specs || '', tags || '', isNew || false]
        );

        const row = rows[0];
        res.status(201).json({
            id: row.id, brand: row.brand, model: row.model,
            type: row.type, status: row.status,
            price: parseFloat(row.price), year: row.year,
            img: row.img || '', desc: row.description || '',
            specs: row.specs || '', tags: row.tags || '',
            isNew: row.is_new
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка добавления автомобиля' });
    }
});

// PUT /api/cars/:id — редактировать машину (только admin)
app.put('/api/cars/:id', authRequired, async (req, res) => {
    try {
        const { brand, model, type, status, price, year, img, desc, specs, tags, isNew } = req.body;

        const { rows } = await db.query(
            `UPDATE cars SET brand=$1, model=$2, type=$3, status=$4, price=$5,
             year=$6, img=$7, description=$8, specs=$9, tags=$10, is_new=$11
             WHERE id=$12 RETURNING *`,
            [brand, model, type, status, parseFloat(price), parseInt(year),
             img || '', desc || '', specs || '', tags || '', isNew || false,
             req.params.id]
        );

        if (!rows.length) return res.status(404).json({ error: 'Автомобиль не найден' });

        const row = rows[0];
        res.json({
            id: row.id, brand: row.brand, model: row.model,
            type: row.type, status: row.status,
            price: parseFloat(row.price), year: row.year,
            img: row.img || '', desc: row.description || '',
            specs: row.specs || '', tags: row.tags || '',
            isNew: row.is_new
        });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка обновления автомобиля' });
    }
});

// DELETE /api/cars/:id — удалить машину (только admin)
app.delete('/api/cars/:id', authRequired, async (req, res) => {
    try {
        const { rowCount } = await db.query('DELETE FROM cars WHERE id = $1', [req.params.id]);
        if (!rowCount) return res.status(404).json({ error: 'Автомобиль не найден' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка удаления' });
    }
});

// POST /api/cars/:id/upload — загрузить фото (только admin)
app.post('/api/cars/:id/upload', authRequired, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
        const imageUrl = `/uploads/${req.file.filename}`;
        await db.query('UPDATE cars SET img = $1 WHERE id = $2', [imageUrl, req.params.id]);
        res.json({ url: imageUrl });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка загрузки изображения' });
    }
});

// =============================================
// REQUESTS ROUTES
// =============================================

// POST /api/requests — создать заявку (публичный)
app.post('/api/requests', async (req, res) => {
    try {
        const { carId, carName, clientName, clientPhone, comment } = req.body;
        if (!clientName || !clientPhone)
            return res.status(400).json({ error: 'Имя и телефон обязательны' });

        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

        await db.query(
            `INSERT INTO requests (id, car_id, car_name, client_name, client_phone, comment)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [id, carId || null, carName || 'Общий запрос',
             clientName, clientPhone, comment || '']
        );

        res.status(201).json({ success: true, message: 'Заявка принята! Мы свяжемся с вами.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка отправки заявки' });
    }
});

// GET /api/requests — получить все заявки (только admin)
app.get('/api/requests', authRequired, async (req, res) => {
    try {
        const { rows } = await db.query(
            `SELECT * FROM requests ORDER BY created_at DESC`
        );

        const mapped = rows.map(r => ({
            id: r.id,
            carId: r.car_id,
            carName: r.car_name,
            clientName: r.client_name,
            clientPhone: r.client_phone,
            comment: r.comment,
            status: r.status,
            createdAt: r.created_at
        }));

        res.json(mapped);
    } catch (err) {
        res.status(500).json({ error: 'Ошибка получения заявок' });
    }
});

// PATCH /api/requests/:id/status — изменить статус заявки
app.patch('/api/requests/:id/status', authRequired, async (req, res) => {
    try {
        const { status } = req.body;
        const validStatuses = ['new', 'processing', 'completed', 'cancelled'];
        if (!validStatuses.includes(status))
            return res.status(400).json({ error: 'Неверный статус' });

        const { rowCount } = await db.query(
            'UPDATE requests SET status = $1 WHERE id = $2',
            [status, req.params.id]
        );
        if (!rowCount) return res.status(404).json({ error: 'Заявка не найдена' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка обновления статуса' });
    }
});

// DELETE /api/requests/:id — удалить заявку
app.delete('/api/requests/:id', authRequired, async (req, res) => {
    try {
        const { rowCount } = await db.query('DELETE FROM requests WHERE id = $1', [req.params.id]);
        if (!rowCount) return res.status(404).json({ error: 'Заявка не найдена' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка удаления' });
    }
});

// =============================================
// HEALTH CHECK
// =============================================

app.get('/api/health', async (req, res) => {
    try {
        await db.query('SELECT 1');
        res.json({ status: 'ok', db: 'connected', time: new Date().toISOString() });
    } catch {
        res.status(500).json({ status: 'error', db: 'disconnected' });
    }
});

// Все остальные запросы → фронтенд (для SPA)
app.get('*', (req, res) => {
    const indexPath = path.join(__dirname, '../frontend/index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.json({ message: 'AbozorComfort API работает', docs: '/api/health' });
    }
});

// =============================================
// ЗАПУСК СЕРВЕРА
// =============================================

app.listen(PORT, async () => {
    console.log(`\n🚀 AbozorComfort сервер запущен: http://localhost:${PORT}`);
    console.log(`📊 API доступен: http://localhost:${PORT}/api/health`);
    await initAdminUser();
});
