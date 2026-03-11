#!/usr/bin/env python3
"""
idor_tester.py — Testador automático de IDOR
Uso:
    # Testa IDs numéricos em sequência
    python3 idor_tester.py -u "https://site.com/api/user/FUZZ" --range 1 200

    # Testa com lista de IDs específicos
    python3 idor_tester.py -u "https://site.com/invoice/FUZZ" --ids 100 101 102 999

    # Com cookie de autenticação (necessário na maioria dos casos)
    python3 idor_tester.py -u "https://site.com/api/user/FUZZ" --range 1 50 --cookie "session=abc123"

    # Testa parâmetro no corpo (POST)
    python3 idor_tester.py -u "https://site.com/api/profile" --method POST --body '{"user_id":"FUZZ"}' --range 1 50
"""

import argparse
import json
import sys
import time
import requests
requests.packages.urllib3.disable_warnings()


class C:
    GREEN  = "\033[92m"
    YELLOW = "\033[93m"
    RED    = "\033[91m"
    CYAN   = "\033[96m"
    GRAY   = "\033[90m"
    BOLD   = "\033[1m"
    RESET  = "\033[0m"


def test_idor(url_template, ids, method, body, headers, your_id, delay):
    session  = requests.Session()
    session.headers.update(headers)
    session.headers["User-Agent"] = "Mozilla/5.0"

    results  = []
    baseline = None  # resposta do SEU próprio ID para comparar

    print(f"\n{C.BOLD}Testando IDOR em: {url_template}{C.RESET}")
    print(f"{'─'*60}")
    print(f"  {'ID':>8}  {'STATUS':>7}  {'TAMANHO':>9}  NOTA")
    print(f"  {'─'*50}")

    for id_val in ids:
        target_url = url_template.replace("FUZZ", str(id_val))

        try:
            if method.upper() == "POST":
                body_data = body.replace("FUZZ", str(id_val)) if body else None
                resp = session.post(
                    target_url,
                    data=body_data,
                    headers={"Content-Type": "application/json"},
                    timeout=10,
                    verify=False,
                )
            else:
                resp = session.get(target_url, timeout=10, verify=False)

            size = len(resp.content)

            # Define baseline com o seu próprio ID
            if str(id_val) == str(your_id):
                baseline = {"status": resp.status_code, "size": size}
                nota = f"{C.CYAN}← seu ID (baseline){C.RESET}"

            # Compara com baseline para detectar anomalias
            elif baseline:
                if resp.status_code == 200 and resp.status_code == baseline["status"]:
                    if abs(size - baseline["size"]) < 50:
                        nota = f"{C.GREEN}POSSÍVEL IDOR! Resposta similar ao seu{C.RESET}"
                        results.append({"id": id_val, "url": target_url, "status": resp.status_code, "size": size})
                    elif size > 100:
                        nota = f"{C.YELLOW}retornou dados — verifique manualmente{C.RESET}"
                        results.append({"id": id_val, "url": target_url, "status": resp.status_code, "size": size})
                    else:
                        nota = f"{C.GRAY}vazio{C.RESET}"
                elif resp.status_code == 403:
                    nota = f"{C.GRAY}403 — acesso negado (proteção funcionando){C.RESET}"
                elif resp.status_code == 404:
                    nota = f"{C.GRAY}404 — não existe{C.RESET}"
                else:
                    nota = ""
            else:
                nota = f"{C.YELLOW}(defina --your-id para comparar){C.RESET}" if size > 100 else ""

            col = C.GREEN if resp.status_code == 200 else C.GRAY
            print(f"  {str(id_val):>8}  {col}{resp.status_code:>7}{C.RESET}  {size:>9}b  {nota}")

        except requests.exceptions.ConnectionError:
            print(f"  {str(id_val):>8}  {'ERR':>7}  {'─':>9}  conexão recusada")
        except requests.exceptions.Timeout:
            print(f"  {str(id_val):>8}  {'TMO':>7}  {'─':>9}  timeout")

        if delay:
            time.sleep(delay)

    # Sumário
    print(f"\n{'─'*60}")
    if results:
        print(f"{C.GREEN}{C.BOLD}[!] {len(results)} possíveis IDOR encontrados:{C.RESET}")
        for r in results:
            print(f"    → ID {r['id']}: {r['url']}  ({r['status']} | {r['size']}b)")
        print(f"\n{C.YELLOW}Próximos passos:{C.RESET}")
        print("  1. Abra cada URL no Burp Suite e analise o conteúdo da resposta")
        print("  2. Verifique se contém dados de outro usuário (nome, email, CPF...)")
        print("  3. Se contiver: documente e reporte!")
    else:
        print(f"{C.GRAY}Nenhum IDOR óbvio detectado automaticamente.")
        print(f"Isso não significa que não existe — analise manualmente as respostas.{C.RESET}")


def main():
    parser = argparse.ArgumentParser(description="Testador de IDOR")
    parser.add_argument("-u",  "--url",      required=True, help="URL com FUZZ no lugar do ID")
    parser.add_argument("--range",           type=int, nargs=2, metavar=("MIN", "MAX"), help="Intervalo de IDs (ex: 1 100)")
    parser.add_argument("--ids",             type=str, nargs="+", help="IDs específicos para testar")
    parser.add_argument("--method",          default="GET", choices=["GET", "POST"])
    parser.add_argument("--body",            default=None, help="Body do POST com FUZZ (JSON)")
    parser.add_argument("--cookie",          default=None, help="Cookie de sessão (ex: session=abc123)")
    parser.add_argument("--token",           default=None, help="Bearer token")
    parser.add_argument("--your-id",         default=None, help="Seu próprio ID para usar como baseline")
    parser.add_argument("--delay",           type=float, default=0, help="Delay entre requests (segundos)")
    args = parser.parse_args()

    if "FUZZ" not in args.url:
        print("[-] Coloque FUZZ na URL onde fica o ID")
        print("    Exemplo: https://site.com/api/user/FUZZ")
        sys.exit(1)

    # Monta headers
    headers = {}
    if args.cookie:
        headers["Cookie"] = args.cookie
    if args.token:
        headers["Authorization"] = f"Bearer {args.token}"

    # Monta lista de IDs
    if args.range:
        ids = list(range(args.range[0], args.range[1] + 1))
    elif args.ids:
        ids = args.ids
    else:
        print("[-] Use --range 1 100 ou --ids 10 20 30")
        sys.exit(1)

    test_idor(
        url_template = args.url,
        ids          = ids,
        method       = args.method,
        body         = args.body,
        headers      = headers,
        your_id      = args.your_id,
        delay        = args.delay,
    )


if __name__ == "__main__":
    main()
