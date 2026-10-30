-- изменено 2026-10-17 01:30
-- Сводная заявка маршрута на дату = лист сборки и рейс (сборщик, ящики, стопки, водитель).

-- ---------- Сводная заявка маршрута = лист сборки и рейс ----------

CREATE TABLE IF NOT EXISTS route_sheets (
  id           INTEGER PRIMARY KEY,
  route_id     INTEGER NOT NULL REFERENCES routes(id),
  date         TEXT    NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  status       TEXT    NOT NULL DEFAULT 'picking'
               CHECK (status IN ('picking', 'picked', 'shipped', 'closed', 'cancelled')),
  picker_id    INTEGER REFERENCES staff(id),     -- «Сборку осуществил (ФИО)»
  picker_name  TEXT,                             -- если сборщик не в справочнике
  boxes        INTEGER CHECK (boxes  IS NULL OR boxes  >= 0),  -- «Количество ящиков» (при отгрузке → tara_moves out на водителя)
  stacks       INTEGER CHECK (stacks IS NULL OR stacks >= 0),  -- «Количество стопок» (для погрузки, не тара)
  driver_id    INTEGER REFERENCES staff(id),
  created_at   TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
  picked_at    TEXT,
  shipped_at   TEXT,
  closed_at    TEXT,
  UNIQUE (route_id, date)
);
