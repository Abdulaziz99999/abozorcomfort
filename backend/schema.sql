-- =============================================
-- AbozorComfort — Инициализация базы данных
-- Запустить один раз: psql -U postgres -f schema.sql
-- =============================================

-- Создать базу данных (выполнить от имени postgres)
-- CREATE DATABASE abozorcomfort;
-- \c abozorcomfort

-- Таблица пользователей-администраторов
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    login VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'admin',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Таблица автомобилей
CREATE TABLE IF NOT EXISTS cars (
    id VARCHAR(50) PRIMARY KEY,
    brand VARCHAR(100) NOT NULL,
    model VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('electric', 'hybrid', 'petrol')),
    status VARCHAR(20) NOT NULL DEFAULT 'instock' CHECK (status IN ('instock', 'order', 'presale')),
    price NUMERIC(12, 2) NOT NULL,
    year INTEGER,
    img TEXT,
    description TEXT,
    specs TEXT,
    tags TEXT,
    is_new BOOLEAN DEFAULT FALSE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Таблица заявок
CREATE TABLE IF NOT EXISTS requests (
    id VARCHAR(50) PRIMARY KEY,
    car_id VARCHAR(50) REFERENCES cars(id) ON DELETE SET NULL,
    car_name VARCHAR(200) NOT NULL,
    client_name VARCHAR(200) NOT NULL,
    client_phone VARCHAR(50) NOT NULL,
    comment TEXT,
    status VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new', 'processing', 'completed', 'cancelled')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_cars_type ON cars(type);
CREATE INDEX IF NOT EXISTS idx_cars_status ON cars(status);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_created ON requests(created_at DESC);

-- Триггер: автоматически обновлять updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cars_updated_at
    BEFORE UPDATE ON cars
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER requests_updated_at
    BEFORE UPDATE ON requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Начальные данные — автомобили
INSERT INTO cars (id, brand, model, type, status, price, year, description, specs, tags, is_new, sort_order) VALUES
('1', 'BYD', 'Han EV', 'electric', 'instock', 42000, 2025,
 'Флагманский электрический седан от BYD. Мощный, стильный и технологичный автомобиль с запасом хода до 610 км.',
 'Мощность: 517 л.с., Разгон 0-100: 3.9с, Запас хода: 610 км, Батарея: 85.4 кВт·ч',
 'AWD,517 л.с.,610 км', TRUE, 1),

('2', 'Zeekr', '001 Ultra+', 'electric', 'instock', 58000, 2026,
 'Премиальный электрический лифтбек нового поколения с максимальной мощностью и передовыми технологиями.',
 'Мощность: 880 л.с., Разгон 0-100: 2.9с, Запас хода: 820 км, Полный привод',
 'AWD,880 л.с.,820 км', TRUE, 2),

('3', 'Zeekr', '7X Ultra', 'electric', 'instock', 54000, 2025,
 'Премиальный электрический SUV нового поколения. Просторный салон, современные технологии и отличная динамика.',
 'Мощность: 650 л.с., Разгон 0-100: 3.8с, Запас хода: 780 км, Полный привод',
 'SUV,AWD,780 км', FALSE, 3),

('4', 'GAC Aion', 'Y Plus', 'electric', 'order', 28000, 2025,
 'Доступный электрокроссовер для городской езды. Компактный, экономичный и практичный.',
 'Мощность: 204 л.с., Запас хода: 430 км, Передний привод',
 'FWD,430 км', FALSE, 4),

('5', 'BYD', 'Tang DM-i', 'hybrid', 'instock', 38000, 2025,
 'Полноразмерный гибридный SUV на 7 мест. Идеальный выбор для большой семьи.',
 'Двигатель: 1.5T + электромотор, Расход: 1.5л/100км, Запас хода: 1000 км',
 '7 мест,SUV,PHEV', FALSE, 5),

('6', 'Chery', 'Tiggo 8 Pro', 'petrol', 'instock', 26000, 2025,
 'Надёжный семейный SUV с богатой комплектацией и отличным соотношением цена-качество.',
 'Двигатель: 2.0T, Мощность: 197 л.с., Расход: 8.5л/100км, Полный привод',
 'SUV,2.0T,7 мест', FALSE, 6)
ON CONFLICT (id) DO NOTHING;

RAISE NOTICE '✅ База данных AbozorComfort инициализирована успешно!';
