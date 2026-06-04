import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/.migration-backup/**"] },

  // Base JS — disable rules TypeScript already handles, plus noisy style rules
  {
    ...js.configs.recommended,
    rules: {
      ...js.configs.recommended.rules,
      "no-undef": "off",
      "no-unused-vars": "off",
      "no-empty": "off",
      "no-useless-escape": "off",
      "no-useless-assignment": "warn",
      "prefer-const": "warn",
    },
  },

  // TypeScript rules for all TS/TSX files
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [...tseslint.configs.recommended],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-unused-expressions": "error",
    },
  },

  // Frontend-specific rules
  {
    files: ["artifacts/pregasquad-manager/src/**/*.{ts,tsx}", "artifacts/mockup-sandbox/src/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-refresh/only-export-components": "off",
    },
  },

  // API server / libs — Node.js globals
  {
    files: ["artifacts/api-server/src/**/*.ts", "lib/**/*.ts", "scripts/src/**/*.ts"],
    languageOptions: {
      globals: {
        process: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        Buffer: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
      },
    },
  },
);
