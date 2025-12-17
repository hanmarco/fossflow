const fs = require('fs');
const path = require('path');
const pngToIco = require('png-to-ico');

async function main() {
  const src = path.join(__dirname, '..', 'public', 'logo512.png');
  const outDir = path.join(__dirname, '..', 'assets');

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  const icoPath = path.join(outDir, 'icon.ico');
  // png-to-ico expects a filepath (string) to a PNG (preferably 256x256).
  // Pass the path directly.
  const buffer = await pngToIco(src);
  fs.writeFileSync(icoPath, buffer);

  console.log('Created', icoPath);
}

main().catch(err => { console.error(err); process.exit(1); });
