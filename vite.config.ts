import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
	plugins: [svelte()],

	optimizeDeps: {
		exclude: ["svelte"],
	},

	build: {
		rollupOptions: {
			input: {
				main: path.resolve(__dirname, "index.html"),
				"15870": path.resolve(__dirname, "src/pages/15870/index.html"),
				"16076": path.resolve(__dirname, "src/pages/16076/index.html"),
				"16090": path.resolve(__dirname, "src/pages/16090/index.html"),
			},
		},
	},
});
