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
let decoder = new Decoder();
let utils = new Utils();

Promise.promisifyAll(fs);

class WebUI {
    constructor(config) {
        this.config = config;
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
                res.header('niico', 'yes');
                next();
            });

            app.get('/api/sessions', _.bind(this.getSessions, this));
            app.get('/api/session/:session', _.bind(this.getRequests, this));
            app.get('/api/request/:session/:request', _.bind(this.decodeRequest, this));
            app.get('/api/response/:session/:request', _.bind(this.decodeResponse, this));

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
            if (!_.startsWith(req.path, '/auth') && !req.isAuthenticated()) {
                res.redirect('/auth/github');
            } else {
                next();
            }
        });
    }

    getSessions(req, res) {
        logger.info('Getting all sessions.');
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
            res.json(files);
        })
        .catch(e => res.status(500).send(e));
    }

    decodeRequest(req, res) {
        logger.info('Decrypting session %d, request %s', req.params.session, req.params.request);
        return decoder.decodeRequest(req.params.session, req.params.request)
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
        return decoder.decodeResponse(req.params.session, req.params.request)
        .then(data => {
            res.json(data);

        }).catch(e => {
            logger.error(e);
            res.status(500).send(e);

        });
    }
}

module.exports = WebUI;
