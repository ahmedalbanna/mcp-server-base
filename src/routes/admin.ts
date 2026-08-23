import type { Express, Request, Response } from 'express';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { getMetrics, getSpans } from '../utils/otel.js';
import { getMemoryStore } from '../tools/memory.tool.js';
import { getVectorStore } from '../tools/rag.tool.js';
import { defaultCache } from '../utils/cache.js';

function requireAdminAuth(req: Request, res: Response, next: () => void) {
  if (!config.admin.enabled) {
    res.status(404).send('Admin disabled');
    return;
  }
  const token = config.admin.token;
  if (token) {
    const provided = (req.headers['x-admin-token'] as string) || (req.query.token as string);
    if (provided !== token) {
      res.status(401).json({ error: 'Unauthorized: invalid admin token' });
      return;
    }
  }
  next();
}

export function registerAdminRoutes(
  app: Express,
  getServerInfo: () => { server: any; transports?: any }
) {
  if (!config.admin.enabled) {
    logger.info('Admin routes disabled');
    return;
  }

  // HTML dashboard
  app.get('/admin', requireAdminAuth, (_req, res) => {
    const html = `<!DOCTYPE html>
<html>
<head><title>MCP Admin - ${config.server.name}</title><style>
body{font-family:system-ui;padding:2rem;max-width:900px;margin:auto}
h1{color:#333} .card{border:1px solid #ddd;padding:1rem;margin:1rem 0;border-radius:8px}
a{color:#0366d6} pre{background:#f6f8fa;padding:1rem;overflow:auto}
input,select,textarea{width:100%;padding:0.5rem;margin:0.3rem 0}
button{padding:0.5rem 1rem;background:#0366d6;color:white;border:none;border-radius:4px;cursor:pointer}
</style></head>
<body>
<h1>🔧 MCP Admin - ${config.server.name} v${config.server.version}</h1>
<p>Env: ${config.env} | Uptime: ${Math.floor(process.uptime())}s | Node: ${process.version}</p>
<div class="card"><h3>Tools</h3><div id="tools">Loading...</div></div>
<div class="card"><h3>Resources</h3><div id="resources">Loading...</div></div>
<div class="card"><h3>Prompts Playground (v2.2)</h3>
  <select id="promptSelect"><option value="code-review">code-review</option><option value="explain-concept">explain-concept</option><option value="summarize">summarize</option><option value="research">research</option></select>
  <textarea id="promptArgs" rows="4" placeholder='{"language":"ts","code":"const x=1"}'></textarea>
  <button onclick="previewPrompt()">Preview</button>
  <pre id="promptPreview"></pre>
</div>
<div class="card"><h3>Metrics</h3><pre id="metrics">Loading...</pre></div>
<div class="card"><h3>Live Spans (last 10)</h3><pre id="spans">Loading...</pre></div>
<div class="card"><h3>Stores</h3><pre id="stores">Loading...</pre></div>
<script>
async function load(){
  const h = ${config.admin.token ? `{'X-Admin-Token':'${config.admin.token}'}` : '{}'};
  try{
    const tools = await fetch('/admin/tools',{headers:h}).then(r=>r.json());
    document.getElementById('tools').innerHTML = tools.tools.map(t=>'<li>'+t.name+'</li>').join('') || 'none';
    const res = await fetch('/admin/resources',{headers:h}).then(r=>r.json());
    document.getElementById('resources').innerHTML = res.resources.map(r=>'<li>'+r.uri+'</li>').join('') || 'none';
    const prompts = await fetch('/admin/prompts',{headers:h}).then(r=>r.json());
    document.getElementById('prompts').innerHTML = prompts.prompts.map(p=>'<li>'+p.name+'</li>').join('') || 'none';
    const metrics = await fetch('/admin/metrics',{headers:h}).then(r=>r.json());
    document.getElementById('metrics').textContent = JSON.stringify(metrics,null,2);
    const spans = await fetch('/admin/spans',{headers:h}).then(r=>r.json());
    document.getElementById('spans').textContent = JSON.stringify(spans,null,2);
    const stores = await fetch('/admin/stores',{headers:h}).then(r=>r.json());
    document.getElementById('stores').textContent = JSON.stringify(stores,null,2);
  }catch(e){console.error(e)}
}
async function previewPrompt(){
  const h = ${config.admin.token ? `{'X-Admin-Token':'${config.admin.token}'}` : '{}'};
  h['Content-Type']='application/json';
  const name = document.getElementById('promptSelect').value;
  let args={}; try{args=JSON.parse(document.getElementById('promptArgs').value||'{}')}catch{}
  const res = await fetch('/admin/prompts/'+name+'/preview',{method:'POST',headers:h,body:JSON.stringify(args)});
  const data = await res.json();
  document.getElementById('promptPreview').textContent = JSON.stringify(data,null,2);
}
load(); setInterval(load,5000);
</script>
</body>
</html>`;
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  });

  app.get('/admin/tools', requireAdminAuth, async (_req, res) => {
    try {
      const { server: _server } = getServerInfo();
      // McpServer doesn't expose list directly, we return static known list plus server info
      const tools = [
        'echo',
        'calculator',
        'get_time',
        'fetch_url',
        'list_files',
        'read_file',
        'write_file',
        'search_files',
        'memory_set',
        'memory_get',
        'memory_delete',
        'memory_list',
        'memory_clear',
        'database_query',
        'database_tables',
        'shell_execute',
        'collect_user_info',
        'generate_with_sampling',
        'rag_ingest',
        'rag_search',
        'rag_list',
        'rag_clear',
        'brave_search',
        'tavily_search',
        'web_fetch',
        'github_search_repos',
        'github_get_repo',
        'github_get_issue',
        'create_task',
        'get_task',
        'get_task_result',
        // v2.2 plugins
        'slack_list_channels',
        'slack_post_message',
        'slack_search',
        'notion_search',
        'notion_get_page',
        'notion_create_page',
        'linear_list_issues',
        'linear_create_issue',
        'linear_get_issue',
      ].map(name => ({ name }));
      res.json({ tools, count: tools.length, server: config.server.name });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/admin/resources', requireAdminAuth, async (_req, res) => {
    res.json({
      resources: [
        { uri: 'config://server-info' },
        { uri: 'greeting://{name}' },
        { uri: 'file:///{+path}' },
        { uri: 'memory://{key}' },
        { uri: 'db://{table}/{id}' },
        { uri: 'docs://{id}' },
      ],
    });
  });

  app.get('/admin/prompts', requireAdminAuth, async (_req, res) => {
    res.json({
      prompts: [
        { name: 'code-review', args: ['language', 'code'] },
        { name: 'explain-concept', args: ['concept', 'level'] },
        { name: 'summarize', args: ['text', 'length', 'style'] },
        { name: 'research', args: ['topic', 'depth', 'audience'] },
      ],
    });
  });

  // Prompt playground preview (v2.2)
  app.post('/admin/prompts/:name/preview', requireAdminAuth, async (req, res) => {
    const name = req.params.name;
    const args = req.body || {};
    try {
      // Simulate prompt rendering without needing client
      let messages: any[] = [];
      if (name === 'code-review') {
        const { language = 'ts', code = 'const x=1' } = args;
        messages = [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please review this ${language} code.\n\n\`\`\`${language}\n${code}\n\`\`\``,
            },
          },
        ];
      } else if (name === 'explain-concept') {
        const { concept = 'MCP', level = 'beginner' } = args;
        messages = [
          {
            role: 'user',
            content: { type: 'text', text: `Explain "${concept}" for a ${level} audience.` },
          },
        ];
      } else if (name === 'summarize') {
        const { text = 'hello', length = 'medium', style = 'bullets' } = args;
        messages = [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Summarize (${length}, ${style}): ${text.slice(0, 200)}`,
            },
          },
        ];
      } else if (name === 'research') {
        const { topic = 'MCP', depth = 'overview' } = args;
        messages = [
          { role: 'user', content: { type: 'text', text: `Research ${topic} depth=${depth}` } },
        ];
      } else {
        res.status(404).json({ error: `Unknown prompt ${name}` });
        return;
      }
      res.json({ prompt: name, args, messages, preview: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/admin/metrics', requireAdminAuth, (_req, res) => {
    const metrics = getMetrics();
    metrics['uptime_seconds'] = { count: 1, avg: process.uptime(), last: process.uptime() };
    metrics['memory_rss_mb'] = {
      count: 1,
      avg: process.memoryUsage().rss / 1024 / 1024,
      last: process.memoryUsage().rss / 1024 / 1024,
    };
    metrics['store.memory.size'] = {
      count: getMemoryStore().size,
      avg: getMemoryStore().size,
      last: getMemoryStore().size,
    };
    metrics['store.rag.size'] = {
      count: getVectorStore().size,
      avg: getVectorStore().size,
      last: getVectorStore().size,
    };
    metrics['cache.size'] = {
      count: defaultCache.size,
      avg: defaultCache.size,
      last: defaultCache.size,
    };
    res.json(metrics);
  });

  app.get('/admin/spans', requireAdminAuth, (_req, res) => {
    res.json(getSpans(20));
  });

  app.get('/admin/stores', requireAdminAuth, (_req, res) => {
    res.json({
      memory: { size: getMemoryStore().size, keys: [...getMemoryStore().keys()].slice(0, 20) },
      rag: { size: getVectorStore().size, ids: [...getVectorStore().keys()].slice(0, 20) },
      cache: { size: defaultCache.size, keys: defaultCache.keys().slice(0, 20) },
      config: {
        env: config.env,
        version: config.server.version,
        authMode: config.auth.mode,
        resumability: config.resumability.enabled,
        eventStore: config.eventStore.type,
        otel: config.otel.enabled,
      },
    });
  });

  app.get('/admin/health', (_req, res) => {
    res.json({ status: 'ok', admin: true, version: config.server.version });
  });

  logger.info('Admin routes registered at /admin', {
    enabled: config.admin.enabled,
    hasToken: !!config.admin.token,
  });
}
