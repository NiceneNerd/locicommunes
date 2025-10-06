const express = require('express');
const multer = require('multer');
const { createCanvas, loadImage } = require('canvas');
const { Vibrant } = require('node-vibrant/node');
const StackBlur = require('stackblur-canvas');
const path = require('path');
const fs = require('fs');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.static('public'));
app.use(express.json());

// Helper function to get luminance of a color
function getLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

// Helper function to determine if color is light or dark
function isLightColor(r, g, b) {
  return getLuminance(r, g, b) > 0.5;
}

// Helper function to measure text width
function measureText(ctx, text, fontSize, maxWidth) {
  ctx.font = `${fontSize}px 'Georgia', serif`;
  const paragraphs = text.replace(/\r\n/g, '\n').split('\n');
  const lines = [];

  paragraphs.forEach(segment => {
    const words = segment.split(/\s+/).filter(Boolean);

    if (words.length === 0) {
      lines.push('');
      return;
    }

    let currentLine = words[0];
    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      const testLine = `${currentLine} ${word}`;
      if (ctx.measureText(testLine).width <= maxWidth) {
        currentLine = testLine;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
    lines.push(currentLine);
  });

  return lines;
}

app.post('/generate', upload.single('cover'), async (req, res) => {
  try {
    const quote = req.body.quote;
    const aspectRatio = req.body.aspectRatio || '9:16'; // Default to 9:16

    // Validate inputs
    if (!quote || !quote.trim()) {
      return res.status(400).json({ error: 'Quote text is required' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Cover image is required' });
    }

    const coverBuffer = req.file.buffer;

    // Load the cover image
    const coverImage = await loadImage(coverBuffer);

    // Story dimensions based on aspect ratio
    let storyWidth, storyHeight;
    switch (aspectRatio) {
      case '2:1':
        storyWidth = 1920;
        storyHeight = 960;
        break;
      case '1:1':
        storyWidth = 1080;
        storyHeight = 1080;
        break;
      case '9:16':
      default:
        storyWidth = 1080;
        storyHeight = 1920;
        break;
    }

    // Create canvas
    const canvas = createCanvas(storyWidth, storyHeight);
    const ctx = canvas.getContext('2d');

  // layout margins / padding (increased for more breathing room)
  const margin = 80; // edge margin (used to position mini cover and text area)


    // Step 1: Draw blurred background
    // Calculate crop dimensions to maintain aspect ratio
    const coverAspect = coverImage.width / coverImage.height;
    const storyAspect = storyWidth / storyHeight;

    let cropWidth, cropHeight, cropX, cropY;
    if (coverAspect > storyAspect) {
      // Image is wider than story
      cropHeight = coverImage.height;
      cropWidth = coverImage.height * storyAspect;
      cropX = (coverImage.width - cropWidth) / 2;
      cropY = 0;
    } else {
      // Image is taller than story
      cropWidth = coverImage.width;
      cropHeight = coverImage.width / storyAspect;
      cropX = 0;
      cropY = (coverImage.height - cropHeight) / 2;
    }

    // Draw cropped image to an offscreen canvas
    const offscreen = createCanvas(storyWidth, storyHeight);
    const offCtx = offscreen.getContext('2d');
    offCtx.drawImage(
      coverImage,
      cropX, cropY, cropWidth, cropHeight,
      0, 0, storyWidth, storyHeight
    );


    // Apply blur using stackblur-canvas
    const blurRadius = 40; // 80 is visually strong for 1080x1920
    const imageData = offCtx.getImageData(0, 0, storyWidth, storyHeight);
    StackBlur.imageDataRGBA(imageData, 0, 0, storyWidth, storyHeight, blurRadius);
    ctx.putImageData(imageData, 0, 0);    // Add a semi-transparent overlay for better contrast
    ctx.fillStyle = 'rgba(0, 0, 0, 0.33)';
    ctx.fillRect(0, 0, storyWidth, storyHeight);

    // Extract dominant colors
    const palette = await Vibrant.from(coverBuffer).getPalette();
    const vibrantSwatch = palette.Vibrant || palette.Muted || palette.DarkMuted;
    const textColor = vibrantSwatch ?
      (isLightColor(...vibrantSwatch.rgb) ? 'rgb(40, 40, 40)' : 'rgb(255, 255, 255)') :
      'rgb(255, 255, 255)';

    // Determine if overall palette is light or dark
    let paletteLuminance = 0.2; // default to dark
    if (vibrantSwatch) {
      paletteLuminance = getLuminance(...vibrantSwatch.rgb);
    }
    // We'll compute the final `bgColor` later once we know the exact text background
    // rectangle (bgX, bgY, bgWidth, bgHeight). That lets us sample the precise
    // blurred pixels and pick an appropriate alpha so the background remains
    // visibly translucent on bright images.

    let coverX, coverY, coverWidth, coverHeight;
    let textAreaX, textAreaWidth, textAreaHeight, textAreaTop, textAreaBottom;

    if (aspectRatio === '2:1') {
      // Right side for cover
      const coverAreaWidth = storyWidth * 0.35;
      const coverAreaX = storyWidth - coverAreaWidth;

      coverWidth = coverAreaWidth - (margin * 2);
      coverHeight = (coverImage.height / coverImage.width) * coverWidth;

      if (coverHeight > storyHeight - (margin * 2)) {
        coverHeight = storyHeight - (margin * 2);
        coverWidth = (coverImage.width / coverImage.height) * coverHeight;
      }

      coverX = coverAreaX + (coverAreaWidth - coverWidth) / 2;
      coverY = (storyHeight - coverHeight) / 2;

      // Left side for text
      textAreaX = margin;
      textAreaWidth = storyWidth - coverAreaWidth - margin;
      textAreaTop = margin;
      textAreaBottom = storyHeight - margin;
      textAreaHeight = textAreaBottom - textAreaTop;

    } else {
      // Bottom right for cover (default behavior)
      coverHeight = storyHeight * 0.25;
      coverWidth = (coverImage.width / coverImage.height) * coverHeight;
      coverX = storyWidth - coverWidth - margin;
      coverY = storyHeight - coverHeight - margin;

      textAreaTop = 100;
      textAreaBottom = coverY - margin;
      textAreaHeight = textAreaBottom - textAreaTop;
      textAreaWidth = storyWidth - (margin * 2);
      textAreaX = margin;
    }


    // Step 2: Draw the cover image
    // Draw shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetX = 5;
    ctx.shadowOffsetY = 5;
    ctx.drawImage(coverImage, coverX, coverY, coverWidth, coverHeight);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Step 3: Draw quote text
    // Padding for the text background
    const paddingX = 60; // increased horizontal padding
    const paddingY = 40; // increased vertical padding

    // We'll measure text constrained to the inner width (accounting for horizontal padding)
    const wrapWidth = Math.max(10, textAreaWidth - paddingX * 2);

    // Find optimal font size while wrapping to wrapWidth
    let fontSize = 80;
    let lines = [];
    let totalTextHeight = 0;

    do {
      fontSize -= 2;
      lines = measureText(ctx, quote, fontSize, wrapWidth);
      const lineHeight = fontSize * 1.4;
      totalTextHeight = lines.length * lineHeight;
    } while (totalTextHeight > textAreaHeight && fontSize > 20);

    const lineHeight = fontSize * 1.4;
    totalTextHeight = lines.length * lineHeight;

    // Calculate max line width from measured lines
    ctx.font = `${fontSize}px 'Georgia', serif`;
    const maxLineWidth = lines.reduce((max, line) => Math.max(max, ctx.measureText(line).width), 0);

    // Calculate text block position (centered within the text area, not entire canvas)
    const textBlockTop = textAreaTop + (textAreaHeight - totalTextHeight) / 2;
    const textAreaCenterX = textAreaX + textAreaWidth / 2;

    const bgWidth = Math.max(1, Math.round(maxLineWidth + paddingX * 2));
    const bgHeight = Math.max(1, Math.round(totalTextHeight + paddingY * 2));
    const bgX = Math.round(textAreaCenterX - bgWidth / 2);
    const bgY = Math.round(textBlockTop - paddingY);

    const radius = 15;

    // Compute adaptive background alpha by sampling the exact blurred region under
    // the text background. Brighter sampled areas will yield a lower alpha so the
    // background doesn't appear fully solid.
    let bgAlpha = 0.65; // default fallback
    try {
      // Clamp sample rect to canvas bounds
      const sampleX = Math.max(0, Math.min(storyWidth - 1, bgX));
      const sampleY = Math.max(0, Math.min(storyHeight - 1, bgY));
      const sampleW = Math.max(1, Math.min(bgWidth, storyWidth - sampleX));
      const sampleH = Math.max(1, Math.min(bgHeight, storyHeight - sampleY));

      const sampleData = offCtx.getImageData(sampleX, sampleY, sampleW, sampleH).data;
      let totalLum = 0;
      const pxCount = sampleW * sampleH;
      // iterate pixels
      for (let i = 0; i < sampleData.length; i += 4) {
        const r = sampleData[i];
        const g = sampleData[i + 1];
        const b = sampleData[i + 2];
        totalLum += getLuminance(r, g, b);
      }
      const avgLum = totalLum / pxCount; // 0..1

      // Map avgLum (0..1) to alpha range (dark -> stronger bg). We'll use 0.78..0.28.
      bgAlpha = 0.78 - (avgLum * (0.78 - 0.28));
      bgAlpha = Math.max(0.28, Math.min(0.78, bgAlpha));
    } catch (e) {
      console.warn('Adaptive bg alpha sampling failed, using fallback alpha', e && e.message);
      bgAlpha = 0.65;
    }

    const bgColor = paletteLuminance > 0.5
      ? `rgba(255,255,255,${bgAlpha})`
      : `rgba(0,0,0,${bgAlpha})`;

    // Create an offscreen canvas for extra blur, sample from the blurred offscreen (before overlay)
    const textBgCanvas = createCanvas(bgWidth, bgHeight);
    const textBgCtx = textBgCanvas.getContext('2d');
    // Draw the corresponding region from the offscreen canvas (blurred at 40)
    textBgCtx.drawImage(offscreen, bgX, bgY, bgWidth, bgHeight, 0, 0, bgWidth, bgHeight);
    // Apply much stronger blur
    const textBlurRadius = Math.max(15, Math.round(Math.min(100, Math.max(bgWidth, bgHeight) / 3)));
    if (textBlurRadius > 0) {
      let textBgImageData = textBgCtx.getImageData(0, 0, bgWidth, bgHeight);
      StackBlur.imageDataRGBA(textBgImageData, 0, 0, bgWidth, bgHeight, textBlurRadius);
      textBgCtx.putImageData(textBgImageData, 0, 0);
    }
    // Draw the extra blurred region back to the main canvas (overwrites the overlay)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(bgX + radius, bgY);
    ctx.lineTo(bgX + bgWidth - radius, bgY);
    ctx.quadraticCurveTo(bgX + bgWidth, bgY, bgX + bgWidth, bgY + radius);
    ctx.lineTo(bgX + bgWidth, bgY + bgHeight - radius);
    ctx.quadraticCurveTo(bgX + bgWidth, bgY + bgHeight, bgX + bgWidth - radius, bgY + bgHeight);
    ctx.lineTo(bgX + radius, bgY + bgHeight);
    ctx.quadraticCurveTo(bgX, bgY + bgHeight, bgX, bgY + bgHeight - radius);
    ctx.lineTo(bgX, bgY + radius);
    ctx.quadraticCurveTo(bgX, bgY, bgX + radius, bgY);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(textBgCanvas, bgX, bgY);
    ctx.restore();

    // Draw the text background color (#FAFAFA or #212121, semi-transparent)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(bgX + radius, bgY);
    ctx.lineTo(bgX + bgWidth - radius, bgY);
    ctx.quadraticCurveTo(bgX + bgWidth, bgY, bgX + bgWidth, bgY + radius);
    ctx.lineTo(bgX + bgWidth, bgY + bgHeight - radius);
    ctx.quadraticCurveTo(bgX + bgWidth, bgY + bgHeight, bgX + bgWidth - radius, bgY + bgHeight);
    ctx.lineTo(bgX + radius, bgY + bgHeight);
    ctx.quadraticCurveTo(bgX, bgY + bgHeight, bgX, bgY + bgHeight - radius);
    ctx.lineTo(bgX, bgY + radius);
    ctx.quadraticCurveTo(bgX, bgY, bgX + radius, bgY);
    ctx.closePath();
  ctx.fillStyle = bgColor;
    ctx.fill();
    ctx.restore();

    // Draw text
    ctx.fillStyle = textColor;
    ctx.font = `${fontSize}px 'Georgia', serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    lines.forEach((line, i) => {
      const y = textBlockTop + i * lineHeight;
      ctx.fillText(line, textAreaCenterX, y);
    });

    // Convert canvas to buffer and send
    const buffer = canvas.toBuffer('image/png');
    res.setHeader('Content-Type', 'image/png');
    res.send(buffer);

  } catch (error) {
    console.error('Error generating image:', error);
    res.status(500).json({ error: 'Failed to generate image' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Quote image generator running on http://localhost:${PORT}`);
});
