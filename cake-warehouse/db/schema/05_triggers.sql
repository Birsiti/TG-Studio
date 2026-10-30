-- изменено 2026-10-17 01:30
-- Защита учёта: ящики только водителю и не ниже нуля, журнал не правится, заявка — в сводную своего маршрута.

-- Ящики выдаются только водителю
CREATE TRIGGER IF NOT EXISTS trg_tara_driver_role BEFORE INSERT ON tara_moves
WHEN (SELECT role FROM staff WHERE id = NEW.driver_id) IS NOT 'driver'
BEGIN SELECT RAISE(ABORT, 'Ящики числятся только за водителем'); END;

-- Вернуть или списать больше, чем на руках, нельзя
CREATE TRIGGER IF NOT EXISTS trg_tara_not_below_zero BEFORE INSERT ON tara_moves
WHEN NEW.kind IN ('back', 'writeoff') AND
     COALESCE((SELECT SUM(qty) FROM tara_moves WHERE driver_id = NEW.driver_id AND tara_id = NEW.tara_id), 0) + NEW.qty < 0
BEGIN SELECT RAISE(ABORT, 'У водителя на руках меньше ящиков'); END;

-- Журнал нельзя править задним числом: только новые записи
CREATE TRIGGER IF NOT EXISTS trg_stock_moves_no_update BEFORE UPDATE ON stock_moves
BEGIN SELECT RAISE(ABORT, 'Журнал движений не редактируется — сделайте корректировку (adjust)'); END;
CREATE TRIGGER IF NOT EXISTS trg_stock_moves_no_delete BEFORE DELETE ON stock_moves
BEGIN SELECT RAISE(ABORT, 'Журнал движений не удаляется — сделайте корректировку (adjust)'); END;
CREATE TRIGGER IF NOT EXISTS trg_tara_moves_no_update BEFORE UPDATE ON tara_moves
BEGIN SELECT RAISE(ABORT, 'Журнал тары не редактируется'); END;
CREATE TRIGGER IF NOT EXISTS trg_tara_moves_no_delete BEFORE DELETE ON tara_moves
BEGIN SELECT RAISE(ABORT, 'Журнал тары не удаляется'); END;

-- Заявку в сводную можно положить только своего маршрута и своей даты
CREATE TRIGGER IF NOT EXISTS trg_orders_sheet_match BEFORE UPDATE OF sheet_id ON orders
WHEN NEW.sheet_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM route_sheets s WHERE s.id = NEW.sheet_id AND s.route_id = NEW.route_id AND s.date = NEW.date)
BEGIN SELECT RAISE(ABORT, 'Сводная другого маршрута или даты'); END;
