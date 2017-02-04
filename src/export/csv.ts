import * as logger from 'winston';
import Csv from './libcsv';

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
