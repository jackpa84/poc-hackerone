#!/usr/bin/env python3
"""
fuzzer.py — HTTP Fuzzer com IA integrada
Funciona com Python puro + requests + (opcional) openai/anthropic para análise

Instalação:
    pip install requests colorama

Uso:
    # Fuzzing de diretórios
    python3 fuzzer.py dir -u https://site.com -w wordlists/dirs.txt

    # Fuzzing de parâmetros GET
    python3 fuzzer.py param -u "https://site.com/search?q=FUZZ" -w wordlists/params.txt

    # Fuzzing de subdomain
    python3 fuzzer.py sub -u https://FUZZ.site.com -w wordlists/subdomains.txt

    # Gerar wordlists com IA
    python3 fuzzer.py wordlist --topic "e-commerce checkout"
"""

import argparse
import sys
import time
import json
import threading
from queue import Queue
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

try:
    import requests
    requests.packages.urllib3.disable_warnings()
except ImportError:
    print("[-] Instale: pip install requests")
    sys.exit(1)


# ─── Cores ──────────────────────────────────────────────────────────────────
class C:
    GREEN  = "\033[92m"
    YELLOW = "\033[93m"
    RED    = "\033[91m"
    CYAN   = "\033[96m"
    GRAY   = "\033[90m"
    BOLD   = "\033[1m"
    RESET  = "\033[0m"

STATUS_COLORS = {
    2: C.GREEN,   # 2xx — interessante!
    3: C.CYAN,    # 3xx — redirecionamento
    4: C.GRAY,    # 4xx — não encontrado (maioria)
    5: C.RED,     # 5xx — erro no servidor (muito interessante!)
}

def color_status(code: int) -> str:
    col = STATUS_COLORS.get(code // 100, C.RESET)
    return f"{col}{code}{C.RESET}"


# ─── Wordlists embutidas (para testar sem arquivo externo) ──────────────────
BUILTIN_DIRS = [
    "admin", "login", "dashboard", "api", "v1", "v2", "uploads", "files",
    "backup", "config", ".git", ".env", "wp-admin", "phpinfo.php",
    "robots.txt", "sitemap.xml", ".htaccess", "server-status",
    "swagger", "swagger-ui", "api-docs", "graphql", "console",
    "actuator", "health", "metrics", "debug", "test", "staging",
    "old", "bak", "tmp", "temp", "cache", "logs", "log",
]

BUILTIN_PARAMS = [
    "id", "user", "username", "email", "page", "limit", "offset",
    "search", "query", "q", "file", "path", "url", "redirect",
    "next", "return", "callback", "token", "key", "api_key",
    "debug", "admin", "role", "action", "cmd", "exec",
]

BUILTIN_SUBS = [
    "www", "mail", "api", "dev", "staging", "beta", "test",
    "admin", "portal", "vpn", "remote", "app", "mobile",
    "cdn", "static", "assets", "media", "img", "images",
    "blog", "shop", "store", "support", "help", "docs",
    "dashboard", "panel", "manage", "internal", "corp",
]


# ─── Resultado de um hit ─────────────────────────────────────────────────────
class Hit:
    def __init__(self, url, status, size, redirect, time_ms):
        self.url      = url
        self.status   = status
        self.size     = size
        self.redirect = redirect
        self.time_ms  = time_ms

    def is_interesting(self) -> bool:
        return self.status in [200, 201, 301, 302, 307, 401, 403, 500, 503]

    def to_dict(self) -> dict:
        return {
            "url":      self.url,
            "status":   self.status,
            "size":     self.size,
            "redirect": self.redirect,
            "time_ms":  self.time_ms,
        }


# ─── Worker de requisições ───────────────────────────────────────────────────
class FuzzWorker(threading.Thread):
    def __init__(self, queue: Queue, results: list, config: dict, lock: threading.Lock):
        super().__init__(daemon=True)
        self.queue   = queue
        self.results = results
        self.config  = config
        self.lock    = lock
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (compatible; BugBountyBot/1.0)"
        })

    def run(self):
        while True:
            item = self.queue.get()
            if item is None:
                break
            self.fuzz(item)
            self.queue.task_done()

    def fuzz(self, url: str):
        try:
            start = time.time()
            resp  = self.session.get(
                url,
                timeout=self.config["timeout"],
                verify=False,
                allow_redirects=False,
            )
            elapsed = int((time.time() - start) * 1000)

            hit = Hit(
                url      = url,
                status   = resp.status_code,
                size     = len(resp.content),
                redirect = resp.headers.get("Location", ""),
                time_ms  = elapsed,
            )

            # Filtra status codes indesejados
            if resp.status_code in self.config["filter_status"]:
                return

            with self.lock:
                self.results.append(hit)
                if hit.is_interesting():
                    self._print_hit(hit)

        except requests.exceptions.ConnectionError:
            pass
        except requests.exceptions.Timeout:
            pass
        except Exception as e:
            pass

    def _print_hit(self, hit: Hit):
        redirect = f" → {hit.redirect}" if hit.redirect else ""
        print(
            f"  {color_status(hit.status)}  "
            f"{hit.size:8d}b  "
            f"{hit.time_ms:5d}ms  "
            f"{hit.url}{C.GRAY}{redirect}{C.RESET}"
        )


# ─── Módulo de IA para análise ───────────────────────────────────────────────
def analyze_with_ai(hits: list[Hit], target: str) -> str:
    """
    Analisa os resultados com IA (Claude ou GPT).
    Requer: pip install anthropic  (ou openai)
    """
    try:
        import anthropic
        client = anthropic.Anthropic()

        hits_text = "\n".join([
            f"- {h.status} | {h.size}b | {h.url}"
            for h in hits if h.is_interesting()
        ][:50])  # limita para não estourar o contexto

        prompt = f"""Você é um especialista em bug bounty. Analise esses resultados de fuzzing HTTP para o alvo {target}:

{hits_text}

Para cada resultado interessante:
1. Explique o que pode indicar
2. Quais vulnerabilidades investigar
3. Próximos passos recomendados

Seja conciso e prático."""

        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}]
        )
        return message.content[0].text

    except ImportError:
        return "Para análise com IA, instale: pip install anthropic"
    except Exception as e:
        return f"Erro na análise com IA: {e}"


def generate_wordlist_with_ai(topic: str) -> list[str]:
    """Gera wordlist customizada usando IA com base no contexto do alvo."""
    try:
        import anthropic
        client = anthropic.Anthropic()

        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            messages=[{
                "role": "user",
                "content": f"""Gere uma wordlist para fuzzing HTTP de um site de {topic}.
Liste apenas os paths/palavras, um por linha, sem explicações.
Inclua: diretórios comuns, endpoints de API, arquivos sensíveis, funcionalidades típicas.
Máximo 100 entradas."""
            }]
        )

        words = [
            line.strip().strip("/").strip("-").strip("•").strip()
            for line in message.content[0].text.splitlines()
            if line.strip() and not line.strip().startswith("#")
        ]
        return [w for w in words if w]

    except ImportError:
        print("[-] Para gerar wordlists com IA: pip install anthropic")
        return []
    except Exception as e:
        print(f"[-] Erro: {e}")
        return []


# ─── Comandos principais ─────────────────────────────────────────────────────
def load_wordlist(path: str | None, builtin: list[str]) -> list[str]:
    if path:
        p = Path(path)
        if not p.exists():
            print(f"[-] Wordlist não encontrada: {path}")
            sys.exit(1)
        words = [l.strip() for l in p.read_text().splitlines() if l.strip()]
        print(f"[*] Wordlist carregada: {len(words)} entradas ({path})")
        return words
    else:
        print(f"[*] Usando wordlist embutida: {len(builtin)} entradas")
        return builtin


def cmd_dir(args):
    """Fuzzing de diretórios."""
    words   = load_wordlist(args.wordlist, BUILTIN_DIRS)
    base    = args.url.rstrip("/")
    targets = [f"{base}/{w}" for w in words]
    run_fuzz(targets, args)


def cmd_param(args):
    """Fuzzing de parâmetros (substitui FUZZ na URL)."""
    if "FUZZ" not in args.url:
        print("[-] Use FUZZ na URL para indicar o ponto de injeção")
        print("    Exemplo: https://site.com/search?q=FUZZ")
        sys.exit(1)
    words   = load_wordlist(args.wordlist, BUILTIN_PARAMS)
    targets = [args.url.replace("FUZZ", w) for w in words]
    run_fuzz(targets, args)


def cmd_sub(args):
    """Fuzzing de subdomínios."""
    if "FUZZ" not in args.url:
        print("[-] Use FUZZ na URL para o subdomínio")
        print("    Exemplo: https://FUZZ.site.com")
        sys.exit(1)
    words   = load_wordlist(args.wordlist, BUILTIN_SUBS)
    targets = [args.url.replace("FUZZ", w) for w in words]
    run_fuzz(targets, args)


def cmd_wordlist(args):
    """Gera wordlist com IA."""
    print(f"[*] Gerando wordlist com IA para: {args.topic}")
    words = generate_wordlist_with_ai(args.topic)
    if words:
        out = args.output or f"wordlist_{args.topic.replace(' ', '_')}.txt"
        Path(out).write_text("\n".join(words))
        print(f"[+] {len(words)} palavras salvas em {out}")
        print("\nPreview:")
        for w in words[:10]:
            print(f"  {w}")
        if len(words) > 10:
            print(f"  ... e mais {len(words)-10}")


def run_fuzz(targets: list[str], args):
    """Executa o fuzzing em paralelo."""
    config = {
        "timeout":       getattr(args, "timeout", 10),
        "filter_status": getattr(args, "filter", [404]),
    }

    results = []
    lock    = threading.Lock()
    queue   = Queue()
    threads = getattr(args, "threads", 20)

    print(f"\n[*] Iniciando fuzzing: {len(targets)} alvos | {threads} threads\n")
    print(f"  {'STATUS':8} {'TAMANHO':10} {'TEMPO':8} URL")
    print(f"  {'─'*60}")

    # Inicia workers
    workers = []
    for _ in range(threads):
        w = FuzzWorker(queue, results, config, lock)
        w.start()
        workers.append(w)

    # Popula fila
    start_time = time.time()
    for t in targets:
        queue.put(t)

    # Envia sinais de parada
    for _ in workers:
        queue.put(None)

    # Aguarda conclusão com progress
    done = 0
    total = len(targets)
    while not queue.empty() or any(w.is_alive() for w in workers):
        current_done = total - queue.qsize()
        if current_done != done:
            done = current_done
            pct  = (done / total) * 100
            sys.stdout.write(f"\r  Progress: {done}/{total} ({pct:.1f}%)   ")
            sys.stdout.flush()
        time.sleep(0.1)

    for w in workers:
        w.join()

    elapsed = time.time() - start_time
    hits    = [r for r in results if r.is_interesting()]

    print(f"\n\n[+] Finalizado em {elapsed:.1f}s")
    print(f"[+] {len(hits)} resultados interessantes de {total} requisições")

    # Salva resultados
    if hits:
        out_file = f"fuzz_{urlparse(targets[0]).netloc}_{datetime.now().strftime('%H%M%S')}.json"
        data = [h.to_dict() for h in hits]
        Path(out_file).write_text(json.dumps(data, indent=2))
        print(f"[+] Resultados salvos em {out_file}")

    # Análise com IA
    if getattr(args, "ai", False) and hits:
        print(f"\n{'─'*50}")
        print("[*] Analisando resultados com IA...")
        analysis = analyze_with_ai(hits, targets[0])
        print(f"\n{analysis}")


# ─── CLI ────────────────────────────────────────────────────────────────────
def main():
    print(f"""
{C.BOLD}{C.CYAN}[ HTTP FUZZER — Bug Bounty Tool ]{C.RESET}
""")

    parser = argparse.ArgumentParser(description="HTTP Fuzzer com suporte a IA")
    sub    = parser.add_subparsers(dest="cmd", required=True)

    # Argumentos comuns
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("-u",  "--url",      required=True)
    common.add_argument("-w",  "--wordlist",  default=None)
    common.add_argument("-t",  "--threads",   type=int, default=20)
    common.add_argument("--timeout",          type=int, default=10)
    common.add_argument("--filter",           type=int, nargs="+", default=[404])
    common.add_argument("--ai",               action="store_true", help="Analisa resultados com IA")

    # Subcomandos
    sub.add_parser("dir",      parents=[common], help="Fuzzing de diretórios")
    sub.add_parser("param",    parents=[common], help="Fuzzing de parâmetros (use FUZZ na URL)")
    sub.add_parser("sub",      parents=[common], help="Fuzzing de subdomínios (use FUZZ na URL)")

    wl = sub.add_parser("wordlist", help="Gerar wordlist com IA")
    wl.add_argument("--topic",  required=True, help="Contexto do alvo (ex: 'e-commerce')")
    wl.add_argument("-o", "--output", default=None)

    args = parser.parse_args()

    dispatch = {
        "dir":      cmd_dir,
        "param":    cmd_param,
        "sub":      cmd_sub,
        "wordlist": cmd_wordlist,
    }
    dispatch[args.cmd](args)


if __name__ == "__main__":
    main()
