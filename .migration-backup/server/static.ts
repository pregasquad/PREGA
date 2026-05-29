import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Serve static files from uploads directory first
  const uploadPath = path.resolve(process.cwd(), "uploads");
  if (fs.existsSync(uploadPath)) {
    app.use("/uploads", express.static(uploadPath));
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (req, res) => {
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
      res.status(200).set({ "Content-Type": "text/html" }).end(html);
    } else {
      res.sendFile(indexPath);
    }
  });
}
