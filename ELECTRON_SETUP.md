# Electron Installation Guide

If Electron installation gets stuck, try these solutions:

## Option 1: Use npm instead of yarn

```bash
npm install electron electron-builder --save-dev
```

## Option 2: Set Electron mirror (for China/network issues)

```bash
# Windows
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_CACHE=%USERPROFILE%\.electron
yarn install

# Or use npm
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
npm install electron electron-builder --save-dev
```

## Option 3: Install Electron globally first

```bash
npm install -g electron
yarn install
```

## Option 4: Manual Electron download

1. Check Electron version in package.json (currently ^39.2.6)
2. Download from: https://github.com/electron/electron/releases
3. Extract to `node_modules/electron/dist/`
4. Run `yarn install` again

## Option 5: Use yarn with retry

```bash
yarn install --network-timeout 100000
```

## Option 6: Clear cache and retry

```bash
yarn cache clean
rm -rf node_modules
yarn install
```

## Verify Installation

After installation, verify Electron works:

```bash
npx electron --version
```

Or test the app:

```bash
yarn start
```

