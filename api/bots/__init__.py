# изменено 2026-10-08 02:30
"""Реестр ботов: имя в URL /api/<имя> → объект Bot."""
from bots.carwash import bot as carwash
from bots.toolrent import bot as toolrent

BOTS = {b.name: b for b in (carwash, toolrent)}
