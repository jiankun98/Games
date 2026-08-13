import express from "express";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.use(resolve(__dirname, "public"));
