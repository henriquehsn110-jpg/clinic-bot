const fs = require('fs');
const html = fs.readFileSync('public/dashboard.html', 'utf8');
const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
if (styleMatch) {
    fs.writeFileSync('public/index.css', styleMatch[1].trim());
    const newHtml = html.replace(styleMatch[0], '<link rel="stylesheet" href="/index.css">');
    fs.writeFileSync('public/dashboard.html', newHtml);
    console.log('CSS extracted to public/index.css');
}
