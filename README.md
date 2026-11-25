# SkillTree AI

![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-Native_Execution-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Dependencies](https://img.shields.io/badge/Dependencies-Zero_External_Runtime-8b5cf6?style=flat-square)
![Tests](https://img.shields.io/badge/Tests-24_Passing-10b981?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-06b6d4?style=flat-square)

**Платформа персоналізованих карт розвитку ІТ-компетенцій із контекстним ШІ-асистентом, гібридним менторством та B2B Skill Matrix аналітикою.**

SkillTree AI поєднує автоматичну генерацію покрокових роудмапів навчання, інтерактивне **3D-сузір'я навичок** та **2D-трекер**, вбудований ШІ-тьютор по кожній темі з гарантією часу відповіді `≤ 5000 мс`, систему бронювання й оплати 1-на-1 менторських консультацій та корпоративну матрицю навичок команди з експортом звітів у RFC-4180 CSV.

---

## Ключові можливості

### Студент / Фахівець (`LEARNER`)
- **Генерація персональної карти (`UC2`):** створення дерева навичок під обрану ІТ-професію та рівень (`BEGINNER`, `INTERMEDIATE`, `ADVANCED`) або довільний запит.
- **3D Сузір'я та 2D Список (`UC3`, `UC10`):** перегляд компетенцій у вигляді інтерактивного 3D-графа (`#constellation-canvas` з обертанням мишею) або вертикального 2D-списку; додавання та видалення власних вузлів із захистом композиції `1 : 1..*`.
- **Гейміфікація прогресу (`UC3`):** зміна статусів (`NOT_STARTED → IN_PROGRESS → DONE`), автоматичний розрахунок `%` прогресу, нарахування `+50 XP` без дублювання та відкриття бейджів (`Перший крок`, `Активний дослідник`, `Майстер дерева`).
- **Контекстний ШІ-асистент (`UC4`, `UC11`):** чат усередині кожного вузла з урахуванням теми та матеріалів (`SLA ≤ 5000 мс`), підтримкою `GEMINI_API_KEY` / `OPENAI_API_KEY` або локальним рушієм знань та оцінюванням відповідей (`👍 / 👎`).
- **Менторські консультації (`UC6`, `UC9`):** каталог верифікованих менторів, пошук і фільтрація за стеком, бронювання 1-на-1 сесій, онлайн-оплата з формуванням електронних квитанцій (`PaymentReceipt`) та оцінка якості сесії (`1–5 ★`).

### Ментор / Експерт (`MENTOR`)
- **Публікація матеріалів (`UC5`):** додавання авторських уроків (`TEXT`), відеорозборів (`VIDEO`) та посилань (`LINK`) безпосередньо у вузли карти навичок студентів.
- **Керування сесіями (`UC6`, `UC9`):** підтвердження лише оплачених бронювань (`PAID → CONFIRMED`), скасування з автоматичним поверненням коштів (`REFUNDED`) та динамічний перерахунок рейтингу за відгуками.

### HR / TeamLead B2B (`HR`)
- **Командна матриця навичок (`UC7`):** створення команд, додавання учасників, агрегація прогресу за професіями та окремими навичками, виявлення `Skill Gaps`.
- **Призначення планів розвитку (`UC8`):** клонування шаблону карти для працівників із чистими статусами `NOT_STARTED`.
- **Аудит та експорт (`UC12`):** попередній перегляд і вивантаження стандартизованого RFC-4180 CSV-звіту з UTF-8 BOM для коректного відображення кирилиці в Excel або JSON-звіту.

---

## Екрани та маршрути інтерфейсу

Вебзастосунок побудовано в естетиці **Synthetic Nexus (Dark Cyber Material Design 3)** із клієнтською маршрутизацією (`History API`) та SPA fallback на сервері:

| Маршрут | Призначення | Основні можливості |
| :--- | :--- | :--- |
| **`/` або `/roadmap`** | Робочий простір студента | Карта розвитку (`3D Сузір'я` / `2D Список`), уроки, `AI Blocker Chat`, генерація карт ШІ |
| **`/mentors`** | Каталог менторів та сесій | Пошук, фільтри спеціалізацій, виїзна панель бронювання й оплати, історія сесій і чеки |
| **`/mentor-cabinet`** | Кабінет ментора | KPI-статистика, публікація матеріалів у вузли (`UC5`), підтвердження та скасування сесій |
| **`/b2b`** | B2B Skill Matrix | Управління командами (`UC7`), таблиця компетенцій, призначення карт (`UC8`), експорт CSV/JSON |
| **`/profile`** | Управління профілями (`US-04`) | Картка активного акаунта, редагування даних, зміна пароля, швидке перемикання ролей |
| **`/auth` (`/login`)** | 3D-портал автентифікації | Фон із частинками, 3D-нахил картки, вхід, реєстрація з вибором ролі та скидання пароля |

---

## Технологічний стек та архітектура

- **Платформа та мова:** TypeScript з нативним виконанням у **Node.js v22+** (`--experimental-transform-types`), **0 сторонніх runtime-залежностей**.
- **HTTP-сервер:** Вбудований `node:http` (`src/server.ts`) із REST API, роздачею статики та SPA-маршрутизацією.
- **Персистентність:** Файлове JSON-сховище `data/store.json` (`src/repositories/DataStore.ts`) із SHA-256 хешуванням паролів (`node:crypto`), авто-ініціалізацією demo-даних та відновленням зв’язків після перезапуску.
- **Фронтенд:** Vanilla JS + HTML5 Canvas (3D-сузір'я та система частинок) + Tailwind CSS + Material Symbols Outlined.
- **Тестування:** Вбудований тест-раннер `node:test` та `node:assert/strict`.

### Структура проєкту

```text
SkillTree AI/
├── src/
│   ├── adapters/
│   │   ├── AIServiceAdapter.ts      # Генерація дерев (8+ ІТ-професій + fallback) та AI-чат (Gemini/OpenAI/Local)
│   │   └── PaymentAdapter.ts        # Обробка оплат (UAH), генерація PaymentReceipt, повернення коштів
│   ├── domain/
│   │   ├── enums.ts                 # SkillLevel, NodeStatus, MaterialType, SessionStatus, PaymentStatus
│   │   ├── User.ts                  # User, Learner, Mentor, HRManager
│   │   ├── SkillTree.ts             # Карта розвитку з інваріантом композиції 1 : 1..*
│   │   ├── SkillNode.ts             # Вузол навички (статуси, матеріали, чат)
│   │   ├── LearningMaterial.ts      # Навчальний матеріал (TEXT / LINK / VIDEO)
│   │   ├── ChatMessage.ts           # Повідомлення ШІ-асистента з таймінгом та оцінкою корисності
│   │   ├── MentorSession.ts         # Бронювання, оплата, скасування, відгуки
│   │   ├── Team.ts                  # Команда співробітників та зв’язок із HRManager
│   │   └── index.ts                 # Реекспорт доменної моделі
│   ├── repositories/
│   │   └── DataStore.ts             # Завантаження/збереження data/store.json, seed-дані, KPI
│   ├── services/
│   │   └── SkillMatrixService.ts    # Обчислення B2B Skill Matrix та експорт RFC-4180 CSV + UTF-8 BOM
│   ├── public/
│   │   ├── index.html               # 6-екранний інтерфейс, модальні вікна та бічні панелі
│   │   ├── styles.css               # Стилі Synthetic Nexus / Cyber Material Design 3
│   │   └── app.js                   # Клієнтський роутер, 3D-граф компетенцій та інтеграція з REST API
│   └── server.ts                    # Точка входу HTTP-сервера та маршрутизація /api/*
├── tests/
│   ├── domain.test.ts               # Модульні та регресійні тести доменної моделі й DataStore (12 тестів)
│   └── api.test.ts                  # Інтеграційні HTTP-тести REST API, SPA та безпеки (12 тестів)
├── data/
│   └── store.json                   # Локальна база стану застосунку
├── package.json
└── tsconfig.json
```

---

## Швидкий старт

### Вимоги
- **Node.js v22.6+** (підтримка `--experimental-transform-types`)

### Встановлення та запуск

```bash
# 1. Клонуйте репозиторій
git clone https://github.com/kor1pA/skilltree-ai.git
cd skilltree-ai

# 2. Запустіть вебзастосунок (http://localhost:3000)
npm start

# 3. Запустіть автоматизовані тести (24 тести)
npm test
```

### Необов’язкові змінні середовища

| Змінна | Опис | За замовчуванням |
| :--- | :--- | :--- |
| `PORT` | Порт HTTP-сервера | `3000` |
| `GEMINI_API_KEY` | Ключ Google Gemini API для живих відповідей ШІ-асистента | локальний рушій |
| `OPENAI_API_KEY` | Ключ OpenAI API (`gpt-4o-mini`) за відсутності Gemini-ключа | локальний рушій |

> Якщо зовнішній LLM-ключ не задано або API перевищує таймаут, `AIServiceAdapter` миттєво перемикається на вбудований контекстний синтезатор відповідей, гарантуючи `SLA ≤ 5000 мс`.

---

## Демо-акаунти

Усі облікові записи за замовчуванням використовують пароль **`demo1234`** (також доступний швидкий вхід у 1 клік на `/auth` та у верхньому меню `/profile`):

| Роль | Ім'я | Email | Початковий напрямок / Спеціалізація |
| :--- | :--- | :--- | :--- |
| `LEARNER` | Вячеслав Гой | `slava@skilltree.ai` | Full-Stack Developer (`BEGINNER`, `100 XP`) |
| `LEARNER` | Олена Ковальчук | `olena@skilltree.ai` | Data Analyst / AI Engineer (`INTERMEDIATE`, `150 XP`) |
| `LEARNER` | Дмитро Мельник | `dmytro@skilltree.ai` | QA Automation Engineer (`BEGINNER`, `50 XP`) |
| `MENTOR` | Андрій Савченко | `andriy.mentor@skilltree.ai` | Full-Stack & TypeScript (`900 ₴/год`, ★ `4.9`) |
| `MENTOR` | Ірина Бондаренко | `iryna.mentor@skilltree.ai` | Data Science & LLM (`1100 ₴/год`, ★ `5.0`) |
| `HR` | Марія Ткаченко | `maria.hr@technova.ua` | TechNova Ukraine (B2B-команда `Product Engineering Team`) |

---

## Огляд REST API

| Група | Ендпоінти |
| :--- | :--- |
| **Стан та автентифікація (`UC1`)** | `GET /api/state` • `POST /api/reset` • `POST /api/auth/register` • `POST /api/auth/login` • `POST /api/auth/logout` • `POST /api/auth/reset-password` • `PUT /api/profile` |
| **Карта розвитку та ШІ (`UC2–UC4`, `UC10–UC11`)** | `POST /api/trees/generate` • `POST /api/trees/:treeId/nodes` • `DELETE /api/trees/:treeId/nodes/:nodeId` • `PATCH /api/trees/:treeId/nodes/:nodeId/status` • `POST /api/trees/:treeId/nodes/:nodeId/chat` • `PATCH /api/chat/:messageId/rate` |
| **Менторство та оплата (`UC5`, `UC6`, `UC9`)** | `POST /api/nodes/:nodeId/materials` • `POST /api/sessions` • `POST /api/sessions/:id/pay` • `POST /api/sessions/:id/confirm` • `POST /api/sessions/:id/cancel` • `POST /api/sessions/:id/feedback` |
| **B2B команди та звіти (`UC7`, `UC8`, `UC12`)** | `GET /api/teams/:id/matrix` • `POST /api/teams` • `POST /api/teams/:id/members` • `POST /api/hr/assign-tree` • `GET /api/teams/:id/export?format=CSV\|JSON` |

---

## Тестування

```bash
npm test
```

Набір містить **24 автоматизовані тести** у 2 файлах:
- [domain.test.ts](tests/domain.test.ts) (**12 тестів**): бізнес-інваріанти всіх 10 класів і 5 enum-перелічень, перевірка персистентності `DataStore` на диску, SLA ШІ-відповіді, екранування RFC-4180 CSV та перенумерація вузлів.
- [api.test.ts](tests/api.test.ts) (**12 тестів**): повні інтеграційні HTTP-сценарії `UC1`–`UC12`, валідація помилкових запитів (`400`/`401`/`404`/`409`), SPA-маршрути, блокування path traversal та перевірка DOM-якорів інтерфейсу.

---

## Автор та ліцензія

- **Автор:** Гой Вячеслав Володимирович (група КН-25)
- **Ліцензія:** MIT
