// Polyfill browser globals at the root Node.js process level for native ESM dependencies like pdfjs-dist
if (typeof globalThis !== "undefined") {
  if (!globalThis.DOMMatrix) {
    globalThis.DOMMatrix = class DOMMatrix {
      a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
      constructor(init) {
        if (Array.isArray(init)) {
          this.a = init[0]; this.b = init[1]; this.c = init[2]; this.d = init[3]; this.e = init[4]; this.f = init[5];
        }
      }
    };
  }
  if (!globalThis.ImageData) {
    globalThis.ImageData = class ImageData {
      constructor(width, height) {
        this.width = width;
        this.height = height;
        this.data = new Uint8ClampedArray(width * height * 4);
      }
    };
  }
  if (!globalThis.Path2D) {
    globalThis.Path2D = class Path2D {};
  }
}
if (typeof global !== "undefined") {
  if (!global.DOMMatrix) global.DOMMatrix = globalThis.DOMMatrix;
  if (!global.ImageData) global.ImageData = globalThis.ImageData;
  if (!global.Path2D) global.Path2D = globalThis.Path2D;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  swcMinify: false,
  eslint: {
    // Disables ESLint run during production builds
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Disables type checks during production builds
    ignoreBuildErrors: true,
  },
  experimental: {
    serverComponentsExternalPackages: ["pdf-parse", "mammoth", "pg", "puppeteer-core"],
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
