particle minecraft:heart ~ ~2 ~ 0 0 0 10 100 normal
playsound minecraft:entity.player.levelup ambient @p[distance=..16] ~ ~ ~ 0.2
data remove entity @s CustomName
data merge entity @s {NoAI:0b}
