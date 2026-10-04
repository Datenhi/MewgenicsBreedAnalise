# Worklog

---
Task ID: 1
Agent: Super Z (main)
Task: Разработка приложения для анализа .sav сохранений Mewgenics (родословная котов)

Work Log:
- Исследован формат файла upload/steamcampaign01.sav: SQLite 3 (таблицы cats, files, furniture, properties, winning_teams)
- Реверс-инжиниринг бинарных блобов (Python-скрипты в scripts/):
  - cats.data: [0]uint32 seed, [4]uint32 version(5090), [9..17) random seed, [17]uint8 nameLen, [21]flag, [22..]имя в UTF-16LE (последний символ без старшего байта — схема "2n-1"), пол по ASCII 'male'/'female', класс по подстроке
  - files.pedigree: заголовок (-11, count, 127) + битстрим, затем записи по 4 int64: (child, parent1|-1, parent2|-1, inbreeding double), перемежаются мета-парами (пропускаются ресинхронизацией); секции разделяются маркером int64 = -11
- Реализован парсер src/lib/mewgenics-parser.ts (node:sqlite DatabaseSync, BigInt/DataView, little-endian)
- Найдены и исправлены баги: маркер -11 vs -1; setBigUint64 без флага little-endian
- Итог: 99 котов, 57 с родителями, 42 основателя, 15 с инбридингом (0.25/0.125/0.046875...), имена/пол/классы корректны
- API: src/app/api/parse/route.ts (GET ?example=1, POST file)
- UI: src/app/page.tsx + src/components/family-tree.tsx (рус. язык, amber-тема, shadcn/ui)
- Исправлен конфликт имён Home (lucide icon vs компонент)
- Проверено agent-browser: загрузка демо, дерево потомков (Cleocatra 55), предки (Kavi, инцест-связь объясняет инбридинг 25%), мобильная вёрстка, POST-загрузка, ошибка не-SQLite файла, консоль чистая

Stage Summary:
- Формат .sav восстановлен: SQLite + кастомная бинарная сериализация; родословная = (child, p1, p2, COI)
- Приложение готово: /home/z/my-project (Next.js 16, порт 3000)
- Демо-файл: public/demo/steamcampaign01.sav
- Парсер: ~11 мс на файл, поддержка нескольких секций/кандидатов старта
