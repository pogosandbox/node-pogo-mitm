let logger = require('winston');
let Csv = require('./libcsv');

let csv = new Csv();
csv.exportRequestsSignature()
.then(() => {
    logger.info('Done.');
})
.catch(e => {
    logger.error(e);
})
.finally(() => {
    process.exit();
});
