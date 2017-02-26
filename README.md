# node-pogo-mitm

[![dependencies](https://david-dm.org/pogosandbox/node-pogo-mitm.svg)](https://david-dm.org/pogosandbox/node-pogo-mitm) 

[![Donate](https://img.shields.io/badge/Donate-PayPal-green.svg)](https://www.paypal.me/niicodev)


Act as a proxy between pokemon go app on the phone and niantic servers.  

## Install
 - Install node (version 6 or 7)
 - git clone
 - npm install
 - create a file named data/config.yaml if needed (there is an example in that folder)
 - node bin/index.js

## Mitm with **iOS** (using a proxy)
 - first, modify ipa to disable cert pinning: https://github.com/pogosandbox/ssl.tweak  
 - then install and launch this app
 - add cert to your phone by going to http://[ip]:[port]/cert.crt
 - then modify ios proxy settings to http://[ip]:[port]/proxy.pac
 - use website to browse requests and responses

## Mitm with **iOS** (without proxy
 - first, modify ipa to disable enable local mitm dump: https://github.com/pogosandbox/mitm.tweak   
 - use iTunes to get the mitm dump from your iPhone
 - then install this app
 - put mitm folders into a **ios.dump** folder
 - run bin/import/ios.dump.js
 - use website to browse requests and responses

## Troubleshoot
 - Sometime iOS do not reload proxy.pac, try to forget your wifi and reconfigure it
