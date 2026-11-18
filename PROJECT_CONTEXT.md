# Project Context & Unified Technical Specification: SkillTree AI

## 1. Загальні відомості та мета
**SkillTree AI** — інтерактивна платформа персоналізованих карт розвитку з гібридним менторством та ШІ-підтримкою.
Розроблена на основі:
- Проєктної пропозиції (ПЗ 1)
- Беклогу та User Stories `US-01`..`US-06` (ПЗ 3)
- UML-діаграми варіантів використання (`UC1`..`UC12`) та діаграми класів (10 класів + 5 enums) (ПЗ 4)

## 2. Доменна модель (UML Class Diagram з ПЗ 4)
### Перелічення (Enums)
- `SkillLevel`: `BEGINNER`, `INTERMEDIATE`, `ADVANCED`
- `NodeStatus`: `NOT_STARTED`, `IN_PROGRESS`, `DONE`
- `MaterialType`: `TEXT`, `LINK`, `VIDEO`
- `SessionStatus`: `BOOKED`, `CONFIRMED`, `DONE`, `CANCELLED`
- `PaymentStatus`: `PENDING`, `PAID`, `REFUNDED`

### Класи та їхні обов'язки
1. `User` (abstract): `id`, `fullName`, `email`, `#passwordHash`, `createdAt` | `login()`, `logout()`, `resetPassword()`
2. `Learner extends User`: `targetProfession`, `level: SkillLevel`, `points` | `requestSkillTree()`, `askAssistant()`, `bookSession()`, `addPoints()`
3. `Mentor extends User`: `bio`, `hourlyRate`, `rating` | `publishMaterial()`, `confirmSession()`, `recalculateRating()`
4. `HRManager extends User`: `company` | `createTeam()`, `assignSkillTree()`, `exportReport()`
5. `Team`: `id`, `name` | `addMember()`, `getSkillMatrix()`
6. `SkillTree`: `id`, `title`, `targetProfession`, `createdAt` | `addNode()`, `removeNode()`, `calculateProgress()`
7. `SkillNode`: `id`, `title`, `orderNumber`, `status: NodeStatus` | `start()`, `complete()`
8. `LearningMaterial`: `id`, `title`, `type: MaterialType`, `url`, `publishedAt`
9. `ChatMessage`: `id`, `question`, `answer`, `responseTimeMs`, `isHelpful`, `createdAt` | `rate()`
10. `MentorSession`: `id`, `startAt`, `durationMin`, `price`, `status: SessionStatus`, `paymentStatus: PaymentStatus`, `rating`, `feedback` | `pay()`, `cancel()`, `leaveFeedback()`

## 3. Функціональні сценарії (UC1–UC12)
- `UC1` (US-04): Реєстрація та вхід користувачів усіх ролей.
- `UC2` + `UC10` (US-01): Побудова дерева навичок (AIServiceAdapter) + редагування вузлів (`extend`).
- `UC3` (US-03): Трекінг прогресу навчання, статуси вузлів та нарахування балів.
- `UC4` + `UC11` (US-02): Контекстний ШІ-чат по вузлу (SLA `<= 5000 ms`) + оцінка «Корисно / Некорисно» (`extend`).
- `UC5` + `UC6` + `UC9` (US-05): Публікація матеріалів ментором, бронювання сесій, обов'язкова оплата (`include`), оцінювання і перерахунок рейтингу.
- `UC7` + `UC8` + `UC12` (US-06): B2B `Skill Matrix`, призначення карт працівникам, експорт CSV-звіту (`extend`).

## 4. Обмеження та критерії якості
- Бюджет `$0`: локальне виконання, JSON-сховище, розумний локальний AI fallback-провайдер з SLA <= 5000 мс.
- Захист бізнес-інваріантів (композиція `SkillTree — SkillNode` `1 : 1..*`, обов'язкова оплата перед підтвердженням сесії, відсутність дублювання балів за вузол).
