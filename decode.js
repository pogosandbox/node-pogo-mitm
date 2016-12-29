let logger = require('winston');
let _ = require('lodash');
let fs = require('fs');
let Promise = require('bluebird');

let POGOProtos = require('node-pogo-protos');

Promise.promisifyAll(fs);

// fs.readdirAsync('data')
// .then(dirs => {
//     logger.debug(dirs);
// });

// fs.readdirAsync('data')
// .then(sessions => Promise.map(sessions, s => {
//     return fs.readdirAsync('data/' + s)
//             .then(files => {
//                 return Promise.map(files, file => {
//                     let newfile = _.trimEnd(file, ".bin") + ".req.bin";
//                     return fs.rename(`data/${s}/${file}`, `data/${s}/${newfile}`);
//                 });
//             });
// }));

// fs.readFileAsync('data/20162812.161956/5.bin').then(data => {
//     let decoded = POGOProtos.Networking.Envelopes.RequestEnvelope.decode(data);
//     return fs.writeFileAsync('data/20162812.161956/5.json', JSON.stringify(decoded, null, 4));
// });