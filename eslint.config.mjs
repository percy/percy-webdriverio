import globals from "globals";
import pluginJs from "@eslint/js";
import jasmine from "eslint-plugin-jasmine"


export default [
  {files: ["**/*.js"], languageOptions: {sourceType: "commonjs"}},
  jasmine.configs.recommended,
  {languageOptions: { 
    globals: {
      ...globals.browser,
      ...globals.node, 
      browser: 'readonly',
      driver: 'readonly',
    }
  },
  plugins: {jasmine}
},
];
