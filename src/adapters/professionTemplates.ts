import { MaterialType } from '../domain/index.ts';

export interface MaterialTemplate {
  title: string;
  type: MaterialType;
  url: string;
  description: string;
  content: string;
}

export interface NodeTemplate {
  title: string;
  description: string;
  materials: MaterialTemplate[];
  aiTips: string[];
  codeSnippet?: string;
}

export const PROFESSION_TEMPLATES: Record<string, NodeTemplate[]> = {
  'Full-Stack Developer': [
    {
      title: 'HTML5, CSS3 та адаптивна верстка',
      description: 'Семантична розмітка, Flexbox, CSS Grid, принципи доступності (a11y) та Responsive Design.',
      materials: [
        {
          title: 'MDN: Повний довідник CSS Grid та Flexbox',
          type: MaterialType.LINK,
          url: 'https://developer.mozilla.org/uk/docs/Web/CSS/CSS_grid_layout',
          description: 'Офіційна документація з інтерактивними прикладами побудови адаптивних сіток.',
          content: `### Коли використовувати Flexbox, а коли CSS Grid?\n\n• Flexbox ідеальний для одновимірних рядків чи колонок (навігація, кнопки в ряд, вирівнювання іконки з текстом).\n• CSS Grid створений для двовимірних макетів (сітка карток, дашборди, sidebar + main).\n\n\`\`\`css\n.dashboard-grid {\n  display: grid;\n  grid-template-columns: 280px 1fr;\n  gap: 1.5rem;\n}\n@media (max-width: 900px) {\n  .dashboard-grid { grid-template-columns: 1fr; }\n}\n\`\`\`\n\n### Чекліст якості верстки:\n1. Використовуйте семантичні теги: <header>, <aside>, <main>, <section>.\n2. Завжди задавайте box-sizing: border-box.\n3. Забезпечте контраст тексту щонайменше 4.5:1.`,
        },
        {
          title: 'Конспект: Семантична верстка та доступність (a11y)',
          type: MaterialType.TEXT,
          url: '',
          description: 'Внутрішній урок із правилами побудови доступного інтерфейсу.',
          content: `### Навіщо потрібна семантика?\nСемантичні теги дозволяють скрінрідерам, пошуковим системам і браузерним інструментам розуміти структуру сторінки без зайвих класів.\n\n• Один <h1> на головну тему сторінки, далі логічна ієрархія <h2> → <h3>.\n• Для дій використовуйте <button type="button">, для переходів — <a href="...">.\n• Кожен <input> повинен мати пов'язаний <label for="..."> або aria-label.\n• Додавайте :focus-visible стилі для навігації з клавіатури.`,
        },
      ],
      aiTips: [
        'Для побудови двовимірних макетів (сайдбар + основна робоча зона) використовуйте CSS Grid, а для вирівнювання кнопок у панелі — Flexbox.',
        'Виносьте кольори та радіуси у CSS-змінні (:root), щоб миттєво підтримувати світлу й темну теми.',
      ],
      codeSnippet: `.grid-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem; }`,
    },
    {
      title: 'TypeScript та сучасний JavaScript (ES2022+)',
      description: 'Типізація, інтерфейси, enum, асинхронність (Promise/async-await), обробка помилок.',
      materials: [
        {
          title: 'TypeScript Handbook: Основи типів, класів та enum',
          type: MaterialType.LINK,
          url: 'https://www.typescriptlang.org/docs/handbook/intro.html',
          description: 'Офіційний посібник із суворої типізації та об’єктно-орієнтованого підходу.',
          content: `### Чому TypeScript критичний у бізнес-логіці?\nСтрогі типи й перелічення (enum) дозволяють ловити помилки на етапі написання коду.\n\n\`\`\`ts\nenum NodeStatus {\n  NOT_STARTED = 'NOT_STARTED',\n  IN_PROGRESS = 'IN_PROGRESS',\n  DONE = 'DONE',\n}\n\nfunction updateStatus(node: { status: NodeStatus }, next: NodeStatus) {\n  node.status = next;\n}\n\`\`\`\n\n### Порада з асинхронності:\nЗавжди огортайте мережеві виклики fetch() у try/catch та перевіряйте response.ok, бо fetch не кидає виняток на HTTP 400/500.`,
        },
        {
          title: 'Відеорозбір: Event Loop та async/await на практиці',
          type: MaterialType.VIDEO,
          url: 'https://www.youtube.com/watch?v=8aGhZQkoFbQ',
          description: 'Класична візуалізація стеку викликів, черги мікрозадач і асинхронних запитів.',
          content: `### Ключові висновки з відео:\n1. Синхронний код виконується у Call Stack до повного очищення.\n2. Promise.then / async-await потрапляють у Microtask Queue і виконуються одразу після поточного стеку.\n3. setTimeout / мережеві колбеки чекають у Task (Macrotask) Queue.\n4. Для паралельного завантаження кількох незалежних API використовуйте await Promise.all([api1(), api2()]).`,
        },
      ],
      aiTips: [
        'Використовуйте enum або union types замість «магічних рядків» для статусів — це виключає друкарські помилки.',
        'Для паралельних незалежних запитів застосовуйте Promise.all([...]) замість послідовного await у циклі.',
      ],
      codeSnippet: `const [user, trees] = await Promise.all([fetchUser(id), fetchTrees(id)]);`,
    },
    {
      title: 'Backend REST API на Node.js',
      description: 'Проєктування маршрутів HTTP, статус-коди, валідація вхідних даних та архітектура шарів.',
      materials: [
        {
          title: 'Урок: Специфікація REST API (GET, POST, PATCH, DELETE)',
          type: MaterialType.TEXT,
          url: '',
          description: 'Практичні правила найменування ресурсів і коректні HTTP статус-коди.',
          content: `### Стандарти REST API:\n• GET /api/orders — читання ресурсу (200 OK).\n• POST /api/orders — створення нового ресурсу (201 Created).\n• PATCH /api/orders/:id — часткове оновлення поля status (200 OK).\n• DELETE /api/orders/:id/items/:itemId — видалення позиції (200 OK або 400 Bad Request, якщо порушено бізнес-правило мінімальної кількості).\n\n\`\`\`ts\nif (!title.trim()) {\n  return c.json({ error: 'Назва не може бути порожньою' }, 400);\n}\n\`\`\`\n\n### Головне правило архітектури:\nHTTP-обробники лише валідують запит і викликають методи доменних класів. Вся бізнес-логіка (наприклад, заборона відправки неоплаченого замовлення) живе у домені!`,
        },
        {
          title: 'Node.js Documentation: HTTP Server & Routing',
          type: MaterialType.LINK,
          url: 'https://nodejs.org/api/http.html',
          description: 'Документація вбудованого модуля node:http.',
          content: `### Як працює node:http без зайвих залежностей?\n1. createServer(async (req, res) => { ... }) приймає потік запиту.\n2. URL розбирається через new URL(req.url, 'http://localhost').\n3. Тіло POST/PATCH запиту зчитується асинхронним ітератором for await (const chunk of req).\n4. Відповідь відправляється через res.writeHead(status, headers) + res.end(JSON.stringify(data)).`,
        },
      ],
      aiTips: [
        'Відокремлюйте HTTP-контролери від доменної логіки, щоб бізнес-правила можна було тестувати ізольовано без запуску сервера.',
        'Для часткової зміни стану ресурсу використовуйте PATCH, а для повної заміни — PUT.',
      ],
      codeSnippet: `app.patch('/api/orders/:id/status', (c) => { /* оновлює лише status */ });`,
    },
    {
      title: 'Бази даних та збереження стану',
      description: 'Моделювання зв’язків 1:N та M:N, композиція vs агрегація, цілісність даних.',
      materials: [
        {
          title: 'Урок: Проєктування моделей даних та зв’язків (Схема → Сховище)',
          type: MaterialType.TEXT,
          url: '',
          description: 'Як переносити композицію та агрегацію з моделі даних у реальне сховище.',
          content: `### Композиція vs Агрегація у коді:\n• Композиція (Order — OrderItem): дочірні об'єкти не існують без батьківського. При видаленні замовлення зникають і його позиції.\n• Агрегація (Project — Member): учасник може належати до кількох проєктів або не належати до жодного; видалення проєкту не видаляє користувача.\n\n### Практика цілісності:\nЗавжди відновлюйте екземпляри доменних класів при зчитуванні зі сховища, щоб бізнес-методи залишалися доступними.`,
        },
      ],
      aiTips: [
        'При зчитуванні даних зі сховища гідруйте їх назад у доменні сутності, щоб бізнес-обчислення та інваріанти виконувалися узгоджено.',
      ],
    },
    {
      title: 'Автоматизоване тестування та Git CI/CD',
      description: 'Unit-тести, інтеграційне тестування API, регресійні тести та code review.',
      materials: [
        {
          title: 'Урок: Піраміда тестування (Unit + API Integration)',
          type: MaterialType.TEXT,
          url: '',
          description: 'Як писати швидкі тести на node:test і фіксувати баги регресійними тестами.',
          content: `### Стратегія тестування SkillTree AI:\n1. Доменні Unit-тести (tests/domain.test.ts): перевіряють бізнес-методи класів без HTTP.\n2. Регресійні тести: фіксують знайдені помилки (наприклад, спроба двічі отримати +50 балів або підтвердити неоплачену сесію).\n3. Інтеграційні HTTP-тести (tests/api.test.ts): підіймають сервер на порту 0 і тестують реальні запити fetch.\n\n\`\`\`bash\nnpm test\n\`\`\``,
        },
        {
          title: 'Node.js Official Test Runner Guide',
          type: MaterialType.LINK,
          url: 'https://nodejs.org/api/test.html',
          description: 'Вбудований тест-раннер Node.js з describe/it/assert.',
          content: `### Основні функції node:test:\n• describe('Набір тестів', () => { ... })\n• it('Сценарій', async () => { ... })\n• assert.equal(), assert.throws(), assert.ok() із node:assert/strict.`,
        },
      ],
      aiTips: [
        'Кожен знайдений баг спершу відтворюйте падаючим тестом, а потім виправляйте код — так помилка гарантовано не повернеться.',
      ],
    },
  ],
  'Frontend React Developer': [
    {
      title: 'Компонентна архітектура та JSX/TSX',
      description: 'Декомпозиція UI, props, композиція компонентів та керування станом.',
      materials: [
        {
          title: 'React Docs: Describing the UI',
          type: MaterialType.LINK,
          url: 'https://react.dev/learn/describing-the-ui',
          description: 'Офіційний інтерактивний курс із побудови компонентів у React.',
          content: `### Правила якісних React-компонентів:\n• Один компонент — одна чітка відповідальність.\n• Передавайте дані зверху вниз через типізовані props.\n• Виносьте повторювану логіку в кастомні хуки (useSkillTree, useDebounce).`,
        },
      ],
      aiTips: ['Уникайте надмірної вкладеності стану — зберігайте в state лише мінімально необхідні джерела істини, а похідні (наприклад, % прогресу) обчислюйте на льоту.'],
    },
    {
      title: 'Хуки стану, ефектів та робота з API',
      description: 'useState, useEffect, кешування запитів, обробка станів loading/error/empty.',
      materials: [
        {
          title: 'React Docs: Synchronizing with Effects',
          type: MaterialType.LINK,
          url: 'https://react.dev/learn/synchronizing-with-effects',
          description: 'Як правильно працювати з useEffect та уникати зайвих рендерів.',
          content: `### Чотири стани кожного асинхронного екрана:\n1. Loading (скелетон або спінер)\n2. Error (зрозуміле повідомлення + кнопка повтору)\n3. Empty (підказка, що створити першим)\n4. Success (відображення даних).`,
        },
      ],
      aiTips: ['Завжди скасовуйте застарілі fetch-запити через AbortController у cleanup-функції useEffect.'],
    },
    {
      title: 'Управління формами та маршрутизація',
      description: 'Керовані форми, валідація, захищені маршрути та UX зворотний зв’язок.',
      materials: [
        {
          title: 'Урок: Валідація форм та миттєвий UX-фідбек',
          type: MaterialType.TEXT,
          url: '',
          description: 'Побудова зручних форм без зайвих перезавантажень сторінки.',
          content: `### Принципи зручних форм:\n• Підсвічуйте помилку біля конкретного поля.\n• Блокуйте кнопку відправки під час запиту, щоб уникнути подвійного бронювання або оплати.`,
        },
      ],
      aiTips: ['Показуйте користувачу чітке сповіщення (toast) після кожної успішної дії чи помилки валідації.'],
    },
    {
      title: 'Оптимізація продуктивності та тестування UI',
      description: 'Code splitting, мемоізація, доступність та React Testing Library.',
      materials: [
        {
          title: 'Web.dev: Core Web Vitals & Performance',
          type: MaterialType.LINK,
          url: 'https://web.dev/explore/learn-core-web-vitals',
          description: 'Метрики LCP, INP, CLS та способи прискорення рендерингу.',
          content: `### Оптимізація на практиці:\n• Зменшуйте розмір бандлу через lazy-loading важких модальних вікон і графіків.\n• Задавайте розміри зображень, щоб уникнути стрибків макета (CLS).`,
        },
      ],
      aiTips: ['Не оптимізуйте передчасно з useMemo/useCallback — спершу виміряйте вузьке місце у React DevTools Profiler.'],
    },
  ],
  'Backend Node.js Engineer': [
    {
      title: 'Асинхронність Node.js, потоки та буфери',
      description: 'Event Loop, Streams API, робота з файловою системою та змінними середовища.',
      materials: [
        {
          title: 'Node.js Docs: Streams & Async Iterators',
          type: MaterialType.LINK,
          url: 'https://nodejs.org/api/stream.html',
          description: 'Ефективна обробка великих файлів та мережевих потоків.',
          content: `### Чому потоки важливі на бекенді?\nЗамість завантаження гігантських файлів у RAM, Streams обробляють дані частинами (chunks), утримуючи стабільне споживання пам'яті.`,
        },
      ],
      aiTips: ['Ніколи не використовуйте *Sync методи файлової системи всередині активних HTTP-обробників під високим навантаженням.'],
    },
    {
      title: 'Архітектура сервісів і патерн Adapter',
      description: 'Чистий поділ на Domain, Services, Repositories та Adapters.',
      materials: [
        {
          title: 'Урок: Ізоляція зовнішніх інтеграцій (LLM & Payment)',
          type: MaterialType.TEXT,
          url: '',
          description: 'Як підключати сторонні сервіси без прив’язки бізнес-логіки до конкретного вендора.',
          content: `### Переваги патерна Adapter:\n1. Доменна модель не знає деталей HTTP-протоколу платіжного шлюзу чи LLM.\n2. Можна легко підмінити провайдера (наприклад, локальний fallback або Gemini API) без зміни жодного рядка в тестах домену.`,
        },
      ],
      aiTips: ['Передавайте залежності (адаптери) через параметри конструктора або методи — це робить код тестованим.'],
    },
    {
      title: 'Безпека API та автентифікація',
      description: 'Хешування паролів, валідація даних, захист від ін’єкцій та CSRF.',
      materials: [
        {
          title: 'OWASP API Security Top 10',
          type: MaterialType.LINK,
          url: 'https://owasp.org/API-Security/',
          description: 'Головні загрози безпеці REST API та методи захисту.',
          content: `### Обов'язковий мінімум безпеки:\n• Паролі зберігаються виключно у вигляді криптографічного хешу.\n• Кожен запит перевіряє права власності та допустимі переходи станів (наприклад, оплата перед підтвердженням).`,
        },
      ],
      aiTips: ['Валідуйте типи й межі числових полів (наприклад, рейтинг 1..5, ціна > 0) на сервері, навіть якщо клієнт уже має HTML-валідацію.'],
    },
    {
      title: 'Логування, SLA та тестування продуктивності',
      description: 'Вимірювання часу відповіді (responseTimeMs), інтеграційні тести та профілювання.',
      materials: [
        {
          title: 'Урок: Контроль SLA та моніторинг затримок',
          type: MaterialType.TEXT,
          url: '',
          description: 'Як вимірювати час відповіді ШІ та гарантувати <= 5000 мс.',
          content: `### Практика контролю SLA:\nВикористовуйте performance.now() або Date.now() навколо виклику зовнішнього API та встановлюйте таймаут через AbortSignal.timeout(4500).`,
        },
      ],
      aiTips: ['Завжди логуйте латентність критичних операцій, щоб бачити деградацію до скарг користувачів.'],
    },
  ],
  'Data Analyst / AI Engineer': [
    {
      title: 'Основи Python та структури даних',
      description: 'Списки, словники, comprehensions, типізація та обробка файлів CSV/JSON.',
      materials: [
        {
          title: 'Python Data Structures Guide',
          type: MaterialType.LINK,
          url: 'https://docs.python.org/3/tutorial/datastructures.html',
          description: 'Офіційна документація Python щодо структур даних.',
          content: `### Вибір структури даних у Python:\n• list — упорядкована колекція для ітерації.\n• dict / set — миттєвий пошук за ключем за O(1).\n• Використовуйте типізацію (typing) для зрозумілості аналітичних пайплайнів.`,
        },
      ],
      aiTips: ['Використовуйте словники (dict) або множини (set) для пошуку за ключем за O(1) замість вкладених циклів.'],
    },
    {
      title: 'SQL та аналітичні запити',
      description: 'JOIN, агрегації GROUP BY, віконні функції (ROW_NUMBER, RANK) та підзапити.',
      materials: [
        {
          title: 'Урок: Віконні функції в SQL на реальних кейсах',
          type: MaterialType.TEXT,
          url: '',
          description: 'Обчислення накопичувальних сум, рейтингів та когортного аналізу.',
          content: `### Приклад віконної функції:\n\`\`\`sql\nSELECT user_id, skill_name, progress,\n       AVG(progress) OVER (PARTITION BY team_id) AS team_avg\nFROM skill_matrix;\n\`\`\`\nВіконні функції дозволяють рахувати агрегати без втрати деталізації рядків.`,
        },
      ],
      aiTips: ['Завжди перевіряйте умову JOIN, щоб уникнути дублювання рядків перед агрегацією SUM чи COUNT.'],
    },
    {
      title: 'Аналіз даних у Pandas та візуалізація',
      description: 'Очищення даних, обробка пропусків, побудова метрик KPI та дашбордів.',
      materials: [
        {
          title: 'Pandas 10-minute quickstart',
          type: MaterialType.LINK,
          url: 'https://pandas.pydata.org/docs/user_guide/10min.html',
          description: 'Базові операції фільтрації, групування та агрегації DataFrame.',
          content: `### Перші 3 команди при відкритті будь-якого датасету:\n1. df.info() — типи та пропуски.\n2. df.describe() — розподіли й аномалії.\n3. df.isna().sum() — точна кількість NaN у кожній колонці.`,
        },
      ],
      aiTips: ['Перед побудовою графіків завжди перевіряйте df.isna().sum() та типи колонок через df.dtypes.'],
    },
    {
      title: 'Промпт-інжиніринг та інтеграція LLM API',
      description: 'Системні промпти, контроль затримки (SLA), оцінка якості відповідей та RAG.',
      materials: [
        {
          title: 'Урок: Архітектура контекстного AI-асистента з SLA ≤ 5s',
          type: MaterialType.TEXT,
          url: '',
          description: 'Використання контексту поточного вузла, таймаутів і fallback-стратегії.',
          content: `### Формула якісної відповіді ШІ у вузлі:\n1. Передайте у системний промпт назву вузла, цільову професію та прикріплені матеріали.\n2. Обмежте час очікування мережевого API (AbortController на 4.2 с).\n3. Збирайте зворотний зв'язок користувачів («Корисно / Некорисно») для контролю > 90% якості.`,
        },
      ],
      aiTips: ['Додавайте до промпту чіткий контекст (роль, тема вузла, обмеження формату) і встановлюйте таймаут запиту, щоб гарантувати SLA.'],
    },
  ],
  'QA Automation Engineer': [
    {
      title: 'Теорія тестування та тест-дизайн',
      description: 'Техніки еквівалентного розбиття, граничних значень, таблиці рішень і тест-плани.',
      materials: [
        {
          title: 'Урок: Шпаргалка з технік тест-дизайну',
          type: MaterialType.TEXT,
          url: '',
          description: 'Граничні значення (Boundary Value Analysis) та негативні сценарії.',
          content: `### Застосування граничних значень у SkillTree AI:\n• Оцінка ментора: тестуємо 0 (помилка), 1 (мін), 5 (макс), 6 (помилка).\n• Видалення вузла: карта з 2 вузлами (видаляє), карта з 1 вузлом (повертає false).\n• Прогрес: 0/4 = 0%, 2/4 = 50%, 4/4 = 100%.`,
        },
      ],
      aiTips: ['Завжди тестуйте граничні стани: 0, 1, максимум та невалідні переходи (наприклад, підтвердження неоплаченої сесії).'],
    },
    {
      title: 'Автоматизація API-тестів',
      description: 'Перевірка REST API, валідація JSON-схем, статус-кодів і контрактів.',
      materials: [
        {
          title: 'Node.js Test Runner & Assertions',
          type: MaterialType.LINK,
          url: 'https://nodejs.org/api/test.html',
          description: 'Створення швидких автотестів без зайвих залежностей.',
          content: `### Золоті правила API-тестів:\n1. Кожен тест ізольований (використовує окрему БД).\n2. Перевіряйте не лише статус-код (200/400), але й структуру тіла відповіді.`,
        },
      ],
      aiTips: ['Ізолюйте кожен інтеграційний тест на окремому сховищі даних, щоб тести не залежали від порядку запуску.'],
    },
    {
      title: 'E2E-тестування вебзастосунків',
      description: 'Сценарії користувача, селектори, стабільні очікування без sleep().',
      materials: [
        {
          title: 'Playwright Best Practices',
          type: MaterialType.LINK,
          url: 'https://playwright.dev/docs/best-practices',
          description: 'Стійкі локатори та тестування критичних користувацьких шляхів.',
          content: `### Вибір локаторів у E2E:\nВикористовуйте семантичні ролі (getByRole, getByLabel) замість крихких XPath або CSS-класів оформлення.`,
        },
      ],
      aiTips: ['Використовуйте user-facing атрибути або role-селектори замість крихких CSS-класів стилізації.'],
    },
    {
      title: 'CI/CD та звітність про дефекти',
      description: 'Баг-репорти, регресійні прогони в GitHub Actions, аналіз покриття.',
      materials: [
        {
          title: 'Урок: Шаблон ефективного баг-репорту',
          type: MaterialType.TEXT,
          url: '',
          description: 'Кроки відтворення, фактичний результат, очікуваний результат і докази.',
          content: `### Обов’язкові поля баг-репорту:\n1. Заголовок (Що + Де + За яких умов).\n2. Кроки відтворення (1, 2, 3).\n3. Фактичний vs Очікуваний результат.\n4. Регресійний автотест після виправлення.`,
        },
      ],
      aiTips: ['Хороший баг-репорт містить мінімальний відтворюваний сценарій і посилання на падаючий тест.'],
    },
  ],
  'UI/UX Product Designer': [
    {
      title: 'Дослідження користувачів та User Stories',
      description: 'Інтерв’ю, персони, Jobs-to-be-Done та формулювання критеріїв прийняття.',
      materials: [
        {
          title: 'Урок: Як перетворювати болі користувачів на User Stories',
          type: MaterialType.TEXT,
          url: '',
          description: 'Формула «Як <роль> я хочу <можливість>, щоб <вигода>».',
          content: `### Правило якісного UX-дослідження:\nКожен екран повинен зменшувати когнітивне навантаження: не виводьте на одному екрані все одразу — групуйте за завданням користувача (карта навчання / створення карти / менторство).`,
        },
      ],
      aiTips: ['Кожна дизайн-ідея має вирішувати конкретну проблему користувача, підтверджену сценарієм використання.'],
    },
    {
      title: 'Інформаційна архітектура та Wireframing',
      description: 'User Flows, структура екранів, навігаційна ієрархія та прототипування.',
      materials: [
        {
          title: 'Nielsen Norman Group: UX Articles',
          type: MaterialType.LINK,
          url: 'https://www.nngroup.com/articles/',
          description: 'Дослідження юзабіліті, навігації та інформаційної архітектури.',
          content: `### Візуальна ієрархія:\n1. Лівий сайдбар для глобальної навігації між задачами.\n2. Прозорий заголовок поточної сторінки.\n3. Чіткий контраст між основною кнопкою дії (Primary CTA) та другорядними кнопками.`,
        },
      ],
      aiTips: ['Починайте з low-fidelity вайрфреймів для перевірки логіки переходів перед підбором кольорів і шрифтів.'],
    },
    {
      title: 'Дизайн-системи у Figma',
      description: 'Колірні токени, типографіка, Auto Layout, компоненти та варіанти станів.',
      materials: [
        {
          title: 'Figma Help: Auto Layout & Components',
          type: MaterialType.VIDEO,
          url: 'https://help.figma.com/hc/en-us/articles/360040451373',
          description: 'Побудова гнучких адаптивних компонентів інтерфейсу.',
          content: `### Дизайн-токени в системі:\nВизначайте змінні для фону (--bg), карток (--surface), меж (--border), акценту (--primary) та статусів (--success, --warning, --danger).`,
        },
      ],
      aiTips: ['Завжди проєктуйте всі стани інтерактивних елементів: default, hover, active, disabled, loading та error.'],
    },
    {
      title: 'Доступність (WCAG) та Юзабіліті-тестування',
      description: 'Контрастність тексту, клавіатурна навігація, збір фідбеку від користувачів.',
      materials: [
        {
          title: 'Урок: Чекліст перевірки контрасту WCAG AA',
          type: MaterialType.TEXT,
          url: '',
          description: 'Мінімальний коефіцієнт контрасту 4.5:1 та зрозуміла мова інтерфейсу.',
          content: `### Заміна технічного жаргону на мову людини:\nЗамість «NOT_STARTED» пишіть «Не розпочато», замість «PENDING» — «Очікує оплати». Інтерфейс має бути зрозумілим із першого погляду без знання коду.`,
        },
      ],
      aiTips: ['Перевіряйте інтерфейс без миші та з урахуванням станів порожніх списків (Empty States).'],
    },
  ],
  'DevOps & Cloud Engineer': [
    {
      title: 'Linux, мережі та Bash-скриптинг',
      description: 'Файлова система, процеси, HTTP/DNS/TLS, діагностика портів і журналів.',
      materials: [
        {
          title: 'Урок: Основи адміністрування Linux та мережевих утиліт',
          type: MaterialType.TEXT,
          url: '',
          description: 'Команди ss, curl, journalctl, chmod та змінні середовища.',
          content: `### Базова діагностика сервісу:\n• Перевірка відкритих портів: ss -tulnp\n• Перевірка HTTP-відповіді: curl -i http://localhost:3000/api/health\n• Передача секретів (API-ключів) лише через змінні середовища (.env), ніколи у Git.`,
        },
      ],
      aiTips: ['Автоматизуйте рутинні перевірки середовища через ідемпотентні скрипти з чіткими кодами виходу.'],
    },
    {
      title: 'Контейнеризація з Docker та Compose',
      description: 'Dockerfile, багатоетапне збирання, мережі, volumes та оптимізація образів.',
      materials: [
        {
          title: 'Docker Best Practices',
          type: MaterialType.LINK,
          url: 'https://docs.docker.com/develop/dev-best-practices/',
          description: 'Створення легких та безпечних контейнерів.',
          content: `### Multi-stage Dockerfile:\nВикористовуйте node:22-alpine та .dockerignore (node_modules, .git), щоб фінальний образ був легким і запускався за секунди.`,
        },
      ],
      aiTips: ['Використовуйте .dockerignore та multi-stage builds, щоб зменшити розмір фінального образу в рази.'],
    },
    {
      title: 'CI/CD пайплайни та GitHub Actions',
      description: 'Автоматичний запуск тестів, лінтерів, збирання артефактів і деплой.',
      materials: [
        {
          title: 'GitHub Actions Documentation',
          type: MaterialType.LINK,
          url: 'https://docs.github.com/actions',
          description: 'Тригери push/pull_request, кешування залежностей і секрети.',
          content: `### Мінімальний CI workflow:\nНа кожен push у main запускаються npm test та перевірка типізації; при помилці деплой блокується.`,
        },
      ],
      aiTips: ['Блокуйте злиття Pull Request у main, якщо не пройшли автоматизовані тести.'],
    },
    {
      title: 'Моніторинг, логи та спостережуваність',
      description: 'Метрики SLA/SLO, алерти, централізоване логування та healthcheck.',
      materials: [
        {
          title: 'Урок: Чекліст Production Readiness',
          type: MaterialType.TEXT,
          url: '',
          description: 'Наявність healthcheck, вимірювання затримки P95 і структурованих логів.',
          content: `### Три стовпи спостережуваності:\n1. Logs (структурований JSON).\n2. Metrics (затримка відповіді AI <= 5000 мс, відсоток позитивних оцінок > 90%).\n3. Traces (відстеження шляху запиту між сервісами).`,
        },
      ],
      aiTips: ['Додавайте вимірювання часу виконання критичних запитів (responseTimeMs), щоб бачити деградацію SLA до скарг користувачів.'],
    },
  ],
  'Cybersecurity Specialist': [
    {
      title: 'Мережева безпека та модель OSI/TCP-IP',
      description: 'Аналіз трафіку, TLS/HTTPS, фаєрволи, DNS-безпека та захист периметра.',
      materials: [
        {
          title: 'OWASP Cheat Sheet Series',
          type: MaterialType.LINK,
          url: 'https://cheatsheetseries.owasp.org/',
          description: 'Практичні рекомендації з безпеки вебзастосунків та інфраструктури.',
          content: `### Базові принципи захисту мережі:\n• Використовуйте TLS 1.3 для всього зовнішнього трафіку.\n• Принцип найменших привілеїв (Least Privilege) для портів та сервісних акаунтів.`,
        },
      ],
      aiTips: ['Завжди перевіряйте не тільки шифрування каналу (HTTPS), а й авторизацію кожного API-ендпоінту.'],
    },
    {
      title: 'Безпека вебзастосунків (OWASP Top 10)',
      description: 'XSS, CSRF, SQL/NoSQL Injection, IDOR та безпечна робота з вводом.',
      materials: [
        {
          title: 'Урок: Захист від XSS та контроль доступу',
          type: MaterialType.TEXT,
          url: '',
          description: 'Екранування виводу у браузері та валідація прав доступу на сервері.',
          content: `### Як захистити SPA від XSS:\nУсі користувацькі рядки перед вставкою в DOM мають проходити HTML-екранування (&, <, >, ", ') або вставлятися через textContent.`,
        },
      ],
      aiTips: ['Ніколи не довіряйте даним із клієнта — перевіряйте права доступу та інваріанти на сервері.'],
    },
    {
      title: 'Криптографія та керування ідентичністю',
      description: 'Хешування паролів, соління, токени, MFA та керування секретами.',
      materials: [
        {
          title: 'Урок: Безпечне зберігання паролів',
          type: MaterialType.TEXT,
          url: '',
          description: 'Чому паролі не можна зберігати у відкритому вигляді.',
          content: `### Правила роботи з паролями:\nВикористовуйте scrypt з випадковою сіллю, обмежуйте мінімальну довжину та ніколи не повертайте passwordHash у відповідях API.`,
        },
      ],
      aiTips: ['Перевіряйте серіалізацію об’єктів (toJSON), щоб випадково не віддати приватні хеші чи токени у відповіді API.'],
    },
    {
      title: 'Тестування на проникнення та реагування на інциденти',
      description: 'Сканування вразливостей, аудит коду, журналювання подій безпеки.',
      materials: [
        {
          title: 'NIST Cybersecurity Framework',
          type: MaterialType.LINK,
          url: 'https://www.nist.gov/cyberframework',
          description: 'Фреймворк виявлення, захисту та реагування на загрози.',
          content: `### Аудит безпеки коду:\nРегулярно перевіряйте залежності та пишіть негативні автотести на обхід бізнес-логіки (наприклад, підтвердження неоплаченої послуги).`,
        },
      ],
      aiTips: ['Фіксуйте кожен знайдений обхід бізнес-правил автоматизованим негативним тестом.'],
    },
  ],
};
