# SkillTree AI

**Платформа персоналізованих карт розвитку з гібридним менторством та ШІ-підтримкою**

Реалізовано на основі:
- Проєктної пропозиції (Практичне завдання 1)
- Беклогу продукту та User Stories `US-01`–`US-06` (Практичне завдання 3)
- UML-діаграми варіантів використання (`UC1`–`UC12`) та діаграми класів із 10 класів і 5 перелічень (Практичне завдання 4)

---

## Стек та архітектура
- **Мова та платформа:** TypeScript (нативне виконання у Node.js v22 `--experimental-transform-types`), сувора типізація без сторонніх фреймворків із $0 бюджетом.
- **Сервер та REST API:** Вбудований `node:http` (`src/server.ts`), повний набір маршрутів для `UC1`–`UC12`.
- **Зберігання даних:** Персистентне локальне сховище `data/store.json` (`src/repositories/DataStore.ts`) з попередньо підготовленими демонстраційними даними.
- **Веб-інтерфейс:** SPA для трьох ролей (`src/public/index.html`, `styles.css`, `app.js`) — Кабінет Студента, Кабінет Ментора та B2B-кабінет HR / TeamLead.
- **Тестування:** Вбудований тест-раннер `node --test` (`tests/domain.test.ts`, `tests/api.test.ts`).

---

## Трасування функціональності (`US` ↔ `UC` ↔ `Domain`)

| User Story | Use Cases | Класи та сервіси | Основні можливості |
| :--- | :--- | :--- | :--- |
| **US-04** (P2) | `UC1` | `User`, `Learner`, `Mentor`, `HRManager` | Реєстрація, вхід за паролем (SHA-256), зміна пароля, перемикання профілів |
| **US-01** (P0) | `UC2`, `UC10` | `SkillTree`, `SkillNode`, `LearningMaterial`, `AIServiceAdapter` | Генерація карти під професію/рівень, додавання та видалення вузлів із захистом композиції `1 : 1..*` |
| **US-03** (P0) | `UC3` | `SkillNode`, `SkillTree`, `Learner` | Статуси `NOT_STARTED → IN_PROGRESS → DONE`, розрахунок `%` прогресу, нарахування балів і бейджів |
| **US-02** (P0) | `UC4`, `UC11` | `ChatMessage`, `AIServiceAdapter` | Контекстний чат по вузлу з контролем `SLA ≤ 5000 мс` та оцінкою «Корисно / Некорисно» |
| **US-05** (P1) | `UC5`, `UC6`, `UC9` | `Mentor`, `MentorSession`, `PaymentAdapter` | Публікація матеріалів, бронювання, обов’язкова оплата (`«include» UC9`), відгуки та рейтинг |
| **US-06** (P1) | `UC7`, `UC8`, `UC12` | `HRManager`, `Team`, `SkillMatrixService` | B2B `Skill Matrix` команди, призначення карт співробітникам, експорт RFC-4180 CSV |

---

## Запуск проєкту та тестів

```bash
# Запустити вебзастосунок на http://localhost:3000
npm start

# Запустити всі модульні та інтеграційні тести
npm test
```

> **Демо-акаунти (пароль за замовчуванням: `demo1234`):**
> - Студент: `slava@skilltree.ai`
> - Ментор: `andriy.mentor@skilltree.ai`
> - HR-менеджер: `maria.hr@technova.ua`

---

## Історія комітів та артефакти для звіту (AI-агент Workflow)

Історія Git організована послідовними комітами для зручного аналізу diff та підготовки презентації:

1. **`chore(init)` (`97f53ac`)** — ініціалізація конфігурації (`package.json`, `tsconfig.json`) та стартового контексту `PROJECT_CONTEXT.md`.
2. **`feat(domain)` (`2a42938`) — Кейс 1: Реалізація функції**: реалізовано всі 10 класів та 5 перелічень UML з ПЗ 4.
3. **`feat(adapters)` (`54b4b66`)** — адаптери вторинних акторів (`AIServiceAdapter`, `PaymentAdapter`) та сховище `DataStore`.
4. **`fix(domain)` (`7f69f7e`) — Помилка ШІ та її виправлення**:
   - *Що пішло не так:* у початковій реалізації методу `Mentor.confirmSession()` була відсутня перевірка `paymentStatus === PAID` (порушення зв’язку `UC6 → «include» UC9`), а `Learner.completeNode()` повторно нараховував бали при повторному натисканні на завершений вузол.
   - *Виправлення:* додано перевірку інваріантів оплати у `Mentor.confirmSession()` та `MentorSession.leaveFeedback()`, а також захист від дублювання балів і нарахування бейджів у `Learner.completeNode()`.
5. **`refactor(matrix)` (`dbc00f6`) — Кейс 2: Покращення коду (Рефакторинг)**:
   - Винесено логіку агрегації B2B `Skill Matrix` та експорту звіту в окремий `SkillMatrixService` (`src/services/SkillMatrixService.ts`) з підтримкою RFC-4180 екранування та UTF-8 BOM для коректного відкриття кирилиці в Excel.
6. **`feat(web)` (`2c4fcdf`)** — сервер REST API (`src/server.ts`) та інтерактивний веб-інтерфейс (`src/public/`).
7. **`test(all)`** — модульні тести доменної моделі (`tests/domain.test.ts`), інтеграційні API-тести (`tests/api.test.ts`) та документація `README.md`.

### Як опублікувати репозиторій на GitHub
Після створення порожнього репозиторію на GitHub (наприклад, `skilltree-ai`) виконайте:
```bash
git remote add origin https://github.com/<ваш-логін>/skilltree-ai.git
git push -u origin main
```
