"""Gera os ícones PNG do app (sem dependências externas).

Uso: python3 ferramentas/gerar_icones.py icones/
Desenha o símbolo "%" branco sobre o gradiente do app, com suavização (supersampling).
"""
import math
import os
import struct
import sys
import zlib

C1, C2, C3 = (0x6D, 0x5D, 0xFC), (0xC9, 0x4B, 0xFF), (0xFF, 0x6A, 0x88)


def grad(t):
    if t < 0.5:
        a, b, u = C1, C2, t / 0.5
    else:
        a, b, u = C2, C3, (t - 0.5) / 0.5
    return tuple(a[i] + (b[i] - a[i]) * u for i in range(3))


def dentro_percent(x, y, escala):
    """x, y em [0,1]; True se o ponto pertence ao símbolo %. escala < 1 encolhe o símbolo (área segura)."""
    x = 0.5 + (x - 0.5) / escala
    y = 0.5 + (y - 0.5) / escala
    # dois anéis
    for cx, cy in ((0.33, 0.32), (0.67, 0.68)):
        d = math.hypot(x - cx, y - cy)
        if 0.065 <= d <= 0.125:
            return True
    # barra diagonal de (0.70,0.22) a (0.30,0.78)
    ax, ay, bx, by = 0.70, 0.20, 0.30, 0.80
    vx, vy = bx - ax, by - ay
    t = max(0.0, min(1.0, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)))
    px, py = ax + t * vx, ay + t * vy
    return math.hypot(x - px, y - py) <= 0.045


def dentro_arredondado(x, y, raio):
    """Quadrado de cantos arredondados (raio em fração do lado)."""
    cx = min(max(x, raio), 1 - raio)
    cy = min(max(y, raio), 1 - raio)
    return math.hypot(x - cx, y - cy) <= raio


def icone(n, escala_simbolo, raio_canto):
    ss = 4
    linhas = []
    for j in range(n):
        linha = bytearray([0])
        for i in range(n):
            r = g = b = a = 0.0
            for sj in range(ss):
                for si in range(ss):
                    x = (i + (si + 0.5) / ss) / n
                    y = (j + (sj + 0.5) / ss) / n
                    if raio_canto and not dentro_arredondado(x, y, raio_canto):
                        continue
                    if dentro_percent(x, y, escala_simbolo):
                        cr, cg, cb = 255, 255, 255
                    else:
                        cr, cg, cb = grad((x + y) / 2)
                    r += cr; g += cg; b += cb; a += 1
            k = ss * ss
            if a:
                linha += bytes((round(r / a), round(g / a), round(b / a), round(255 * a / k)))
            else:
                linha += bytes((0, 0, 0, 0))
        linhas.append(bytes(linha))
    return png(n, n, b"".join(linhas))


def png(w, h, dados):
    def bloco(tipo, conteudo):
        c = tipo + conteudo
        return struct.pack(">I", len(conteudo)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)
    return (b"\x89PNG\r\n\x1a\n" + bloco(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
            + bloco(b"IDAT", zlib.compress(dados, 9)) + bloco(b"IEND", b""))


if __name__ == "__main__":
    destino = sys.argv[1]
    os.makedirs(destino, exist_ok=True)
    alvos = [
        ("icone-192.png", 192, 0.92, 0.22),          # "any": cantos arredondados
        ("icone-512.png", 512, 0.92, 0.22),
        ("icone-maskable-512.png", 512, 0.70, 0),    # "maskable": fundo cheio, símbolo na área segura
        ("apple-touch-icon.png", 180, 0.80, 0),      # iOS arredonda sozinho
        ("favicon-32.png", 32, 1.0, 0.22),
    ]
    for nome, n, esc, raio in alvos:
        with open(os.path.join(destino, nome), "wb") as f:
            f.write(icone(n, esc, raio))
        print("ok", nome)
