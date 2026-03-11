#!/usr/bin/env python3
"""
recon.py — Pipeline de reconhecimento automatizado
Dependências externas: subfinder, httpx, gau, nuclei
Instale com: go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest
             go install github.com/projectdiscovery/httpx/cmd/httpx@latest
             go install github.com/lc/gau/v2/cmd/gau@latest
             go install github.com/projectdiscovery/nuclei/v2/cmd/nuclei@latest

Uso:
    python3 recon.py -d exemplo.com
    python3 recon.py -d exemplo.com --full
"""

import argparse
import subprocess
import sys
import os
import json
from datetime import datetime
from pathlib import Path


# ─── Cores para terminal ────────────────────────────────────────────────────
class C:
    GREEN  = "\033[92m"
    YELLOW = "\033[93m"
    RED    = "\033[91m"
    CYAN   = "\033[96m"
    BOLD   = "\033[1m"
    RESET  = "\033[0m"

def info(msg):  print(f"{C.CYAN}[*]{C.RESET} {msg}")
def ok(msg):    print(f"{C.GREEN}[+]{C.RESET} {msg}")
def warn(msg):  print(f"{C.YELLOW}[!]{C.RESET} {msg}")
def err(msg):   print(f"{C.RED}[-]{C.RESET} {msg}")
def banner():
    print(f"""
{C.BOLD}{C.CYAN}
  ██████╗ ███████╗ ██████╗ ██████╗ ███╗   ██╗
  ██╔══██╗██╔════╝██╔════╝██╔═══██╗████╗  ██║
  ██████╔╝█████╗  ██║     ██║   ██║██╔██╗ ██║
  ██╔══██╗██╔══╝  ██║     ██║   ██║██║╚██╗██║
  ██║  ██║███████╗╚██████╗╚██████╔╝██║ ╚████║
  ╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═════╝ ╚═╝  ╚═══╝
{C.RESET}  Bug Bounty Recon Pipeline — by você :)
""")


# ─── Verificação de dependências ────────────────────────────────────────────
TOOLS = ["subfinder", "httpx", "gau", "nuclei"]

def check_tools(required: list[str]) -> list[str]:
    missing = []
    for tool in required:
        result = subprocess.run(["which", tool], capture_output=True)
        if result.returncode != 0:
            missing.append(tool)
    return missing


# ─── Execução de comandos ───────────────────────────────────────────────────
def run(cmd: list[str], output_file: str | None = None) -> list[str]:
    """Executa comando e retorna linhas de output."""
    info(f"Executando: {' '.join(cmd)}")
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        lines = [l.strip() for l in result.stdout.splitlines() if l.strip()]

        if output_file:
            Path(output_file).write_text("\n".join(lines))
            ok(f"Salvo em {output_file} ({len(lines)} resultados)")

        if result.returncode != 0 and result.stderr:
            warn(f"stderr: {result.stderr[:200]}")

        return lines
    except subprocess.TimeoutExpired:
        err(f"Timeout ao executar {cmd[0]}")
        return []
    except FileNotFoundError:
        err(f"Ferramenta não encontrada: {cmd[0]}")
        return []


# ─── Etapas do pipeline ─────────────────────────────────────────────────────
def step_subdomains(domain: str, out_dir: str) -> list[str]:
    """Etapa 1: Enumeração de subdomínios com subfinder."""
    print(f"\n{C.BOLD}[ETAPA 1] Enumeração de Subdomínios{C.RESET}")
    out_file = f"{out_dir}/subdomains.txt"
    subs = run(
        ["subfinder", "-d", domain, "-silent", "-all"],
        output_file=out_file
    )
    ok(f"{len(subs)} subdomínios encontrados")
    return subs


def step_live_hosts(subdomains: list[str], out_dir: str) -> list[str]:
    """Etapa 2: Verifica quais subdomínios estão ativos com httpx."""
    print(f"\n{C.BOLD}[ETAPA 2] Verificando Hosts Ativos{C.RESET}")
    if not subdomains:
        warn("Nenhum subdomínio para verificar")
        return []

    subs_file = f"{out_dir}/subdomains.txt"
    out_file  = f"{out_dir}/live_hosts.txt"

    live = run(
        ["httpx", "-l", subs_file, "-silent", "-mc", "200,201,301,302,403",
         "-title", "-tech-detect", "-status-code"],
        output_file=out_file
    )
    ok(f"{len(live)} hosts ativos")
    return live


def step_urls(domain: str, out_dir: str) -> list[str]:
    """Etapa 3: Coleta URLs históricas com gau (GetAllUrls)."""
    print(f"\n{C.BOLD}[ETAPA 3] Coletando URLs Históricas (gau){C.RESET}")
    out_file = f"{out_dir}/urls.txt"
    urls = run(
        ["gau", "--subs", domain],
        output_file=out_file
    )
    ok(f"{len(urls)} URLs coletadas")
    return urls


def step_interesting_urls(urls: list[str], out_dir: str) -> dict:
    """Etapa 4: Filtra URLs interessantes por categoria."""
    print(f"\n{C.BOLD}[ETAPA 4] Filtrando URLs Interessantes{C.RESET}")

    categories = {
        "params":   [],  # URLs com parâmetros (alvo de XSS, SQLi)
        "api":      [],  # Endpoints de API
        "js":       [],  # Arquivos JavaScript
        "login":    [],  # Páginas de login/auth
        "uploads":  [],  # Funcionalidades de upload
        "admin":    [],  # Painéis admin
    }

    keywords = {
        "params":  lambda u: "?" in u,
        "api":     lambda u: "/api/" in u or "/v1/" in u or "/v2/" in u,
        "js":      lambda u: u.endswith(".js"),
        "login":   lambda u: any(k in u.lower() for k in ["login", "signin", "auth", "oauth"]),
        "uploads": lambda u: any(k in u.lower() for k in ["upload", "file", "attach"]),
        "admin":   lambda u: any(k in u.lower() for k in ["admin", "dashboard", "panel"]),
    }

    for url in urls:
        for cat, fn in keywords.items():
            if fn(url):
                categories[cat].append(url)

    for cat, found in categories.items():
        out_file = f"{out_dir}/urls_{cat}.txt"
        if found:
            Path(out_file).write_text("\n".join(found))
            ok(f"  {cat:10s} → {len(found):4d} URLs  ({out_file})")

    return categories


def step_nuclei_scan(live_hosts_file: str, out_dir: str):
    """Etapa 5: Scan de vulnerabilidades conhecidas com nuclei."""
    print(f"\n{C.BOLD}[ETAPA 5] Nuclei — Scan de Vulnerabilidades{C.RESET}")
    out_file = f"{out_dir}/nuclei_results.txt"
    warn("Isso pode demorar alguns minutos...")
    run(
        ["nuclei", "-l", live_hosts_file,
         "-t", "cves/", "-t", "exposures/", "-t", "misconfiguration/",
         "-severity", "medium,high,critical",
         "-o", out_file, "-silent"],
    )


def generate_report(domain: str, out_dir: str, results: dict):
    """Gera relatório JSON final."""
    print(f"\n{C.BOLD}[RELATÓRIO] Gerando sumário{C.RESET}")
    report = {
        "domain":    domain,
        "timestamp": datetime.now().isoformat(),
        "summary":   {k: len(v) for k, v in results.items()},
        "output_dir": out_dir,
    }
    report_file = f"{out_dir}/report.json"
    Path(report_file).write_text(json.dumps(report, indent=2))
    ok(f"Relatório salvo em {report_file}")

    print(f"\n{C.BOLD}{'='*50}")
    print(f"  SUMÁRIO — {domain}")
    print(f"{'='*50}{C.RESET}")
    for k, v in results.items():
        bar = "█" * min(len(v) // 10, 30)
        print(f"  {k:15s} {len(v):5d}  {C.GREEN}{bar}{C.RESET}")
    print()


# ─── Main ───────────────────────────────────────────────────────────────────
def main():
    banner()

    parser = argparse.ArgumentParser(description="Pipeline de Recon para Bug Bounty")
    parser.add_argument("-d", "--domain",  required=True, help="Domínio alvo (ex: exemplo.com)")
    parser.add_argument("--full",          action="store_true", help="Inclui nuclei scan (mais lento)")
    parser.add_argument("-o", "--output",  default=None, help="Diretório de saída (padrão: recon_<domain>)")
    args = parser.parse_args()

    domain  = args.domain
    out_dir = args.output or f"recon_{domain}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    Path(out_dir).mkdir(parents=True, exist_ok=True)

    info(f"Alvo: {C.BOLD}{domain}{C.RESET}")
    info(f"Output: {out_dir}")

    # Verifica ferramentas necessárias
    needed  = TOOLS if args.full else ["subfinder", "httpx", "gau"]
    missing = check_tools(needed)
    if missing:
        err(f"Ferramentas não instaladas: {', '.join(missing)}")
        print("\nInstale com Go:")
        for t in missing:
            print(f"  go install github.com/projectdiscovery/{t}/v2/cmd/{t}@latest")
        print("\nOu via apt (Kali): sudo apt install subfinder httpx-toolkit")
        sys.exit(1)

    # Pipeline
    results = {}

    subdomains           = step_subdomains(domain, out_dir)
    results["subdomains"] = subdomains

    live                 = step_live_hosts(subdomains, out_dir)
    results["live_hosts"] = live

    urls                 = step_urls(domain, out_dir)
    results["urls"]       = urls

    interesting          = step_interesting_urls(urls, out_dir)
    results.update(interesting)

    if args.full:
        step_nuclei_scan(f"{out_dir}/live_hosts.txt", out_dir)

    generate_report(domain, out_dir, results)
    ok("Recon finalizado!")


if __name__ == "__main__":
    main()
