-- изменено 2026-10-16 22:00
-- СГЕНЕРИРОВАНО build_seed.py — правьте генератор, а не этот файл.
-- Ассортимент: api/bots/cake.py (CATALOG). Заказчики, точки, заявки: фото от 17.10.2026 (../source/).
PRAGMA foreign_keys = ON;
BEGIN;

INSERT INTO categories (id, name, sort) VALUES
  (1, 'Торт', 0),
  (2, 'Венский десерт', 1),
  (3, 'Пирожное', 2),
  (4, 'Набор пирожных', 3),
  (5, 'Сладости мучные', 4);

INSERT INTO products (id, category_id, name, weight_g, is_weighted, sort) VALUES
  (1, 1, 'Муравейка', 550, 0, 1),
  (2, 1, 'Грильяжный', 800, 0, 2),
  (3, 1, 'Домашний', 850, 0, 3),
  (4, 1, 'Йогуртовый с персиком', 950, 0, 4),
  (5, 1, 'Лесная ягодка', 1000, 0, 5),
  (6, 1, 'Лаванда', 850, 0, 6),
  (7, 1, 'Наполеон домашний', 1000, 0, 7),
  (8, 1, 'Панчо', 1000, 0, 8),
  (9, 1, 'Полесье', 1000, 0, 9),
  (10, 1, 'Смородинка', 850, 0, 10),
  (11, 1, 'Смородинка', 1300, 1, 11),
  (12, 1, 'Съешь меня карамельный', 500, 0, 12),
  (13, 1, 'Съешь меня карамельный', 950, 1, 13),
  (14, 1, 'Съешь меня трюфельный', 500, 0, 14),
  (15, 1, 'Творожный «Фруктовый»', 950, 0, 15),
  (16, 1, 'Творожный «Бруснично-грушевый»', 1000, 0, 16),
  (17, 1, 'Творожный «Блуберри»', 1000, 0, 17),
  (18, 1, 'Юбилейный', 1000, 0, 18),
  (19, 1, 'Вкус наслаждения', 500, 1, 19),
  (20, 1, 'Трюфельный', 1500, 1, 20),
  (21, 1, 'Царское удовольствие', 900, 0, 21),
  (22, 1, 'Какао-пломбир', 900, 0, 22),
  (23, 1, 'Шокобанан', 1000, 0, 23),
  (24, 1, 'Вкусненький', 1000, 0, 24),
  (25, 1, 'Пражский', 1000, 0, 25),
  (26, 1, 'Санкт-Петербург', 1000, 0, 26),
  (27, 1, 'Санкт-Петербург', 2000, 1, 27),
  (28, 1, 'Ассорти «Трио»', 2000, 1, 28),
  (29, 1, 'Дамские пальчики', 1000, 0, 29),
  (30, 1, 'Клубника-банан', 850, 0, 30),
  (31, 1, 'Крещатик', 1000, 0, 31),
  (32, 1, 'Кучерявый', 1000, 0, 32),
  (33, 1, 'Кучерявый', 1500, 1, 33),
  (34, 1, 'Лакомка', 900, 0, 34),
  (35, 1, 'Экзотик', 1500, 1, 35),
  (36, 1, 'Баунти', 1000, 0, 36),
  (37, 1, 'Вишня в шоколаде', 1000, 1, 37),
  (38, 2, 'Клубника, ананас', 620, 0, 38),
  (39, 2, 'Вишня в коньяке', 620, 0, 39),
  (40, 2, 'Клубничный', 620, 0, 40),
  (41, 2, 'Голубичный', 600, 0, 41),
  (42, 2, 'Ягодная поляна', 600, 0, 42),
  (43, 2, 'Киви, персик', 600, 0, 43),
  (44, 2, 'Вишня, малина, ежевика, голубика', 600, 0, 44),
  (45, 2, 'Голубика, ежевика, малина', 600, 0, 45),
  (46, 2, 'Манго, папайя', 620, 0, 46),
  (47, 2, 'Тропический', 620, 0, 47),
  (48, 2, 'Фруктовый коктейль', 620, 0, 48),
  (49, 3, 'Картошка с натур. сгущ.', 390, 0, 49),
  (50, 3, 'Картошка', 360, 0, 50),
  (51, 3, 'Фисташковое', 470, 0, 51),
  (52, 3, 'Шоколадно-банановое', 360, 0, 52),
  (53, 3, 'Муравейка', 450, 0, 53),
  (54, 3, 'Пражское', 360, 0, 54),
  (55, 3, 'Эклер на сливочном масле', 250, 0, 55),
  (56, 3, 'Клубника-маракуйя', 360, 0, 56),
  (57, 3, 'Лакомка', 420, 0, 57),
  (58, 3, 'Пломбир в шоколаде', 250, 0, 58),
  (59, 3, 'Кольцо творожное, заварное', 250, 0, 59),
  (60, 3, 'Кольцо заварное сметанное', 250, 0, 60),
  (61, 3, 'Заварное с варёной сгущёнкой', 265, 0, 61),
  (62, 3, 'Клубничное наслаждение', 380, 0, 62),
  (63, 3, 'Юмбрик творожный', 240, 0, 63),
  (64, 3, 'Лаванда', 470, 0, 64),
  (65, 3, 'Эклер заварной', 75, 1, 65),
  (66, 3, 'Эклер творожный', 75, 1, 66),
  (67, 3, 'Ёж ореховый', 80, 1, 67),
  (68, 3, 'Медок', 75, 1, 68),
  (69, 3, 'Рафаэлка', 50, 1, 69),
  (70, 4, 'Рафаэлка', 200, 0, 70),
  (71, 4, 'Эклер творожный', 300, 0, 71),
  (72, 4, 'Эклер заварной', 300, 0, 72),
  (73, 4, 'Медок', 300, 0, 73),
  (74, 4, 'Ёж ореховый', 400, 0, 74),
  (75, 4, 'Царское удовольствие', 250, 0, 75),
  (76, 4, 'Царское удовольствие с орехом', 250, 0, 76),
  (77, 4, 'Наполеон', 225, 0, 77),
  (78, 4, 'Вишня в шоколаде', 340, 0, 78),
  (79, 4, 'Honey Бум нутелла', 310, 0, 79),
  (80, 4, 'Honey Бум солёная карамель', 310, 0, 80),
  (81, 4, 'Honey Бум фисташка', 310, 0, 81),
  (82, 4, 'Заварные пирожные', 256, 0, 82),
  (83, 5, 'Птичье молоко фрукт ассорти', 350, 0, 83),
  (84, 5, 'Птичье молоко', 500, 0, 84),
  (85, 5, 'Эстерхази', 850, 0, 85),
  (86, 5, 'Эстерхази', 425, 0, 86),
  (87, 5, 'Сникерс', 800, 0, 87),
  (88, 5, 'Сникерс', 400, 0, 88),
  (89, 5, 'Сказка', 650, 0, 89),
  (90, 5, 'Сластена', 800, 0, 90),
  (91, 5, 'Маффин шоколадный', 70, 1, 91),
  (92, 5, 'Вафельная трубочка с вар. сгущ.', 65, 0, 92),
  (93, 5, 'Рулет бисквитный «Мохито»', 500, 0, 93),
  (94, 5, 'Рулет бисквитный «Нежная лаванда»', 500, 1, 94);

INSERT INTO routes (id, name, sort) VALUES
  (1, 'Маршрут 2', 0),
  (2, 'Маршрут 3', 1);

INSERT INTO customers (id, name) VALUES
  (1, 'Чистые родники ООО'),
  (2, 'Санта Ритейл'),
  (3, 'Белвиллесден ИУП'),
  (4, 'АльБах'),
  (5, 'Гурманика'),
  (6, 'Белмаркеткомпани ООО'),
  (7, 'Либретик ООО'),
  (8, 'Доброном');

INSERT INTO points (id, customer_id, route_id, store_code, address, delivery_from, delivery_to, note) VALUES
  (1, 1, 1, NULL, 'г. Минск, ул. Ложинская, 14-2', NULL, NULL, NULL),
  (2, 1, 1, NULL, 'г. Минск, ул. Мирошниченко, д. 3', NULL, NULL, NULL),
  (3, 2, 1, NULL, 'г. Минск, пр-т Независимости, 179/2', NULL, NULL, NULL),
  (4, 3, 1, NULL, 'г. Минск, ул. Некрасова, 3а', NULL, NULL, NULL),
  (5, 3, 1, NULL, 'Минская обл., а.г. Лесной, ул. Александрова, д. 15', NULL, NULL, NULL),
  (6, 3, 1, NULL, 'Минская обл., Минский р-н, Боровлянский с/с, 74/1', NULL, NULL, NULL),
  (7, 3, 1, NULL, 'г. Минск, ул. Городецкая, 30', NULL, NULL, NULL),
  (8, 4, 1, NULL, 'Минский р-н, а.г. Лесной, 35, пом. 5, магазин «Вкусняшки»', NULL, NULL, NULL),
  (9, 5, 1, NULL, 'г. Минск, ст. м. Уручье', NULL, '12:00', NULL),
  (10, 6, 1, NULL, 'а.г. Колодищи, ул. Минская, д. 5', NULL, NULL, NULL),
  (11, 7, 1, NULL, 'д. Боровляны, ул. 40 лет Победы, д. 21Д', NULL, NULL, NULL),
  (12, 7, 1, NULL, 'г. Минск, ул. Калиновского, 66А', NULL, NULL, NULL),
  (13, 3, 2, NULL, 'г. Минск, пр-т Партизанский, 150А', NULL, NULL, NULL),
  (14, 3, 2, NULL, 'г. Минск, пр-т Партизанский, д. 79', NULL, NULL, NULL),
  (15, 8, 2, '3104', 'г. Минск, пр-т Дзержинского, д. 90/405', NULL, NULL, NULL),
  (16, 8, 2, '2865', 'г. Минск, ул. Г. Якубова, д. 58', NULL, NULL, NULL),
  (17, 8, 2, '2678', 'г. Минск, ул. Маяковского, д. 115/2', NULL, NULL, NULL),
  (18, 2, 2, NULL, 'г. Минск, ул. Рафиева, д. 64', NULL, NULL, NULL),
  (19, 2, 2, NULL, 'г. Минск, ул. Илимская, д. 27', NULL, NULL, NULL),
  (20, 2, 2, NULL, 'г. Минск, ул. Чкалова, д. 36', NULL, NULL, NULL),
  (21, 2, 2, NULL, 'г. Минск, ул. Кижеватова, д. 72/1', NULL, NULL, NULL),
  (22, 2, 2, NULL, 'г. Минск, пр-т Рокоссовского, 145', NULL, NULL, NULL),
  (23, 7, 2, NULL, 'Минская обл., пос. Юбилейный, ул. Полевая, д. 15', NULL, NULL, NULL),
  (24, 6, 2, NULL, 'г. Минск, ул. Связистов, 13', NULL, NULL, NULL);

INSERT INTO tara_types (id, name, total) VALUES
  (1, 'Ящик', 0),
  (2, 'Стопка', 0);  -- сколько в обороте — уточнить у клиента

-- Заявка № 1103561 · Маршрут 2
INSERT INTO orders (id, number, date, point_id, route_id, comment) VALUES (1, '1103561', '2026-10-17', 1, 1, NULL);
INSERT INTO order_lines (order_id, line_no, product_id, qty, places, is_bonus) VALUES
  (1, 1, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Пирожное' AND p.name = 'Муравейка' AND p.weight_g = 450), 2, 2, 0),
  (1, 2, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Пирожное' AND p.name = 'Пражское' AND p.weight_g = 360), 2, 2, 0),
  (1, 3, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Пирожное' AND p.name = 'Фисташковое' AND p.weight_g = 470), 2, 2, 0),
  (1, 4, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Пирожное' AND p.name = 'Эклер на сливочном масле' AND p.weight_g = 250), 2, 2, 0),
  (1, 5, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Набор пирожных' AND p.name = 'Эклер творожный' AND p.weight_g = 300), 2, 2, 0),
  (1, 6, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Сладости мучные' AND p.name = 'Птичье молоко фрукт ассорти' AND p.weight_g = 350), 5, 5, 0),
  (1, 7, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Торт' AND p.name = 'Вкус наслаждения' AND p.weight_g = 500), 1, 1, 0),
  (1, 8, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Торт' AND p.name = 'Съешь меня трюфельный' AND p.weight_g = 500), 1, 1, 0);

-- Заявка № 1103455 · Маршрут 2
INSERT INTO orders (id, number, date, point_id, route_id, comment) VALUES (2, '1103455', '2026-10-17', 11, 1, NULL);
INSERT INTO order_lines (order_id, line_no, product_id, qty, places, is_bonus) VALUES
  (2, 1, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Торт' AND p.name = 'Вкус наслаждения' AND p.weight_g = 500), 5, 5, 0),
  (2, 2, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Пирожное' AND p.name = 'Юмбрик творожный' AND p.weight_g = 240), 10, 10, 0),
  (2, 3, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Торт' AND p.name = 'Съешь меня трюфельный' AND p.weight_g = 500), 5, 5, 0),
  (2, 4, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Сладости мучные' AND p.name = 'Эстерхази' AND p.weight_g = 850), 5, 5, 0),
  (2, 5, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Пирожное' AND p.name = 'Эклер на сливочном масле' AND p.weight_g = 250), 5, 5, 0),
  (2, 6, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Пирожное' AND p.name = 'Клубника-маракуйя' AND p.weight_g = 360), 5, 5, 0),
  (2, 7, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Пирожное' AND p.name = 'Пражское' AND p.weight_g = 360), 5, 5, 0),
  (2, 8, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Пирожное' AND p.name = 'Фисташковое' AND p.weight_g = 470), 10, 10, 0),
  (2, 9, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Пирожное' AND p.name = 'Муравейка' AND p.weight_g = 450), 5, 5, 0),
  (2, 10, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Торт' AND p.name = 'Клубника-банан' AND p.weight_g = 850), 5, 5, 0),
  (2, 11, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Набор пирожных' AND p.name = 'Honey Бум нутелла' AND p.weight_g = 310), 3, 3, 0),
  (2, 12, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Набор пирожных' AND p.name = 'Honey Бум солёная карамель' AND p.weight_g = 310), 3, 3, 0),
  (2, 13, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Набор пирожных' AND p.name = 'Honey Бум фисташка' AND p.weight_g = 310), 2, 2, 0),
  (2, 14, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Сладости мучные' AND p.name = 'Птичье молоко фрукт ассорти' AND p.weight_g = 350), 10, 10, 0);

-- Заявка № 1103462 · Маршрут 2
INSERT INTO orders (id, number, date, point_id, route_id, comment) VALUES (3, '1103462', '2026-10-17', 12, 1, NULL);
INSERT INTO order_lines (order_id, line_no, product_id, qty, places, is_bonus) VALUES
  (3, 1, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Пирожное' AND p.name = 'Муравейка' AND p.weight_g = 450), 7, 7, 0),
  (3, 2, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Пирожное' AND p.name = 'Юмбрик творожный' AND p.weight_g = 240), 6, 6, 0),
  (3, 3, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Сладости мучные' AND p.name = 'Птичье молоко фрукт ассорти' AND p.weight_g = 350), 5, 5, 0),
  (3, 4, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Торт' AND p.name = 'Вкус наслаждения' AND p.weight_g = 500), 2, 2, 0);

-- Заявка № 1103342 · Маршрут 3
INSERT INTO orders (id, number, date, point_id, route_id, comment) VALUES (4, '1103342', '2026-10-17', 24, 2, NULL);
INSERT INTO order_lines (order_id, line_no, product_id, qty, places, is_bonus) VALUES
  (4, 1, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Набор пирожных' AND p.name = 'Honey Бум нутелла' AND p.weight_g = 310), 2, 2, 0),
  (4, 2, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Набор пирожных' AND p.name = 'Медок' AND p.weight_g = 300), 2, 2, 0),
  (4, 3, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Набор пирожных' AND p.name = 'Ёж ореховый' AND p.weight_g = 400), 4, 4, 0),
  (4, 4, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Набор пирожных' AND p.name = 'Наполеон' AND p.weight_g = 225), 6, 6, 0),
  (4, 5, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Набор пирожных' AND p.name = 'Рафаэлка' AND p.weight_g = 200), 2, 2, 0),
  (4, 6, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Набор пирожных' AND p.name = 'Эклер творожный' AND p.weight_g = 300), 2, 2, 0),
  (4, 7, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Торт' AND p.name = 'Ассорти «Трио»' AND p.weight_g = 2000), 1, 1, 0),
  (4, 8, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Торт' AND p.name = 'Баунти' AND p.weight_g = 1000), 1, 1, 0),
  (4, 9, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Торт' AND p.name = 'Клубника-банан' AND p.weight_g = 850), 1, 1, 0),
  (4, 10, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Торт' AND p.name = 'Смородинка' AND p.weight_g = 850), 1, 1, 0);

-- Заявка № 1103471 · Маршрут 3
INSERT INTO orders (id, number, date, point_id, route_id, comment) VALUES (5, '1103471', '2026-10-17', 17, 2, NULL);
INSERT INTO order_lines (order_id, line_no, product_id, qty, places, is_bonus) VALUES
  (5, 1, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Набор пирожных' AND p.name = 'Наполеон' AND p.weight_g = 225), 3, 3, 0),
  (5, 2, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Торт' AND p.name = 'Наполеон домашний' AND p.weight_g = 1000), 1, 1, 0),
  (5, 3, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Торт' AND p.name = 'Смородинка' AND p.weight_g = 850), 1, 1, 0),
  (5, 4, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Торт' AND p.name = 'Баунти' AND p.weight_g = 1000), 1, 1, 0);

-- Заявка № 1103477 · Маршрут 3
INSERT INTO orders (id, number, date, point_id, route_id, comment) VALUES (6, '1103477', '2026-10-17', 21, 2, NULL);
INSERT INTO order_lines (order_id, line_no, product_id, qty, places, is_bonus) VALUES
  (6, 1, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Торт' AND p.name = 'Съешь меня трюфельный' AND p.weight_g = 500), 1, 1, 0);

-- Заявка № 1103487 · Маршрут 3
INSERT INTO orders (id, number, date, point_id, route_id, comment) VALUES (7, '1103487', '2026-10-17', 19, 2, NULL);
INSERT INTO order_lines (order_id, line_no, product_id, qty, places, is_bonus) VALUES
  (7, 1, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Торт' AND p.name = 'Вкус наслаждения' AND p.weight_g = 500), 1, 1, 0),
  (7, 2, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Торт' AND p.name = 'Вкусненький' AND p.weight_g = 1000), 1, 1, 0),
  (7, 3, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Торт' AND p.name = 'Лакомка' AND p.weight_g = 900), 1, 1, 0),
  (7, 4, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Торт' AND p.name = 'Наполеон домашний' AND p.weight_g = 1000), 1, 1, 0),
  (7, 5, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Торт' AND p.name = 'Смородинка' AND p.weight_g = 850), 1, 1, 0),
  (7, 6, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Торт' AND p.name = 'Съешь меня карамельный' AND p.weight_g = 500), 1, 1, 0),
  (7, 7, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Торт' AND p.name = 'Съешь меня трюфельный' AND p.weight_g = 500), 1, 1, 0),
  (7, 8, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Торт' AND p.name = 'Творожный «Бруснично-грушевый»' AND p.weight_g = 1000), 1, 1, 0);

-- Заявка № 1103500 · Маршрут 3
INSERT INTO orders (id, number, date, point_id, route_id, comment) VALUES (8, '1103500', '2026-10-17', 20, 2, NULL);
INSERT INTO order_lines (order_id, line_no, product_id, qty, places, is_bonus) VALUES
  (8, 1, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Торт' AND p.name = 'Съешь меня карамельный' AND p.weight_g = 950), 2, 2, 0),
  (8, 2, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Торт' AND p.name = 'Лакомка' AND p.weight_g = 900), 1, 1, 0);

-- Заявка № 1103549 · Маршрут 3
INSERT INTO orders (id, number, date, point_id, route_id, comment) VALUES (9, '1103549', '2026-10-17', 18, 2, NULL);
INSERT INTO order_lines (order_id, line_no, product_id, qty, places, is_bonus) VALUES
  (9, 1, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Торт' AND p.name = 'Вкус наслаждения' AND p.weight_g = 500), 5, 5, 0),
  (9, 2, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Торт' AND p.name = 'Съешь меня трюфельный' AND p.weight_g = 500), 2, 2, 0);

-- Заявка № 1103609 · Маршрут 3
INSERT INTO orders (id, number, date, point_id, route_id, comment) VALUES (10, '1103609', '2026-10-17', 13, 2, 'Грильяжный — 2 бонуса. Доставка в 14:20');
INSERT INTO order_lines (order_id, line_no, product_id, qty, places, is_bonus) VALUES
  (10, 1, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Набор пирожных' AND p.name = 'Рафаэлка' AND p.weight_g = 200), 10, 10, 0),
  (10, 2, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Торт' AND p.name = 'Кучерявый' AND p.weight_g = 1500), 2, 2, 0),
  (10, 3, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Торт' AND p.name = 'Лаванда' AND p.weight_g = 850), 2, 2, 0),
  (10, 4, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Торт' AND p.name = 'Наполеон домашний' AND p.weight_g = 1000), 2, 2, 0),
  (10, 5, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Торт' AND p.name = 'Творожный «Блуберри»' AND p.weight_g = 1000), 2, 2, 0),
  (10, 6, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Торт' AND p.name = 'Творожный «Бруснично-грушевый»' AND p.weight_g = 1000), 2, 2, 0),
  (10, 7, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Торт' AND p.name = 'Юбилейный' AND p.weight_g = 1000), 2, 2, 0),
  (10, 8, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Набор пирожных' AND p.name = 'Наполеон' AND p.weight_g = 225), 3, 3, 0),
  (10, 9, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Торт' AND p.name = 'Ассорти «Трио»' AND p.weight_g = 2000), 2, 2, 0),
  (10, 10, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Торт' AND p.name = 'Вишня в шоколаде' AND p.weight_g = 1000), 1, 1, 0),
  (10, 11, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Торт' AND p.name = 'Вкусненький' AND p.weight_g = 1000), 2, 2, 0),
  (10, 12, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Торт' AND p.name = 'Клубника-банан' AND p.weight_g = 850), 2, 2, 0),
  (10, 13, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Торт' AND p.name = 'Крещатик' AND p.weight_g = 1000), 2, 2, 0),
  (10, 14, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Торт' AND p.name = 'Кучерявый' AND p.weight_g = 1000), 2, 2, 0),
  (10, 15, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Торт' AND p.name = 'Лесная ягодка' AND p.weight_g = 1000), 2, 2, 0),
  (10, 16, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Торт' AND p.name = 'Пражский' AND p.weight_g = 1000), 2, 2, 0),
  (10, 17, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Торт' AND p.name = 'Смородинка' AND p.weight_g = 850), 2, 2, 0),
  (10, 18, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Торт' AND p.name = 'Смородинка' AND p.weight_g = 1300), 2, 2, 0),
  (10, 19, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Торт' AND p.name = 'Съешь меня карамельный' AND p.weight_g = 950), 2, 2, 0),
  (10, 20, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Торт' AND p.name = 'Трюфельный' AND p.weight_g = 1500), 2, 2, 0),
  (10, 21, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Торт' AND p.name = 'Экзотик' AND p.weight_g = 1500), 2, 2, 0),
  (10, 22, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Торт' AND p.name = 'Грильяжный' AND p.weight_g = 800), 2, 2, 1);

-- Заявка № 1103617 · Маршрут 3
INSERT INTO orders (id, number, date, point_id, route_id, comment) VALUES (11, '1103617', '2026-10-17', 15, 2, NULL);
INSERT INTO order_lines (order_id, line_no, product_id, qty, places, is_bonus) VALUES
  (11, 1, (SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Набор пирожных' AND p.name = 'Наполеон' AND p.weight_g = 225), 6, 6, 0);

COMMIT;
