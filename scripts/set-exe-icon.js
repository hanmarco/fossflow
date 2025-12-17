const path = require('path');
const rcedit = require('rcedit');

function main() {
  const exePath = path.join(__dirname, '..', 'dist', 'fossflow-local 1.0.1.exe');
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.ico');

  rcedit(exePath, { icon: iconPath }, function (err) {
    if (err) {
      console.error('Failed to set icon:', err);
      process.exit(1);
    }
    console.log('Set icon for', exePath);
  });
}

main();
