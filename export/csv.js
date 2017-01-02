let logger = require('winston');
let fs = require('fs');
let Promise = require('bluebird');
let _ = require('lodash');
let json2csv = require('json2csv');

let Config = require('./../lib/config');
let config = new Config().load();

logger.level = config.logger.level;
if (config.logger.file) {
    logger.add(logger.transports.File, {filename: config.logger.file, json: false});
}

let Utils = require('./../lib/utils');
let utils = new Utils(config);

let Decoder = require('./../lib/decoder.js');
let decoder = new Decoder(config);

class Csv {
    exportRequestsSignature() {
        return utils.cleanDataFolders()
                .then(() => utils.getSessionFolders())
                .then(folders => {
                    // parse all session folder and get only requests
                    return Promise.map(folders, folder => {
                        return fs.readdirAsync(`data/${folder}`)
                                .then(files => _.filter(files, file => _.endsWith(file, '.req.bin')))
                                .then(files => _.map(files, file => {
                                                        return {
                                                            session: folder,
                                                            request: _.trimEnd(file, '.req.bin'),
                                                            file: folder + '/' + file,
                                                        };
                                                    }));
                    });
                })
                .then(folders => _.flatten(folders))
                .then(folders => {
                    return Promise.map(folders, folder => {
                        if (fs.existsSync(`data/${folder.session}/.info`)) {
                            return fs.readFileAsync(`data/${folder.session}/.info`, 'utf8')
                            .then(content => {
                                folder.info = content;
                                return folder;
                            });
                        } else {
                            return folder;
                        }
                    });
                })
                .then(files => {
                    // we now have an array of files with requests dump, let's decrypt
                    return Promise.map(files, file => {
                        return decoder.decodeRequest(file.session, file.request)
                                .then(request => {
                                    let signature = _.find(request.decoded.platform_requests, r => r.request_name == 'SEND_ENCRYPTED_SIGNATURE');
                                    return (!signature || typeof signature.message == 'string') ? null : signature.message;
                                })
                                .then(signature => {
                                    return {
                                        session: file.session,
                                        info: file.info,
                                        request: file.request,
                                        signature: signature,
                                    };
                                });
                    });
                })
                .then(signatures => _.filter(signatures, s => s.signature != null))
                .then(signatures => {
                    return Promise.join(
                        this.dumpDeviceInfo(signatures),
                        this.dumpLocationFix(signatures),
                        this.dumpSensorInfo(signatures),
                        this.dumpActivityStatus(signatures)
                    );
                });
    }

    dumpDeviceInfo(signatures) {
        logger.info('Dumping device info...');
        let csv = json2csv({
            data: signatures,
            fields: [
                'session',
                'info',
                'request',
                'signature.device_info.device_brand',
                'signature.device_info.device_model',
                'signature.device_info.device_model_boot',
                'signature.device_info.hardware_manufacturer',
                'signature.device_info.hardware_model',
                'signature.device_info.firmware_brand',
                'signature.device_info.firmware_type',
            ],
            del: config.export.csv.separator,
        });
        return fs.writeFileAsync('data/request.device_info.csv', csv, 'utf8');
    }

    dumpLocationFix(signatures) {
        logger.info('Dumping location fix...');
        let csv = json2csv({
            data: signatures,
            fields: [
                'session',
                'info',
                'request',
                'signature.location_fix[0].provider',
                'signature.location_fix[0].altitude',
                'signature.location_fix[0].latitude',
                'signature.location_fix[0].longitude',
                'signature.location_fix[0].speed',
                'signature.location_fix[0].course',
                'signature.location_fix[0].horizontal_accuracy',
                'signature.location_fix[0].vertical_accuracy',
                'signature.location_fix[0].provider_status',
                'signature.location_fix[0].floor',
                'signature.location_fix[0].location_type',
            ],
            del: config.export.csv.separator,
        });
        return fs.writeFileAsync('data/request.location_fix.csv', csv, 'utf8');
    }

    dumpSensorInfo(signatures) {
        logger.info('Dumping sensor info...');
        let csv = json2csv({
            data: signatures,
            fields: [
                'session',
                'info',
                'request',
                'signature.sensor_info[0].linear_acceleration_x',
                'signature.sensor_info[0].linear_acceleration_y',
                'signature.sensor_info[0].linear_acceleration_z',
                'signature.sensor_info[0].magnetic_field_x',
                'signature.sensor_info[0].magnetic_field_y',
                'signature.sensor_info[0].magnetic_field_z',
                'signature.sensor_info[0].magnetic_field_accuracy',
                'signature.sensor_info[0].attitude_pitch',
                'signature.sensor_info[0].attitude_yaw',
                'signature.sensor_info[0].attitude_roll',
                'signature.sensor_info[0].rotation_rate_x',
                'signature.sensor_info[0].rotation_rate_y',
                'signature.sensor_info[0].rotation_rate_z',
                'signature.sensor_info[0].gravity_x',
                'signature.sensor_info[0].gravity_y',
                'signature.sensor_info[0].gravity_z',
            ],
            del: config.export.csv.separator,
        });
        return fs.writeFileAsync('data/request.sensor_info.csv', csv, 'utf8');
    }

    dumpActivityStatus(signatures) {
        logger.info('Dumping activity status...');
        let csv = json2csv({
            data: signatures,
            fields: [
                'session',
                'info',
                'request',
                'signature.activity_status.unknown_status',
                'signature.activity_status.walking',
                'signature.activity_status.running',
                'signature.activity_status.stationary',
                'signature.activity_status.automotive',
                'signature.activity_status.tilting',
                'signature.activity_status.cycling',
            ],
            del: config.export.csv.separator,
        });
        return fs.writeFileAsync('data/request.activity_status.csv', csv, 'utf8');
    }
}

let csv = new Csv();
csv.exportRequestsSignature('data/exports.csv')
.then(() => {
    logger.info('Done.');
})
.catch(e => {
    logger.error(e);
})
.finally(() => {
    process.exit();
});
