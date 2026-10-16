-- изменено 2026-10-17 01:30
-- Представления: ящики по водителям, по рейсам, на складе.

-- Ящики по водителям: выдано, вернул, утерял, долг
CREATE VIEW IF NOT EXISTS v_driver_tara AS
SELECT st.id AS driver_id, st.name AS driver, t.name AS tara,
       COALESCE(SUM(CASE WHEN m.kind = 'out' THEN m.qty END), 0)       AS issued,
       COALESCE(-SUM(CASE WHEN m.kind = 'back' THEN m.qty END), 0)     AS returned,
       COALESCE(-SUM(CASE WHEN m.kind = 'writeoff' THEN m.qty END), 0) AS lost,
       COALESCE(SUM(m.qty), 0)                                         AS debt
FROM staff st
CROSS JOIN tara_types t
LEFT JOIN tara_moves m ON m.driver_id = st.id AND m.tara_id = t.id
WHERE st.role = 'driver'
GROUP BY st.id, t.id;

-- Ящики по листам (рейсам): сколько уехало и сколько вернулось с этого маршрута
CREATE VIEW IF NOT EXISTS v_sheet_tara AS
SELECT s.id AS sheet_id, s.date, r.name AS route, st.name AS driver, t.name AS tara,
       COALESCE(SUM(CASE WHEN m.kind = 'out' THEN m.qty END), 0)   AS issued,
       COALESCE(-SUM(CASE WHEN m.kind = 'back' THEN m.qty END), 0) AS returned,
       COALESCE(SUM(m.qty), 0)                                     AS not_returned
FROM route_sheets s
JOIN routes r ON r.id = s.route_id
JOIN tara_moves m ON m.sheet_id = s.id
JOIN staff st ON st.id = m.driver_id
JOIN tara_types t ON t.id = m.tara_id
GROUP BY s.id, m.driver_id, t.id;

-- Ящики на складе = всего в обороте − за водителями − утеряно
CREATE VIEW IF NOT EXISTS v_tara_stock AS
SELECT t.id AS tara_id, t.name, t.total,
       COALESCE(SUM(m.qty), 0) AS at_drivers,
       COALESCE(-SUM(CASE WHEN m.kind = 'writeoff' THEN m.qty END), 0) AS lost,
       t.total - COALESCE(SUM(m.qty), 0) - COALESCE(-SUM(CASE WHEN m.kind = 'writeoff' THEN m.qty END), 0) AS in_stock
FROM tara_types t
LEFT JOIN tara_moves m ON m.tara_id = t.id
GROUP BY t.id;
