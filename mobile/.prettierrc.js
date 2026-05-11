/**
 * Prettier Configuration
 * 
 * Automatic code formatting settings for consistent code style.
 */

module.exports = {
  // Basic formatting
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: true,
  quoteProps: 'as-needed',
  
  // JSX specific
  jsxSingleQuote: false,
  jsxBracketSameLine: false,
  
  // Trailing commas
  trailingComma: 'es5',
  
  // Spacing
  bracketSpacing: true,
  arrowParens: 'always',
  
  // Line endings
  endOfLine: 'lf',
  
  // Ignore files
  overrides: [
    {
      files: '*.json',
      options: {
        printWidth: 80,
      },
    },
  ],
};
