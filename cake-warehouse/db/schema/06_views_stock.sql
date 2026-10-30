-- изменено 2026-10-17 01:30
-- Представления: остатки, итоги заявки, сводная маршрута, нехватка.

-- ---------- Представления ----------

-- Остаток по товарам
CREATE VIEW IF NOT EXISTS v_stock AS
SELECT p.id AS product_id, c.name AS category, p.name, p.weight_g,
       COALESCE(SUM(m.qty), 0) AS qty, p.min_qty,
       COALESCE(SUM(m.qty), 0) < p.min_qty AS is_low
FROM products p
JOIN categories c ON c.id = p.category_id
LEFT JOIN stock_moves m ON m.product_id = p.id
GROUP BY p.id;

-- Итоги заявки — как строка «Итого» в накладной
CREATE VIEW IF NOT EXISTS v_order_totals AS
SELECT o.id AS order_id, o.number, o.date, r.name AS route, cu.name AS customer, pt.address,
       SUM(CASE WHEN l.is_bonus = 0 THEN l.qty ELSE 0 END) AS qty,
       SUM(l.places) AS places,
       ROUND(SUM(l.qty * p.weight_g) / 1000.0, 3) AS weight_kg
FROM orders o
JOIN routes r ON r.id = o.route_id
JOIN points pt ON pt.id = o.point_id
JOIN customers cu ON cu.id = pt.customer_id
JOIN order_lines l ON l.order_id = o.id
JOIN products p ON p.id = l.product_id
GROUP BY o.id;

-- Сводная заявка за период по маршруту — лист сборки (товар, кол-во, общий вес)
CREATE VIEW IF NOT EXISTS v_route_summary AS
SELECT o.date, r.name AS route, c.sort AS cat_sort, c.name AS category, p.id AS product_id, p.name, p.weight_g,
       SUM(l.qty) AS qty, SUM(l.places) AS places,
       ROUND(SUM(l.qty * p.weight_g) / 1000.0, 3) AS weight_kg,
       COUNT(DISTINCT o.id) AS orders
FROM orders o
JOIN routes r ON r.id = o.route_id
JOIN order_lines l ON l.order_id = o.id
JOIN products p ON p.id = l.product_id
JOIN categories c ON c.id = p.category_id
WHERE o.status <> 'cancelled'
GROUP BY o.date, r.id, p.id;

-- Хватает ли остатка на сводную
CREATE VIEW IF NOT EXISTS v_route_shortage AS
SELECT s.date, s.route, s.name, s.weight_g, s.qty AS need, st.qty AS have, s.qty - st.qty AS short
FROM v_route_summary s
JOIN v_stock st ON st.product_id = s.product_id
WHERE s.qty > st.qty;
