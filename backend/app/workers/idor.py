"""
workers/idor.py — Teste automatizado de IDOR

Lógica:
  1. Faz requisição com o SEU próprio ID para estabelecer baseline
  2. Testa cada ID do range especificado
  3. Compara tamanho e status da resposta com o baseline
  4. IDs que retornam resposta similar ao baseline = possível IDOR
  5. Cria Finding automático para cada candidato

Exemplo de config do job:
  {
    "url_template": "https://target.com/api/user/FUZZ",
    "method": "GET",
    "id_range": [1, 200],
    "your_id": "42",
    "cookie": "session=abc123",
    "token": "Bearer eyJ..."
  }
"""
import asyncio
import httpx
from datetime import datetime
from bson import ObjectId

from app.models.job import Job
from app.models.finding import Finding


async def task_run_idor_test(ctx, job_id: str):
    job = await Job.get(ObjectId(job_id))
    if not job:
        return

    try:
        job.status = "running"
        job.started_at = datetime.utcnow()

        cfg          = job.config
        url_template = cfg.get("url_template", "")
        method       = cfg.get("method", "GET").upper()
        id_range     = cfg.get("id_range", [1, 50])
        your_id      = cfg.get("your_id")
        cookie       = cfg.get("cookie")
        token        = cfg.get("token")
        body_template = cfg.get("body")  # para POST: '{"user_id":"FUZZ"}'

        if "FUZZ" not in url_template and not body_template:
            job.status = "failed"
            job.error = "url_template não contém FUZZ e body não foi especificado"
            await job.save()
            return

        headers = {}
        if cookie:
            headers["Cookie"] = cookie
        if token:
            headers["Authorization"] = token

        # Gera lista de IDs a testar
        ids = list(range(id_range[0], id_range[1] + 1))
        job.logs = [f"[idor] Iniciando | template: {url_template} | {len(ids)} IDs | seu ID: {your_id}"]
        await job.save()

        # Coleta baseline com SEU id
        baseline = None
        if your_id:
            test_url = url_template.replace("FUZZ", str(your_id))
            async with httpx.AsyncClient(verify=False, follow_redirects=False, timeout=10) as client:
                resp = await client.get(test_url, headers=headers)
                baseline = {"status": resp.status_code, "size": len(resp.content)}
                job.logs.append(f"[idor] Baseline (seu ID={your_id}): status={baseline['status']} size={baseline['size']}b")
                await job.save()

        # Testa cada ID
        semaphore = asyncio.Semaphore(30)
        candidates = []

        async def test_id(id_val):
            async with semaphore:
                try:
                    test_url = url_template.replace("FUZZ", str(id_val))
                    async with httpx.AsyncClient(verify=False, follow_redirects=False, timeout=10) as client:
                        if method == "POST" and body_template:
                            body = body_template.replace("FUZZ", str(id_val))
                            resp = await client.post(test_url, content=body,
                                                     headers={**headers, "Content-Type": "application/json"})
                        else:
                            resp = await client.get(test_url, headers=headers)

                    size = len(resp.content)
                    log = f"[idor] ID={id_val} status={resp.status_code} size={size}b"

                    # Compara com baseline para detectar IDOR
                    is_candidate = False
                    if baseline and str(id_val) != str(your_id):
                        status_match = resp.status_code == baseline["status"] == 200
                        size_similar = abs(size - baseline["size"]) < 200
                        has_content  = size > 50

                        if status_match and size_similar and has_content:
                            log += " ← POSSÍVEL IDOR!"
                            is_candidate = True
                            candidates.append({"id": id_val, "url": test_url, "status": resp.status_code, "size": size})

                    job.logs.append(log)

                except Exception:
                    pass

        await asyncio.gather(*[test_id(i) for i in ids])
        await job.save()

        # Cria findings para os candidatos
        auto_findings = []
        for c in candidates:
            steps = (
                f"1. Faça login com sua conta (ID: {your_id})\n"
                f"2. Acesse: {url_template.replace('FUZZ', str(your_id))}\n"
                f"3. Observe a resposta (tamanho: {baseline['size'] if baseline else 'N/A'}b)\n"
                f"4. Troque o ID para {c['id']}: {c['url']}\n"
                f"5. Observe que o servidor retorna dados de outro usuário (tamanho: {c['size']}b)"
            )
            f = Finding(
                user_id=job.user_id,
                program_id=job.program_id,
                target_id=job.target_id,
                job_id=str(job.id),
                title=f"Possível IDOR em {url_template} (ID: {c['id']})",
                type="idor",
                severity="high",
                affected_url=c["url"],
                parameter="id",
                description=(
                    f"O endpoint `{url_template}` não verifica se o usuário tem permissão "
                    f"para acessar o recurso com ID `{c['id']}`. "
                    f"A resposta para o ID `{c['id']}` é similar ao baseline do ID `{your_id}`, "
                    f"sugerindo acesso a dados de outro usuário."
                ),
                steps_to_reproduce=steps,
                impact=(
                    "Um atacante pode iterar IDs e acessar dados de todos os usuários da plataforma, "
                    "incluindo informações pessoais, financeiras e de negócio."
                ),
            )
            auto_findings.append(f)

        if auto_findings:
            await Finding.insert_many(auto_findings)

        job.status = "completed"
        job.finished_at = datetime.utcnow()
        job.result_summary = {
            "ids_tested": len(ids),
            "candidates": len(candidates),
            "auto_findings": len(auto_findings),
        }
        job.logs.append(f"[idor] Concluído: {len(candidates)} candidatos IDOR encontrados")
        await job.save()

    except Exception as e:
        import traceback
        job.status = "failed"
        job.error = traceback.format_exc()
        job.finished_at = datetime.utcnow()
        await job.save()
