// =============================================
// AbozorComfort — Frontend App (API версия)
// =============================================

// Адрес бэкенда. При разработке локально — http://localhost:3001
// На сервере — просто '' (пустая строка, т.к. фронт и бэк на одном домене)
const API_BASE = '/api'; // Изменить на 'http://localhost:3001' при локальной разработке

// Global State
let cars = [];
let filterActive = 'all';
let isLoggedIn = false;
let isRequestsLoggedIn = false;
let requests = [];
let authToken = null;

// =============================================
// API HELPER
// =============================================

async function apiRequest(method, path, body = null, requiresAuth = false) {
    const opts = {
        method,
        headers: { 'Content-Type': 'application/json' }
    };
    if (requiresAuth && authToken) {
        opts.headers['Authorization'] = `Bearer ${authToken}`;
    }
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(API_BASE + path, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка запроса');
    return data;
}

// =============================================
// ЗАГРУЗКА ДАННЫХ
// =============================================

async function loadCars() {
    try {
        cars = await apiRequest('GET', '/api/cars');
    } catch (err) {
        console.error('Ошибка загрузки каталога:', err.message);
        cars = [];
        showGlobalError('Не удалось загрузить каталог. Проверьте соединение.');
    }
    renderGrid();
    renderAdminTable();
}

async function loadRequests() {
    try {
        requests = await apiRequest('GET', '/api/requests', null, true);
    } catch (err) {
        console.error('Ошибка загрузки заявок:', err.message);
        requests = [];
    }
    renderRequestsTable();
}

function showGlobalError(msg) {
    const grid = document.getElementById('cars-grid');
    if (grid) grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
        <div class="icon">⚠️</div><p>${msg}</p></div>`;
}

// =============================================
// UTILS
// =============================================

function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function getTypeLabel(t) {
    return { electric: 'Электро', hybrid: 'Гибрид', petrol: 'ДВС' }[t] || t;
}

function getStatusLabel(s) {
    return { instock: 'В наличии', order: 'Под заказ', presale: 'Предзаказ' }[s] || s;
}

function getStatusClass(s) {
    return { instock: 'instock', order: 'order', presale: 'order' }[s] || '';
}

function formatDate(date) {
    return new Date(date).toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

// =============================================
// PAGE NAVIGATION
// =============================================

function showPage(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('visible'));
    document.querySelectorAll('.nav-links button').forEach(b => b.classList.remove('active'));
    document.getElementById('page-' + id).classList.add('visible');

    const btns = document.querySelectorAll('.nav-links button');
    const map = { catalog: 0, about: 1, contacts: 2, admin: 3, requests: 4 };
    if (map[id] !== undefined && btns[map[id]]) btns[map[id]].classList.add('active');

    if (id === 'admin' && !isLoggedIn) {
        document.getElementById('admin-login-wrap').style.display = '';
        document.getElementById('admin-panel-wrap').style.display = 'none';
    } else if (id === 'admin' && isLoggedIn) {
        document.getElementById('admin-login-wrap').style.display = 'none';
        document.getElementById('admin-panel-wrap').style.display = '';
    }

    if (id === 'requests' && !isRequestsLoggedIn) {
        document.getElementById('requests-login-wrap').style.display = '';
        document.getElementById('requests-panel-wrap').style.display = 'none';
    } else if (id === 'requests' && isRequestsLoggedIn) {
        document.getElementById('requests-login-wrap').style.display = 'none';
        document.getElementById('requests-panel-wrap').style.display = '';
        loadRequests();
    }
}

function goBackToCatalog() {
    showPage('catalog');
    renderGrid();
}

// =============================================
// CAR DETAIL
// =============================================

function showCarDetail(carId) {
    const car = cars.find(c => c.id === carId);
    if (!car) return;

    const detailContent = document.getElementById('car-detail-content');
    detailContent.innerHTML = `
        <div class="car-detail">
            <div class="car-detail-header">
                <div class="car-detail-image">
                    ${car.img
                        ? `<img src="${escHtml(car.img.startsWith('/uploads') ? API_BASE + car.img : car.img)}"
                            alt="${escHtml(car.brand + ' ' + car.model)}"
                            onerror="this.parentElement.innerHTML='🚗 ${escHtml(car.brand)}'">`.trim()
                        : `🚗 ${escHtml(car.brand)}`}
                </div>
                <div class="car-detail-info">
                    <div class="car-detail-brand">${escHtml(car.brand)}</div>
                    <div class="car-detail-name">${escHtml(car.model)} ${car.year || ''}</div>
                    <div class="car-detail-meta">
                        <span class="car-tag ${car.type === 'electric' ? 'ev' : ''}">${getTypeLabel(car.type)}</span>
                        <span class="car-tag ${getStatusClass(car.status)}">${getStatusLabel(car.status)}</span>
                    </div>
                    <div class="car-detail-price">$${Number(car.price).toLocaleString()}</div>
                    <div class="car-detail-price-sub">цена под ключ в Ташкенте</div>
                    <div class="car-detail-description">${escHtml(car.desc || 'Подробное описание уточняйте у менеджера.')}</div>
                    <div class="car-detail-actions">
                        <button class="btn-primary" onclick="openRequestModal('${car.id}')">📝 Оставить заявку</button>
                        <button class="btn-outline" onclick="showPage('contacts')">📞 Связаться</button>
                    </div>
                </div>
            </div>
            ${car.specs ? `
            <div class="car-detail-specs">
                <h4>📊 Характеристики</h4>
                <div class="specs-list">
                    ${car.specs.split(',').map(s => `<div class="spec-item">• ${escHtml(s.trim())}</div>`).join('')}
                </div>
            </div>` : ''}
        </div>`;
    showPage('detail');
}

// =============================================
// REQUESTS (ЗАЯВКИ)
// =============================================

function openRequestModal(carId) {
    const car = cars.find(c => c.id === carId);
    if (!car) return;

    document.getElementById('request-car-name').value = `${car.brand} ${car.model}`;
    document.getElementById('request-client-name').value = '';
    document.getElementById('request-client-phone').value = '';
    document.getElementById('request-comment').value = '';
    document.getElementById('request-modal-alert').innerHTML = '';
    document.getElementById('request-modal').classList.add('open');
    window.currentRequestCarId = carId;
}

function closeRequestModal() {
    document.getElementById('request-modal').classList.remove('open');
}

async function submitRequest() {
    const name = document.getElementById('request-client-name').value.trim();
    const phone = document.getElementById('request-client-phone').value.trim();
    const comment = document.getElementById('request-comment').value.trim();
    const carName = document.getElementById('request-car-name').value;
    const alertDiv = document.getElementById('request-modal-alert');

    if (!name || !phone) {
        alertDiv.innerHTML = '<div class="alert alert-err">Заполните имя и телефон</div>';
        return;
    }

    try {
        alertDiv.innerHTML = '<div class="alert" style="color:var(--text2)">Отправка...</div>';
        await apiRequest('POST', '/api/requests', {
            carId: window.currentRequestCarId,
            carName,
            clientName: name,
            clientPhone: phone,
            comment
        });

        closeRequestModal();
        alert('✅ Заявка успешно отправлена! Наш менеджер свяжется с вами.');
    } catch (err) {
        alertDiv.innerHTML = `<div class="alert alert-err">${escHtml(err.message)}</div>`;
    }
}

function renderRequestsTable() {
    const tbody = document.getElementById('requests-tbody');
    const totalSpan = document.getElementById('total-requests');
    const newSpan = document.getElementById('new-requests');

    if (!requests.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:2rem">Нет заявок</td></tr>';
        if (totalSpan) totalSpan.textContent = '0';
        if (newSpan) newSpan.textContent = '0';
        return;
    }

    const newCount = requests.filter(r => r.status === 'new').length;
    if (totalSpan) totalSpan.textContent = requests.length;
    if (newSpan) newSpan.textContent = newCount;

    tbody.innerHTML = requests.map(r => `
        <tr>
            <td>${formatDate(r.createdAt)}</td>
            <td><strong>${escHtml(r.carName)}</strong></td>
            <td>${escHtml(r.clientName)}</td>
            <td><strong>${escHtml(r.clientPhone)}</strong></td>
            <td>
                <select class="form-control" style="width:auto;padding:4px 8px;font-size:12px"
                    onchange="updateRequestStatus('${r.id}', this.value)">
                    <option value="new" ${r.status==='new'?'selected':''}>🟡 Новая</option>
                    <option value="processing" ${r.status==='processing'?'selected':''}>🔵 В обработке</option>
                    <option value="completed" ${r.status==='completed'?'selected':''}>🟢 Завершена</option>
                    <option value="cancelled" ${r.status==='cancelled'?'selected':''}>🔴 Отменена</option>
                </select>
            </td>
            <td>
                <button class="btn-edit" onclick="viewRequestDetails('${r.id}')">📄</button>
                <button class="btn-del" onclick="deleteRequest('${r.id}')">🗑</button>
            </td>
        </tr>`).join('');
}

async function updateRequestStatus(requestId, newStatus) {
    try {
        await apiRequest('PATCH', `/api/requests/${requestId}/status`, { status: newStatus }, true);
        const r = requests.find(x => x.id === requestId);
        if (r) r.status = newStatus;
        renderRequestsTable();
    } catch (err) {
        alert('Ошибка: ' + err.message);
    }
}

function viewRequestDetails(requestId) {
    const r = requests.find(x => x.id === requestId);
    if (!r) return;
    alert(`📋 Детали заявки:\n\nАвтомобиль: ${r.carName}\nКлиент: ${r.clientName}\nТелефон: ${r.clientPhone}\nКомментарий: ${r.comment || '—'}\nДата: ${formatDate(r.createdAt)}\nСтатус: ${r.status}`);
}

async function deleteRequest(requestId) {
    if (!confirm('Удалить заявку?')) return;
    try {
        await apiRequest('DELETE', `/api/requests/${requestId}`, null, true);
        requests = requests.filter(r => r.id !== requestId);
        renderRequestsTable();
    } catch (err) {
        alert('Ошибка: ' + err.message);
    }
}

function exportRequestsToCSV() {
    if (!requests.length) { alert('Нет заявок для экспорта'); return; }
    const headers = ['Дата', 'Автомобиль', 'Клиент', 'Телефон', 'Комментарий', 'Статус'];
    const rows = requests.map(r => [
        formatDate(r.createdAt), r.carName, r.clientName,
        r.clientPhone, r.comment || '', r.status
    ]);
    const csv = [headers, ...rows].map(row =>
        row.map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(',')
    ).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `requests_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// =============================================
// AUTH
// =============================================

async function doLogin() {
    const u = document.getElementById('login-user').value.trim();
    const p = document.getElementById('login-pass').value;
    const alertDiv = document.getElementById('login-alert');

    try {
        alertDiv.innerHTML = '<div class="alert" style="color:var(--text2)">Вход...</div>';
        const data = await apiRequest('POST', '/api/auth/login', { login: u, password: p });
        authToken = data.token;
        // Сохраняем токен в сессии (вкладка)
        sessionStorage.setItem('ac_token', authToken);
        isLoggedIn = true;
        isRequestsLoggedIn = true;
        document.getElementById('admin-login-wrap').style.display = 'none';
        document.getElementById('admin-panel-wrap').style.display = '';
        alertDiv.innerHTML = '';
        await loadCars();
        renderAdminTable();
    } catch (err) {
        alertDiv.innerHTML = `<div class="alert alert-err">${escHtml(err.message)}</div>`;
    }
}

function doLogout() {
    authToken = null;
    isLoggedIn = false;
    isRequestsLoggedIn = false;
    sessionStorage.removeItem('ac_token');
    document.getElementById('admin-login-wrap').style.display = '';
    document.getElementById('admin-panel-wrap').style.display = 'none';
    showPage('catalog');
}

// Для страницы заявок — используем тот же токен
function doRequestsLogin() {
    doLogin().then(() => {
        if (isLoggedIn) {
            document.getElementById('requests-login-wrap').style.display = 'none';
            document.getElementById('requests-panel-wrap').style.display = '';
            loadRequests();
        }
    });
}

function doRequestsLogout() { doLogout(); }

// =============================================
// MODAL (добавить/редактировать авто)
// =============================================

let editId = null;

function openModal(id = null) {
    editId = id;
    document.getElementById('modal-title').textContent = id ? 'РЕДАКТИРОВАТЬ' : 'ДОБАВИТЬ АВТО';
    document.getElementById('modal-alert').innerHTML = '';

    if (id) {
        const c = cars.find(x => x.id === id);
        document.getElementById('f-brand').value = c.brand || '';
        document.getElementById('f-model').value = c.model || '';
        document.getElementById('f-type').value = c.type || 'electric';
        document.getElementById('f-status').value = c.status || 'instock';
        document.getElementById('f-price').value = c.price || '';
        document.getElementById('f-year').value = c.year || '';
        document.getElementById('f-img').value = c.img || '';
        document.getElementById('f-desc').value = c.desc || '';
        document.getElementById('f-specs').value = c.specs || '';
        document.getElementById('f-tags').value = c.tags || '';
    } else {
        ['f-brand','f-model','f-price','f-year','f-img','f-desc','f-specs','f-tags']
            .forEach(i => document.getElementById(i).value = '');
        document.getElementById('f-type').value = 'electric';
        document.getElementById('f-status').value = 'instock';
    }

    document.getElementById('car-modal').classList.add('open');
}

function closeModal() {
    document.getElementById('car-modal').classList.remove('open');
}

async function saveCar() {
    const brand = document.getElementById('f-brand').value.trim();
    const model = document.getElementById('f-model').value.trim();
    const price = document.getElementById('f-price').value;
    const alertDiv = document.getElementById('modal-alert');

    if (!brand || !model || !price) {
        alertDiv.innerHTML = '<div class="alert alert-err">Заполните марку, модель и цену</div>';
        return;
    }

    const payload = {
        brand, model,
        type: document.getElementById('f-type').value,
        status: document.getElementById('f-status').value,
        price: parseFloat(price),
        year: parseInt(document.getElementById('f-year').value) || new Date().getFullYear(),
        img: document.getElementById('f-img').value.trim(),
        desc: document.getElementById('f-desc').value.trim(),
        specs: document.getElementById('f-specs').value.trim(),
        tags: document.getElementById('f-tags').value.trim(),
        isNew: !editId
    };

    try {
        alertDiv.innerHTML = '<div class="alert" style="color:var(--text2)">Сохранение...</div>';

        if (editId) {
            const updated = await apiRequest('PUT', `/api/cars/${editId}`, payload, true);
            const idx = cars.findIndex(c => c.id === editId);
            if (idx > -1) cars[idx] = updated;
        } else {
            const newCar = await apiRequest('POST', '/api/cars', payload, true);
            cars.unshift(newCar);
        }

        renderGrid();
        renderAdminTable();
        closeModal();

        const adminAlert = document.getElementById('admin-alert');
        adminAlert.innerHTML = '<div class="alert alert-ok">✓ Сохранено успешно</div>';
        setTimeout(() => adminAlert.innerHTML = '', 3000);
    } catch (err) {
        alertDiv.innerHTML = `<div class="alert alert-err">${escHtml(err.message)}</div>`;
    }
}

function editCar(id) { openModal(id); }

async function deleteCar(id) {
    if (!confirm('Удалить автомобиль?')) return;
    try {
        await apiRequest('DELETE', `/api/cars/${id}`, null, true);
        cars = cars.filter(c => c.id !== id);
        renderGrid();
        renderAdminTable();
    } catch (err) {
        alert('Ошибка: ' + err.message);
    }
}

// =============================================
// FILTER & SEARCH
// =============================================

function setFilter(el) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    filterActive = el.dataset.filter;
    renderGrid();
}

function setFilterByType(type) {
    showPage('catalog');
    document.querySelectorAll('.filter-btn').forEach(btn => {
        if (btn.dataset.filter === type) setFilter(btn);
    });
    setTimeout(() => document.getElementById('grid-section').scrollIntoView({ behavior: 'smooth' }), 100);
}

// =============================================
// RENDER GRID
// =============================================

function renderGrid() {
    const q = document.getElementById('search-input').value.toLowerCase();

    let list = cars.filter(c => {
        const matchFilter =
            filterActive === 'all' ||
            (filterActive === 'electric' && c.type === 'electric') ||
            (filterActive === 'hybrid'   && c.type === 'hybrid') ||
            (filterActive === 'petrol'   && c.type === 'petrol') ||
            (filterActive === 'instock'  && c.status === 'instock');
        const matchSearch = !q || (c.brand + ' ' + c.model + ' ' + (c.tags||'')).toLowerCase().includes(q);
        return matchFilter && matchSearch;
    });

    document.getElementById('count-label').textContent = list.length + ' авто';
    const grid = document.getElementById('cars-grid');

    if (!list.length) {
        grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
            <div class="icon">🚘</div><p>Автомобили не найдены</p>
            <button class="btn-outline" onclick="document.getElementById('search-input').value='';filterActive='all';
            document.querySelectorAll('.filter-btn').forEach((b,i)=>b.classList.toggle('active',i===0));renderGrid()">
            Сбросить фильтры</button></div>`;
        return;
    }

    grid.innerHTML = list.map(c => {
        const imgSrc = c.img
            ? (c.img.startsWith('/uploads') ? API_BASE + c.img : c.img)
            : '';
        return `
        <div class="car-card" onclick="showCarDetail('${c.id}')">
            ${c.isNew ? '<div class="badge-new">NEW</div>' : ''}
            ${imgSrc
                ? `<div class="car-img"><img src="${escHtml(imgSrc)}" alt="${escHtml(c.brand+' '+c.model)}"
                    onerror="this.parentElement.innerHTML='<div class=\\'car-img-placeholder\\'><span>🚗</span><small>${escHtml(c.brand)}</small></div>'"></div>`
                : `<div class="car-img-placeholder"><span>🚗</span><small>${escHtml(c.brand)}</small></div>`}
            <div class="car-body">
                <div class="car-brand">${escHtml(c.brand)}</div>
                <div class="car-name">${escHtml(c.model)} ${c.year || ''}</div>
                <div class="car-meta">
                    <span class="car-tag ${c.type==='electric'?'ev':''}">${getTypeLabel(c.type)}</span>
                    <span class="car-tag ${getStatusClass(c.status)}">${getStatusLabel(c.status)}</span>
                    ${(c.tags||'').split(',').filter(t=>t.trim()).slice(0,2)
                        .map(t=>`<span class="car-tag">${escHtml(t.trim())}</span>`).join('')}
                </div>
                <div class="car-price">$${Number(c.price).toLocaleString()}</div>
                <div class="car-price-sub">цена под ключ в Ташкенте</div>
                <div class="car-footer">
                    <button class="btn-sm btn-contact" onclick="event.stopPropagation();openRequestModal('${c.id}')">Заказать</button>
                    <button class="btn-sm btn-more" onclick="event.stopPropagation();showCarDetail('${c.id}')">Подробнее</button>
                </div>
            </div>
        </div>`;
    }).join('');
}

// =============================================
// RENDER ADMIN TABLE
// =============================================

function renderAdminTable() {
    const tb = document.getElementById('admin-tbody');
    if (!cars.length) {
        tb.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:2rem">Каталог пуст</td></tr>';
        return;
    }
    tb.innerHTML = cars.map(c => {
        const imgSrc = c.img ? (c.img.startsWith('/uploads') ? API_BASE + c.img : c.img) : '';
        return `<tr>
            <td>${imgSrc
                ? `<img class="car-thumb" src="${escHtml(imgSrc)}" onerror="this.style.display='none'">`
                : '<div class="car-thumb" style="display:flex;align-items:center;justify-content:center;font-size:18px">🚗</div>'}</td>
            <td><b>${escHtml(c.brand)}</b> ${escHtml(c.model)}<br>
                <span style="font-size:11px;color:var(--text3)">${c.year||''}</span></td>
            <td><span class="car-tag ${c.type==='electric'?'ev':''}" style="font-size:11px">${getTypeLabel(c.type)}</span></td>
            <td><span class="car-tag ${getStatusClass(c.status)}" style="font-size:11px">${getStatusLabel(c.status)}</span></td>
            <td style="font-weight:600">$${Number(c.price).toLocaleString()}</td>
            <td><div class="action-btns">
                <button class="btn-edit" onclick="editCar('${c.id}')">Изм.</button>
                <button class="btn-del" onclick="deleteCar('${c.id}')">Удал.</button>
            </div></td>
        </tr>`;
    }).join('');
}

// =============================================
// EVENT LISTENERS
// =============================================

document.getElementById('car-modal').addEventListener('click', function(e) {
    if (e.target === this) closeModal();
});
document.getElementById('request-modal').addEventListener('click', function(e) {
    if (e.target === this) closeRequestModal();
});
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeModal(); closeRequestModal(); }
});

// =============================================
// INITIALIZE
// =============================================

// Восстанавливаем сессию если был залогинен
const savedToken = sessionStorage.getItem('ac_token');
if (savedToken) {
    authToken = savedToken;
    isLoggedIn = true;
    isRequestsLoggedIn = true;
}

loadCars();
