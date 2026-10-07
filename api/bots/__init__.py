# изменено 2026-10-08 02:15
"""Реестр ботов: имя в URL /api/<имя> → объект Bot."""
from bots.carwash import bot as carwash

BOTS = {b.name: b for b in (carwash,)}
