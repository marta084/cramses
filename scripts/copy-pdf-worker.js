const fs = require('fs');
const path = require('path');

// Source worker file
const workerSrc = path.join(__dirname, '../node_modules/pdfjs-dist/build/pdf.worker.min.js');

// Destination directory
const publicDir = path.join(__dirname, '../public');
const workerDest = path.join(publicDir, 'pdf.worker.js');

// Create public directory if it doesn't exist
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// List the contents of the pdfjs-dist directory to help debug
const pdfjsDir = path.join(__dirname, '../node_modules/pdfjs-dist');
console.log('Contents of pdfjs-dist directory:');
if (fs.existsSync(pdfjsDir)) {
  const files = fs.readdirSync(pdfjsDir);
  console.log(files);

  const buildDir = path.join(pdfjsDir, 'build');
  if (fs.existsSync(buildDir)) {
    console.log('\nContents of build directory:');
    console.log(fs.readdirSync(buildDir));
  }
} else {
  console.log('pdfjs-dist directory not found!');
}

// Copy worker file
if (fs.existsSync(workerSrc)) {
  fs.copyFileSync(workerSrc, workerDest);
  console.log('PDF.js worker file copied successfully!');
} else {
  console.error('Worker source file not found at:', workerSrc);
  process.exit(1);
}
