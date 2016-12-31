let logger = require('winston');
let fs = require('fs');
let Promise = require('bluebird');
let _ = require('lodash');
let json2csv = require('json2csv');

let Config = require('./../lib/config');
let config = new Config().load();

logger.loglevel = config.loglevel;

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
                                .then(files => _.map(files, file => folder + '/' + file));
                    });
                })
                .then(folders => _.flatten(folders))
                .then(files => {
                    // we now have an array of files with requests dump, let's decrypt
                    return Promise.map(files, file => {
                        return decoder.decodeRequest('data/' + file)
                                .then(request => {
                                    let signature = _.find(request.decoded.platform_requests, r => r.request_name == 'SEND_ENCRYPTED_SIGNATURE');
                                    return (!signature || typeof signature.message == 'string') ? null : signature.message;
                                });
                    });
                })
                .then(signatures => _.filter(signatures, s => s != null))
                .then(signatures => {
                    return Promise.join(
                        this.dumpDeviceInfo(signatures),
                        this.dumpLocationFix(signatures),
                        this.dumpSensorInfo(signatures)
                    );
                });
    }

    dumpDeviceInfo(signatures) {
        let csv = json2csv({
            data: signatures,
            fields: [
                'device_info.device_brand',
                'device_info.device_model',
                'device_info.device_model_boot',
                'device_info.hardware_manufacturer',
                'device_info.hardware_model',
                'device_info.firmware_brand',
                'device_info.firmware_type',
            ],
        });
        return fs.writeFileAsync('data/request.device_info.csv', csv, 'utf8');
    }

    dumpLocationFix(signatures) {
        let csv = json2csv({
            data: signatures,
            fields: [
                'location_fix[0].provider',
                'location_fix[0].altitude',
                'location_fix[0].latitude',
                'location_fix[0].longitude',
                'location_fix[0].speed',
                'location_fix[0].course',
                'location_fix[0].horizontal_accuracy',
                'location_fix[0].vertical_accuracy',
                'location_fix[0].provider_status',
                'location_fix[0].floor',
                'location_fix[0].location_type',
            ],
        });
        return fs.writeFileAsync('data/request.location_fix.csv', csv, 'utf8');
    }

    dumpSensorInfo(signatures) {
        let csv = json2csv({
            data: signatures,
            fields: [
                'sensor_info[0].linear_acceleration_x',
                'sensor_info[0].linear_acceleration_y',
                'sensor_info[0].linear_acceleration_z',
                'sensor_info[0].magnetic_field_x',
                'sensor_info[0].magnetic_field_y',
                'sensor_info[0].magnetic_field_z',
                'sensor_info[0].magnetic_field_accuracy',
                'sensor_info[0].attitude_pitch',
                'sensor_info[0].attitude_yaw',
                'sensor_info[0].attitude_roll',
                'sensor_info[0].rotation_rate_x',
                'sensor_info[0].rotation_rate_y',
                'sensor_info[0].rotation_rate_z',
                'sensor_info[0].gravity_x',
                'sensor_info[0].gravity_y',
                'sensor_info[0].gravity_z',
            ],
        });
        return fs.writeFileAsync('data/request.sensor_info.csv', csv, 'utf8');
    }
}

let csv = new Csv();
csv.exportRequestsSignature('data/exports.csv')
.then(() => {
    logger.info('Done.');
});
