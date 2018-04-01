let Terminal = require('./terminal')
let terminal = Terminal.Get();

process.on('unhandledRejection', (reason, p) => {
  terminal.log('HOST', 'unhandled error', 'Unhandled Rejection at: Promise ' + reason);
  // terminal.log('HOST', 'unhandled error', 'Unhandled Rejection at: Promise', p, 'reason:', reason, Error.stack);
  // application specific logging, throwing an error, or other logic here
});


global.Promise = require('bluebird')
let Promise = require('bluebird')
Promise.config({
    // Enable warnings
    warnings: true,
    // Enable long stack traces
    longStackTraces: true,
    // Enable cancellation
    cancellation: true,
    // Enable monitoring
    monitoring: true
});
