-- изменено 2026-10-16 23:00
-- Частые запросы. Запуск: sqlite3 -header -column cake.db < queries.sql
-- (или скопировать нужный в sqlite3 / DB Browser for SQLite)

-- 1. Сводная заявка по маршруту на дату — лист сборки, как бумажный
SELECT category AS "Категория", name AS "Товар", weight_g AS "Вес, г", qty AS "Кол-во", weight_kg AS "Общий вес"
FROM v_route_summary
WHERE route = 'Маршрут 3' AND date = '2026-10-17'
ORDER BY cat_sort, name, weight_g;

-- 2. Заявки маршрута с итогами — для листа «по точкам»
SELECT number AS "Заявка", customer AS "Заказчик", address AS "Пункт разгрузки", qty AS "Кол-во", places AS "Мест", weight_kg AS "Вес"
FROM v_order_totals
WHERE route = 'Маршрут 3' AND date = '2026-10-17'
ORDER BY number;

-- 3. Чего не хватает на складе под маршрут
SELECT route, name, weight_g, need, have, short FROM v_route_shortage WHERE date = '2026-10-17';

-- 4. Остатки, что заканчивается — первым
SELECT category, name, weight_g, qty, min_qty FROM v_stock ORDER BY is_low DESC, category, name;

-- 5. Ящики за водителями: выдано, вернул, утерял, долг
SELECT driver AS "Водитель", issued AS "Выдано", returned AS "Вернул", lost AS "Утерял", debt AS "Долг"
FROM v_driver_tara ORDER BY debt DESC;

-- 5а. Ящики по рейсам за неделю: что не вернулось с маршрута
SELECT date, route, driver, issued, returned, not_returned FROM v_sheet_tara
WHERE date >= date('now', '-7 days') ORDER BY date DESC, route;

-- 5б. Ящики на складе
SELECT name, total AS "Всего", at_drivers AS "У водителей", lost AS "Утеряно", in_stock AS "На складе" FROM v_tara_stock;

-- 6. Отгрузки по заказчикам за неделю
SELECT cu.name AS customer, -SUM(m.qty) AS shipped
FROM stock_moves m
JOIN orders o ON o.id = m.order_id
JOIN points pt ON pt.id = o.point_id
JOIN customers cu ON cu.id = pt.customer_id
WHERE m.type = 'ship' AND m.date >= date('now', '-7 days')
GROUP BY cu.id ORDER BY shipped DESC;
