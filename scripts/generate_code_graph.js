#!/usr/bin/env node
/**
 * Graphify Code Indexer for ClinicaBot SaaS Pro
 * Scans the codebase, parses AST dependencies, routes, and database tables,
 * and produces:
 * 1. GRAPH_REPORT.md (AI-ready codebase knowledge graph)
 * 2. graph.json (Machine-readable graph)
 * 3. public/graph.html (Interactive standalone visualizer)
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../../');
const BACKEND_DIR = path.resolve(__dirname, '../');
const PUBLIC_DIR = path.resolve(BACKEND_DIR, 'public');

const IGNORE_DIRS = [
    'node_modules',
    '.git',
    'screenshots',
    'dist',
    'build',
    '.expo',
    '.system_generated',
    'brain'
];

const EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.html', '.sql'];

function getCategory(filePath) {
    const rel = path.relative(ROOT_DIR, filePath).replace(/\\/g, '/');
    if (rel.includes('controllers/')) return 'Controller';
    if (rel.includes('services/')) return 'Service';
    if (rel.includes('middlewares/')) return 'Middleware';
    if (rel.includes('routes/')) return 'Route';
    if (rel.includes('scripts/') || rel.includes('simulators/')) return 'Script/Simulator';
    if (rel.includes('tests/')) return 'Test';
    if (rel.includes('public/') || rel.includes('admin-mobile-app')) return 'Frontend/Mobile';
    if (rel === 'clinic-bot-backend/server.js' || rel === 'server.js') return 'Entrypoint';
    return 'Core';
}

// Recursively walk directory
function walkDir(dir, fileList = []) {
    if (!fs.existsSync(dir)) return fileList;
    const items = fs.readdirSync(dir);
    for (const item of items) {
        if (IGNORE_DIRS.includes(item)) continue;
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            walkDir(fullPath, fileList);
        } else if (EXTENSIONS.includes(path.extname(item))) {
            fileList.push(fullPath);
        }
    }
    return fileList;
}

// Parse JS/HTML file for imports, routes, tables and symbols
function parseFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const relPath = path.relative(ROOT_DIR, filePath).replace(/\\/g, '/');

    const imports = [];
    const exportsList = [];
    const routes = [];
    const tables = new Set();
    const symbols = [];

    // Extract requires and imports
    const requireRegex = /(?:require\(['"]([^'"]+)['"]\)|from\s+['"]([^'"]+)['"])/g;
    let match;
    while ((match = requireRegex.exec(content)) !== null) {
        const imp = match[1] || match[2];
        if (imp && imp.startsWith('.')) {
            const resolved = path.resolve(path.dirname(filePath), imp);
            let targetRel = path.relative(ROOT_DIR, resolved).replace(/\\/g, '/');
            if (!path.extname(targetRel)) targetRel += '.js';
            imports.push(targetRel);
        }
    }

    // Extract express routes: (app|router).(get|post|put|delete)('route', ...)
    const routeRegex = /(?:app|router)\.(get|post|put|delete|patch)\(\s*['"]([^'"]+)['"]/g;
    while ((match = routeRegex.exec(content)) !== null) {
        routes.push({ method: match[1].toUpperCase(), path: match[2] });
    }

    // Extract Supabase tables: .from('table_name')
    const tableRegex = /\.from\(\s*['"]([a-zA-Z0-9_]+)['"]\s*\)/g;
    while ((match = tableRegex.exec(content)) !== null) {
        tables.add(match[1]);
    }

    // Extract function names & exports
    const funcRegex = /(?:function\s+([a-zA-Z0-9_]+)|const\s+([a-zA-Z0-9_]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>|(?:exports|module\.exports)\.([a-zA-Z0-9_]+)\s*=)/g;
    while ((match = funcRegex.exec(content)) !== null) {
        const name = match[1] || match[2] || match[3];
        if (name && name.length > 2 && !['require', 'config', 'path', 'fs', 'app', 'router'].includes(name)) {
            symbols.push(name);
        }
    }

    return {
        id: relPath,
        label: path.basename(relPath),
        path: relPath,
        category: getCategory(filePath),
        lineCount: lines.length,
        sizeBytes: content.length,
        imports,
        routes,
        tables: Array.from(tables),
        symbols: Array.from(new Set(symbols)).slice(0, 15) // Top 15 symbols
    };
}

function buildGraph() {
    console.log('🔍 [Graphify] Escaneando arquivos do projeto...');
    
    // Scan backend core & relevant frontend
    const allFiles = walkDir(path.join(ROOT_DIR, 'clinic-bot-backend'));
    const mobileFiles = walkDir(path.join(ROOT_DIR, 'admin-mobile-app-v2'));
    const files = [...allFiles, ...mobileFiles].filter(f => !f.includes('tests/screenshots'));

    const nodesMap = new Map();
    const nodes = [];
    const edges = [];

    // Parse all files
    for (const f of files) {
        const parsed = parseFile(f);
        nodesMap.set(parsed.id, parsed);
        nodes.push({
            id: parsed.id,
            label: parsed.label,
            category: parsed.category,
            lines: parsed.lineCount,
            size: parsed.sizeBytes,
            routesCount: parsed.routes.length,
            tables: parsed.tables,
            symbols: parsed.symbols,
            inDegree: 0,
            outDegree: 0
        });
    }

    // Connect edges
    for (const [id, parsed] of nodesMap.entries()) {
        for (const imp of parsed.imports) {
            // Find closest match in nodesMap
            let targetId = imp;
            if (!nodesMap.has(targetId)) {
                // Try suffix or prefix match
                for (const k of nodesMap.keys()) {
                    if (k.endsWith(imp) || imp.endsWith(k)) {
                        targetId = k;
                        break;
                    }
                }
            }

            if (nodesMap.has(targetId)) {
                edges.push({
                    source: id,
                    target: targetId,
                    type: 'imports'
                });

                // Increment degrees
                const srcNode = nodes.find(n => n.id === id);
                const tgtNode = nodes.find(n => n.id === targetId);
                if (srcNode) srcNode.outDegree++;
                if (tgtNode) tgtNode.inDegree++;
            }
        }

        // Add database table connections as virtual nodes
        for (const table of parsed.tables) {
            const tableNodeId = `table:${table}`;
            if (!nodes.some(n => n.id === tableNodeId)) {
                nodes.push({
                    id: tableNodeId,
                    label: `🗄️ ${table}`,
                    category: 'Database Table',
                    lines: 0,
                    size: 0,
                    routesCount: 0,
                    tables: [],
                    symbols: [],
                    inDegree: 0,
                    outDegree: 0
                });
            }
            edges.push({
                source: id,
                target: tableNodeId,
                type: 'queries_table'
            });
            const tNode = nodes.find(n => n.id === tableNodeId);
            if (tNode) tNode.inDegree++;
        }
    }

    // Rank "God Nodes" (highest total connectivity)
    nodes.forEach(n => n.totalDegree = n.inDegree + n.outDegree);
    const godNodes = [...nodes]
        .filter(n => n.category !== 'Database Table')
        .sort((a, b) => b.totalDegree - a.totalDegree)
        .slice(0, 8);

    console.log(`✅ [Graphify] Mapeados ${nodes.length} nós e ${edges.length} conexões.`);
    return { nodes, edges, godNodes, nodesMap };
}

function generateReportMD(graph) {
    const { nodes, edges, godNodes } = graph;

    let md = `# 🕸️ ClinicaBot SaaS Pro — Knowledge Graph Report\n\n`;
    md += `> **Data de Geração:** ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (BRT)\n`;
    md += `> **Métricas do Repositório:** ${nodes.length} Nós Mapeados | ${edges.length} Conexões Estruturais\n\n`;

    md += `## 🌟 God Nodes (Módulos de Maior Centralidade)\n`;
    md += `Estes são os arquivos mais críticos do sistema. Qualquer alteração neles tem alto impacto em cascata:\n\n`;
    md += `| Módulo | Categoria | Conexões | Linhas | Símbolos Principais |\n`;
    md += `| :--- | :--- | :---: | :---: | :--- |\n`;

    for (const gn of godNodes) {
        const topSymbols = gn.symbols.slice(0, 4).join(', ') || '-';
        md += `| **\`${gn.label}\`** | ${gn.category} | **${gn.totalDegree}** | ${gn.lines} | \`${topSymbols}\` |\n`;
    }

    md += `\n---\n\n## 🗄️ Tabelas do Supabase & Módulos que as Acessam\n\n`;
    const tables = nodes.filter(n => n.category === 'Database Table');
    for (const t of tables) {
        const rawTableName = t.id.replace('table:', '');
        const accessing = edges.filter(e => e.target === t.id).map(e => `\`${path.basename(e.source)}\``);
        md += `- **\`${rawTableName}\`**: acessado por ${accessing.join(', ') || 'Nenhum'}\n`;
    }

    md += `\n---\n\n## 🧭 Rotas Principais do Backend (API / Webhooks)\n\n`;
    const routeNodes = nodes.filter(n => n.routesCount > 0);
    for (const rn of routeNodes) {
        md += `### 📄 \`${rn.label}\` (${rn.category})\n`;
        const fullNode = graph.nodesMap.get(rn.id);
        if (fullNode && fullNode.routes) {
            for (const r of fullNode.routes) {
                md += `- \`${r.method}\` **${r.path}**\n`;
            }
        }
        md += `\n`;
    }

    md += `\n---\n\n## 💡 Instrução de Eficiência para Agentes de IA\n`;
    md += `Ao trabalhar em uma tarefa, consulte este índice antes de usar \`view_file\` ou \`grep_search\` amplo. `;
    md += `Isso garante edições cirúrgicas e previne desperdício de contexto no modelo.\n`;

    return md;
}

function generateInteractiveHTML(graph) {
    const { nodes, edges, godNodes } = graph;

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ClinicaBot SaaS Pro — Knowledge Graph</title>
    <style>
        :root {
            --bg-color: #0d1117;
            --card-bg: rgba(22, 27, 34, 0.95);
            --border-color: #30363d;
            --text-primary: #e6edf3;
            --text-muted: #8b949e;
            --accent: #58a6ff;
            --god-node: #f0883e;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
        body { background: var(--bg-color); color: var(--text-primary); overflow: hidden; height: 100vh; display: flex; flex-direction: column; }
        
        /* Top Navigation Header */
        header {
            height: 60px;
            background: #161b22;
            border-bottom: 1px solid var(--border-color);
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 24px;
            z-index: 10;
        }
        .brand { display: flex; align-items: center; gap: 12px; font-weight: 700; font-size: 1.1rem; }
        .brand span { color: var(--accent); }
        .badge { background: #238636; color: white; padding: 3px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600; }
        
        .controls { display: flex; gap: 12px; align-items: center; }
        .search-box {
            background: #0d1117;
            border: 1px solid var(--border-color);
            color: white;
            padding: 7px 14px;
            border-radius: 6px;
            font-size: 0.9rem;
            width: 260px;
            outline: none;
        }
        .search-box:focus { border-color: var(--accent); }

        /* Main Workspace Container */
        .workspace { flex: 1; position: relative; display: flex; }
        canvas { width: 100%; height: 100%; display: block; cursor: grab; }
        canvas:active { cursor: grabbing; }

        /* Side Inspector Panel */
        .sidebar {
            position: absolute;
            top: 16px;
            right: 16px;
            width: 340px;
            max-height: calc(100% - 32px);
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 16px;
            overflow-y: auto;
            backdrop-filter: blur(8px);
            box-shadow: 0 8px 24px rgba(0,0,0,0.5);
            display: none;
        }
        .sidebar.active { display: block; }
        .sidebar h3 { font-size: 1.05rem; margin-bottom: 8px; word-break: break-all; }
        .sidebar .category-tag { font-size: 0.75rem; font-weight: 600; padding: 2px 8px; border-radius: 4px; display: inline-block; margin-bottom: 12px; }
        .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px; }
        .stat-card { background: #0d1117; border: 1px solid var(--border-color); padding: 8px; border-radius: 6px; }
        .stat-card .val { font-size: 1.1rem; font-weight: 700; color: var(--accent); }
        .stat-card .lbl { font-size: 0.75rem; color: var(--text-muted); }
        .section-title { font-size: 0.85rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; margin: 12px 0 6px; }
        .tag-list { display: flex; flex-wrap: wrap; gap: 4px; }
        .tag { background: #21262d; border: 1px solid #30363d; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; }

        /* Legend Panel */
        .legend {
            position: absolute;
            bottom: 16px;
            left: 16px;
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 12px 16px;
            display: flex;
            gap: 14px;
            font-size: 0.8rem;
            backdrop-filter: blur(8px);
        }
        .legend-item { display: flex; align-items: center; gap: 6px; }
        .legend-dot { width: 10px; height: 10px; border-radius: 50%; }
    </style>
</head>
<body>
    <header>
        <div class="brand">
            🕸️ ClinicaBot <span>Graphify</span>
            <span class="badge">${nodes.length} Nós</span>
            <span class="badge" style="background:#8957e5">${edges.length} Arestas</span>
        </div>
        <div class="controls">
            <input type="text" id="searchInput" class="search-box" placeholder="Buscar módulo, função ou tabela...">
            <button onclick="resetView()" style="background:#21262d;border:1px solid #30363d;color:white;padding:7px 12px;border-radius:6px;cursor:pointer;">Resetar Zoom</button>
        </div>
    </header>

    <div class="workspace">
        <canvas id="graphCanvas"></canvas>
        <div id="inspector" class="sidebar">
            <h3 id="nodeTitle">Módulo</h3>
            <span id="nodeCategory" class="category-tag">Categoria</span>
            <div class="stat-grid">
                <div class="stat-card"><div id="nodeLines" class="val">0</div><div class="lbl">Linhas de Código</div></div>
                <div class="stat-card"><div id="nodeConnections" class="val">0</div><div class="lbl">Conexões</div></div>
            </div>
            <div class="section-title">Símbolos & Funções</div>
            <div id="nodeSymbols" class="tag-list"></div>
            <div class="section-title">Tabelas Supabase</div>
            <div id="nodeTables" class="tag-list"></div>
        </div>

        <div class="legend">
            <div class="legend-item"><div class="legend-dot" style="background:#bc8cff;"></div> Controller</div>
            <div class="legend-item"><div class="legend-dot" style="background:#58a6ff;"></div> Service</div>
            <div class="legend-item"><div class="legend-dot" style="background:#3fb950;"></div> Banco (Tabela)</div>
            <div class="legend-item"><div class="legend-dot" style="background:#d29922;"></div> Rota / Middleware</div>
            <div class="legend-item"><div class="legend-dot" style="background:#f0883e;"></div> God Node (Crítico)</div>
        </div>
    </div>

    <script>
        const GRAPH_DATA = ${JSON.stringify(graph, null, 2)};
        const canvas = document.getElementById('graphCanvas');
        const ctx = canvas.getContext('2d');
        const inspector = document.getElementById('inspector');

        let width, height;
        let scale = 0.8;
        let panX = 0, panY = 0;
        let isDragging = false;
        let startX, startY;
        let selectedNode = null;
        let hoveredNode = null;

        const COLOR_MAP = {
            'Controller': '#bc8cff',
            'Service': '#58a6ff',
            'Database Table': '#3fb950',
            'Middleware': '#d29922',
            'Route': '#d29922',
            'Entrypoint': '#f0883e',
            'Frontend/Mobile': '#ff7b72',
            'Test': '#8b949e',
            'Script/Simulator': '#79c0ff'
        };

        function resize() {
            width = canvas.parentElement.clientWidth;
            height = canvas.parentElement.clientHeight;
            canvas.width = width;
            canvas.height = height;
            draw();
        }
        window.addEventListener('resize', resize);

        // Layout Nodes in Circular/Cluster Layout
        function initializePositions() {
            const nodes = GRAPH_DATA.nodes;
            const total = nodes.length;
            const radius = Math.min(width, height) * 0.9;
            
            nodes.forEach((n, i) => {
                const angle = (i / total) * 2 * Math.PI;
                // Place God Nodes closer to center
                const isGod = GRAPH_DATA.godNodes.some(g => g.id === n.id);
                const dist = isGod ? radius * 0.35 + (i % 3) * 40 : radius * (0.6 + (i % 4) * 0.1);
                n.x = width / 2 + Math.cos(angle) * dist;
                n.y = height / 2 + Math.sin(angle) * dist;
                n.r = isGod ? 18 : (n.category === 'Database Table' ? 14 : Math.max(8, Math.min(16, Math.sqrt(n.totalDegree || 1) * 4)));
            });
        }

        function resetView() {
            scale = 0.85;
            panX = 0;
            panY = 0;
            draw();
        }

        function draw() {
            ctx.clearRect(0, 0, width, height);
            ctx.save();
            ctx.translate(width / 2 + panX, height / 2 + panY);
            ctx.scale(scale, scale);
            ctx.translate(-width / 2, -height / 2);

            // Draw Edges
            for (const edge of GRAPH_DATA.edges) {
                const src = GRAPH_DATA.nodes.find(n => n.id === edge.source);
                const tgt = GRAPH_DATA.nodes.find(n => n.id === edge.target);
                if (!src || !tgt) continue;

                const isConnected = selectedNode && (selectedNode.id === src.id || selectedNode.id === tgt.id);
                ctx.beginPath();
                ctx.moveTo(src.x, src.y);
                ctx.lineTo(tgt.x, tgt.y);
                ctx.strokeStyle = isConnected ? '#58a6ff' : 'rgba(48, 54, 61, 0.4)';
                ctx.lineWidth = isConnected ? 2 : 1;
                ctx.stroke();
            }

            // Draw Nodes
            for (const node of GRAPH_DATA.nodes) {
                const isGod = GRAPH_DATA.godNodes.some(g => g.id === node.id);
                const isSelected = selectedNode && selectedNode.id === node.id;
                const isHovered = hoveredNode && hoveredNode.id === node.id;

                ctx.beginPath();
                ctx.arc(node.x, node.y, node.r, 0, 2 * Math.PI);
                ctx.fillStyle = isGod ? '#f0883e' : (COLOR_MAP[node.category] || '#8b949e');
                ctx.fill();

                if (isSelected || isHovered || isGod) {
                    ctx.strokeStyle = isSelected ? '#ffffff' : (isGod ? '#f0883e' : '#58a6ff');
                    ctx.lineWidth = isSelected ? 4 : 2;
                    ctx.stroke();
                }

                // Node Labels
                if (scale > 0.65 || isGod || isSelected || isHovered) {
                    ctx.font = isGod ? 'bold 12px sans-serif' : '10px sans-serif';
                    ctx.fillStyle = isSelected ? '#ffffff' : (isGod ? '#f0883e' : '#c9d1d9');
                    ctx.fillText(node.label, node.x + node.r + 4, node.y + 4);
                }
            }

            ctx.restore();
        }

        // Mouse Pan & Zoom
        canvas.addEventListener('mousedown', e => {
            isDragging = true;
            startX = e.clientX - panX;
            startY = e.clientY - panY;
        });

        window.addEventListener('mousemove', e => {
            if (isDragging) {
                panX = e.clientX - startX;
                panY = e.clientY - startY;
                draw();
            } else {
                // Check Hover
                const rect = canvas.getBoundingClientRect();
                const mouseX = (e.clientX - rect.left - width / 2 - panX) / scale + width / 2;
                const mouseY = (e.clientY - rect.top - height / 2 - panY) / scale + height / 2;

                hoveredNode = GRAPH_DATA.nodes.find(n => {
                    const dx = n.x - mouseX;
                    const dy = n.y - mouseY;
                    return Math.sqrt(dx * dx + dy * dy) < n.r + 4;
                });
                draw();
            }
        });

        window.addEventListener('mouseup', () => isDragging = false);

        canvas.addEventListener('wheel', e => {
            e.preventDefault();
            const zoomFactor = 1.1;
            if (e.deltaY < 0) scale *= zoomFactor;
            else scale /= zoomFactor;
            scale = Math.max(0.2, Math.min(3.0, scale));
            draw();
        });

        // Click to Inspect Node
        canvas.addEventListener('click', e => {
            const rect = canvas.getBoundingClientRect();
            const mouseX = (e.clientX - rect.left - width / 2 - panX) / scale + width / 2;
            const mouseY = (e.clientY - rect.top - height / 2 - panY) / scale + height / 2;

            selectedNode = GRAPH_DATA.nodes.find(n => {
                const dx = n.x - mouseX;
                const dy = n.y - mouseY;
                return Math.sqrt(dx * dx + dy * dy) < n.r + 4;
            });

            if (selectedNode) {
                inspector.classList.add('active');
                document.getElementById('nodeTitle').innerText = selectedNode.label;
                const catSpan = document.getElementById('nodeCategory');
                catSpan.innerText = selectedNode.category;
                catSpan.style.background = COLOR_MAP[selectedNode.category] || '#8b949e';
                catSpan.style.color = '#0d1117';

                document.getElementById('nodeLines').innerText = selectedNode.lines || 0;
                document.getElementById('nodeConnections').innerText = selectedNode.totalDegree || 0;

                const symList = document.getElementById('nodeSymbols');
                symList.innerHTML = (selectedNode.symbols || []).map(s => \`<span class="tag">\${s}</span>\`).join('') || '<span style="color:#8b949e;font-size:0.8rem">Nenhum detectado</span>';

                const tabList = document.getElementById('nodeTables');
                tabList.innerHTML = (selectedNode.tables || []).map(t => \`<span class="tag" style="background:#238636;color:white">\${t}</span>\`).join('') || '<span style="color:#8b949e;font-size:0.8rem">Nenhuma tabela direta</span>';
            } else {
                inspector.classList.remove('active');
            }
            draw();
        });

        // Search Filter
        document.getElementById('searchInput').addEventListener('input', e => {
            const q = e.target.value.toLowerCase().trim();
            if (!q) {
                selectedNode = null;
                inspector.classList.remove('active');
                draw();
                return;
            }
            const found = GRAPH_DATA.nodes.find(n => 
                n.label.toLowerCase().includes(q) || 
                (n.symbols && n.symbols.some(s => s.toLowerCase().includes(q))) ||
                (n.tables && n.tables.some(t => t.toLowerCase().includes(q)))
            );
            if (found) {
                selectedNode = found;
                panX = -(found.x - width / 2) * scale;
                panY = -(found.y - height / 2) * scale;
                inspector.classList.add('active');
                document.getElementById('nodeTitle').innerText = found.label;
                document.getElementById('nodeCategory').innerText = found.category;
                document.getElementById('nodeLines').innerText = found.lines || 0;
                document.getElementById('nodeConnections').innerText = found.totalDegree || 0;
            }
            draw();
        });

        resize();
        initializePositions();
        resetView();
    </script>
</body>
</html>`;
}

function main() {
    const graph = buildGraph();

    // 1. Write GRAPH_REPORT.md
    const reportMD = generateReportMD(graph);
    const reportPath = path.join(ROOT_DIR, 'GRAPH_REPORT.md');
    fs.writeFileSync(reportPath, reportMD, 'utf8');
    console.log(`📄 [Graphify] Relatório gerado em: ${reportPath}`);

    // 2. Write graph.json
    const jsonPath = path.join(PUBLIC_DIR, 'graph.json');
    fs.writeFileSync(jsonPath, JSON.stringify(graph, null, 2), 'utf8');
    console.log(`📊 [Graphify] Dados JSON gerados em: ${jsonPath}`);

    // 3. Write public/graph.html
    const htmlContent = generateInteractiveHTML(graph);
    const htmlPath = path.join(PUBLIC_DIR, 'graph.html');
    fs.writeFileSync(htmlPath, htmlContent, 'utf8');
    console.log(`🌐 [Graphify] Visualizador interativo gerado em: ${htmlPath}`);

    console.log('\n🚀 [Graphify] Concluído com sucesso! Abra public/graph.html no navegador.');
}

main();
