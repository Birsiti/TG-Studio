-- изменено 2026-10-17 01:30
-- Представления: лист сборки по кругу склада — заявка и весь маршрут.

-- Лист сборки одной заявки: строки в порядке обхода склада по кругу.
-- Товары без места — в конце (pick_seq = 1000000), чтобы их не потеряли.
CREATE VIEW IF NOT EXISTS v_pick_order AS
SELECT o.id AS order_id, o.number, o.date, r.name AS route, l.line_no,
       COALESCE(p.place, 1000000) AS pick_seq, p.place, c.sort AS cat_sort, c.name AS category,
       p.name, p.weight_g, l.qty, l.places, l.is_bonus
FROM orders o
JOIN routes r ON r.id = o.route_id
JOIN order_lines l ON l.order_id = o.id
JOIN products p ON p.id = l.product_id
JOIN categories c ON c.id = p.category_id;

-- Лист сборки всего маршрута за один круг: сумма по товару + раскладка по заявкам
CREATE VIEW IF NOT EXISTS v_pick_route AS
SELECT o.date, r.name AS route, COALESCE(p.place, 1000000) AS pick_seq, p.place, c.sort AS cat_sort,
       c.name AS category, p.id AS product_id, p.name, p.weight_g,
       SUM(l.qty) AS qty, SUM(l.places) AS places,
       GROUP_CONCAT(o.number || ':' || l.qty || CASE WHEN l.is_bonus THEN 'б' ELSE '' END, ' ') AS split
FROM orders o
JOIN routes r ON r.id = o.route_id
JOIN order_lines l ON l.order_id = o.id
JOIN products p ON p.id = l.product_id
JOIN categories c ON c.id = p.category_id
WHERE o.status <> 'cancelled'
GROUP BY o.date, r.id, p.id;
