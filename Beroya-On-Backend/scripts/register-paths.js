const path = require('path');
const { register } = require('tsconfig-paths');

// tsc leaves `@/` imports untouched. Nest's dev watcher does not run tsc-alias,
// so resolve those aliases to the compiled output at runtime.
register({
  baseUrl: path.resolve(__dirname, '..'),
  paths: {
    '@/*': ['dist/*'],
    '@prisma/client': ['dist/generated/prisma/client'],
  },
});
