import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const paths = {
  root: path.join(__dirname, "../.."),
  views: path.join(__dirname, "../views"),
  public: path.join(__dirname, "../../public"),
};
