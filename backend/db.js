// backend/db.js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

pool.on('error', (err) => {
    console.error('❌ Ошибка PostgreSQL:', err.message);
});

pool.connect()
    .then(client => {
        console.log('✅ PostgreSQL подключён успешно');
        client.release();
    })
    .catch(err => {
        console.error('❌ Не удалось подключиться к PostgreSQL:', err.message);
        process.exit(1);
    });

module.exports = pool;