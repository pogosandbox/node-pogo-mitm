import * as logger from 'winston';
import Csv from './libcsv';

async function exportCsv() {
    const csv = new Csv();
    await csv.exportRequestsSignature();
    logger.info('Done.');
    process.exit();
}

exportCsv().catch(e => logger.error(e));
