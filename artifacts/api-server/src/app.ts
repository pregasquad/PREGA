import express, { type Express } from "express";
import cors from "cors";
import compression from "compression";

const app: Express = express();

app.use(compression());
app.use(cors());
app.use(
  express.json({
    limit: "10mb",
  }),
);
app.use(express.urlencoded({ limit: "10mb", extended: false }));

if (process.env.NODE_ENV !== "production") {
  app.use((_req, res, next) => {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    next();
  });
}

export default app;
