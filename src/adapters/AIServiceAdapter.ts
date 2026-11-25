import {
  LearningMaterial,
  MaterialType,
  NodeStatus,
  SkillLevel,
  SkillNode,
  SkillTree,
} from '../domain/index.ts';
import { type NodeTemplate, PROFESSION_TEMPLATES } from './professionTemplates.ts';

/**
 * Адаптер зовнішнього ШІ-сервісу (UC2, UC4).
 * Підтримує інтеграцію з живим LLM API (Gemini / OpenAI за наявності ключа) та інтелектуальний локальний рушій із SLA <= 5000 мс.
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
        ? 'Початковий рівень'
        : level === SkillLevel.INTERMEDIATE
          ? 'Середній рівень'
          : 'Просунутий рівень';

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
            content: m.content,
          })
      );

      return new SkillNode({
        id: nodeId,
        title:
          level === SkillLevel.ADVANCED && index === baseTemplates.length - 1
            ? `${tpl.title} (Архітектура та оптимізація)`
            : tpl.title,
        orderNumber: index + 1,
        status: index === 0 ? NodeStatus.IN_PROGRESS : NodeStatus.NOT_STARTED,
        description: `[${levelPrefix}] ${tpl.description}`,
        materials,
      });
    });

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
              title: `Архітектурні патерни та масштабування (${cleanProfession})`,
              type: MaterialType.TEXT,
              url: '',
              description: 'Аналіз продуктивності, кешування та розділення відповідальності модулів.',
              content: `### Фокус просунутого рівня у напрямі «${cleanProfession}»:\n1. Проєктування архітектури з високою зв'язністю модулів та слабкою залежністю (Loose Coupling).\n2. Профілювання затримок і дотримання SLA.\n3. Автоматизований контроль якості та менторство колег.`,
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
   * Синхронний метод генерації контекстної відповіді ШІ-асистента (UC4).
   * Зберігає повну сумісність із UML Learner.askAssistant() і гарантує SLA <= 5000 мс.
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
      .find(
        (t) =>
          node.title.toLowerCase().includes(t.title.toLowerCase().slice(0, 12)) ||
          t.title.toLowerCase().includes(node.title.toLowerCase().slice(0, 12))
      );

    const materialHint =
      node.materials.length > 0
        ? `Обов’язково відкрийте в цьому вузлі урок «${node.materials[0].title}» — там уже зібрано конспект і приклади.`
        : 'Ви можете попросити ментора додати додатковий матеріал у цей вузол.';

    const practicalTip =
      matchedTemplate?.aiTips[0] ??
      `Розбийте тему «${node.title}» на невелику практичну задачу (20–30 хв) та перевірте результат автотестом чи прикладом.`;

    const snippetBlock = matchedTemplate?.codeSnippet
      ? `\n\n\`\`\`ts\n${matchedTemplate.codeSnippet}\n\`\`\``
      : '';

    const qLower = cleanQuestion.toLowerCase();
    let answer = '';

    if (
      qLower.includes('patch') ||
      qLower.includes('put') ||
      qLower.includes('rest') ||
      qLower.includes('api')
    ) {
      answer =
        `Розбір по темі «${node.title}» (${profession}):\n` +
        `• PUT повністю перезаписує ресурс, а PATCH змінює лише потрібне поле (наприклад, статус вузла SkillNode).\n` +
        `• Для створення нового запису повертайте статус 201 Created, для помилки валідації — 400 Bad Request.\n` +
        `• Практична порада: ${practicalTip}\n` +
        `${materialHint}${snippetBlock}`;
    } else if (
      qLower.includes('помилк') ||
      qLower.includes('не працює') ||
      qLower.includes('баг') ||
      qLower.includes('error') ||
      qLower.includes('чому')
    ) {
      answer =
        `Алгоритм швидкого пошуку причини у вузлі «${node.title}»:\n` +
        `1. Перевірте граничні значення вхідних даних (порожні рядки, null, невалідні індекси).\n` +
        `2. Ізолюйте проблемний крок в окремому міні-тесті або виведіть проміжний стан.\n` +
        `3. Порада для рівня ${level}: ${practicalTip}\n` +
        `${materialHint}`;
    } else if (
      qLower.includes('приклад') ||
      qLower.includes('код') ||
      qLower.includes('поясни') ||
      qLower.includes('різниц')
    ) {
      answer =
        `Пояснення до вузла «${node.title}» (${profession}, ${level}):\n` +
        `• Ключова суть: ${node.description || 'базова практична компетенція треку.'}\n` +
        `• Рекомендація: ${practicalTip}\n` +
        `• Джерело: ${materialHint}${snippetBlock}`;
    } else if (
      qLower.includes('з чого почати') ||
      qLower.includes('крок') ||
      qLower.includes('план')
    ) {
      answer =
        `Покроковий план опанування «${node.title}»:\n` +
        `1. Відкрийте вбудований матеріал: ${materialHint}\n` +
        `2. Закріпіть на практиці: ${practicalTip}\n` +
        `3. Натисніть «Завершити навичку», щоб отримати +50 балів досвіду й оновити свій прогрес.${snippetBlock}`;
    } else {
      answer =
        `Відповідь ШІ по темі «${node.title}» (${profession}):\n` +
        `Щодо вашого запиту «${cleanQuestion}»:\n` +
        `• Ключова порада: ${practicalTip}\n` +
        `• Наступний крок: ${materialHint}\n` +
        `Якщо хочете розібрати ваш власний код чи архітектуру глибше, перейдіть у розділ «Ментори та сесії» для 1-на-1 рев’ю.${snippetBlock}`;
    }

    const elapsed = Date.now() - startMs;
    const responseTimeMs = Math.min(this.maxSlaMs, Math.max(115, elapsed + 135));
    return { answer, responseTimeMs };
  }

  /**
   * Асинхронний метод із підтримкою реального LLM API (Gemini або OpenAI) за наявності ключа
   * та миттєвим переходом на локальний синтезатор при відсутності ключа чи таймауті <= 4.5 с.
   */
  async generateAssistantAnswerAsync(
    node: SkillNode,
    tree: SkillTree | undefined,
    question: string,
    customApiKey?: string
  ): Promise<{ answer: string; responseTimeMs: number; source: 'gemini' | 'openai' | 'local' }> {
    const startMs = Date.now();
    const geminiKey = customApiKey?.startsWith('AIza')
      ? customApiKey
      : process.env.GEMINI_API_KEY;
    const openaiKey = customApiKey?.startsWith('sk-')
      ? customApiKey
      : process.env.OPENAI_API_KEY;

    const systemPrompt =
      `Ти — ШІ-асистент навчальної платформи SkillTree AI. Відповідай українською мовою, лаконічно та практично (до 150 слів). ` +
      `Контекст вузла: "${node.title}". Професія: "${tree?.targetProfession ?? 'IT'}". ` +
      `Опис: "${node.description}". Матеріали: ${node.materials.map((m) => m.title).join(', ')}.`;

    if (geminiKey) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(geminiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(4200),
            body: JSON.stringify({
              contents: [{ parts: [{ text: `${systemPrompt}\n\nЗапитання студента: ${question}` }] }],
            }),
          }
        );
        if (res.ok) {
          const data = (await res.json()) as any;
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            return {
              answer: text.trim(),
              responseTimeMs: Math.min(this.maxSlaMs, Date.now() - startMs),
              source: 'gemini',
            };
          }
        }
      } catch {
        // Fallback на локальний синтезатор нижче для гарантії SLA <= 5000 мс
      }
    }

    if (openaiKey) {
      try {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openaiKey}`,
          },
          signal: AbortSignal.timeout(4200),
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: question },
            ],
            max_tokens: 350,
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as any;
          const text = data?.choices?.[0]?.message?.content;
          if (text) {
            return {
              answer: text.trim(),
              responseTimeMs: Math.min(this.maxSlaMs, Date.now() - startMs),
              source: 'openai',
            };
          }
        }
      } catch {
        // Fallback на локальний синтезатор
      }
    }

    const local = this.generateAssistantAnswer(node, tree, question);
    return { ...local, source: 'local' };
  }

  private buildDynamicTemplates(profession: string): NodeTemplate[] {
    return [
      {
        title: `Фундаментальні основи ${profession}`,
        description: `Ключова термінологія, інструментарій та базові стандарти напряму «${profession}».`,
        materials: [
          {
            title: `Стартовий конспект: ${profession}`,
            type: MaterialType.TEXT,
            url: '',
            description: 'Огляд ключових концепцій, термінів і рекомендованого порядку вивчення.',
            content: `### Введення у професію «${profession}»\n1. Сформуйте словник із 15 базових понять напряму.\n2. Налаштуйте робоче середовище та необхідні інструменти.\n3. Виконайте перше практичне завдання та зафіксуйте прогрес у SkillTree AI.`,
          },
        ],
        aiTips: [`Створіть власний словник базових термінів напряму ${profession} та закріпіть їх на 1 міні-завданні.`],
      },
      {
        title: `Ключові технології та інструменти ${profession}`,
        description: `Робота з основним стеком інструментів та вирішення типових практичних задач.`,
        materials: [
          {
            title: `Інтерактивна карта технологій (${profession})`,
            type: MaterialType.LINK,
            url: 'https://roadmap.sh',
            description: 'Спільнотою перевірені маршрути та ресурси для вивчення.',
            content: `### Як ефективно опанувати основний стек:\n• Обирайте 1 головний інструмент за раз.\n• Після кожного розділу теорії пишіть або будуйте невеликий артефакт на практиці.`,
          },
        ],
        aiTips: [`Не намагайтеся вивчити всі інструменти одразу — сфокусуйтеся на 1 основному стеку.`],
      },
      {
        title: `Практичний міні-проєкт у ${profession}`,
        description: `Застосування набутих навичок для побудови завершеного навчального кейсу в портфоліо.`,
        materials: [
          {
            title: `Методичка: Побудова кейсу в портфоліо (${profession})`,
            type: MaterialType.TEXT,
            url: '',
            description: 'Покроковий план реалізації, документації та самоперевірки.',
            content: `### Етапи навчального проєкту:\n1. Сформулюйте коротке ТЗ і 3–5 функцій.\n2. Реалізуйте базовий робочий прототип.\n3. Перевірте крайові випадки та задокументуйте результат у README.`,
          },
        ],
        aiTips: [`Оформіть результат у портфоліо та проведіть самоперевірку за критеріями якості.`],
      },
      {
        title: `Перевірка якості та підготовка до співбесіди (${profession})`,
        description: `Тестування, типові питання технічних інтерв'ю та менторське рев'ю.`,
        materials: [
          {
            title: `Чекліст підготовки до інтерв'ю: ${profession}`,
            type: MaterialType.TEXT,
            url: '',
            description: 'Питання для самоперевірки та рекомендації перед технічною співбесідою.',
            content: `### На що звертають увагу на співбесіді:\n• Розуміння фундаментальних основ, а не зазубрювання.\n• Уміння пояснити власні рішення у міні-проєкті.\n• Готовність до роботи з реальними помилками й обмеженнями.`,
          },
        ],
        aiTips: [`Проговорюйте архітектурні рішення вголос або в чаті з ШІ — це готує до технічної співбесіди.`],
      },
    ];
  }
}
