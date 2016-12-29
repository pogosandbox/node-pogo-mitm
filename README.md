# node-pogo-mitm

[![dependencies](https://david-dm.org/pogosandbox/node-pogo-mitm.svg)](https://david-dm.org/pogosandbox/node-pogo-mitm) 

Act as a proxy between pokemon go app on the phone and niantic servers.  
On iOS:
 - first, modify ipa to disable cert pinning: https://github.com/pogosandbox/ssl.tweak  
 - then install and launch this app
 - add cert to your phone by going to http://[ip]:[port]/cert.crt
 - then modify ios proxy settings to http://[ip]:[port]/proxy.pac
 
