<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# EMO AI Companion

EMO is an education assistant robot powered by the Gemini Live API with visual context capabilities using SerpApi. It features a responsive split-screen UI optimized for touchscreen displays, running smoothly on low RAM devices like the Raspberry Pi 5 and Lenovo Android Tab.

## 1. Setup for development

**Prerequisites:** Node.js (v18+ recommended)

Clone the repository and install dependencies:
```bash
npm install
```

## 2. Setup Gemini key

Set your Gemini API key in `server/.env` and/or `.env.local`:
```env
GEMINI_API_KEY=your_gemini_key_here
```
*(Note: If you were previously using `API_KEY`, it will still work for backward compatibility).*

## 3. Setup SerpApi key

Set your SerpApi key in `server/.env` for the image search feature to work:
```env
SERPAPI_API_KEY=your_serpapi_key_here
```

## 4. Run backend

The Node.js Express backend handles image searches and topic relevance logic securely.
```bash
npm run dev:server
```
*(Runs on port 5000 by default)*

## 5. Run frontend

In a separate terminal, run the Vite frontend:
```bash
npm run dev:app
```
*Alternatively, run both simultaneously with `npm run dev:all`.*

## 6. Run Electron on Raspberry Pi

To start in Electron mode (optimized for 11-inch touchscreen and kiosk mode):
```bash
npm run electron:dev
```
For production build:
```bash
npm run electron:build
# or for ARM64:
npm run electron:build:arm64
```

## 7. Build Android APK for Lenovo Tab

This project uses Capacitor for Android support. To build the APK:
```bash
npm run build:android
```
Then open the `android` folder in Android Studio to run or build the final APK.

## 8. Troubleshooting

- **Missing API key**: Check your `.env` files in both the root and `server` directories.
- **Image not showing**: Ensure `SERPAPI_API_KEY` is correct and your internet connection is stable.
- **API limit over**: If SerpApi limits are reached, the visual context panel will show an error or fallback message gracefully.
- **Internet issue**: The app will display connection errors on the UI without crashing.
- **Touch scroll not working**: Ensure you are using a touch-enabled device or simulating touch in dev tools. Visible scrollbars are intentionally hidden.
- **Blank screen on Android**: Ensure `VITE_BACKEND_URL` is set correctly pointing to your accessible backend server IP, not just `localhost`.
- **Low RAM performance tips**: The app uses memory caching and async decoding. Avoid keeping too many heavy background apps running on 1GB RAM devices.
