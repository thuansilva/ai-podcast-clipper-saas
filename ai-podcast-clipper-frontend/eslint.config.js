import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // Escopo restrito de volta ao que `next lint` (comando antigo, removido no Next
    // 16.4.0) cobria por padrão: app/, pages/, components/, lib/, src/ — na prática,
    // neste projeto, só `src/`. `eslint .` (comando novo) varre o repo inteiro, então
    // excluímos aqui o que nunca foi coberto antes (tests/, load-tests/, configs de
    // raiz) pra não travar o CI com dívida técnica pré-existente fora de `src/`. Ver
    // docs/operacao/checklist-go-live.md (item de limpeza de lint em tests/load-tests).
    ignores: [
      "tests/**",
      "load-tests/**",
      "next.config.js",
      "postcss.config.js",
      "prettier.config.js",
    ],
  },
  {
    ignores: [".next", "src/components/ui/**/*", "src/stores/**/*", "src/hooks/**/*", "src/config/**/*", "src/server-actions/**/*", "src/navigation/**/*", "src/data/**/*", "src/lib/**/*", "src/components/billing/**/*", "src/components/dashboard/sidebar/**/*", "src/components/dashboard/header/**/*"],
  },
  ...nextCoreWebVitals,
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [
      ...tseslint.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    rules: {
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/prefer-nullish-coalescing": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
    },
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
  },
);
