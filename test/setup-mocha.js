//inject mocha globally to allow custom interface refer without direct import - bypass bundle issue
global._ = require('lodash');
global.mocha = require('mocha');
global.chai = require('chai');
global.sinon = require('sinon');
global.chai.use(require('sinon-chai'));

// Screeps engine constants as globals. Without these, requiring any real bot
// module dies at LOAD time on its first top-level constant (Market/budget.ts on
// RESOURCE_CATALYST, Roles/energyMiner.ts on STRUCTURE_SPAWN, ...), which is why
// no test could touch real code before. Must run before any test requires src/.
require('./screeps-constants').install(global);

// Override ts-node compiler options
process.env.TS_NODE_PROJECT = 'tsconfig.test.json'
