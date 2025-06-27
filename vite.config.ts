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
		minify: false,
		rollupOptions: {
			input: {
				main: path.resolve(__dirname, "index.html"),
				"13768": path.resolve(__dirname, "src/pages/13768/index.html"),
				"13768_2": path.resolve(__dirname, "src/pages/13768_2/index.html"),
			},
		},
	},
});
