# SkillTree AI

![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-Native_Execution-3178C6?style=flat-square&logo=typescript&logoColor=white)
![SQLite](https://img.shields.io/badge/Database-SQLite_%2F_Turso_libSQL-003B57?style=flat-square&logo=sqlite&logoColor=white)
![Hono](https://img.shields.io/badge/Backend-Hono_API-E36002?style=flat-square)
![Tests](https://img.shields.io/badge/Tests-19_Passing-10b981?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-06b6d4?style=flat-square)

**Платформа персоналізованих карт розвитку ІТ-компетенцій із контекстним ШІ-асистентом, гібридним менторством та B2B Skill Matrix аналітикою.**

SkillTree AI поєднує автоматичну генерацію покрокових роудмапів навчання, інтерактивне **3D-сузір'я навичок** та **2D-трекер**, вбудований ШІ-тьютор по кожній темі з гарантією часу відповіді `≤ 5000 мс`, систему бронювання й атомарної оплати 1-на-1 менторських консультацій та корпоративну матрицю навичок команди з експортом звітів у RFC-4180 CSV.

---

## Ключові можливості

### Студент / Фахівець (`LEARNER`)
- **Генерація персональної карти (`UC2`):** створення дерева навичок під обрану ІТ-професію та рівень (`BEGINNER`, `INTERMEDIATE`, `ADVANCED`) або довільний запит.
- **3D Сузір'я та 2D Список (`UC3`, `UC10`):** перегляд компетенцій у вигляді інтерактивного 3D-графа (`#constellation-canvas` з обертанням мишею) або вертикального 2D-списку; додавання та видалення власних вузлів із захистом композиції `1 : 1..*`.
- **Гейміфікація прогресу (`UC3`):** зміна статусів (`NOT_STARTED → IN_PROGRESS → DONE`), автоматичний розрахунок `%` прогресу, нарахування `+50 XP` без дублювання та відкриття бейджів (`Перший крок`, `Активний дослідник`, `Майстер дерева`).
- **Контекстний ШІ-асистент (`UC4`, `UC11`):** чат усередині кожного вузла з урахуванням теми та матеріалів (`SLA ≤ 5000 мс`), підтримкою `GEMINI_API_KEY` / `OPENAI_API_KEY` або локальним рушієм знань та оцінюванням відповідей (`👍 / 👎`).
- **Менторські консультації (`UC6`, `UC9`):** каталог верифікованих менторів із реальним підрахунком зайнятості слотів, пошук і фільтрація за стеком, атомарне бронювання й оплата (`CARD`, `APPLE_PAY`, `INVOICE`) з формуванням електронних квитанцій (`PaymentReceipt`) та оцінкою якості сесії (`1–5 ★`).

### Ментор / Експерт (`MENTOR`)
- **Публікація матеріалів (`UC5`):** додавання авторських уроків (`TEXT`), відеорозборів (`VIDEO`) та перевірених `http/https` посилань (`LINK`) безпосередньо у вузли карти навичок студентів.
- **Керування сесіями (`UC6`, `UC9`):** підтвердження лише оплачених бронювань (`PAID → CONFIRMED`), скасування з автоматичним поверненням коштів (`REFUNDED`) та динамічний перерахунок рейтингу за відгуками у БД.

### HR / TeamLead B2B (`HR`)
- **Командна матриця навичок (`UC7`):** створення команд, додавання учасників, агрегація прогресу за професіями та окремими навичками, виявлення `Skill Gaps`.
- **Призначення планів розвитку (`UC8`):** клонування шаблону карти для працівників із чистими статусами `NOT_STARTED`.
- **Аудит та експорт (`UC12`):** попередній перегляд і вивантаження стандартизованого RFC-4180 CSV-звіту з UTF-8 BOM для коректного відображення кирилиці в Excel або JSON-звіту.

---

## Екрани та маршрути інтерфейсу

Вебзастосунок побудовано в естетиці **Synthetic Nexus (Dark Cyber Material Design 3)** із клієнтською маршрутизацією (`History API`), локально зібраним мініфікованим Tailwind CSS (`public/tailwind.css`) та SPA fallback на сервері:

| Маршрут | Призначення | Основні можливості |
| :--- | :--- | :--- |
| **`/auth` (`/login`)** | 3D-портал автентифікації | Реєстрація (`LEARNER` / `MENTOR` / `HR`), вхід за реальними обліковими даними, вибір терміну сесії |
| **`/` або `/roadmap`** | Робочий простір студента | Карта розвитку (`3D Сузір'я` / `2D Список`), уроки, `AI Blocker Chat`, генерація карт ШІ |
| **`/mentors`** | Каталог менторів та сесій | Пошук із debounce, фільтри спеціалізацій, виїзна панель бронювання й оплати, історія сесій і чеки |
| **`/mentor-cabinet`** | Кабінет ментора | KPI-статистика, публікація матеріалів у вузли (`UC5`), підтвердження та скасування сесій |
| **`/b2b`** | B2B Skill Matrix | Управління командами (`UC7`), таблиця компетенцій, призначення карт (`UC8`), експорт CSV/JSON |
| **`/profile`** | Профіль та активні сесії | Дані акаунта, безпечна зміна пароля з перевіркою поточного, аудит і відкликання HttpOnly-сесій у SQLite |

---

## Архітектура, база даних і безпека

- **Runtime & HTTP-фреймворк:** **Node.js v22+** (`--experimental-transform-types`) + **Hono** (`@hono/node-server`), стиснення відповідей `compress()`, сумісність із **Vercel Fluid Compute**.
- **Персистентність SQLite / Turso (патерн Strategy + Repository):**
  - Локально: вбудований у Node.js 22 рушій `node:sqlite` (`WAL`-режим, `PRAGMA foreign_keys = ON`, серіалізовані транзакції `BEGIN IMMEDIATE` + `SAVEPOINT`).
  - У хмарі (Vercel): автоматичне перемикання на **`@libsql/client/web` (Turso Cloud SQLite)** за наявності `TURSO_DATABASE_URL` і `TURSO_AUTH_TOKEN` (або тимчасовий fallback `/tmp/skilltree.db`).
  - Нормалізована схема з **11 таблиць** і **12 індексів** (`users`, `auth_sessions`, `auth_rate_limits`, `skill_trees`, `skill_nodes`, `learning_materials`, `chat_messages`, `mentor_sessions`, `payment_receipts`, `teams`, `team_members`), batch-гідратація без N+1 запитів.
- **Пакет захисту (Security Hardening):**
  - Хешування паролів через **`crypto.scryptSync`** із випадковою 16-байтною сіллю та порівнянням **`crypto.timingSafeEqual`** (мінімум 8 символів пароля).
  - Персональні **`HttpOnly; SameSite=Lax`** cookie-сесії з SHA-256 хешуванням токена у таблиці `auth_sessions` та захистом від брутфорсу (`auth_rate_limits` + sliding-window rate limiter).
  - Суворий **RBAC** (`requireRole('LEARNER' | 'MENTOR' | 'HR')`), перевірка власника ресурсу (anti-IDOR) та принцип найменших привілеїв у `GET /api/state`.
  - **CSRF-захист** (перевірка `Origin` / `Referer` і `X-Requested-With` / `application/json`), обмеження розміру JSON (`128 KB` → `413`), типізована ієрархія HTTP-помилок (`400`/`401`/`403`/`404`/`409`/`413`/`429`/`500`), валідація протоколів URL (`http:`/`https:` лише, захист від `javascript:` XSS).
  - Security-заголовки: суворий `Content-Security-Policy` (`script-src 'self'`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`.

### Структура проєкту

```text
SkillTree AI/
├── public/
│   ├── js/
│   │   ├── app.js                   # Головний ES-модуль, ініціалізація та глобальні події
│   │   ├── core/                    # api.js (mutateAndSync), dom.js, router.js, state.js
│   │   ├── pages/                   # authPage, roadmapPage, mentorsPage, mentorCabinetPage, b2bPage, profilePage
│   │   └── visuals/                 # authCanvas.js та constellationCanvas.js (пауза RAF поза фокусом)
│   ├── index.html                   # 6-екранний інтерфейс без inline-скриптів і заглушок
│   ├── styles.css                   # Кастомні стилі Synthetic Nexus / Cyber Material Design 3
│   └── tailwind.css                 # Скомпільований та мініфікований Tailwind CSS
├── src/
│   ├── adapters/
│   │   ├── AIServiceAdapter.ts      # Генерація карт та контекстний ШІ-асистент (Gemini/OpenAI/Local)
│   │   ├── professionTemplates.ts   # Шаблони навчальних треків для 8+ ІТ-професій
│   │   └── PaymentAdapter.ts        # Обробка оплат (UAH), PaymentReceipt, повернення коштів
│   ├── db/
│   │   ├── SqlExecutor.ts           # Strategy для node:sqlite та @libsql/client/web (Turso)
│   │   ├── schema.ts                # DDL 11 таблиць і 12 індексів SQLite
│   │   ├── seed.ts                  # Ідемпотентний початковий каталог 3 верифікованих менторів
│   │   └── mappers.ts               # Мапінг SQL-рядків у доменні сутності UML
│   ├── domain/                      # 10 класів та 5 enum-ів предметної області (UC1–UC12)
│   ├── http/
│   │   ├── errors.ts                # HttpError/AppError та безпечний mapErrorToHttp
│   │   ├── security.ts              # HttpOnly cookies, RBAC, CSRF, CSP, rate limiting
│   │   └── validation.ts            # Сувора валідація JSON (<=128 KB), дат, enum, URL
│   ├── repositories/
│   │   ├── SkillTreeRepository.ts   # SQLite-репозиторій з транзакціями та batch-завантаженням
│   │   └── errors.ts                # Доменні/прикладні помилки репозиторію
│   ├── routes/                      # Модульні маршрути: authRoutes, treeRoutes, mentorRoutes, b2bRoutes
│   ├── services/SkillMatrixService.ts
│   ├── styles/input.css             # Джерело Tailwind для локальної збірки
│   ├── createApp.ts                 # Фабрика Hono-застосунку та безпечна роздача статики
│   └── server.ts                    # Entrypoint для Vercel Fluid Compute (export default app) та локального запуску
├── tests/
│   ├── domain.test.ts               # Юніт- та регресійні тести доменної моделі (11 тестів)
│   ├── sqlite.test.ts               # Тести схеми, персистентності на диску та транзакцій SQLite (3 тести)
│   └── api.test.ts                  # Інтеграційні тести REST API, RBAC, CSRF, XSS, HttpOnly сесій (5 тестів)
├── package.json
├── tailwind.config.cjs
├── tsconfig.json
└── vercel.json
```

---

## Локальний запуск та тестування

### Вимоги
- **Node.js v22+**

### Команди

```bash
# 1. Клонування та встановлення залежностей
git clone https://github.com/kor1pA/skilltree-ai.git
cd skilltree-ai
npm install

# 2. Збірка мініфікованого Tailwind CSS (опціонально при змінах UI)
npm run css:build

# 3. Запуск сервера (http://localhost:3000)
npm start

# 4. Запуск усіх 19 автотестів (domain + sqlite + api/security)
npm test
```

> При першому старті на порожній БД автоматично створюються всі таблиці та 3 стартові ментори для публічного каталогу. Нові користувачі (`LEARNER`, `MENTOR`, `HR`) створюють облікові записи через екран `/auth`.

---

## Змінні середовища та деплой на Vercel

| Змінна | Призначення | За замовчуванням |
| :--- | :--- | :--- |
| `PORT` | Локальний порт HTTP-сервера | `3000` |
| `SQLITE_PATH` | Шлях до локального файлу SQLite | `data/skilltree.db` |
| `TURSO_DATABASE_URL` | URL хмарної бази Turso libSQL для продакшну на Vercel | — *(fallback `/tmp/skilltree.db`)* |
| `TURSO_AUTH_TOKEN` | Токен доступу до бази Turso libSQL | — |
| `GEMINI_API_KEY` | Ключ Google Gemini API для відповідей ШІ-асистента | локальний синтезатор |
| `OPENAI_API_KEY` | Ключ OpenAI API (`gpt-4o-mini`) за відсутності Gemini-ключа | локальний синтезатор |

Для розгортання на **Vercel**:
```bash
npx vercel login
npx vercel --prod
```
Для постійного збереження даних між serverless cold start на Vercel задайте у **Project Settings → Environment Variables** змінні `TURSO_DATABASE_URL` і `TURSO_AUTH_TOKEN`.

---

## Огляд REST API

| Група | Ендпоінти |
| :--- | :--- |
| **Стан та автентифікація (`UC1`)** | `GET /api/health` • `GET /api/state` • `POST /api/auth/register` • `POST /api/auth/login` • `POST /api/auth/logout` • `PUT /api/profile` • `POST /api/auth/change-password` • `GET /api/auth/sessions` • `DELETE /api/auth/sessions/:sessionId` • `POST /api/auth/sessions/revoke-others` |
| **Карта розвитку та ШІ (`UC2–UC4`, `UC10–UC11`)** | `POST /api/trees/generate` • `POST /api/trees/:treeId/nodes` • `DELETE /api/trees/:treeId/nodes/:nodeId` • `PATCH /api/trees/:treeId/nodes/:nodeId/status` • `POST /api/trees/:treeId/nodes/:nodeId/chat` • `PATCH /api/chat/:messageId/rate` |
| **Менторство та оплата (`UC5`, `UC6`, `UC9`)** | `GET /api/mentors` • `POST /api/nodes/:nodeId/materials` • `POST /api/sessions` • `POST /api/sessions/:id/pay` • `POST /api/sessions/:id/confirm` • `POST /api/sessions/:id/cancel` • `POST /api/sessions/:id/feedback` |
| **B2B команди та звіти (`UC7`, `UC8`, `UC12`)** | `GET /api/teams/:id/matrix` • `POST /api/teams` • `POST /api/teams/:id/members` • `POST /api/hr/assign-tree` • `GET /api/teams/:id/export?format=CSV\|JSON` |

---

## Автор та ліцензія

- **Автор:** Гой Вячеслав Володимирович (група КН-25)
- **Ліцензія:** MIT
