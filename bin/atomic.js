#!/usr/bin/env node
'use strict';

require('../src/cli.js')
  .run(process.argv.slice(2))
  .catch((err) => {
    process.stderr.write(`atomic: ${err && err.message ? err.message : err}\n`);
    process.exit(1);
  });
