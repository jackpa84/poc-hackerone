"""
workers/port_scan.py — Port scanning com naabu

Naabu (projectdiscovery) é um port scanner rápido escrito em Go,
já instalado no container via multi-stage build do Dockerfile.

Fluxo:
  1. Recebe domínio/IP do job config
  2. Executa naabu para descobrir portas abertas
  3. Cria findings automáticos para portas sensíveis (databases, admin panels, etc.)

Exemplo de config do job:
  {
    "target": "shopify.com",
    "ports": "top-100",           # "top-100" | "top-1000" | "full" | "21,22,80,443,3306"
    "rate": 1000,                 # pacotes por segundo
    "scan_type": "s"              # "s" (SYN) | "c" (CONNECT)
  }
"""
import asyncio
import logging
from datetime import datetime
from bson import ObjectId

from app.models.job import Job
from app.services.dedup import finding_exists_or_create

logger = logging.getLogger(__name__)


SENSITIVE_PORTS = {
    21:    ("FTP", "high"),
    22:    ("SSH", "medium"),
    23:    ("Telnet", "high"),
    25:    ("SMTP", "medium"),
    110:   ("POP3", "medium"),
    135:   ("MS-RPC", "high"),
    139:   ("NetBIOS", "high"),
    445:   ("SMB", "high"),
    1433:  ("MSSQL", "high"),
    1521:  ("Oracle DB", "high"),
    2049:  ("NFS", "high"),
    2379:  ("etcd", "critical"),
    3000:  ("Grafana/Dev Server", "medium"),
    3306:  ("MySQL", "high"),
    3389:  ("RDP", "high"),
    4443:  ("Docker Registry", "high"),
    5000:  ("Docker Registry", "high"),
    5432:  ("PostgreSQL", "high"),
    5601:  ("Kibana", "high"),
    5900:  ("VNC", "high"),
    5984:  ("CouchDB", "high"),
    6379:  ("Redis", "critical"),
    6443:  ("Kubernetes API", "critical"),
    8080:  ("HTTP Proxy/Admin", "medium"),
    8443:  ("HTTPS Alt", "low"),
    8888:  ("Jupyter Notebook", "critical"),
    9000:  ("SonarQube/Portainer", "high"),
    9090:  ("Prometheus", "high"),
    9200:  ("Elasticsearch", "high"),
    9300:  ("Elasticsearch Transport", "high"),
    10250: ("Kubelet API", "critical"),
    11211: ("Memcached", "high"),
    15672: ("RabbitMQ Management", "high"),
    27017: ("MongoDB", "critical"),
}

PORT_PRESETS = {
    "top-100":  "-top-ports 100",
    "top-1000": "-top-ports 1000",
    "full":     "-p -",
}


async def _run_naabu(cmd: list[str], job: Job) -> list[str]:
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    lines = []
    async for line in proc.stdout:
        text = line.decode().strip()
        if text:
            lines.append(text)
            job.logs.append(text)
            if len(job.logs) % 10 == 0:
                await job.save()

    await proc.wait()
    return lines


async def task_run_port_scan(ctx, job_id: str):
    job = await Job.get(ObjectId(job_id))
    if not job:
        return

    try:
        job.status = "running"
        job.started_at = datetime.utcnow()

        cfg = job.config
        target = cfg.get("target", "")
        ports = cfg.get("ports", "top-1000")
        rate = cfg.get("rate", 3000)
        scan_type = cfg.get("scan_type", "c")

        if not target:
            job.status = "failed"
            job.error = "Target não especificado"
            await job.save()
            return

        job.logs = [f"[port_scan] Iniciando scan em: {target}"]
        await job.save()

        cmd = ["naabu", "-host", target, "-silent", "-rate", str(rate), "-scan-type", scan_type]

        if ports in PORT_PRESETS:
            cmd.extend(PORT_PRESETS[ports].split())
        else:
            cmd.extend(["-p", ports])

        job.logs.append(f"[port_scan] Comando: naabu -host {target} -rate {rate} -scan-type {scan_type}")
        await job.save()

        raw_lines = await _run_naabu(cmd, job)

        open_ports = []
        for line in raw_lines:
            parts = line.rsplit(":", 1)
            if len(parts) == 2:
                try:
                    port = int(parts[1])
                    host = parts[0]
                    open_ports.append({"host": host, "port": port})
                except ValueError:
                    pass

        job.logs.append(f"[port_scan] {len(open_ports)} portas abertas encontradas")
        await job.save()

        created_findings = 0
        skipped_findings = 0
        for entry in open_ports:
            port = entry["port"]
            host = entry["host"]
            if port in SENSITIVE_PORTS:
                service, severity = SENSITIVE_PORTS[port]
                f = await finding_exists_or_create(
                    user_id=job.user_id,
                    program_id=job.program_id,
                    target_id=job.target_id,
                    job_id=str(job.id),
                    title=f"Porta {port} ({service}) aberta em {host}",
                    type="info_disclosure",
                    severity=severity,
                    affected_url=f"{host}:{port}",
                    description=(
                        f"O host `{host}` possui a porta **{port}** ({service}) aberta e acessível.\n\n"
                        f"Serviços como {service} expostos publicamente podem permitir "
                        f"acesso não autorizado, enumeração ou exploração de vulnerabilidades conhecidas."
                    ),
                    steps_to_reproduce=(
                        f"1. Execute: `nmap -sV -p {port} {host}`\n"
                        f"2. Verifique a versão do serviço\n"
                        f"3. Tente conectar: `nc -zv {host} {port}`"
                    ),
                    impact=f"Exposição do serviço {service} na porta {port} pode levar a acesso não autorizado ou vazamento de informações.",
                )
                if f:
                    created_findings += 1
                else:
                    skipped_findings += 1

        job.logs.append(
            f"[port_scan] {created_findings} findings criados, {skipped_findings} duplicatas ignoradas"
        )

        job.status = "completed"
        job.finished_at = datetime.utcnow()
        job.result_summary = {
            "open_ports": len(open_ports),
            "sensitive_ports": created_findings,
            "ports_list": [e["port"] for e in open_ports[:50]],
        }
        job.logs.append("[port_scan] Concluído!")
        await job.save()

    except Exception:
        import traceback
        job.status = "failed"
        job.error = traceback.format_exc()
        job.finished_at = datetime.utcnow()
        await job.save()
