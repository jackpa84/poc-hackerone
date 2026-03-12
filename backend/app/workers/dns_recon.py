"""
workers/dns_recon.py — DNS reconnaissance com dnsx

dnsx (projectdiscovery) é uma ferramenta de DNS multi-propósito,
já instalada no container via multi-stage build do Dockerfile.

Descobre registros DNS (A, AAAA, CNAME, MX, TXT, NS, SOA) de um domínio,
identifica misconfigurações e cria findings automáticos.

Exemplo de config do job:
  {
    "domain": "shopify.com",
    "record_types": ["a", "aaaa", "cname", "mx", "txt", "ns", "soa"],
    "wordlist": "subdomains"    # para brute-force de subdomínios via DNS
  }
"""
import asyncio
import logging
from datetime import datetime
from pathlib import Path
from bson import ObjectId

from app.models.job import Job
from app.services.dedup import finding_exists_or_create

logger = logging.getLogger(__name__)

WORDLISTS_DIR = Path("/app/tools/wordlists")

BUILTIN_SUBS = [
    # Web / Apps
    "www", "www1", "www2", "www3", "web", "web1", "web2", "app", "app1", "app2",
    "mobile", "m", "wap", "portal", "portal2", "site", "home",
    # API
    "api", "api1", "api2", "api3", "api-v2", "api-v3", "rest", "graphql", "grpc",
    "gateway", "proxy", "lb", "loadbalancer",
    # Email
    "mail", "mail1", "mail2", "smtp", "imap", "pop", "pop3", "exchange",
    "webmail", "outlook", "mx", "mx1", "mx2", "mta",
    # Dev / Staging
    "dev", "dev1", "dev2", "dev3", "develop", "development", "staging", "stage",
    "stg", "pre", "preprod", "pre-prod", "uat", "qa", "qa1", "qa2",
    "test", "test1", "test2", "testing", "sandbox", "demo", "demo1",
    "beta", "alpha", "canary", "preview", "next", "lab", "labs",
    # Prod
    "prod", "production", "prd", "live", "release",
    # Admin / Management
    "admin", "admin1", "admin2", "administrator", "manage", "management",
    "panel", "cpanel", "whm", "webmin", "dashboard", "console",
    "control", "controlpanel", "backstage",
    # Auth / SSO
    "auth", "auth0", "login", "sso", "oauth", "id", "identity",
    "accounts", "account", "signup", "register", "cas", "adfs", "saml",
    # DNS
    "ns", "ns1", "ns2", "ns3", "ns4", "dns", "dns1", "dns2",
    # VPN / Remote
    "vpn", "vpn1", "vpn2", "remote", "rdp", "ras", "connect",
    "citrix", "anyconnect", "tunnel", "bastion", "jump",
    # CDN / Static
    "cdn", "cdn1", "cdn2", "static", "assets", "media", "images", "img",
    "files", "upload", "uploads", "download", "downloads", "content",
    "resources", "fonts", "css", "js",
    # Docs / Knowledge
    "docs", "doc", "documentation", "wiki", "help", "support", "faq",
    "kb", "knowledge", "blog", "news", "press",
    # Commerce
    "shop", "store", "ecommerce", "cart", "checkout", "payment", "pay",
    "billing", "invoice", "orders",
    # CI/CD / DevOps
    "jenkins", "ci", "cd", "build", "deploy", "release", "pipeline",
    "gitlab", "github", "bitbucket", "gitea", "drone", "bamboo",
    "teamcity", "circleci", "travis", "argo", "argocd",
    # Monitoring / Observability
    "grafana", "kibana", "prometheus", "alertmanager", "datadog",
    "newrelic", "sentry", "monitor", "monitoring", "status",
    "health", "nagios", "zabbix", "splunk", "graylog", "elk",
    "jaeger", "zipkin", "apm",
    # Infrastructure
    "vault", "consul", "nomad", "terraform", "ansible",
    "puppet", "chef", "salt",
    # Message Queues / Cache
    "rabbitmq", "kafka", "redis", "memcached", "mq", "queue",
    "celery", "sidekiq", "bull",
    # Databases
    "db", "db1", "db2", "database", "mysql", "postgres", "postgresql",
    "mongo", "mongodb", "elastic", "elasticsearch", "cassandra",
    "couchdb", "influxdb", "neo4j", "mariadb", "oracle", "mssql",
    "phpmyadmin", "adminer", "pgadmin",
    # File / Storage
    "ftp", "sftp", "s3", "storage", "backup", "backups", "archive",
    "nas", "nfs", "minio", "nextcloud", "owncloud",
    # Containers / Orchestration
    "docker", "registry", "harbor", "k8s", "kubernetes", "rancher",
    "portainer", "swarm", "openshift",
    # Security
    "waf", "firewall", "ids", "ips", "sonar", "sonarqube",
    "fortify", "veracode", "nessus", "qualys",
    # Collaboration
    "jira", "confluence", "slack", "teams", "chat", "meet",
    "zoom", "webex", "calendar", "crm", "erp", "hr",
    "sharepoint", "onedrive", "drive",
    # Corporate / Internal
    "internal", "intranet", "corp", "corporate", "office",
    "staff", "employee", "hr", "finance", "legal",
    # Analytics / Marketing
    "analytics", "tracking", "pixel", "tag", "gtm",
    "ads", "adserver", "marketing", "campaign",
    # Misc services
    "git", "svn", "repo", "packages", "npm", "pip", "maven",
    "artifactory", "nexus", "sonatype",
    "proxy", "squid", "traefik", "nginx", "haproxy", "envoy",
    "api-gateway", "kong", "apisix",
    "cms", "wordpress", "wp", "drupal", "joomla", "magento",
    "autodiscover", "autoconfig", "lyncdiscover",
    "time", "ntp", "ldap", "ad", "kerberos",
    "log", "logs", "syslog", "logstash",
    "search", "solr", "lucene",
    "map", "maps", "geo", "gis",
    "video", "stream", "streaming", "live", "rtmp",
    "voip", "sip", "pbx", "asterisk",
]

DNS_MISCONFIG_INDICATORS = {
    "v=spf1 +all":          ("SPF permissivo (+all)", "medium"),
    "v=spf1 ~all":          ("SPF soft-fail (~all) — pode permitir spoofing", "low"),
    "_dmarc":               None,  # presença de DMARC é bom, ausência é finding
}


async def _run_cmd(cmd: list[str], job: Job, stdin_data: str | None = None) -> list[str]:
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdin=asyncio.subprocess.PIPE if stdin_data else None,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    if stdin_data:
        stdout, _ = await proc.communicate(stdin_data.encode())
        lines = [l.strip() for l in stdout.decode().splitlines() if l.strip()]
    else:
        lines = []
        async for line in proc.stdout:
            text = line.decode().strip()
            if text:
                lines.append(text)
        await proc.wait()

    for text in lines:
        job.logs.append(text)
    if lines and len(job.logs) % 10 == 0:
        await job.save()

    return lines


async def task_run_dns_recon(ctx, job_id: str):
    job = await Job.get(ObjectId(job_id))
    if not job:
        return

    try:
        job.status = "running"
        job.started_at = datetime.utcnow()

        cfg = job.config
        domain = cfg.get("domain", "").lstrip("*.")
        record_types = cfg.get("record_types", ["a", "aaaa", "cname", "mx", "txt", "ns", "soa"])
        wordlist_name = cfg.get("wordlist", "subdomains")

        if not domain or "." not in domain:
            job.status = "failed"
            job.error = "Domínio inválido"
            await job.save()
            return

        job.logs = [f"[dns_recon] Iniciando DNS recon em: {domain}"]
        await job.save()

        all_records: dict[str, list[str]] = {}
        created_findings = 0

        # ── Etapa 1: Resolver registros DNS do domínio ──────────────────
        for rtype in record_types:
            job.logs.append(f"[dnsx] Consultando registros {rtype.upper()} para {domain}...")
            await job.save()

            flag = f"-{rtype}"
            result = await _run_cmd(
                ["dnsx", "-silent", "-resp", flag, "-retry", "2"],
                job,
                stdin_data=domain,
            )
            if result:
                all_records[rtype.upper()] = result
                job.logs.append(f"[dnsx] {rtype.upper()}: {len(result)} registros")
            else:
                job.logs.append(f"[dnsx] {rtype.upper()}: nenhum registro")

        await job.save()

        # ── Etapa 2: Verificar misconfigurações em TXT records ──────────
        job.logs.append("[dns_recon] Verificando misconfigurações DNS...")
        txt_records = all_records.get("TXT", [])

        has_spf = False
        has_dmarc = False
        for record in txt_records:
            upper = record.upper()
            if "V=SPF1" in upper:
                has_spf = True
                if "+ALL" in upper:
                    f = await finding_exists_or_create(
                        user_id=job.user_id,
                        program_id=job.program_id,
                        target_id=job.target_id,
                        job_id=str(job.id),
                        title=f"SPF permissivo (+all) em {domain}",
                        type="other",
                        severity="medium",
                        affected_url=domain,
                        description=(
                            f"O registro SPF de `{domain}` usa `+all`, "
                            f"permitindo que qualquer servidor envie emails em nome do domínio.\n\n"
                            f"Registro encontrado: `{record}`"
                        ),
                        steps_to_reproduce=f"1. Execute: `dig TXT {domain}`\n2. Observe o registro SPF com +all",
                        impact="Permite email spoofing, phishing e bypass de filtros anti-spam.",
                    )
                    if f:
                        created_findings += 1
            if "_DMARC" in upper or "DMARC" in upper:
                has_dmarc = True

        if not has_spf:
            f = await finding_exists_or_create(
                user_id=job.user_id,
                program_id=job.program_id,
                target_id=job.target_id,
                job_id=str(job.id),
                title=f"Registro SPF ausente em {domain}",
                type="other",
                severity="low",
                affected_url=domain,
                description=f"O domínio `{domain}` não possui registro SPF configurado.",
                steps_to_reproduce=f"1. Execute: `dig TXT {domain}`\n2. Note a ausência de registro SPF",
                impact="Sem SPF, emails podem ser forjados em nome do domínio sem restrição.",
            )
            if f:
                created_findings += 1

        # ── Etapa 3: Brute-force de subdomínios via DNS ─────────────────
        job.logs.append("[dns_recon] Brute-force de subdomínios via DNS...")
        await job.save()

        wl_path = WORDLISTS_DIR / f"{wordlist_name}.txt"
        if wl_path.exists():
            words = [l.strip() for l in wl_path.read_text().splitlines() if l.strip()]
        else:
            words = BUILTIN_SUBS

        sub_input = "\n".join(f"{w}.{domain}" for w in words)
        dns_subs = await _run_cmd(
            ["dnsx", "-silent", "-resp", "-a", "-retry", "2"],
            job,
            stdin_data=sub_input,
        )

        resolved_subs = []
        for line in dns_subs:
            if "[" in line:
                host = line.split("[")[0].strip()
                resolved_subs.append(host)

        job.logs.append(f"[dns_recon] {len(resolved_subs)} subdomínios resolvidos via DNS")

        if created_findings:
            job.logs.append(f"[dns_recon] {created_findings} findings de misconfigurações DNS criados")

        job.status = "completed"
        job.finished_at = datetime.utcnow()
        job.result_summary = {
            "records_found": {k: len(v) for k, v in all_records.items()},
            "dns_subdomains": len(resolved_subs),
            "misconfig_findings": created_findings,
        }
        job.logs.append("[dns_recon] Concluído!")
        await job.save()

    except Exception:
        import traceback
        job.status = "failed"
        job.error = traceback.format_exc()
        job.finished_at = datetime.utcnow()
        await job.save()
