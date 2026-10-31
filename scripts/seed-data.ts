// Deterministic generator of realistic test contacts.
// Russian strings here are test data shown in the UI, not code.

type Gender = "m" | "f";

export type SeedNote = { body: string; createdAt: Date };

// Groups of the demo data: the owner makes up their own, these are examples
export const SEED_GROUPS = [
  "Семья",
  "Друзья",
  "Знакомые",
  "Дача",
  "Аналитики",
] as const;

export type SeedGroup = (typeof SEED_GROUPS)[number];

// How often to keep in touch; same values as the database enum
type SeedTouchInterval = "week" | "month" | "quarter" | "year";

export type SeedContact = {
  name: string;
  about: string | null;
  howWeMet: string | null;
  phone: string | null;
  email: string | null;
  // Both are set or both are empty
  touchInterval: SeedTouchInterval | null;
  touchIntervalSetAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  notes: SeedNote[];
  // Groups of the contact; empty for contacts in no group
  groups: SeedGroup[];
};

// Row for the contacts table: everything except notes and groups
export function toContactRow(contact: SeedContact) {
  const {
    name,
    about,
    howWeMet,
    phone,
    email,
    touchInterval,
    touchIntervalSetAt,
    createdAt,
    updatedAt,
  } = contact;
  return {
    name,
    about,
    howWeMet,
    phone,
    email,
    touchInterval,
    touchIntervalSetAt,
    createdAt,
    updatedAt,
  };
}

// mulberry32: tiny seeded PRNG, so every run produces the same data
function createRandom(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) =>
      min + Math.floor(next() * (max - min + 1)),
    pick: <T>(items: readonly T[]): T =>
      items[Math.floor(next() * items.length)],
    chance: (probability: number) => next() < probability,
  };
}

type Random = ReturnType<typeof createRandom>;

const maleNames = [
  "Александр",
  "Алексей",
  "Андрей",
  "Антон",
  "Аркадий",
  "Арсений",
  "Артём",
  "Богдан",
  "Борис",
  "Вадим",
  "Валентин",
  "Валерий",
  "Василий",
  "Виктор",
  "Виталий",
  "Владимир",
  "Владислав",
  "Всеволод",
  "Вячеслав",
  "Геннадий",
  "Георгий",
  "Глеб",
  "Григорий",
  "Даниил",
  "Денис",
  "Дмитрий",
  "Евгений",
  "Егор",
  "Захар",
  "Иван",
  "Игорь",
  "Илья",
  "Кирилл",
  "Константин",
  "Лев",
  "Леонид",
  "Максим",
  "Марк",
  "Матвей",
  "Мирон",
  "Михаил",
  "Никита",
  "Николай",
  "Олег",
  "Павел",
  "Пётр",
  "Роман",
  "Руслан",
  "Савелий",
  "Семён",
  "Сергей",
  "Станислав",
  "Степан",
  "Тимофей",
  "Тимур",
  "Фёдор",
  "Филипп",
  "Эдуард",
  "Юрий",
  "Ярослав",
] as const;

const femaleNames = [
  "Александра",
  "Алёна",
  "Алина",
  "Алиса",
  "Анастасия",
  "Ангелина",
  "Анна",
  "Антонина",
  "Арина",
  "Валентина",
  "Валерия",
  "Варвара",
  "Василиса",
  "Вера",
  "Вероника",
  "Виктория",
  "Галина",
  "Дарья",
  "Диана",
  "Ева",
  "Евгения",
  "Екатерина",
  "Елена",
  "Елизавета",
  "Жанна",
  "Злата",
  "Зоя",
  "Инна",
  "Ирина",
  "Карина",
  "Кира",
  "Ксения",
  "Лариса",
  "Лидия",
  "Любовь",
  "Людмила",
  "Майя",
  "Маргарита",
  "Марина",
  "Мария",
  "Милана",
  "Надежда",
  "Наталья",
  "Нина",
  "Оксана",
  "Олеся",
  "Ольга",
  "Полина",
  "Раиса",
  "Светлана",
  "Софья",
  "Таисия",
  "Тамара",
  "Татьяна",
  "Ульяна",
  "Эвелина",
  "Юлия",
  "Яна",
] as const;

// Male forms; female forms are derived in feminineSurname()
const surnames = [
  "Иванов",
  "Смирнов",
  "Кузнецов",
  "Попов",
  "Васильев",
  "Петров",
  "Соколов",
  "Михайлов",
  "Новиков",
  "Фёдоров",
  "Морозов",
  "Волков",
  "Алексеев",
  "Лебедев",
  "Семёнов",
  "Егоров",
  "Павлов",
  "Козлов",
  "Степанов",
  "Николаев",
  "Орлов",
  "Андреев",
  "Макаров",
  "Никитин",
  "Захаров",
  "Зайцев",
  "Соловьёв",
  "Борисов",
  "Яковлев",
  "Григорьев",
  "Романов",
  "Воробьёв",
  "Сергеев",
  "Кузьмин",
  "Фролов",
  "Александров",
  "Дмитриев",
  "Королёв",
  "Гусев",
  "Киселёв",
  "Ильин",
  "Максимов",
  "Поляков",
  "Сорокин",
  "Виноградов",
  "Ковалёв",
  "Белов",
  "Медведев",
  "Антонов",
  "Тарасов",
  "Жуков",
  "Баранов",
  "Филиппов",
  "Комаров",
  "Давыдов",
  "Беляев",
  "Герасимов",
  "Богданов",
  "Осипов",
  "Сидоров",
  "Матвеев",
  "Титов",
  "Марков",
  "Миронов",
  "Крылов",
  "Куликов",
  "Карпов",
  "Власов",
  "Мельников",
  "Денисов",
  "Гаврилов",
  "Тихонов",
  "Казаков",
  "Афанасьев",
  "Данилов",
  "Савельев",
  "Тимофеев",
  "Фомин",
  "Чернов",
  "Абрамов",
  "Мартынов",
  "Ефимов",
  "Федотов",
  "Щербаков",
  "Назаров",
  "Калинин",
  "Исаев",
  "Чернышёв",
  "Быков",
  "Маслов",
  "Родионов",
  "Коновалов",
  "Лазарев",
  "Воронин",
  "Климов",
  "Филатов",
  "Пономарёв",
  "Голубев",
  "Кудрявцев",
  "Прохоров",
  "Наумов",
  "Потапов",
  "Журавлёв",
  "Овчинников",
  "Трофимов",
  "Леонов",
  "Соболев",
  "Ермаков",
  "Колесников",
  "Гончаров",
  "Емельянов",
  "Никифоров",
  "Грачёв",
  "Котов",
  "Гришин",
  "Ефремов",
  "Архипов",
  "Громов",
  "Кириллов",
  "Малышев",
  "Панов",
  "Моисеев",
  "Румянцев",
  "Акимов",
  "Кондратьев",
  "Бирюков",
  "Горбунов",
  "Анисимов",
  "Галкин",
  "Лукьянов",
  "Скворцов",
  "Юдин",
  "Белоусов",
  "Нестеров",
  "Симонов",
  "Харитонов",
  "Князев",
  "Цветков",
  "Левин",
  "Воронцов",
  "Зверев",
  "Нечаев",
  "Седов",
  "Головин",
  "Суворов",
  "Островский",
  "Покровский",
  "Вишневский",
  "Высоцкий",
  "Троицкий",
  "Савицкий",
  "Толстой",
  "Шевченко",
  "Бондаренко",
  "Ткаченко",
  "Коваленко",
  "Кравченко",
  "Ковальчук",
  "Мельничук",
  "Черных",
  "Седых",
  "Долгих",
  "Белых",
] as const;

function feminineSurname(surname: string): string {
  if (/(ов|ев|ёв|ин|ын)$/.test(surname)) return `${surname}а`;
  if (/ский$/.test(surname)) return surname.replace(/ский$/, "ская");
  if (/цкий$/.test(surname)) return surname.replace(/цкий$/, "цкая");
  if (/ой$/.test(surname)) return surname.replace(/ой$/, "ая");
  return surname; // -енко, -ук, -ых, -их do not change
}

const companies = [
  "Яндексе",
  "Сбере",
  "Т-Банке",
  "Озоне",
  "VK",
  "Авито",
  "Лаборатории Касперского",
  "2ГИС",
  "Skyeng",
  "hh.ru",
  "МТС",
  "Альфа-Банке",
  "Ростелекоме",
  "Самокате",
  "Додо Пицце",
  "Контуре",
  "JetBrains",
  "Леруа Мерлен",
  "небольшой студии дизайна",
  "консалтинговой компании",
] as const;

const universities = [
  "МГУ",
  "СПбГУ",
  "МФТИ",
  "ВШЭ",
  "МГТУ им. Баумана",
  "МГИМО",
  "ИТМО",
  "УрФУ",
  "НГУ",
  "КФУ",
  "РЭУ им. Плеханова",
  "МИФИ",
] as const;

const cities = [
  "Москву",
  "Петербург",
  "Казань",
  "Екатеринбург",
  "Новосибирск",
  "Сочи",
  "Калининград",
  "Нижний Новгород",
  "Тбилиси",
  "Ереван",
  "Белград",
  "Алматы",
] as const;

const places = [
  "Кофемании на Никитской",
  "Шоколаднице у метро",
  "кафе возле офиса",
  "парке Горького",
  "Дринкит на Тверской",
  "ресторане на Патриарших",
  "коворкинге",
  "Surf Coffee",
  "столовой бизнес-центра",
] as const;

const books = [
  "Мастер и Маргарита",
  "Сто лет одиночества",
  "Думай медленно… решай быстро",
  "Sapiens",
  "Атомные привычки",
  "Пиши, сокращай",
  "Мифический человеко-месяц",
  "Шантарам",
  "Три товарища",
  "Гарри Поттер и философский камень",
] as const;

const friends = [
  "Олега",
  "Маши",
  "Димы",
  "Кати",
  "Серёжи",
  "Ани",
  "Паши",
  "Лены",
  "Миши",
  "Насти",
  "Андрея",
  "Юли",
] as const;

function aboutText(random: Random, gender: Gender): string {
  const g = (male: string, female: string) => (gender === "m" ? male : female);
  const company = random.pick(companies);
  const options = [
    () => `Коллега по работе в ${company}`,
    () => `Продакт-менеджер в ${company}`,
    () => `Разработчик в ${company}`,
    () => `Дизайнер в ${company}`,
    () => `Аналитик данных в ${company}`,
    () => `Маркетолог в ${company}`,
    () => `Тимлид в ${company}`,
    () => `HR в ${company}`,
    () => g("Бывший руководитель", "Бывшая руководительница"),
    () => g("Основатель стартапа", "Основательница стартапа"),
    () => "Юрист, помогает с договорами",
    () => "Бухгалтер, ведёт ИП",
    () => "Финансовый консультант",
    () => "Рекрутер",
    () => "Инвестор, ангел",
    () => g("Журналист", "Журналистка"),
    () => g("Друг детства", "Подруга детства"),
    () => g("Одноклассник", "Одноклассница"),
    () => g("Однокурсник", "Однокурсница"),
    () => g("Сосед по даче", "Соседка по даче"),
    () => g("Сосед по подъезду", "Соседка по подъезду"),
    () => "Тренер по теннису",
    () => "Стоматолог",
    () => "Парикмахер",
    () => "Репетитор английского для детей",
    () => "Мастер по ремонту квартир",
    () => "Ветеринар",
    () => g("Папа одноклассника сына", "Мама одноклассницы дочери"),
    () => g("Двоюродный брат", "Двоюродная сестра"),
    () => g(`Друг ${random.pick(friends)}`, `Подруга ${random.pick(friends)}`),
    () => "Фотограф",
    () => "Психолог",
    () => g("Преподаватель в университете", "Преподавательница в университете"),
    () => "Риелтор",
    () => g("Автомеханик", "Администратор автосервиса"),
  ];
  return random.pick(options)();
}

function howWeMetText(random: Random): string {
  const year = random.int(2005, 2025);
  const options = [
    () => `Учились вместе в ${random.pick(universities)}`,
    () => `Познакомились на конференции в ${year} году`,
    () =>
      `Работали вместе в ${random.pick(companies)} в ${year}–${Math.min(year + random.int(1, 4), 2026)}`,
    () => "Соседи по даче",
    () => "Живём в одном доме",
    () =>
      random.pick([
        "Познакомил Олег",
        "Познакомила Маша",
        "Познакомил Дима",
        "Познакомила Катя",
        "Познакомил Серёжа",
        "Познакомила Аня",
      ]),
    () => `Через ${random.pick(friends)}, на дне рождения`,
    () => `Встретились на свадьбе у ${random.pick(friends)}`,
    () => "Ходили вместе на курсы английского",
    () => `Ездили вместе в поход на Алтай в ${year}`,
    () => "Тренируемся в одном зале",
    () => "Родительский чат в школе",
    () => "Познакомились на митапе по продуктовой аналитике",
    () => "Соседи по месту в самолёте",
    () => "Через общих друзей",
    () => "По рекомендации в чате дома",
    () => "Учились в одном классе",
    () => "Играем в одной футбольной команде по выходным",
  ];
  return random.pick(options)();
}

function noteText(random: Random, gender: Gender): string {
  const g = (male: string, female: string) => (gender === "m" ? male : female);
  const options = [
    () =>
      `Созвонились, обсудили новый проект. Договорились вернуться к разговору через пару недель.`,
    () =>
      `Встретились в ${random.pick(places)}. ${g("Рассказал", "Рассказала")}, что думает о смене работы.`,
    () => `Поздравление с днём рождения отправлено. Зовёт в гости летом.`,
    () => `${g("Обещал", "Обещала")} прислать контакт хорошего стоматолога.`,
    () => `Договорились встретиться на кофе в начале следующего месяца.`,
    () =>
      `${g("Попросил", "Попросила")} порекомендовать юриста — отправлен контакт ${random.pick(friends)}.`,
    () =>
      `${g("Переехал", "Переехала")} в ${random.pick(cities)}. Новый адрес пришлёт позже.`,
    () =>
      `${g("Сменил", "Сменила")} работу: теперь в ${random.pick(companies)}.`,
    () =>
      `Вернуть книгу «${random.pick(books)}» — она у меня с прошлой встречи.`,
    () =>
      `${g("Взял", "Взяла")} почитать «${random.pick(books)}», обещал${gender === "f" ? "а" : ""} вернуть к концу месяца.`,
    () => `Спросить при следующей встрече, как прошёл отпуск.`,
    () => `Договорились вместе сходить на выставку в субботу.`,
    () =>
      `Обсудили идею совместного проекта. Я отправляю презентацию до пятницы.`,
    () =>
      `Ищет квартиру в аренду, просил${gender === "f" ? "а" : ""} скинуть, если что-то попадётся.`,
    () => `У детей скоро выпускной — не забыть поздравить.`,
    () => `${g("Помог", "Помогла")} с переездом — с меня ужин.`,
    () =>
      `Созвонились коротко: всё хорошо, ${g("занят", "занята")} до конца квартала.`,
    () =>
      `Обменялись контактами нужных людей, ${g("он", "она")} знакомит меня с инвестором.`,
    () => `Перенесли встречу на следующую неделю.`,
    () =>
      `${g("Рассказал", "Рассказала")} про хороший курс по Python, ссылку прислал${gender === "f" ? "а" : ""} в мессенджер.`,
    () =>
      `Встретились случайно в ${random.pick(places)}, договорились не пропадать.`,
    () => `Подборка статей отправлена, как договаривались.`,
  ];
  return random.pick(options)();
}

const translitMap: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

function translit(text: string): string {
  return [...text.toLowerCase()]
    .map((char) => translitMap[char] ?? char)
    .join("");
}

// Reserved example.* domains: test addresses never reach a real person
const emailDomains = ["example.com", "example.org", "example.net"] as const;

function makeEmail(
  random: Random,
  firstName: string,
  surname: string | null,
  used: Set<string>,
): string {
  const first = translit(firstName);
  const last = surname ? translit(surname) : "";
  const variants = last
    ? [
        `${first}.${last}`,
        `${first[0]}.${last}`,
        `${last}.${first}`,
        `${first}${last}`,
      ]
    : [first];
  let local = random.pick(variants);
  if (random.chance(0.25)) {
    local += random.int(70, 99);
  }
  let email = `${local}@${random.pick(emailDomains)}`;
  for (let suffix = 2; used.has(email); suffix += 1) {
    email = `${local}${suffix}@${random.pick(emailDomains)}`;
  }
  used.add(email);
  return email;
}

function makePhone(random: Random): string {
  const digits = (count: number) =>
    Array.from({ length: count }, () => random.int(0, 9)).join("");
  return `+7 9${digits(2)} ${digits(3)}-${digits(2)}-${digits(2)}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// About a quarter of contacts get an interval: more often "once a month" and
// "once a quarter". The rest stay without it, like contacts added by hand
const touchIntervalChoices: readonly [SeedTouchInterval, number][] = [
  ["week", 15],
  ["month", 35],
  ["quarter", 35],
  ["year", 15],
];

function pickTouchInterval(random: Random): SeedTouchInterval | null {
  if (!random.chance(0.25)) {
    return null;
  }
  let point = random.next() * 100;
  for (const [interval, weight] of touchIntervalChoices) {
    if (point < weight) {
      return interval;
    }
    point -= weight;
  }
  return "month";
}

// How likely a group is to be picked: the family and the dacha are the smallest,
// acquaintances the biggest, as in life
const groupChoices: readonly [SeedGroup, number][] = [
  ["Знакомые", 35],
  ["Друзья", 30],
  ["Аналитики", 20],
  ["Дача", 8],
  ["Семья", 7],
];

// About 70% of contacts are in a group: three of four in one, the rest in two
function pickGroups(random: Random): SeedGroup[] {
  if (!random.chance(0.7)) {
    return [];
  }
  const wanted = random.chance(0.25) ? 2 : 1;
  const picked: SeedGroup[] = [];
  while (picked.length < wanted) {
    let point =
      random.next() * groupChoices.reduce((sum, [, weight]) => sum + weight, 0);
    for (const [group, weight] of groupChoices) {
      if (point < weight) {
        if (!picked.includes(group)) {
          picked.push(group);
        }
        break;
      }
      point -= weight;
    }
  }
  return picked;
}

// Move a moment to daytime (9:00-21:59 Moscow time), never past "now"
function atDaytime(random: Random, date: Date, now: Date): Date {
  const result = new Date(date);
  result.setUTCHours(
    random.int(6, 18),
    random.int(0, 59),
    random.int(0, 59),
    0,
  );
  return result > now ? now : result;
}

export function generateContacts(
  count: number,
  // Fixed "now" keeps the data identical between runs
  now = new Date("2026-10-09T18:00:00+03:00"),
): SeedContact[] {
  const random = createRandom(20261010);
  // Own generator: adding intervals does not change names, notes and the rest
  const touchRandom = createRandom(20261031);
  // Same for groups: names, notes and intervals stay what they were
  const groupRandom = createRandom(20261101);
  const usedNames = new Set<string>();
  const usedEmails = new Set<string>();
  const result: SeedContact[] = [];

  while (result.length < count) {
    const gender: Gender = random.chance(0.5) ? "m" : "f";
    const firstName = random.pick(gender === "m" ? maleNames : femaleNames);
    const maleSurname = random.pick(surnames);
    const surname = random.chance(0.97)
      ? gender === "m"
        ? maleSurname
        : feminineSurname(maleSurname)
      : null;
    const name = surname ? `${firstName} ${surname}` : firstName;
    if (usedNames.has(name)) {
      continue;
    }
    usedNames.add(name);

    // Contacts were added over the last five years
    const createdAt = atDaytime(
      random,
      new Date(now.getTime() - random.int(1, 5 * 365) * DAY_MS),
      now,
    );
    const noteCount = random.pick([0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 5, 6]);
    const notes: SeedNote[] = Array.from({ length: noteCount }, () => ({
      body: noteText(random, gender),
      createdAt: atDaytime(
        random,
        new Date(
          createdAt.getTime() +
            random.next() * (now.getTime() - createdAt.getTime()),
        ),
        now,
      ),
    })).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    // The interval was chosen some time after the contact was added
    const touchInterval = pickTouchInterval(touchRandom);
    const touchIntervalSetAt = touchInterval
      ? atDaytime(
          touchRandom,
          new Date(
            createdAt.getTime() +
              touchRandom.next() * (now.getTime() - createdAt.getTime()),
          ),
          now,
        )
      : null;

    result.push({
      name,
      about: random.chance(0.9) ? aboutText(random, gender) : null,
      howWeMet: random.chance(0.85) ? howWeMetText(random) : null,
      phone: random.chance(0.85) ? makePhone(random) : null,
      email: random.chance(0.7)
        ? makeEmail(random, firstName, surname, usedEmails)
        : null,
      touchInterval,
      touchIntervalSetAt,
      createdAt,
      updatedAt: createdAt,
      notes,
      groups: pickGroups(groupRandom),
    });
  }

  return result;
}
