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

    // Story dimensions (9:16 aspect ratio)
    const storyWidth = 1080;
    const storyHeight = 1920;

    // Create canvas
    const canvas = createCanvas(storyWidth, storyHeight);
    const ctx = canvas.getContext('2d');


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
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
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
    // Set text background color: almost black or almost white
    const bgColor = paletteLuminance > 0.5
      ? 'rgba(255,255,255,0.65)' // almost white, more transparent
      : 'rgba(0,0,0,0.65)'; // almost black, more transparent

    // Step 2: Draw the cover image at bottom right
    const coverHeight = storyHeight * 0.25;
    const coverWidth = (coverImage.width / coverImage.height) * coverHeight;
    const coverX = storyWidth - coverWidth - 60;
    const coverY = storyHeight - coverHeight - 60;

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
    const textAreaTop = 100;
    const textAreaBottom = coverY - 60;
    const textAreaHeight = textAreaBottom - textAreaTop;
    const textAreaWidth = storyWidth - 120;
    const textAreaX = 60;

    // Find optimal font size
    let fontSize = 80;
    let lines = [];
    let totalTextHeight = 0;

    do {
      fontSize -= 2;
      lines = measureText(ctx, quote, fontSize, textAreaWidth);
      const lineHeight = fontSize * 1.4;
      totalTextHeight = lines.length * lineHeight;
    } while (totalTextHeight > textAreaHeight && fontSize > 20);

    const lineHeight = fontSize * 1.4;
    totalTextHeight = lines.length * lineHeight;

    // Calculate max line width
    ctx.font = `${fontSize}px 'Georgia', serif`;
    const maxLineWidth = lines.reduce((max, line) => {
      return Math.max(max, ctx.measureText(line).width);
    }, 0);

    // Calculate text block position
    const textBlockTop = textAreaTop + (textAreaHeight - totalTextHeight) / 2;
    const textCenterX = storyWidth / 2;
    const paddingX = 40;
    const paddingY = 30;

    const bgWidth = Math.max(1, Math.round(maxLineWidth + paddingX * 2));
    const bgHeight = Math.max(1, Math.round(totalTextHeight + paddingY * 2));
    const bgX = Math.round(textCenterX - bgWidth / 2);
    const bgY = Math.round(textBlockTop - paddingY);

    const radius = 15;

    // Create an offscreen canvas for extra blur, sample from the blurred offscreen (before overlay)
    const textBgCanvas = createCanvas(bgWidth, bgHeight);
    const textBgCtx = textBgCanvas.getContext('2d');
    // Draw the corresponding region from the offscreen canvas (blurred at 40)
    textBgCtx.drawImage(offscreen, bgX, bgY, bgWidth, bgHeight, 0, 0, bgWidth, bgHeight);
    // Apply much stronger blur
    const textBlurRadius = Math.max(15, Math.round(Math.min(80, Math.max(bgWidth, bgHeight) / 3)));
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
      ctx.fillText(line, textCenterX, y);
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
