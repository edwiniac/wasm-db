/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'ui-no-direct-engine',
      severity: 'error',
      comment: 'UI must not import engine directly — go through src/state/',
      from: { path: '^src/ui' },
      to: { path: '^src/engine' },
    },
    {
      name: 'ui-no-direct-transport',
      severity: 'error',
      from: { path: '^src/ui' },
      to: { path: '^src/transport' },
    },
    {
      name: 'ui-no-direct-cache',
      severity: 'error',
      from: { path: '^src/ui' },
      to: { path: '^src/cache' },
    },
    {
      name: 'engine-no-import-ui',
      severity: 'error',
      from: { path: '^src/engine' },
      to: { path: '^src/ui' },
    },
    {
      name: 'engine-no-import-state',
      severity: 'error',
      from: { path: '^src/engine' },
      to: { path: '^src/state' },
    },
    {
      name: 'transport-no-import-engine',
      severity: 'error',
      from: { path: '^src/transport' },
      to: { path: '^src/engine' },
    },
    {
      name: 'transport-no-import-ui',
      severity: 'error',
      from: { path: '^src/transport' },
      to: { path: '^src/ui' },
    },
    {
      name: 'cache-no-import-transport',
      severity: 'error',
      from: { path: '^src/cache' },
      to: { path: '^src/transport' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.app.json' },
  },
}
