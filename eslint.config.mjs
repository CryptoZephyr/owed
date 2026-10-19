import tseslint from "typescript-eslint";

const config = [{ ignores: [".next/**", "next-env.d.ts"] }, ...tseslint.configs.recommended];
export default config;
