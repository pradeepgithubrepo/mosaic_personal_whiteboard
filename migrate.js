#!/usr/bin/env node

/**
 * Microsoft Whiteboard Export to Mosaic Package (MIP) Migration Script
 * 
 * Usage:
 *   node migrate.js <input-zip-path> <output-zip-path>
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

// 1. Auto-install dependencies if they are not already present
function ensureDependencies() {
  const deps = ['jszip', 'jsdom', 'sharp'];
  const installNames = {
    'jszip': 'jszip',
    'jsdom': 'jsdom@20',
    'sharp': 'sharp@0.32.6'
  };
  const missing = [];
  for (const dep of deps) {
    try {
      require(dep);
    } catch (e) {
      missing.push(dep);
    }
  }
  if (missing.length > 0) {
    console.log(`Installing missing migration dependencies: ${missing.join(', ')}...`);
    try {
      const installPkg = missing.map(m => installNames[m]).join(' ');
      execSync(`npm install --no-save ${installPkg}`, { stdio: 'inherit' });
      console.log('Dependencies installed successfully.\n');
    } catch (err) {
      console.error('Failed to install dependencies automatically:', err.message);
      process.exit(1);
    }
  }
}

ensureDependencies();

const JSZip = require('jszip');
const { JSDOM } = require('jsdom');
const sharp = require('sharp');

// 2. Parse arguments
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Error: Missing arguments.');
  console.log('Usage:');
  console.log('  node migrate.js <input-zip-path> <output-zip-path>');
  process.exit(1);
}

const inputZipPath = path.resolve(args[0]);
const outputZipPath = path.resolve(args[1]);

if (!fs.existsSync(inputZipPath)) {
  console.error(`Error: Input file does not exist at "${inputZipPath}"`);
  process.exit(1);
}

// Helper: Calculate SHA-256 checksum of a buffer
function computeSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// Helper: Format sequential numbering
function formatNumber(num, length = 4) {
  return String(num).padStart(length, '0');
}

// Helper: Parse px value
function parsePx(val) {
  if (!val) return null;
  const parsed = parseFloat(val);
  return isNaN(parsed) ? null : parsed;
}

// Helper: Parse transformation rotation
function parseRotation(transform) {
  if (!transform || transform === 'none') return 0;
  const rotateMatch = transform.match(/rotateZ?\(([^)]+)\)/);
  if (rotateMatch) {
    const val = rotateMatch[1].trim();
    return val.endsWith('rad')
      ? Math.round((parseFloat(val) * 180) / Math.PI)
      : parseFloat(val);
  }
  const matrixMatch = transform.match(/matrix\(([^)]+)\)/);
  if (matrixMatch) {
    const parts = matrixMatch[1].split(',').map(Number);
    if (parts.length >= 2) {
      const [a, b] = parts;
      return Math.round((Math.atan2(b, a) * 180) / Math.PI);
    }
  }
  return 0;
}

// Helper: Extract CSS positions
function extractPosition(el) {
  const inlineStyle = el.style || {};
  let x = parsePx(inlineStyle.left);
  let y = parsePx(inlineStyle.top);
  let width = parsePx(inlineStyle.width);
  let height = parsePx(inlineStyle.height);

  if (width === null) {
    width = parsePx(el.getAttribute('width')) || 0;
  }
  if (height === null) {
    height = parsePx(el.getAttribute('height')) || 0;
  }

  const rotation = parseRotation(inlineStyle.transform || el.getAttribute('transform'));
  const parentTagName = el.parentElement?.tagName.toLowerCase() || 'body';
  const style = el.getAttribute('style') || '';

  return { x, y, width, height, rotation, style, parentTagName };
}

// Main migration execution
async function runMigration() {
  const startTime = Date.now();
  console.log(`[MIP Migration CLI] Starting migration...`);
  console.log(`[MIP Migration CLI] Input:  ${inputZipPath}`);
  console.log(`[MIP Migration CLI] Output: ${outputZipPath}\n`);

  // Stage 1: Read ZIP
  console.log('Stage 1: Reading input ZIP...');
  const zipData = fs.readFileSync(inputZipPath);
  const zip = await JSZip.loadAsync(zipData);
  
  const htmlFiles = Object.keys(zip.files).filter(
    (f) => f.endsWith('.html') || f.endsWith('.htm')
  );

  if (htmlFiles.length === 0) {
    console.error('Error: No HTML file found inside the ZIP export.');
    process.exit(1);
  }

  const htmlPath = htmlFiles[0];
  console.log(`Found HTML file inside ZIP: "${htmlPath}"`);
  const htmlText = await zip.files[htmlPath].async('string');

  // Stage 3: Parse DOM
  console.log('Stage 3: Parsing DOM structure...');
  const dom = new JSDOM(htmlText);
  const doc = dom.window.document;

  const nodes = [];
  let domIndex = 0;
  let totalNodes = 0;

  function walk(node) {
    if (node.nodeType === 1) { // ELEMENT_NODE
      totalNodes++;
      const tagName = node.tagName.toLowerCase();
      if (['img', 'svg', 'div', 'span', 'canvas'].includes(tagName)) {
        nodes.push({ el: node, domIndex });
      }
      domIndex++;
    }
    for (let i = 0; i < node.childNodes.length; i++) {
      walk(node.childNodes[i]);
    }
  }

  if (doc.body) {
    walk(doc.body);
  }
  console.log(`Completed DOM walk. Matched ${nodes.length} elements out of ${totalNodes} total nodes.`);

  // Stage 4: Image & Vector Extraction
  console.log('Stage 4: Extracting images and rendering SVGs to PNG...');
  const outputZip = new JSZip();

  // Stage 2: raw/dom.html (preserve original HTML)
  outputZip.file('raw/dom.html', htmlText);

  const assetsList = [];
  const boardObjectsList = [];
  const warnings = [];
  const skippedNodes = [];
  const unsupportedElements = [];

  let imgTagCount = 0;
  let svgTagCount = 0;
  let canvasTagCount = 0;

  const imagesFolder = outputZip.folder('images');

  for (let i = 0; i < nodes.length; i++) {
    const { el, domIndex: nodeIdx } = nodes[i];
    const tagName = el.tagName.toLowerCase();
    const pos = extractPosition(el);

    let imageBuffer = null;
    let nativeWidth = 0;
    let nativeHeight = 0;

    if (tagName === 'img') {
      const src = el.getAttribute('src') || '';
      if (!src) {
        skippedNodes.push({ tag: 'img', domIndex: nodeIdx, reason: 'img missing src attribute.' });
        continue;
      }

      if (src.startsWith('data:')) {
        const match = src.match(/^data:image\/([^;]+);base64,(.+)$/);
        if (match) {
          imageBuffer = Buffer.from(match[2], 'base64');
          imgTagCount++;
          try {
            const meta = await sharp(imageBuffer).metadata();
            nativeWidth = meta.width || 0;
            nativeHeight = meta.height || 0;
          } catch (e) {
            nativeWidth = pos.width || 800;
            nativeHeight = pos.height || 600;
          }
        } else {
          warnings.push(`img index ${nodeIdx} has invalid data URL format.`);
          skippedNodes.push({ tag: 'img', domIndex: nodeIdx, reason: 'Invalid data URL format.' });
        }
      } else {
        warnings.push(`img index ${nodeIdx} references external or non-inline resource: "${src}"`);
        skippedNodes.push({ tag: 'img', domIndex: nodeIdx, reason: 'Non-inline external source.' });
      }
    } else if (tagName === 'svg') {
      // Exclude tiny vector icons
      if (pos.width < 10 && pos.height < 10) {
        skippedNodes.push({ tag: 'svg', domIndex: nodeIdx, reason: `Tiny SVG vector icon ignored (${pos.width}x${pos.height})` });
        continue;
      }

      // Parse viewBox to get native high resolution
      const viewBox = el.getAttribute('viewBox');
      nativeWidth = pos.width || 800;
      nativeHeight = pos.height || 600;
      if (viewBox) {
        const parts = viewBox.trim().split(/\s+/).map(Number);
        if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
          nativeWidth = parts[2];
          nativeHeight = parts[3];
        }
      }

      // Ensure dimensions are set to native high resolution for sharp render
      const clone = el.cloneNode(true);
      clone.setAttribute('width', String(nativeWidth));
      clone.setAttribute('height', String(nativeHeight));

      const svgString = clone.outerHTML;
      try {
        imageBuffer = await sharp(Buffer.from(svgString))
          .png()
          .toBuffer();
        svgTagCount++;
      } catch (err) {
        warnings.push(`Failed to convert SVG index ${nodeIdx} to PNG: ${err.message}`);
        skippedNodes.push({ tag: 'svg', domIndex: nodeIdx, reason: `Sharp rendering error: ${err.message}` });
      }
    } else if (tagName === 'canvas') {
      skippedNodes.push({ tag: 'canvas', domIndex: nodeIdx, reason: 'Canvas elements do not contain inline pixel states.' });
    } else if (tagName === 'div' || tagName === 'span') {
      const styleBg = el.style.backgroundImage || '';
      const match = styleBg.match(/url\(['"]?([^'"]+)['"]?\)/);

      if (match && match[1] && match[1].startsWith('data:')) {
        const urlSrc = match[1];
        const dataMatch = urlSrc.match(/^data:image\/([^;]+);base64,(.+)$/);
        if (dataMatch) {
          imageBuffer = Buffer.from(dataMatch[2], 'base64');
          imgTagCount++;
          try {
            const meta = await sharp(imageBuffer).metadata();
            nativeWidth = meta.width || 0;
            nativeHeight = meta.height || 0;
          } catch (e) {
            nativeWidth = pos.width || 200;
            nativeHeight = pos.height || 200;
          }
        } else {
          skippedNodes.push({ tag: tagName, domIndex: nodeIdx, reason: 'Invalid background-image data URL.' });
        }
      } else {
        skippedNodes.push({ tag: tagName, domIndex: nodeIdx, reason: 'Non-visual container element.' });
      }
    } else {
      unsupportedElements.push(tagName);
    }

    // Write image file if extracted
    if (imageBuffer) {
      const assetIndex = assetsList.length;
      const fileName = `IMG_${formatNumber(assetIndex, 4)}.png`;

      if (imagesFolder) {
        imagesFolder.file(fileName, imageBuffer);
      }

      const sha = computeSha256(imageBuffer);
      const assetId = `asset-${assetIndex}`;
      const objectId = `obj-${assetIndex}`;

      // Register asset with native high resolution size
      assetsList.push({
        id: assetId,
        file: `images/${fileName}`,
        mime: 'image/png',
        sha256: sha,
        bytes: imageBuffer.length,
        width: nativeWidth || pos.width || 800,
        height: nativeHeight || pos.height || 600,
      });

      // Register board object with display bounds, fallback to native if display is 0/null
      boardObjectsList.push({
        id: objectId,
        type: 'image',
        assetId: assetId,
        bounds: {
          x: pos.x,
          y: pos.y,
          width: pos.width || nativeWidth || 800,
          height: pos.height || nativeHeight || 600,
        },
        rotation: pos.rotation,
        layer: assetIndex,
        style: pos.style,
        domIndex: nodeIdx,
        parent: pos.parentTagName,
      });
    }
  }

  // Write assets.json
  outputZip.file('assets.json', JSON.stringify({ assets: assetsList }, null, 2));

  // Write board.json
  outputZip.file('board.json', JSON.stringify({ objects: boardObjectsList }, null, 2));

  // Stage 7: metadata.json
  const metadataJson = {
    packageVersion: '1.0',
    generationTime: new Date().toISOString(),
    generatorVersion: '1.0',
    assetCount: assetsList.length,
    boardCount: boardObjectsList.length,
    htmlName: htmlPath.split('/').pop() || 'Board.html',
    packageType: 'MIP',
  };
  outputZip.file('metadata.json', JSON.stringify(metadataJson, null, 2));

  // Stage 8: manifest.json
  const boardName = htmlPath.split('/').pop()?.replace(/\.html?$/i, '') || 'Board';
  const manifestJson = {
    schemaVersion: '1.0',
    source: 'Microsoft Whiteboard',
    boardName: boardName,
    totalAssets: assetsList.length,
    totalImgTags: imgTagCount,
    totalSvg: svgTagCount,
    generatedBy: 'Mosaic Migration Engine',
  };
  outputZip.file('manifest.json', JSON.stringify(manifestJson, null, 2));

  // Stage 9: diagnostics.json
  const duration = Date.now() - startTime;
  const diagnosticsJson = {
    warnings,
    skippedNodes,
    unsupportedElements: Array.from(new Set(unsupportedElements)),
    extractionSummary: {
      totalNodes: totalNodes,
      extractedImages: imgTagCount,
      extractedSvgs: svgTagCount,
      extractedCanvases: canvasTagCount,
    },
    processingTime: duration,
    errors: [],
  };
  outputZip.file('diagnostics.json', JSON.stringify(diagnosticsJson, null, 2));

  // Stage 10: report.md
  const totalSkipped = skippedNodes.length;
  const successRate = assetsList.length > 0
    ? Math.round((assetsList.length / (assetsList.length + totalSkipped)) * 100)
    : 100;

  const reportMd = `# Microsoft Whiteboard Migration Report

- **Input HTML:** ${metadataJson.htmlName}
- **Total Images Extracted:** ${assetsList.length}
- **Extraction Success Rate:** ${successRate}%
- **Skipped Elements:** ${totalSkipped}
- **Warnings:** ${warnings.length}
- **Package Generated Successfully:** Yes
`;
  outputZip.file('report.md', reportMd);

  // Generate output zip buffer and write to disk
  console.log('Compiling output ZIP package...');
  const outputZipBuffer = await outputZip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.writeFileSync(outputZipPath, outputZipBuffer);

  console.log(`\n[MIP Migration CLI] Complete! Generated MIP package successfully at:`);
  console.log(`  ${outputZipPath}`);
  console.log(`[MIP Migration CLI] Processing Time: ${duration}ms\n`);
}

runMigration().catch((err) => {
  console.error('\nMigration failed with error:', err);
  process.exit(1);
});
