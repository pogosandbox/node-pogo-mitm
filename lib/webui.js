let express = require('express');
let logger = require('winston');
let path = require('path');
let fs = require('fs');
let Promise = require('bluebird');
let _ = require('lodash');
let moment = require('moment');
let passport = require('passport');

const Decoder = require('./decoder.js');
const Utils = require('./utils.js');
let utils = new Utils();

const Csv = require('./../export/libcsv');

Promise.promisifyAll(fs);

class WebUI {
    constructor(config) {
        this.config = config;
        this.decoder = new Decoder(config);
    }

    launch() {
        let config = this.config.ui;
        if (config.active) {
            let app = this.app = express();
            app.set('etag', false);

            if (config.auth.active) this.activateAuth();

            app.use('/api*', function(req, res, next) {
                res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
                res.header('Expires', '-1');
                res.header('Pragma', 'no-cache');
                next();
            });

            app.get('/api/sessions', _.bind(this.getSessions, this));
            app.get('/api/session/:session', _.bind(this.getRequests, this));
            app.get('/api/request/:session/:request', _.bind(this.decodeRequest, this));
            app.get('/api/response/:session/:request', _.bind(this.decodeResponse, this));
            app.get('/api/export/csv', _.bind(this.exportCsv, this));

            this.app.get('/logout', function(req, res) {
                                    req.logout();
                                    res.redirect('/');
                                });

            app.use(express.static(path.resolve(__dirname, '../webui')));

            app.listen(config.port, () => {
                logger.info('UI started, port %s.', config.port);
            });
        } else {
            logger.info('UI deactivated.');
        }
    }

    activateAuth() {
        logger.info('Activate GitHub authentication.');
        let config = this.config.ui;
        let GitHubStrategy = require('passport-github2').Strategy;
        passport.use(new GitHubStrategy(
            {
                clientID: config.auth.githubClientId,
                clientSecret: config.auth.githubClientSecret,
                callbackURL: config.auth.callbackUrl,
            },
            function(accessToken, refreshToken, profile, done) {
                if (_.find(config.auth.users, u => u == profile.username)) {
                    logger.debug('User %s logged in.', profile.username);
                    return done(null, profile);
                } else {
                    return done('unauthorize', null);
                }
            }
        ));

        passport.serializeUser(function(user, done) {
            done(null, JSON.stringify(user));
        });

        passport.deserializeUser(function(user, done) {
            if (typeof user == 'string') {
                done(null, JSON.parse(user));
            } else {
                done(null, user);
            }
        });

        let cookieSession = require('cookie-session');
        this.app.use(cookieSession({
            name: 'mitm.session',
            secret: config.auth.secret,
            maxAge: 24 * 60 * 60 * 1000,
        }));

        this.app.use(passport.initialize());
        this.app.use(passport.session());

        this.app.get('/auth/github',
                    passport.authenticate('github', {scope: ['user:email']}),
                    function(req, res) {});

        this.app.get('/auth/github/callback',
                    passport.authenticate('github', {failureRedirect: '/auth/github'}),
                    function(req, res) {
                        res.redirect('/');
                    });

        this.app.get('/logout', function(req, res) {
                                req.logout();
                                res.redirect('/');
                            });

        this.app.use(function(req, res, next) {
            if (!req.isAuthenticated() && !_.startsWith(req.path, '/auth') && !_.startsWith(req.path, '/public')) {
                res.redirect('/auth/github');
            } else {
                next();
            }
        });
    }

    getSessions(req, res) {
        logger.info('Getting sessions.');
        return utils.getSessionFolders()
        .then(folders => {
            return _.map(folders, folder => {
                return {
                    id: folder,
                    title: moment(folder, 'YYYYDDMM.HHmmss').format('DD MMM YY - HH:mm:ss'),
                };
            });
        })
        .then(folders => {
            // get info if it exist
            return Promise.map(folders, folder => {
                if (fs.existsSync(`data/${folder.id}/.info`)) {
                    return fs.readFileAsync(`data/${folder.id}/.info`, 'utf8')
                    .then(content => {
                        folder.title += ' ' + content;
                        return folder;
                    });
                } else {
                    return folder;
                }
            });
        })
        .then(folders => res.json(folders));
    }

    getRequests(req, res) {
        logger.info('Getting requests for session %s', req.params.session);
        return fs.readdirAsync(`data/${req.params.session}`)
        .then(data => _.filter(data, d => _.endsWith(d, '.req.bin')))
        .then(data => {
            return Promise.map(data, file => {
                return fs.readFileAsync(`data/${req.params.session}/${file}`, 'utf8')
                        .then(content => {
                            return JSON.parse(content);
                        })
                        .then(req => {
                            req.id = _.trimEnd(file, '.req.bin');
                            return req;
                        });
            });
        })
        .then(files => {
            return {
                title: '',
                files: files,
                step: [],
            };
        })
        .then(data => {
            if (fs.existsSync(`data/${req.params.session}/.info`)) {
                return fs.readFileAsync(`data/${req.params.session}/.info`, 'utf8')
                        .then(content => {
                            data.title = content;
                            return data;
                        });
            } else {
                return data;
            }
        })
        .then(data => {
            if (fs.existsSync(`data/${req.params.session}/.preload`)) {
                return fs.readFileAsync(`data/${req.params.session}/.preload`, 'utf8')
                        .then(content => {
                            data.steps = JSON.parse(content);
                            return data;
                        });
            } else {
                return data;
            }
        })
        .then(data => res.json(data))
        .catch(e => {
            logger.error(e);
            res.status(500).send(e);
        });
    }

    decodeRequest(req, res) {
        logger.info('Decrypting session %d, request %s', req.params.session, req.params.request);
        return this.decoder.decodeRequest(req.params.session, req.params.request, !this.config.protos.cachejson)
        .then(data => {
            data.id = req.params.request;
            res.json(data);

        }).catch(e => {
            logger.error(e);
            res.status(500).send(e);

        });
    }

    decodeResponse(req, res) {
        logger.info('Decrypting session %d, response %s', req.params.session, req.params.request);
        return this.decoder.decodeResponse(req.params.session, req.params.request, !this.config.protos.cachejson)
        .then(data => {
            res.json(data);

        }).catch(e => {
            logger.error(e);
            res.status(500).send(e);

        });
    }

    exportCsv(req, res) {
        return fs.statAsync('data/requests.signatures.csv')
                .then(stats => {
                    let mtime = moment(stats.mtime);
                    if (mtime.add(15, 'm').isAfter(moment())) {
                        res.sendFile('requests.signatures.csv', {root: 'data'});
                    } else {
                        throw new Error('File too old.');
                    }
                }).catch(e => {
                    logger.info('Export signatures to CSV.');
                    let csv = new Csv(this.config);
                    return csv.exportRequestsSignature('requests.signatures.csv')
                            .then(file => {
                                res.sendFile(file, {root: 'data'});
                            });
                });
    }
}

module.exports = WebUI;
