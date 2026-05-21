// backend/db.js — Подключение к PostgreSQL
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'abozorcomfort',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    max: 10,                    // максимум 10 одновременных соединений
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
    console.error('❌ Ошибка подключения к PostgreSQL:', err.message);
});

// Проверка подключения при старте
pool.connect()
    .then(client => {
        console.log('✅ PostgreSQL подключён успешно');
        client.release();
    })
    .catch(err => {
        console.error('❌ Не удалось подключиться к PostgreSQL:', err.message);
        console.error('   Проверьте настройки в файле .env');
        process.exit(1);
    });

module.exports = pool;
