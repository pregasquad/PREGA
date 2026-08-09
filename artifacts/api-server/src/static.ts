import express, { type Express } from "express";
import fs from "fs";
import path from "path";

function resolveDistPath(): string | null {
  const candidates = [
    path.resolve(__dirname, "public"),
    path.resolve(__dirname, "..", "..", "pregasquad-manager", "dist", "public"),
    path.resolve(process.cwd(), "..", "pregasquad-manager", "dist", "public"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(path.join(p, "index.html"))) return p;
  }
  return null;
}

export function serveStatic(app: Express) {
  const distPath = resolveDistPath();
  if (!distPath) {
    console.warn(
      "[static] Frontend build not found — serving API only. Run the pregasquad-manager build to enable the UI."
    );
    return;
  }

  const uploadPath = path.resolve(process.cwd(), "uploads");
  if (fs.existsSync(uploadPath)) {
    app.use("/uploads", express.static(uploadPath));
  }

  // Hashed build assets (/assets/*-<hash>.js|css) are immutable — cache 1 year on phones.
  // Everything else (index.html, sw.js, manifest) must revalidate so updates ship instantly.
  app.use(
    express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (/[/\\]assets[/\\][^/\\]+-[A-Za-z0-9_-]{8,}\.\w+$/.test(filePath)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else {
          res.setHeader("Cache-Control", "no-cache");
        }
      },
    })
  );

  app.use("*splat", (req, res) => {
    const indexPath = path.resolve(distPath, "index.html");
    const portalMatch = req.originalUrl.match(/^\/staff-portal\/([^/?]+)/);
    if (portalMatch) {
      const token = portalMatch[1];
      let html = fs.readFileSync(indexPath, "utf-8");
      html = html.replace(
        'href="/manifest.json"',
        `href="/api/public/staff-portal/${token}/manifest.json"`,
      );
      html = html.replace(
        '<meta name="apple-mobile-web-app-title" content="PregaSquad" />',
        `<meta name="apple-mobile-web-app-title" content="PregaSquad Portal" />`,
      );
      res.status(200).set({ "Content-Type": "text/html", "Cache-Control": "no-cache" }).end(html);
    } else {
      res.set("Cache-Control", "no-cache").sendFile(indexPath);
    }
  });
}
