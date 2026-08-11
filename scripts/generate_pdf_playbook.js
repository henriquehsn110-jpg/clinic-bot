/**
 * generate_pdf_playbook.js
 * Compila o Playbook de Implantação & Fechamento de Clientes em um PDF Executivo
 * de Altíssimo Padrão Visual (Estilo McKinsey / Apple) utilizando Puppeteer Chromium.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

async function buildPdfFromMarkdown() {
    console.log('================================================================');
    console.log('📄 GERANDO PDF EXECUTIVO DO GUIA DE ONBOARDING & FECHAMENTO');
    console.log('================================================================\n');

    const mdPath = fs.existsSync(path.join(__dirname, '../public/guia_onboarding_e_fechamento_clientes.md'))
        ? path.join(__dirname, '../public/guia_onboarding_e_fechamento_clientes.md')
        : path.join(__dirname, '../../guia_onboarding_e_fechamento_clientes.md');
    const mdContent = fs.readFileSync(mdPath, 'utf8');

    // Converte Markdown básico em HTML estruturado com CSS de impressão executivo
    const htmlContent = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <title>Playbook de Implantação SaaS — ClinicaBot SaaS Pro</title>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
            
            @page {
                size: A4;
                margin: 20mm 15mm 20mm 15mm;
                @bottom-right {
                    content: counter(page);
                }
            }

            * {
                box-sizing: border-box;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }

            body {
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                color: #0f172a;
                background-color: #ffffff;
                line-height: 1.6;
                font-size: 11pt;
                margin: 0;
                padding: 0;
            }

            .cover-header {
                background: linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%);
                color: #ffffff;
                padding: 32px;
                border-radius: 16px;
                margin-bottom: 28px;
                box-shadow: 0 10px 25px -5px rgba(67, 56, 202, 0.3);
            }

            .cover-badge {
                display: inline-block;
                background: rgba(255, 255, 255, 0.15);
                backdrop-filter: blur(10px);
                color: #6366f1;
                background-color: #e0e7ff;
                padding: 4px 12px;
                border-radius: 20px;
                font-size: 9pt;
                font-weight: 700;
                letter-spacing: 0.05em;
                text-transform: uppercase;
                margin-bottom: 12px;
            }

            h1 {
                font-size: 22pt;
                font-weight: 800;
                margin: 0 0 10px 0;
                line-height: 1.2;
                letter-spacing: -0.02em;
            }

            .cover-subtitle {
                font-size: 11pt;
                color: #e0e7ff;
                font-weight: 400;
                margin: 0;
                opacity: 0.9;
            }

            h2 {
                font-size: 15pt;
                font-weight: 700;
                color: #1e1b4b;
                border-bottom: 2px solid #e2e8f0;
                padding-bottom: 6px;
                margin-top: 24px;
                margin-bottom: 14px;
                page-break-after: avoid;
            }

            h3 {
                font-size: 12pt;
                font-weight: 600;
                color: #334155;
                margin-top: 18px;
                margin-bottom: 8px;
                page-break-after: avoid;
            }

            p {
                margin-top: 0;
                margin-bottom: 12px;
                color: #334155;
            }

            ul, ol {
                margin-top: 0;
                margin-bottom: 14px;
                padding-left: 20px;
            }

            li {
                margin-bottom: 6px;
                color: #334155;
            }

            blockquote {
                background: #f8fafc;
                border-left: 4px solid #6366f1;
                margin: 16px 0;
                padding: 12px 18px;
                border-radius: 0 8px 8px 0;
                font-style: italic;
                color: #1e293b;
            }

            blockquote p {
                margin: 0;
            }

            table {
                width: 100%;
                border-collapse: collapse;
                margin: 16px 0;
                font-size: 10pt;
                page-break-inside: avoid;
            }

            th {
                background-color: #1e1b4b;
                color: #ffffff;
                text-align: left;
                padding: 10px 12px;
                font-weight: 600;
            }

            td {
                padding: 9px 12px;
                border-bottom: 1px solid #e2e8f0;
                color: #334155;
            }

            tr:nth-child(even) td {
                background-color: #f8fafc;
            }

            .highlight-box {
                background-color: #f0fdf4;
                border: 1px solid #bbf7d0;
                border-radius: 8px;
                padding: 14px;
                margin: 16px 0;
                color: #166534;
            }

            hr {
                border: none;
                border-top: 1px solid #e2e8f0;
                margin: 24px 0;
            }

            code {
                font-family: 'Consolas', 'Courier New', monospace;
                background-color: #f1f5f9;
                color: #0f172a;
                padding: 2px 6px;
                border-radius: 4px;
                font-size: 9.5pt;
            }

            .footer-notes {
                margin-top: 30px;
                padding-top: 16px;
                border-top: 1px solid #e2e8f0;
                font-size: 8.5pt;
                color: #94a3b8;
                text-align: center;
            }
        </style>
    </head>
    <body>
        <div class="cover-header">
            <span class="cover-badge">DOCUMENTO MESTRE OPERACIONAL & COMERCIAL</span>
            <h1>Playbook Completo & Definitivo de Implantação SaaS</h1>
            <p class="cover-subtitle">ClinicaBot SaaS Pro — Guia de Vendas B2B, Inteligência Competitiva, Script de ROI e Onboarding Técnico em 24h</p>
        </div>

        ${parseMarkdownToHtml(mdContent)}

        <div class="footer-notes">
            ClinicaBot SaaS Pro © 2026 — Todos os direitos reservados. Documento de uso interno e comercial restrito.
        </div>
    </body>
    </html>
    `;

    // Gerar arquivos
    const pdfPathWorkspace = path.join(__dirname, '../guia_onboarding_e_fechamento_clientes.pdf');
    const pdfPathPublic = path.join(__dirname, '../public/guia_onboarding_e_fechamento_clientes.pdf');

    console.log('🔹 Iniciando Puppeteer para renderizar PDF de altíssima definição...');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    await page.pdf({
        path: pdfPathWorkspace,
        format: 'A4',
        printBackground: true,
        margin: {
            top: '15mm',
            bottom: '15mm',
            left: '12mm',
            right: '12mm'
        }
    });

    // Copiar para pasta public para disponibilizar download direto via URL
    fs.copyFileSync(pdfPathWorkspace, pdfPathPublic);

    await browser.close();

    console.log('✅ PDF gerado com sucesso!');
    console.log(`   Localização Workspace: ${pdfPathWorkspace}`);
    console.log(`   Localização Pública:   ${pdfPathPublic}`);
    console.log('================================================================\n');
}

function parseMarkdownToHtml(md) {
    let html = md
        // Remover cabeçalho inicial já estilizado
        .replace(/^# 🚀 Playbook Completo[\s\S]*?---\n/, '')
        // Converter Headings
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        // Converter Citações
        .replace(/^\> (.*$)/gim, '<blockquote><p>$1</p></blockquote>')
        // Converter Negrito e Itálico
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        // Converter Listas
        .replace(/^\* (.*$)/gim, '<li>$1</li>')
        .replace(/^- (.*$)/gim, '<li>$1</li>')
        // Converter Linhas Horizontais
        .replace(/^---$/gim, '<hr>');

    return html;
}

buildPdfFromMarkdown().then(() => process.exit(0)).catch(err => {
    console.error('❌ Erro ao gerado PDF:', err);
    process.exit(1);
});
