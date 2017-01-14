function FindProxyForURL(url, host) {
	if (shExpMatch(host, "*.nianticlabs.com")) {
		return "PROXY ##PROXY##";
	}

	// if (shExpMatch(host, "sso.pokemon.com")) {
	// 	return "PROXY ##PROXY##";
	// }

    return DIRECT;
}
