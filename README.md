# node-pogo-mitm

Act as a proxy between pokemon go app on the phone and niantic servers.  
On iOS:
 - first, modify ipa to disable cert pinning: https://github.com/pogosandbox/ssl.tweak  
 - then install and launch this app
 - then modify ios proxy settings to http://[ip]:[port]/proxy.pac
 
