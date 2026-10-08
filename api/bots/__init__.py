# изменено 2026-10-08 03:10
"""Реестр ботов: имя в URL /api/<имя> → объект Bot."""
from bots.carwash import bot as carwash
from bots.toolrent import bot as toolrent
from bots.versta import bot as versta
from bots.barbershop import bot as barbershop
from bots.most import bot as most

BOTS = {b.name: b for b in (carwash, toolrent, versta, barbershop, most)}
