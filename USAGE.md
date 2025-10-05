# Quote Image Generator - Usage Guide

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```
   
   **Note for pnpm users:** Canvas requires build approval:
   ```bash
   pnpm install
   pnpm approve-builds canvas  # Select canvas, approve with 'y'
   ```

2. **Start the server:**
   ```bash
   npm start
   ```

3. **Open in browser:**
   Navigate to `http://localhost:3000`

## How It Works

### User Interface
The app features a clean, mobile-first interface with:
- A text area for entering quotes
- An image upload field for book covers
- A generate button that creates the quote image
- The generated image opens automatically in a new tab

### Image Generation Process

1. **Background Layer**: The cover image is cropped to 9:16 aspect ratio and blurred to create an attractive background

2. **Cover Placement**: A second copy of the cover is placed at the bottom-right corner with:
   - Natural aspect ratio maintained
   - Sized to ~25% of image height
   - Offset positioning with padding
   - Subtle drop shadow for depth

3. **Quote Text**: The quote is rendered with:
   - Automatic text sizing to fit available space
   - Intelligent line wrapping
   - Elegant serif font (Georgia)
   - Semi-transparent background for readability
   - Colors extracted from the cover image's dominant palette

4. **Color Extraction**: Uses node-vibrant to analyze the cover and select:
   - Text color (dark or light based on background luminance)
   - Background color (semi-transparent version of dominant color)

## Technical Details

### Image Specifications
- **Output Format**: PNG
- **Dimensions**: 1080 x 1920 pixels (9:16 aspect ratio)
- **Target Platform**: Instagram Stories, Facebook Stories

### Server Endpoints
- `GET /` - Serves the main interface
- `POST /generate` - Accepts form data and returns generated image
  - Parameters:
    - `quote` (text): The quote text
    - `cover` (file): The book cover image

### Dependencies
- **express**: Web server framework
- **multer**: Handles file uploads
- **canvas**: Server-side image manipulation
- **node-vibrant**: Extracts color palettes from images
- **htmx**: Client-side dynamic interactions

## Tips for Best Results

1. **Image Quality**: Use high-resolution cover images for best results
2. **Quote Length**: Keep quotes concise for better readability
3. **Image Format**: JPEG, PNG, and most common image formats are supported
4. **Mobile First**: The interface is optimized for mobile devices but works great on desktop too

## Customization

To customize the appearance, edit:
- `public/index.html` - For UI styling and layout
- `server.js` - For image generation parameters like:
  - Font size range
  - Padding values
  - Cover image sizing
  - Blur intensity
  - Shadow effects

## Troubleshooting

### Canvas module build error
If you see `Error: Cannot find module '../build/Release/canvas.node'`:

**For pnpm users:**
```bash
pnpm approve-builds canvas
```
Select canvas with spacebar, press enter, then type 'y' to approve.

**For npm users:**
```bash
npm rebuild canvas
```

**Missing system dependencies:**
Canvas requires Cairo graphics library. Install with:
```bash
# Ubuntu/Debian
sudo apt-get install libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev build-essential g++

# macOS
brew install cairo pango jpeg giflib pkg-config

# Fedora
sudo dnf install cairo-devel libjpeg-turbo-devel pango-devel giflib-devel
```

### Server won't start
- Ensure Node.js version 14+ is installed
- Run `npm install` to install dependencies
- Check if port 3000 is available

### Images not generating
- Verify the uploaded image is a valid format
- Check server logs for error messages
- Ensure there's sufficient memory for image processing

### Colors look wrong
- Some images may not have strong color palettes
- Try images with more vibrant colors
- The algorithm falls back to white text on black background if needed

## License

ISC - Open source and free to use
