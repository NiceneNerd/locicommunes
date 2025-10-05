# Quote Image Generator

A minimalist, mobile-first web app for creating beautiful quote images for social media (Instagram/Facebook stories).

## Features

- 🎨 **Minimalist UI**: Clean, resource-light, mobile-first design
- 📱 **9:16 Format**: Perfect for Instagram and Facebook stories
- 🎭 **Smart Design**: 
  - Blurred cover image background
  - Cover image positioned at bottom right with shadow
  - Quote text with intelligent sizing and wrapping
  - Semi-transparent background for readability
  - Colors automatically extracted from cover image
- ⚡ **HTMX Integration**: Fast, lightweight interactions without complex JavaScript
- 🔓 **100% Open Source**: Built with Express, Canvas, and node-vibrant

## Installation

```bash
npm install
```

**Note for pnpm users:** The canvas module requires native build scripts. If using pnpm, you'll need to approve the build:

```bash
pnpm install
pnpm approve-builds canvas
# Select canvas with space, press enter, then approve with 'y'
```

## Usage

Start the server:

```bash
npm start
```

Open your browser to `http://localhost:3000`

## How to Use

1. Enter your quote in the text area
2. Upload a book cover image (or any image)
3. Click "Generate Quote Image"
4. The generated image opens in a new tab
5. Right-click and save the image

## Technology Stack

- **Backend**: Node.js with Express
- **Image Processing**: node-canvas for server-side image manipulation
- **Color Extraction**: node-vibrant for dominant color detection
- **Frontend**: HTMX for dynamic interactions
- **File Upload**: Multer for handling multipart form data

## Requirements

- Node.js 14 or higher
- npm or yarn

## License

ISC
