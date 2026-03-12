'use client'

import { useState } from 'react'
import {
  ShieldAlert, ChevronDown, ChevronRight,
  Zap, Database, Key, Globe, Search, Code2,
  FileSearch, Network, Lock, Radio, Bug,
  AlertTriangle, CheckCircle2, ExternalLink, Terminal, Shield,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────

interface VulnType {
  id: string
  name: string
  abbr: string
  icon: React.ReactNode
  color: string
  borderColor: string
  bgColor: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'variable'
  cvss: string
  scanner: string
  tool: string
  description: string
  howItWorks: string
  impact: string[]
  detection: string[]
  payloads: { label: string; code: string }[]
  reportTips: string[]
  cwe: string
  owasp: string
}

// ── Data ──────────────────────────────────────────────────────────────────

const VULNS: VulnType[] = [
  {
    id: 'xss',
    name: 'Cross-Site Scripting',
    abbr: 'XSS',
    icon: <Code2 size={18} />,
    color: '#f97316',
    borderColor: '#f9731630',
    bgColor: '#f9731608',
    severity: 'high',
    cvss: '6.1 – 8.8',
    scanner: 'task_run_xss_scan',
    tool: 'dalfox',
    description: 'XSS permite que um atacante injete scripts maliciosos em páginas web visualizadas por outros usuários. O script executa no navegador da vítima com as mesmas permissões do site legítimo.',
    howItWorks: 'O atacante encontra um campo de entrada (parâmetro GET/POST, header, cookie) que reflete conteúdo sem sanitização adequada no HTML. Ao injetar código JavaScript, esse código é executado no contexto do domínio alvo quando a vítima acessa a URL manipulada.',
    impact: [
      'Roubo de cookies de sessão (session hijacking)',
      'Redirecionamento para sites de phishing',
      'Keylogging e captura de credenciais',
      'Modificação do DOM para enganar usuários',
      'Ataques de CSRF forçados via script',
      'Exfiltração de dados sensíveis visíveis na página',
    ],
    detection: [
      'dalfox detecta reflected, DOM-based e blind XSS',
      'Testa parâmetros GET/POST com payloads polimórficos',
      'Verifica headers como Referer, User-Agent e X-Forwarded-For',
      'Análise de respostas HTML para confirmar reflexão não sanitizada',
    ],
    payloads: [
      { label: 'Básico', code: '<script>alert(1)</script>' },
      { label: 'Atributo', code: '" onmouseover="alert(1)' },
      { label: 'DOM', code: 'javascript:alert(document.cookie)' },
      { label: 'Bypass filtro', code: '<img src=x onerror=alert`1`>' },
      { label: 'SVG', code: '<svg onload=alert(1)>' },
    ],
    reportTips: [
      'Demonstre impacto real: roubo de cookie com document.cookie',
      'Mostre que funciona em conta separada (não só no próprio perfil)',
      'Para reflected: forneça a URL completa pronta para clicar',
      'Para stored: mostre o payload persistido e onde aparece',
      'Inclua PoC com cookie capturado ou redirect para domínio seu',
    ],
    cwe: 'CWE-79',
    owasp: 'A03:2021',
  },
  {
    id: 'sqli',
    name: 'SQL Injection',
    abbr: 'SQLi',
    icon: <Database size={18} />,
    color: '#ef4444',
    borderColor: '#ef444430',
    bgColor: '#ef444408',
    severity: 'critical',
    cvss: '7.5 – 10.0',
    scanner: 'task_run_sqli_scan',
    tool: 'sqlmap',
    description: 'SQL Injection permite que um atacante interfira nas queries que uma aplicação faz ao banco de dados. Pode resultar em acesso não autorizado a dados, bypass de autenticação, execução de comandos no servidor e destruição de dados.',
    howItWorks: 'Quando dados fornecidos pelo usuário são inseridos diretamente em queries SQL sem parametrização, o atacante pode alterar a lógica da query. Por exemplo, inserindo um apóstrofo para fechar a string e adicionar lógica SQL adicional.',
    impact: [
      'Dump completo do banco de dados (usuários, senhas, dados pessoais)',
      'Bypass de autenticação (login sem senha)',
      'Leitura/escrita de arquivos no servidor (FILE privilege)',
      'Execução de comandos OS via xp_cmdshell (MSSQL) ou UDF (MySQL)',
      'Destruição de tabelas e dados críticos',
      'Acesso a outros bancos no mesmo servidor',
    ],
    detection: [
      'sqlmap detecta boolean-based, time-based, error-based, union-based e stacked queries',
      'Testa automaticamente todos os parâmetros GET/POST/Cookie',
      'Usa técnicas de blind injection quando erros são suprimidos',
      'Identifica DBMS (MySQL, PostgreSQL, MSSQL, Oracle, SQLite)',
    ],
    payloads: [
      { label: 'Error-based', code: "' OR 1=1 --" },
      { label: 'Union', code: "' UNION SELECT null,username,password FROM users--" },
      { label: 'Time-based', code: "'; WAITFOR DELAY '0:0:5'--" },
      { label: 'Boolean blind', code: "' AND 1=2--" },
      { label: 'Stacked', code: "'; DROP TABLE users--" },
    ],
    reportTips: [
      'Use sqlmap com --dump para mostrar dados reais extraídos (anonimize PII)',
      'Demonstre o DBMS, versão e usuário DB comprometido',
      'Mostre tabelas sensíveis acessíveis (users, passwords, tokens)',
      'Severity crítica se dados de produção ou RCE for possível',
      'Inclua o sqlmap command exato para reprodução',
    ],
    cwe: 'CWE-89',
    owasp: 'A03:2021',
  },
  {
    id: 'idor',
    name: 'Insecure Direct Object Reference',
    abbr: 'IDOR',
    icon: <Key size={18} />,
    color: '#8b5cf6',
    borderColor: '#8b5cf630',
    bgColor: '#8b5cf608',
    severity: 'high',
    cvss: '5.3 – 8.1',
    scanner: 'task_run_idor_test',
    tool: 'custom (IDOR tester)',
    description: 'IDOR ocorre quando uma aplicação usa um identificador controlável pelo usuário (ID, UUID, username) para acessar objetos diretamente, sem verificar se o usuário tem permissão para aquele objeto específico.',
    howItWorks: 'A aplicação expõe IDs de objetos (numéricos sequenciais, UUIDs, nomes de arquivo) em URLs ou parâmetros. Ao alterar esse ID para o de outro usuário, o atacante consegue acessar, modificar ou deletar dados que não lhe pertencem.',
    impact: [
      'Acesso a dados privados de outros usuários (PII, mensagens, documentos)',
      'Modificação de dados de terceiros (endereço, senha, email)',
      'Deleção de recursos alheios (arquivos, contas, pedidos)',
      'Acesso a funcionalidades administrativas via ID manipulation',
      'Exposição de dados médicos, financeiros ou legais',
    ],
    detection: [
      'Testa troca de IDs entre contas criadas para o teste',
      'Verifica endpoints com parâmetros numéricos sequenciais',
      'Testa operações CRUD (GET, PUT, PATCH, DELETE) com IDs alheios',
      'Analisa respostas para confirmar acesso cross-account',
    ],
    payloads: [
      { label: 'ID sequencial', code: 'GET /api/users/1337/profile' },
      { label: 'UUID swap', code: 'GET /api/orders/uuid-conta-B' },
      { label: 'Path traversal', code: 'GET /download?file=../user2/doc.pdf' },
      { label: 'POST body', code: '{"user_id": 9999, "action": "delete"}' },
    ],
    reportTips: [
      'Use duas contas reais para demonstrar o acesso cross-account',
      'Mostre que a conta A acessa dados da conta B sem autorização',
      'Inclua request/response completos (curl ou Burp) de ambas as contas',
      'Calcule impacto: quantos usuários afetados? dados PII expostos?',
      'IDOR em operações de escrita (PUT/DELETE) vale severity mais alta',
    ],
    cwe: 'CWE-639',
    owasp: 'A01:2021',
  },
  {
    id: 'ssrf',
    name: 'Server-Side Request Forgery',
    abbr: 'SSRF',
    icon: <Globe size={18} />,
    color: '#06b6d4',
    borderColor: '#06b6d430',
    bgColor: '#06b6d408',
    severity: 'high',
    cvss: '7.2 – 9.8',
    scanner: 'task_run_recon',
    tool: 'nuclei (ssrf templates)',
    description: 'SSRF permite que um atacante induza o servidor a fazer requisições para destinos arbitrários — incluindo serviços internos da rede, metadados de cloud (AWS IMDSv1) e outros servidores inacessíveis diretamente pelo atacante.',
    howItWorks: 'A aplicação aceita uma URL fornecida pelo usuário e realiza uma requisição HTTP server-side (ex: preview de links, webhook, importação de imagem por URL). O atacante substitui a URL por endereços internos como 169.254.169.254 (AWS metadata) ou localhost:6379 (Redis).',
    impact: [
      'Acesso a metadados de cloud (IAM credentials, instance ID, user-data)',
      'Port scan e discovery de serviços internos (Redis, Elasticsearch, MongoDB)',
      'Bypass de firewalls e whitelists de IP',
      'Leitura de arquivos internos via file:// protocol',
      'Pivoting para RCE em serviços internos vulneráveis',
      'AWS: roubo de credenciais temporárias via IMDSv1',
    ],
    detection: [
      'nuclei usa templates ssrf com Burp Collaborator / interactsh',
      'Testa parâmetros URL (url=, redirect=, src=, href=, webhook=)',
      'Detecta via DNS callback em domínios controlados pelo atacante',
      'Analisa tempo de resposta para blind SSRF (internal vs external)',
    ],
    payloads: [
      { label: 'AWS Metadata', code: 'http://169.254.169.254/latest/meta-data/iam/security-credentials/' },
      { label: 'Localhost', code: 'http://localhost:6379' },
      { label: 'Internal IP', code: 'http://10.0.0.1/admin' },
      { label: 'DNS callback', code: 'http://your.burpcollaborator.net' },
      { label: 'File proto', code: 'file:///etc/passwd' },
    ],
    reportTips: [
      'SSRF com IMDSv1 na AWS é crítico — mostre as IAM credentials obtidas',
      'Para blind SSRF: use interactsh/Burp Collaborator e mostre o DNS hit',
      'Demonstre quais serviços internos são acessíveis',
      'Inclua o response completo do endpoint de metadata',
      'Mencione se IMDSv2 (token) está habilitado (mitiga parcialmente)',
    ],
    cwe: 'CWE-918',
    owasp: 'A10:2021',
  },
  {
    id: 'lfi',
    name: 'Local File Inclusion',
    abbr: 'LFI',
    icon: <FileSearch size={18} />,
    color: '#eab308',
    borderColor: '#eab30830',
    bgColor: '#eab30808',
    severity: 'high',
    cvss: '6.5 – 9.1',
    scanner: 'task_run_dir_fuzz',
    tool: 'nuclei (lfi templates) + ffuf',
    description: 'LFI permite que um atacante inclua arquivos locais do servidor através de parâmetros de entrada não sanitizados. Pode levar à leitura de arquivos sensíveis, exposição de credenciais e potencialmente RCE via log poisoning.',
    howItWorks: 'Parâmetros que referenciam arquivos (page=, file=, template=, lang=) incluem o conteúdo do arquivo no response sem validação. Com path traversal (../), o atacante navega para fora do diretório permitido e acessa arquivos do sistema.',
    impact: [
      'Leitura de /etc/passwd, /etc/shadow (Linux)',
      'Leitura de arquivos de configuração com credenciais de DB',
      'Acesso a chaves SSH privadas e certificados',
      'Exposição de código-fonte da aplicação',
      'RCE via log poisoning (injetar código nos logs e incluí-los)',
      'Exfiltração de variáveis de ambiente (.env)',
    ],
    detection: [
      'nuclei com templates lfi testa path traversal em parâmetros comuns',
      'ffuf faz fuzzing de parâmetros com wordlists de path traversal',
      'Detecta padrões de /etc/passwd no response (root:x:0:0)',
      'Testa null byte injection (%00) para bypass de extensão forçada',
    ],
    payloads: [
      { label: 'Basic', code: '?page=../../../../etc/passwd' },
      { label: 'Null byte', code: '?file=../../../etc/passwd%00' },
      { label: 'Encoded', code: '?lang=..%2F..%2F..%2Fetc%2Fpasswd' },
      { label: 'Double encode', code: '?page=..%252F..%252Fetc%252Fpasswd' },
      { label: 'Windows', code: '?file=..\\..\\..\\windows\\win.ini' },
    ],
    reportTips: [
      'Inclua o conteúdo real de /etc/passwd como prova (primeiras linhas)',
      'Se encontrar .env ou config.php com DB credentials, destaque',
      'Demonstre o path traversal step-by-step',
      'Mencione log poisoning se o servidor for Apache/Nginx (escalada para RCE)',
      'Severity sobe para critical se credenciais forem expostas',
    ],
    cwe: 'CWE-98',
    owasp: 'A03:2021',
  },
  {
    id: 'open_redirect',
    name: 'Open Redirect',
    abbr: 'Redirect',
    icon: <ExternalLink size={18} />,
    color: '#10b981',
    borderColor: '#10b98130',
    bgColor: '#10b98108',
    severity: 'low',
    cvss: '3.1 – 6.1',
    scanner: 'task_run_recon',
    tool: 'nuclei (redirect templates)',
    description: 'Open Redirect ocorre quando uma aplicação aceita uma URL controlável pelo usuário e redireciona o browser para ela sem validação. Usado primariamente para phishing, abusando da confiança do domínio legítimo.',
    howItWorks: 'Parâmetros como redirect=, next=, return=, url=, goto= recebem uma URL e redirecionam o usuário. Sem validação de domínio permitido, o atacante envia um link para o domínio legítimo que redireciona para seu site malicioso.',
    impact: [
      'Phishing credencial usando o domínio confiável como vetor',
      'Bypass de referer checks em fluxos OAuth',
      'Redirecionamento para malware ou drive-by downloads',
      'Combinado com XSS para contornar CSP',
      'Abuso em fluxos de login (redirect após auth para site malicioso)',
    ],
    detection: [
      'nuclei testa parâmetros redirect com domínios externos',
      'Detecta HTTP 301/302 apontando para domínio não relacionado',
      'Testa variações de URL: //evil.com, /\\evil.com, https://evil.com',
    ],
    payloads: [
      { label: 'Direto', code: '?next=https://evil.com' },
      { label: 'Protocol-relative', code: '?redirect=//evil.com' },
      { label: 'Backslash', code: '?url=/\\evil.com' },
      { label: 'Encoded', code: '?goto=https%3A%2F%2Fevil.com' },
      { label: 'Subdomain', code: '?return=https://target.com.evil.com' },
    ],
    reportTips: [
      'Demonstre o redirect para um domínio que você controla',
      'Mostre um cenário de phishing realista (página de login falsa)',
      'Severity sobe para medium/high se combinado com OAuth ou token leak',
      'H1 frequentemente aceita apenas se há impacto demonstrável além do redirect puro',
      'Inclua o link completo e o destino do redirect como PoC',
    ],
    cwe: 'CWE-601',
    owasp: 'A01:2021',
  },
  {
    id: 'info_disclosure',
    name: 'Information Disclosure',
    abbr: 'InfoDisc',
    icon: <Search size={18} />,
    color: '#a855f7',
    borderColor: '#a855f730',
    bgColor: '#a855f708',
    severity: 'variable',
    cvss: '2.5 – 7.5',
    scanner: 'task_run_js_analysis + task_run_secret_scan',
    tool: 'gitleaks + nuclei + katana',
    description: 'Exposição acidental de informações sensíveis: chaves de API, secrets, tokens, dados pessoais de usuários, estrutura interna da aplicação, credenciais em código-fonte ou em arquivos acessíveis publicamente.',
    howItWorks: 'Secrets são commitados em repositórios Git públicos, hardcoded em JavaScript do frontend, expostos em endpoints de debug, vazados em respostas de API, presentes em arquivos de configuração ou backup acessíveis (.env.bak, config.json, .git/).',
    impact: [
      'Credenciais de cloud (AWS, GCP) levando a comprometimento total',
      'Chaves de API de serviços de pagamento (Stripe, PayPal)',
      'JWT secrets permitindo forjamento de tokens',
      'Tokens de acesso a repositórios e CI/CD',
      'Dados pessoais (PII) de usuários expostos',
      'Stack traces revelando tecnologia, versão e paths internos',
    ],
    detection: [
      'gitleaks escaneia repositórios Git com regex de secrets conhecidos',
      'katana crawla e analisa arquivos JS em busca de chaves hardcoded',
      'nuclei testa endpoints comuns (.env, .git/config, phpinfo, debug)',
      'Busca por padrões: AKIA* (AWS), sk_live_* (Stripe), ghp_* (GitHub)',
    ],
    payloads: [
      { label: 'Config exposto', code: 'GET /.env' },
      { label: 'Git exposto', code: 'GET /.git/config' },
      { label: 'PHP info', code: 'GET /phpinfo.php' },
      { label: 'Backup', code: 'GET /backup.zip' },
      { label: 'Swagger', code: 'GET /api/swagger.json' },
    ],
    reportTips: [
      'Revogue imediatamente as credenciais encontradas antes de reportar',
      'Mostre o secret encontrado (parcialmente ofuscado) e onde estava',
      'Demonstre que o secret funciona (API call bem-sucedida)',
      'Severity depende do tipo: AWS key = critical, debug info = low',
      'Inclua o arquivo/URL onde o secret foi encontrado',
    ],
    cwe: 'CWE-200',
    owasp: 'A02:2021',
  },
  {
    id: 'port_scan',
    name: 'Serviços Expostos',
    abbr: 'PortScan',
    icon: <Network size={18} />,
    color: '#f59e0b',
    borderColor: '#f59e0b30',
    bgColor: '#f59e0b08',
    severity: 'variable',
    cvss: '3.0 – 9.8',
    scanner: 'task_run_port_scan',
    tool: 'naabu',
    description: 'Descoberta de portas abertas e serviços expostos desnecessariamente à internet: painéis de admin, bancos de dados, Redis, Elasticsearch, Jupyter, etc. sem autenticação adequada.',
    howItWorks: 'naabu realiza um port scan rápido em modo SYN nos hosts descobertos pelo recon. Portas abertas com serviços administrativos expostos à internet representam uma superfície de ataque significativa, especialmente quando sem autenticação.',
    impact: [
      'Acesso direto a Redis sem auth (leitura de sessions, RCE via replicação)',
      'Elasticsearch sem auth (dump completo de índices)',
      'Painéis de admin (Kubernetes dashboard, Grafana, Kibana)',
      'Banco de dados direto (MongoDB, MySQL sem senha)',
      'Jupyter Notebook sem auth (RCE direto)',
      'Jenkins, Gitlab, portais CI/CD expostos',
    ],
    detection: [
      'naabu escaneia top 1000 portas em todos os hosts ativos',
      'Combina com nuclei para fingerprint do serviço e detecção de vulns',
      'Detecta serviços pela banner response (HTTP title, SSH version)',
      'Findings criados para portas críticas: 6379, 9200, 27017, 5601, 8080',
    ],
    payloads: [
      { label: 'Redis sem auth', code: 'redis-cli -h target.com PING' },
      { label: 'Elasticsearch', code: 'GET http://target.com:9200/_cat/indices' },
      { label: 'MongoDB', code: "mongo target.com:27017 --eval 'db.adminCommand({listDatabases:1})'" },
      { label: 'HTTP admin', code: 'GET http://target.com:8080/admin' },
    ],
    reportTips: [
      'Mostre exatamente o que está acessível sem autenticação',
      'Para Redis: demonstre que pode ler keys e/ou executar SLAVEOF (RCE)',
      'Para Elasticsearch: faça um dump parcial de dados reais',
      'Calcule impacto: quantos registros expostos? dados PII?',
      'Severity varia muito: Elasticsearch público com dados = critical',
    ],
    cwe: 'CWE-284',
    owasp: 'A05:2021',
  },
  {
    id: 'dns_recon',
    name: 'DNS Misconfigurations',
    abbr: 'DNS',
    icon: <Radio size={18} />,
    color: '#3b82f6',
    borderColor: '#3b82f630',
    bgColor: '#3b82f608',
    severity: 'medium',
    cvss: '4.0 – 7.5',
    scanner: 'task_run_dns_recon',
    tool: 'dnsx',
    description: 'Subdomain takeover, zone transfers não autorizados, subdomínios apontando para serviços descontinuados (CNAME dangling) e exposição de registros DNS internos.',
    howItWorks: 'dnsx resolve todos os subdomínios descobertos e verifica registros A, CNAME, MX, TXT e NS. Subdomínios com CNAME apontando para serviços extintos (Heroku, GitHub Pages, Fastly, Azure) podem ser "tomados" pelo atacante registrando o serviço no destino.',
    impact: [
      'Subdomain takeover: atacante controla subdomínio legítimo (cookie theft, phishing)',
      'Zone transfer expõe toda a topologia interna da rede',
      'Subdomínios internos mapeados (dev, staging, admin, vpn)',
      'SPF/DMARC misconfigured permitindo email spoofing',
      'Registros TXT com informações sensíveis (API keys, tokens)',
    ],
    detection: [
      'dnsx resolve e verifica NXDOMAIN para CNAME dangling',
      'Detecta CNAMEs apontando para provedores com takeover possível',
      'Verifica zone transfer (AXFR) em nameservers',
      'Busca subdomínios ativos com conteúdo de "Not Found" do provedor',
    ],
    payloads: [
      { label: 'Zone transfer', code: 'dig @ns1.target.com target.com AXFR' },
      { label: 'CNAME check', code: 'dig sub.target.com CNAME' },
      { label: 'Takeover PoC', code: '# Registrar app no Heroku/GitHub Pages apontado pelo CNAME' },
      { label: 'SPF check', code: 'dig target.com TXT | grep spf' },
    ],
    reportTips: [
      'Para subdomain takeover: mostre o CNAME dangling e registre o serviço como PoC',
      'Hospede uma página inocente no subdomínio tomado como prova',
      'Severity alta: cookies do domínio pai são acessíveis no subdomínio',
      'Para zone transfer: mostre os registros internos expostos',
      'Inclua evidência de que o CNAME aponta para serviço não registrado',
    ],
    cwe: 'CWE-350',
    owasp: 'A05:2021',
  },
]

const SEV_CONFIG = {
  critical: { label: 'Critical', cls: 'bg-red-500/15 text-red-400 border-red-500/25' },
  high:     { label: 'High',     cls: 'bg-orange-500/15 text-orange-400 border-orange-500/25' },
  medium:   { label: 'Medium',   cls: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25' },
  low:      { label: 'Low',      cls: 'bg-blue-500/15 text-blue-400 border-blue-500/25' },
  variable: { label: 'Variável', cls: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/25' },
}

// ── Components ────────────────────────────────────────────────────────────

function VulnCard({ vuln }: { vuln: VulnType }) {
  const [open, setOpen] = useState(false)
  const sev = SEV_CONFIG[vuln.severity]

  return (
    <div
      className="rounded-2xl border overflow-hidden transition-all"
      style={{ borderColor: open ? vuln.borderColor : 'rgba(255,255,255,0.06)', background: '#09090f' }}
    >
      {/* Header (always visible) */}
      <button
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        {/* Icon */}
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: vuln.bgColor, border: `1px solid ${vuln.borderColor}`, color: vuln.color }}>
          {vuln.icon}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold font-mono px-1.5 py-0.5 rounded"
              style={{ background: vuln.bgColor, color: vuln.color }}>{vuln.abbr}</span>
            <span className="text-sm font-semibold text-zinc-100">{vuln.name}</span>
          </div>
          <p className="text-[11px] text-zinc-600 mt-0.5 truncate">{vuln.description.slice(0, 90)}…</p>
        </div>

        {/* Badges */}
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-lg border', sev.cls)}>
            {sev.label}
          </span>
          <span className="text-[10px] text-zinc-600 font-mono">CVSS {vuln.cvss}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-lg bg-zinc-800 text-zinc-500 border border-zinc-700 font-mono">
            {vuln.tool.split(' ')[0]}
          </span>
        </div>

        <div className="shrink-0 text-zinc-600 ml-2">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
      </button>

      {/* Expanded content */}
      {open && (
        <div className="border-t px-5 py-5 space-y-6" style={{ borderColor: vuln.borderColor }}>

          {/* Description + How it works */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: vuln.color + 'aa' }}>Descrição</p>
              <p className="text-sm text-zinc-400 leading-relaxed">{vuln.description}</p>
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: vuln.color + 'aa' }}>Como Funciona</p>
              <p className="text-sm text-zinc-400 leading-relaxed">{vuln.howItWorks}</p>
            </div>
          </div>

          {/* Meta row */}
          <div className="flex flex-wrap gap-3">
            {[
              { label: 'Severidade', value: sev.label, cls: sev.cls },
              { label: 'CVSS', value: vuln.cvss, cls: 'bg-zinc-800 text-zinc-300 border-zinc-700' },
              { label: 'CWE', value: vuln.cwe, cls: 'bg-zinc-800 text-zinc-300 border-zinc-700' },
              { label: 'OWASP', value: vuln.owasp, cls: 'bg-zinc-800 text-zinc-300 border-zinc-700' },
              { label: 'Scanner', value: vuln.scanner, cls: 'bg-zinc-800 text-zinc-400 border-zinc-700 font-mono text-[9px]' },
              { label: 'Ferramenta', value: vuln.tool, cls: 'bg-zinc-800 text-zinc-400 border-zinc-700 font-mono text-[9px]' },
            ].map(m => (
              <div key={m.label} className="space-y-1">
                <p className="text-[9px] text-zinc-600 uppercase tracking-wider">{m.label}</p>
                <span className={cn('px-2 py-1 rounded-lg border text-[10px] font-medium', m.cls)}>{m.value}</span>
              </div>
            ))}
          </div>

          {/* Impact + Detection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: vuln.borderColor, background: vuln.bgColor }}>
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: vuln.color }}>Impacto Potencial</p>
              {vuln.impact.map((item, i) => (
                <div key={i} className="flex items-start gap-2">
                  <AlertTriangle size={10} className="mt-0.5 shrink-0" style={{ color: vuln.color }} />
                  <p className="text-[11px] text-zinc-400 leading-relaxed">{item}</p>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-zinc-800 p-4 space-y-2 bg-zinc-900/30">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Como a Plataforma Detecta</p>
              {vuln.detection.map((item, i) => (
                <div key={i} className="flex items-start gap-2">
                  <CheckCircle2 size={10} className="text-emerald-500 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-zinc-400 leading-relaxed">{item}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Payloads */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Payloads / Técnicas</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {vuln.payloads.map((p, i) => (
                <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
                  <p className="text-[9px] text-zinc-600 uppercase tracking-wider mb-1">{p.label}</p>
                  <code className="text-[11px] font-mono text-zinc-300 break-all leading-relaxed">{p.code}</code>
                </div>
              ))}
            </div>
          </div>

          {/* Report Tips */}
          <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: '#10b98120', background: '#10b98108' }}>
            <div className="flex items-center gap-2 mb-1">
              <Shield size={12} className="text-emerald-400" />
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Dicas para o Report HackerOne</p>
            </div>
            {vuln.reportTips.map((tip, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-[10px] font-bold text-emerald-600 mt-0.5 shrink-0">{i + 1}.</span>
                <p className="text-[11px] text-zinc-400 leading-relaxed">{tip}</p>
              </div>
            ))}
          </div>

        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function VulnTypesPage() {
  const [search, setSearch] = useState('')
  const [sevFilter, setSevFilter] = useState<string | null>(null)

  const filtered = VULNS.filter(v => {
    const matchSearch = search === '' ||
      v.name.toLowerCase().includes(search.toLowerCase()) ||
      v.abbr.toLowerCase().includes(search.toLowerCase())
    const matchSev = sevFilter === null || v.severity === sevFilter
    return matchSearch && matchSev
  })

  return (
    <div className="space-y-6 pb-12">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <ShieldAlert size={18} className="text-red-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-100">Tipos de Vulnerabilidade</h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              {VULNS.length} tipos cobertos pela plataforma — detecção, impacto, payloads e como reportar no H1
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-2 flex-wrap">
          {Object.entries(SEV_CONFIG).map(([key, cfg]) => {
            const count = VULNS.filter(v => v.severity === key).length
            if (count === 0) return null
            return (
              <button
                key={key}
                onClick={() => setSevFilter(sevFilter === key ? null : key)}
                className={cn(
                  'px-3 py-1.5 rounded-lg border text-[10px] font-semibold transition-all',
                  cfg.cls,
                  sevFilter === key ? 'opacity-100 scale-105' : 'opacity-60 hover:opacity-100'
                )}
              >
                {cfg.label} ({count})
              </button>
            )
          })}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Bug size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-600" />
        <input
          type="text"
          placeholder="Buscar tipo de vulnerabilidade..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-zinc-800 bg-zinc-900/50 text-sm text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
        />
      </div>

      {/* Vuln list */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-zinc-600">
            <Bug size={28} className="opacity-20" />
            <p className="text-sm">Nenhuma vulnerabilidade encontrada</p>
          </div>
        ) : (
          filtered.map(v => <VulnCard key={v.id} vuln={v} />)
        )}
      </div>

      {/* Legend */}
      <div className="rounded-xl border border-zinc-800 p-4 flex flex-wrap gap-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 w-full">Legenda</p>
        {[
          { icon: <Terminal size={11} />, label: 'Scanner automático da plataforma detecta esta vuln' },
          { icon: <CheckCircle2 size={11} className="text-emerald-500" />, label: 'Critérios de detecção usados' },
          { icon: <AlertTriangle size={11} className="text-orange-400" />, label: 'Impactos possíveis documentados' },
          { icon: <Shield size={11} className="text-emerald-400" />, label: 'Dicas para maximizar bounty no H1' },
        ].map((l, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-zinc-500">{l.icon}</span>
            <span className="text-[10px] text-zinc-600">{l.label}</span>
          </div>
        ))}
      </div>

    </div>
  )
}
