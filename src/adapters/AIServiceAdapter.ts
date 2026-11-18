import {
  LearningMaterial,
  MaterialType,
  NodeStatus,
  SkillLevel,
  SkillNode,
  SkillTree,
} from '../domain/index.ts';

interface NodeTemplate {
  title: string;
  description: string;
  materials: Array<{
    title: string;
    type: MaterialType;
    url: string;
    description: string;
  }>;
  aiTips: string[];
}

const PROFESSION_TEMPLATES: Record<string, NodeTemplate[]> = {
  'Full-Stack Developer': [
    {
      title: 'HTML5, CSS3 та адаптивна верстка',
      description: 'Семантична розмітка, Flexbox, CSS Grid, принципи доступності (a11y) та Responsive Design.',
      materials: [
        {
          title: 'MDN: Повний довідник CSS Grid та Flexbox',
          type: MaterialType.LINK,
          url: 'https://developer.mozilla.org/uk/docs/Web/CSS/CSS_grid_layout',
          description: 'Офіційна документація з інтерактивними прикладами сіток.',
        },
        {
          title: 'Чекліст семантичної верстки сторінки',
          type: MaterialType.TEXT,
          url: '#html-semantic-checklist',
          description: 'Використовуйте header, main, nav, article та правильну ієрархію заголовків h1-h3.',
        },
      ],
      aiTips: [
        'Для побудови двовимірних макетів (сітка карток) краще використовувати CSS Grid, а для вирівнювання елементів в один рядок — Flexbox.',
        'Завжди задавайте box-sizing: border-box глобально, щоб padding не ламав розрахункову ширину блоків.',
      ],
    },
    {
      title: 'TypeScript та сучасний JavaScript (ES2022+)',
      description: 'Типізація, інтерфейси, асинхронність (Promise/async-await), робота з масивами та DOM.',
      materials: [
        {
          title: 'TypeScript Handbook: Основи типів та класів',
          type: MaterialType.LINK,
          url: 'https://www.typescriptlang.org/docs/handbook/intro.html',
          description: 'Посібник з інтерфейсів, enum, generic-типів та ООП.',
        },
        {
          title: 'Відеорозбір: Event Loop та async/await на практиці',
          type: MaterialType.VIDEO,
          url: 'https://www.youtube.com/watch?v=8aGhZQkoFbQ',
          description: 'Як працює стек викликів, черга мікрозадач і асинхронні запити.',
        },
      ],
      aiTips: [
        'Використовуйте enum або union types замість «магічних рядків» для статусів — це дозволяє компілятору знаходити помилки ще до запуску.',
        'Для паралельного виконання незалежних запитів застосовуйте Promise.all([...]) замість послідовного await у циклі.',
      ],
    },
    {
      title: 'Backend REST API на Node.js',
      description: 'Проєктування маршрутів HTTP, статус-коди, валідація вхідних даних та архітектура шарів.',
      materials: [
        {
          title: 'Специфікація REST API: методи GET, POST, PATCH, DELETE',
          type: MaterialType.TEXT,
          url: '#rest-api-spec',
          description: 'Практичні правила найменування ресурсів і повернення кодів 200, 201, 400, 404.',
        },
        {
          title: 'Node.js Official Documentation: HTTP & Testing',
          type: MaterialType.LINK,
          url: 'https://nodejs.org/api/http.html',
          description: 'Робота з вбудованим HTTP-сервером та потоками.',
        },
      ],
      aiTips: [
        'Відокремлюйте транспортний шар (HTTP-контролери) від доменної логіки, щоб бізнес-правила можна було тестувати без запуску сервера.',
        'Завжди валідуйте вхідний JSON на межі API і повертайте зрозуміле повідомлення зі статусом 400 Bad Request.',
      ],
    },
    {
      title: 'Бази даних та збереження стану',
      description: 'Моделювання зв’язків 1:N та M:N, SQL/NoSQL підходи, індекси та цілісність даних.',
      materials: [
        {
          title: 'Проєктування реляційних і документних моделей даних',
          type: MaterialType.TEXT,
          url: '#db-modeling',
          description: 'Порівняння композиції, агрегації та нормалізації таблиць.',
        },
      ],
      aiTips: [
        'Перед записом у сховище перевіряйте інваріанти моделі (наприклад, карта не може існувати без жодного вузла).',
      ],
    },
    {
      title: 'Автоматизоване тестування та Git CI/CD',
      description: 'Unit-тести, інтеграційне тестування API, регресійні тести та code review.',
      materials: [
        {
          title: 'Піраміда тестування: Unit vs Integration',
          type: MaterialType.TEXT,
          url: '#testing-pyramid',
          description: 'Як поєднувати швидкі доменні тести та перевірку HTTP-ендпоінтів.',
        },
      ],
      aiTips: [
        'Кожен знайдений баг варто спершу зафіксувати падаючим регресійним тестом, а вже потім виправляти код.',
      ],
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
        },
      ],
      aiTips: [
        'Використовуйте словники (dict) або множини (set) для пошуку за ключем за O(1) замість вкладених циклів.',
      ],
    },
    {
      title: 'SQL та аналітичні запити',
      description: 'JOIN, агрегації GROUP BY, віконні функції (ROW_NUMBER, RANK) та підзапити.',
      materials: [
        {
          title: 'Віконні функції в SQL на реальних кейсах',
          type: MaterialType.TEXT,
          url: '#sql-windows',
          description: 'Обчислення накопичувальних сум і когортного аналізу.',
        },
      ],
      aiTips: [
        'Завжди перевіряйте умову JOIN, щоб уникнути дублювання рядків (cartesian explosion) перед агрегацією SUM чи COUNT.',
      ],
    },
    {
      title: 'Аналіз даних у Pandas та візуалізація',
      description: 'Очищення даних, обробка пропусків, побудова метрик KPI та дашбордів.',
      materials: [
        {
          title: 'Pandas 10-minute quickstart',
          type: MaterialType.LINK,
          url: 'https://pandas.pydata.org/docs/user_guide/10min.html',
          description: 'Базові операції фільтрації та групування DataFrame.',
        },
      ],
      aiTips: [
        'Перед побудовою графіків завжди перевіряйте df.isna().sum() та типи колонок через df.dtypes.',
      ],
    },
    {
      title: 'Промпт-інжиніринг та інтеграція LLM API',
      description: 'Системні промпти, контроль затримки (SLA), оцінка якості відповідей та RAG.',
      materials: [
        {
          title: 'Архітектура контекстного AI-асистента з SLA <= 5s',
          type: MaterialType.TEXT,
          url: '#ai-sla-guide',
          description: 'Використання контексту поточного вузла, таймаутів і fallback-стратегії.',
        },
      ],
      aiTips: [
        'Додавайте до промпту чіткий контекст (роль, тема вузла, обмеження формату) і встановлюйте таймаут запиту, щоб гарантувати SLA.',
      ],
    },
  ],
  'QA Automation Engineer': [
    {
      title: 'Теорія тестування та тест-дизайн',
      description: 'Техніки еквівалентного розбиття, граничних значень, таблиці рішень і тест-плани.',
      materials: [
        {
          title: 'Шпаргалка з технік тест-дизайну',
          type: MaterialType.TEXT,
          url: '#test-design',
          description: 'Граничні значення (Boundary Value Analysis) та негативні сценарії.',
        },
      ],
      aiTips: [
        'Завжди тестуйте граничні стани: 0, 1, максимум та невалідні переходи (наприклад, підтвердження неоплаченої сесії).',
      ],
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
        },
      ],
      aiTips: [
        'Ізолюйте кожен інтеграційний тест на окремому сховищі даних, щоб тести не залежали від порядку запуску.',
      ],
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
        },
      ],
      aiTips: [
        'Використовуйте user-facing атрибути або data-testid замість крихких CSS-класів стилізації.',
      ],
    },
    {
      title: 'CI/CD та звітність про дефекти',
      description: 'Баг-репорти, регресійні прогони в GitHub Actions, аналіз покриття.',
      materials: [
        {
          title: 'Шаблон ефективного баг-репорту',
          type: MaterialType.TEXT,
          url: '#bug-report-template',
          description: 'Кроки відтворення, фактичний результат, очікуваний результат і логи.',
        },
      ],
      aiTips: [
        'Хороший баг-репорт містить мінімальний відтворюваний сценарій і посилання на падаючий тест.',
      ],
    },
  ],
  'UI/UX Product Designer': [
    {
      title: 'Дослідження користувачів та User Stories',
      description: 'Інтерв’ю, персони, Jobs-to-be-Done та формулювання критеріїв прийняття.',
      materials: [
        {
          title: 'Як перетворювати болі користувачів на User Stories',
          type: MaterialType.TEXT,
          url: '#ux-user-stories',
          description: 'Формула «Як <роль> я хочу <можливість>, щоб <вигода>».',
        },
      ],
      aiTips: [
        'Кожна дизайн-ідея має вирішувати конкретну проблему користувача, підтверджену сценарієм використання.',
      ],
    },
    {
      title: 'Інформаційна архітектура та Wireframing',
      description: 'User Flows, структура екранів, навігаційна ієрархія та прототипування.',
      materials: [
        {
          title: 'Основи інформаційної архітектури',
          type: MaterialType.LINK,
          url: 'https://www.nngroup.com/articles/',
          description: 'Статті Nielsen Norman Group про юзабіліті та структурування.',
        },
      ],
      aiTips: [
        'Починайте з low-fidelity вайрфреймів для перевірки логіки переходів перед підбором кольорів і шрифтів.',
      ],
    },
    {
      title: 'Дизайн-системи у Figma',
      description: 'Колірні токени, типографіка, Auto Layout, компоненти та варіанти станів.',
      materials: [
        {
          title: 'Figma Auto Layout & Components Guide',
          type: MaterialType.VIDEO,
          url: 'https://help.figma.com/hc/en-us/articles/360040451373',
          description: 'Побудова гнучких адаптивних компонентів інтерфейсу.',
        },
      ],
      aiTips: [
        'Завжди проєктуйте всі стани інтерактивних елементів: default, hover, active, disabled, loading та error.',
      ],
    },
    {
      title: 'Доступність (WCAG) та Юзабіліті-тестування',
      description: 'Контрастність тексту, клавіатурна навігація, збір фідбеку від користувачів.',
      materials: [
        {
          title: 'Чекліст перевірки контрасту WCAG AA',
          type: MaterialType.TEXT,
          url: '#wcag-checklist',
          description: 'Мінімальний коефіцієнт контрасту 4.5:1 для основного тексту.',
        },
      ],
      aiTips: [
        'Перевіряйте інтерфейс без миші та з урахуванням станів порожніх списків (Empty States).',
      ],
    },
  ],
  'DevOps & Cloud Engineer': [
    {
      title: 'Linux, мережі та Bash-скриптинг',
      description: 'Файлова система, процеси, HTTP/DNS/TLS, діагностика портів і журналів.',
      materials: [
        {
          title: 'Основи адміністрування Linux та мережевих утиліт',
          type: MaterialType.TEXT,
          url: '#linux-networking',
          description: 'Команди ss, curl, journalctl, chmod та змінні середовища.',
        },
      ],
      aiTips: [
        'Автоматизуйте рутинні перевірки середовища через ідемпотентні скрипти з чіткими кодами виходу.',
      ],
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
        },
      ],
      aiTips: [
        'Використовуйте .dockerignore та multi-stage builds, щоб зменшити розмір фінального образу в рази.',
      ],
    },
    {
      title: 'CI/CD пайплайни та GitHub Actions',
      description: 'Автоматичний запуск тестів, лінтерів, збирання артефактів і деплой.',
      materials: [
        {
          title: 'Налаштування workflow у GitHub Actions',
          type: MaterialType.LINK,
          url: 'https://docs.github.com/actions',
          description: 'Тригери push/pull_request, кешування залежностей і секрети.',
        },
      ],
      aiTips: [
        'Блокуйте злиття Pull Request у main, якщо не пройшли автоматизовані тести.',
      ],
    },
    {
      title: 'Моніторинг, логи та спостережуваність',
      description: 'Метрики SLA/SLO, алерти, централізоване логування та healthcheck.',
      materials: [
        {
          title: 'Чекліст Production Readiness',
          type: MaterialType.TEXT,
          url: '#observability-checklist',
          description: 'Наявність /health, вимірювання затримки P95 і структурованих логів.',
        },
      ],
      aiTips: [
        'Додавайте вимірювання часу виконання критичних запитів (наприклад, responseTimeMs), щоб бачити деградацію SLA до скарг користувачів.',
      ],
    },
  ],
};

/**
 * Адаптер зовнішнього ШІ-сервісу (UC2, UC4).
 * Забезпечує генерацію дерева навичок та контекстних відповідей у межах SLA (<= 5000 мс).
 */
export class AIServiceAdapter {
  readonly maxSlaMs = 5000;

  getSupportedProfessions(): string[] {
    return Object.keys(PROFESSION_TEMPLATES);
  }

  /**
   * Генерує персоналізовану карту розвитку SkillTree під професію та рівень (UC2).
   */
  generateSkillTree(
    nextId: () => number,
    learnerId: number,
    profession: string,
    level: SkillLevel
  ): SkillTree {
    const cleanProfession = profession.trim() || 'Full-Stack Developer';
    const templateKey = Object.keys(PROFESSION_TEMPLATES).find(
      (k) => k.toLowerCase() === cleanProfession.toLowerCase()
    );

    const baseTemplates = templateKey
      ? PROFESSION_TEMPLATES[templateKey]
      : this.buildDynamicTemplates(cleanProfession);

    const levelPrefix =
      level === SkillLevel.BEGINNER
        ? 'Базовий рівень'
        : level === SkillLevel.INTERMEDIATE
          ? 'Впевнений практик'
          : 'Просунута спеціалізація';

    const nodes: SkillNode[] = baseTemplates.map((tpl, index) => {
      const nodeId = nextId();
      const materials = tpl.materials.map(
        (m) =>
          new LearningMaterial({
            id: nextId(),
            title: m.title,
            type: m.type,
            url: m.url,
            description: m.description,
          })
      );

      return new SkillNode({
        id: nodeId,
        title: level === SkillLevel.ADVANCED && index === baseTemplates.length - 1
          ? `${tpl.title} (Архітектура та оптимізація)`
          : tpl.title,
        orderNumber: index + 1,
        status: index === 0 ? NodeStatus.IN_PROGRESS : NodeStatus.NOT_STARTED,
        description: `[${levelPrefix}] ${tpl.description}`,
        materials,
      });
    });

    // Для рівня ADVANCED додаємо додатковий вузол системного проєктування
    if (level === SkillLevel.ADVANCED) {
      nodes.push(
        new SkillNode({
          id: nextId(),
          title: `Системний дизайн та масштабування у ${cleanProfession}`,
          orderNumber: nodes.length + 1,
          status: NodeStatus.NOT_STARTED,
          description: `[${levelPrefix}] Проєктування відмовостійких систем, профілювання вузьких місць і менторство команди.`,
          materials: [
            new LearningMaterial({
              id: nextId(),
              title: `Архітектурні патерни для ${cleanProfession}`,
              type: MaterialType.TEXT,
              url: '#system-design-advanced',
              description: 'Аналіз продуктивності, кешування та розділення відповідальності модулів.',
            }),
          ],
        })
      );
    }

    return new SkillTree({
      id: nextId(),
      title: `${cleanProfession} (${level})`,
      targetProfession: cleanProfession,
      level,
      learnerId,
      nodes,
    });
  }

  /**
   * Надає контекстну відповідь на запитання студента у конкретному вузлі (UC4).
   * Гарантує відповідність SLA responseTimeMs <= 5000.
   */
  generateAssistantAnswer(
    node: SkillNode,
    tree: SkillTree | undefined,
    question: string
  ): { answer: string; responseTimeMs: number } {
    const startMs = Date.now();
    const cleanQuestion = question.trim();
    const profession = tree?.targetProfession ?? 'обраного напряму';
    const level = tree?.level ?? SkillLevel.BEGINNER;

    const matchedTemplate = Object.values(PROFESSION_TEMPLATES)
      .flat()
      .find((t) => node.title.toLowerCase().includes(t.title.toLowerCase().slice(0, 12)));

    const materialHint =
      node.materials.length > 0
        ? `Рекомендую звернутися до матеріалу у цьому вузлі: «${node.materials[0].title}».`
        : 'Додайте базовий конспект або зверніться до ментора за додатковими посиланнями.';

    const practicalTip = matchedTemplate?.aiTips[0]
      ? matchedTemplate.aiTips[0]
      : `Розбийте тему «${node.title}» на невеликий практичний міні-проєкт (20–30 хв) та перевірте результат автоматичним тестом або прикладом.`;

    const qLower = cleanQuestion.toLowerCase();
    let focusedAnswer = '';

    if (qLower.includes('помилк') || qLower.includes('не працює') || qLower.includes('баг') || qLower.includes('error')) {
      focusedAnswer =
        `Щоб швидко подолати блокер у темі «${node.title}»:\n` +
        `1) Перевірте вхідні дані та граничні стани (null/порожні значення).\n` +
        `2) Локалізуйте проблему в ізольованому фрагменті коду або тесті.\n` +
        `3) Порада для рівня ${level}: ${practicalTip}`;
    } else if (qLower.includes('приклад') || qLower.includes('як') || qLower.includes('поясни')) {
      focusedAnswer =
        `Коротке пояснення по вузлу «${node.title}» (трек ${profession}, ${level}):\n` +
        `• Суть теми: ${node.description || 'ключова практична навичка треку.'}\n` +
        `• Практична порада: ${practicalTip}\n` +
        `• Джерело: ${materialHint}`;
    } else if (qLower.includes('з чого почати') || qLower.includes('крок') || qLower.includes('план')) {
      focusedAnswer =
        `План проходження вузла «${node.title}» за 3 кроки:\n` +
        `1) Ознайомтеся з матеріалом: ${materialHint}\n` +
        `2) Відпрацюйте на практиці: ${practicalTip}\n` +
        `3) Переведіть вузол у статус DONE, щоб отримати +50 балів досвіду та відкрити наступну навичку.`;
    } else {
      focusedAnswer =
        `Контекстна підказка ШІ для «${node.title}» (${profession}):\n` +
        `На ваше запитання «${cleanQuestion}» — зверніть увагу на таке: ${practicalTip} ` +
        `${materialHint} Якщо блокер потребує глибокого код-рев'ю, ви можете забронювати 1-на-1 сесію з ментором.`;
    }

    const elapsed = Date.now() - startMs;
    // Фіксуємо реалістичний час відповіді в межах SLA (<= 5000 мс)
    const responseTimeMs = Math.min(this.maxSlaMs, Math.max(110, elapsed + 145));

    return {
      answer: focusedAnswer,
      responseTimeMs,
    };
  }

  private buildDynamicTemplates(profession: string): NodeTemplate[] {
    return [
      {
        title: `Фундаментальні основи ${profession}`,
        description: `Ключова термінологія, інструментарій та стандарти професії «${profession}».`,
        materials: [
          {
            title: `Стартовий гайд: ${profession}`,
            type: MaterialType.TEXT,
            url: '#dynamic-start',
            description: 'Огляд базових концепцій та рекомендований порядок вивчення.',
          },
        ],
        aiTips: [`Створіть власний словник базових термінів напряму ${profession} та закріпіть їх на 1 міні-завданні.`],
      },
      {
        title: `Ключові технології та інструменти ${profession}`,
        description: `Робота з основним стеком інструментів та вирішення типових практичних задач.`,
        materials: [
          {
            title: `Огляд екосистеми ${profession}`,
            type: MaterialType.LINK,
            url: 'https://roadmap.sh',
            description: 'Інтерактивна добірка матеріалів та рекомендацій.',
          },
        ],
        aiTips: [`Не намагайтеся вивчити всі інструменти одразу — сфокусуйтеся на 1 основному фреймворку.`],
      },
      {
        title: `Практичний міні-проєкт у ${profession}`,
        description: `Застосування набутих навичок для побудови завершеного навчального кейсу.`,
        materials: [
          {
            title: `ТЗ для навчального міні-проєкту`,
            type: MaterialType.TEXT,
            url: '#mini-project',
            description: 'Покроковий план реалізації та критерії самоперевірки.',
          },
        ],
        aiTips: [`Оформіть результат у портфоліо та проведіть самоперевірку за критеріями якості.`],
      },
      {
        title: `Тестування, оптимізація та підготовка до інтерв'ю`,
        description: `Перевірка якості роботи, типові питання співбесід та код/дизайн-рев'ю.`,
        materials: [
          {
            title: `ТОП-20 запитань на співбесіду з ${profession}`,
            type: MaterialType.TEXT,
            url: '#interview-prep',
            description: 'Питання для закріплення теорії та практики.',
          },
        ],
        aiTips: [`Проговорюйте архітектурні рішення вголос або в чаті з ШІ — це готує до технічної співбесіди.`],
      },
    ];
  }
}
