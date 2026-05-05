
var browser = chrome;

// -------------------- Class declaration --------------------

window.LacunaWebPKI = null;

LacunaWebPKI = function (license) {
	this.license = null;
	this.defaultFailCallback = null;
	this.angularScope = null;
	this.ngZone = null;
	this.brand = null;
	this.restPkiUrl = null;
	this.useDomainNativePool = false;
	this.mobileIntegrationMode = null;
	if (license) {
		this.license = license;
	}

	// check for JQuery blockUI presence causing mobile touch blocking
	if (this.isSupportedMobile && window.$ && window.$.blockUI) {
		try {
			window.$.blockUI.defaults.bindEvents = false;
			this._log('blockUI bindEvents disabled');

		} catch (ex) {
			this._log('Error disabling blockUI bindEvents: ', ex);
		}
	}
};

// Inject class prototype

(function ($) {

    // -------------------- Promise subclass --------------------

    $.Promise = function (angularScope, ngZone) {
        this.successCallback = function() { };
        this.failCallback = null;
        this.angularScope = angularScope;
        this.ngZone = ngZone;
    };

	$.Promise.prototype.success = function (callback) {
        this.successCallback = callback;
        return this;
    };

    $.Promise.prototype.error = function (callback) {
        // for backward compatibility, any legacy error callback converted to a fail callback
        this.failCallback = function(ex) {
            callback(ex.message, ex.error, ex.origin, ex.code);
        };
        return this;
    };

    $.Promise.prototype.fail = function (callback) {
        this.failCallback = callback;
        return this;
    };

    $.Promise.prototype._invokeSuccess = function (result, delay) {
        if (delay > 0) {
            var self = this;
            setTimeout(function () {
                self._invokeSuccess(result);
            }, delay);
        } else {
            var callback = this.successCallback || function () { $._log('Success ignored (no callback registered)'); };
            this._apply(function () {
                callback(result);
            });
        }
    };

    $.Promise.prototype._invokeError = function (ex, delay) {
        if (delay > 0) {
            var self = this;
            setTimeout(function () {
                self._invokeError(ex);
            }, delay);
        } else {
            var callback = this.failCallback || function (ex) {
                throw 'Web PKI error originated at ' + ex.origin + ': ' + ex.message + '\n' + ex.complete + '\ncode: ' + ex.code;
            };
            this._apply(function () {
            	callback({
            		userMessage: ex.userMessage || ex.message,
            		message: ex.message,
            		error: ex.complete,
            		origin: ex.origin,
            		code: ex.code
            	});
            });
        }
    };

    // https://coderwall.com/p/ngisma/safe-apply-in-angular-js
    $.Promise.prototype._apply = function (callback) {
        if (this.angularScope) {
            var phase = this.angularScope.$root.$$phase;
            if (phase == '$apply' || phase == '$digest') {
                callback();
            } else {
                this.angularScope.$apply(function () {
                    callback();
                });
            }
        } else if (this.ngZone) {
        	this.ngZone.run(function () {
        		callback();
        	});
        } else {
            callback();
        }
    };


    // -------------------- Constants --------------------

	$._installUrl = 'https://get.webpkiplugin.com/';
	$._chromeExtensionId = 'dcngeagmmhegagicpcmpinaoklddcgon';
	$._firefoxExtensionId = 'webpki-beta@lacunasoftware.com';
	$._edgeExtensionId = 'nedeegdmhlnmboboahchfpkmdnnemapd';
	$._edgeLegacyProductId = 'd2798a85-9698-425a-add7-3db79a39ca8a';
	$._chromeExtensionFirstVersionWithSelfUpdate = '2.0.20';
	$._jslibVersion = '2.16.3';
	$._mobileSupported = 'true' === 'true';
	$._buildChannel = 'stable';

	// latest components version ----------------------
	$._extensionRequiredVersion = '2.16.0';
	$._chromeNativeWinRequiredVersion = '2.12.3';
	$._chromeNativeLinuxRequiredVersion = '2.13.3';
	$._chromeNativeMacRequiredVersion = '2.13.3';
	$._ieAddonRequiredVersion = '2.9.1';
	$._mobileRequiredVersion = '3.2.0';
    // ------------------------------------------------

    $._chromeInstallationStates = {
        INSTALLED: 0,
        EXTENSION_NOT_INSTALLED: 1,
        EXTENSION_OUTDATED: 2,
        NATIVE_NOT_INSTALLED: 3,
        NATIVE_OUTDATED: 4
    };

    $._certKeyUsages = {
        crlSign: 2,
        dataEncipherment: 16,
        decipherOnly: 32768,
        digitalSignature: 128,
        encipherOnly: 1,
        keyAgreement: 8,
        keyCertSign: 4,
        keyEncipherment: 32,
        nonRepudiation: 64
    };

	$._certExtendedKeyUsages = {
		clientAuth: 1,
		serverAuth: 2,
		codeSigning: 4,
		emailProtection: 8,
		timeStamping: 16,
		ocspSigning: 32,
		ipsecEndSystem: 64,
		ipsecTunnel: 128,
		ipsecUser: 256,
		any: 512
	};

	$.apiVersions = {
		v1_0: '1.0',
		v1_1: '1.1',
		v1_2: '1.2',
		v1_3: '1.3',
		v1_4: '1.4',
		v1_4_1: '1.4.1',
		v1_5: '1.5',
		v1_5_1: '1.5.1',
		v1_5_2: '1.5.2',
		v1_6: '1.6.0',
		v1_6_1: '1.6.1',
		v1_7_0: '1.7.0',
		v1_7_2: '1.7.2',
		v1_8_0: '1.8.0',
		v1_8_1: '1.8.1',
		v1_8_2: '1.8.2',
		v1_9_0: '1.9.0',
		latest: 'latest'
	};

    $._apiMap = {
        nativeWin: {}, 
        nativeLinux: {},
        nativeMac: {},
        ieAddon: {},
        extension: {},
        mobile: {}
    };
    // syntax: api_version: supported_since_version
    // Windows
    $._apiMap.nativeWin[$.apiVersions.v1_0] = '2.1.0';
    $._apiMap.nativeWin[$.apiVersions.v1_1] = '2.3.0';
    $._apiMap.nativeWin[$.apiVersions.v1_2] = '2.4.1';
    $._apiMap.nativeWin[$.apiVersions.v1_3] = '2.5.0';
    $._apiMap.nativeWin[$.apiVersions.v1_4] = '2.6.2';
	$._apiMap.nativeWin[$.apiVersions.v1_4_1] = '2.6.5';
	$._apiMap.nativeWin[$.apiVersions.v1_5] = '2.8.0';
	$._apiMap.nativeWin[$.apiVersions.v1_5_1] = '2.8.1';
	$._apiMap.nativeWin[$.apiVersions.v1_5_2] = '2.9.0';
	$._apiMap.nativeWin[$.apiVersions.v1_6] = '2.10.0';
	$._apiMap.nativeWin[$.apiVersions.v1_6_1] = '2.10.1';
	$._apiMap.nativeWin[$.apiVersions.v1_7_0] = '2.11.0';
	$._apiMap.nativeWin[$.apiVersions.v1_7_2] = '2.11.0';
	$._apiMap.nativeWin[$.apiVersions.v1_8_0] = '2.12.0';
	$._apiMap.nativeWin[$.apiVersions.v1_8_1] = '2.12.1';
	$._apiMap.nativeWin[$.apiVersions.v1_8_2] = '2.12.3';
	$._apiMap.nativeWin[$.apiVersions.v1_9_0] = '2.12.3';

    // IE
    $._apiMap.ieAddon[$.apiVersions.v1_0] = '2.0.4';
    $._apiMap.ieAddon[$.apiVersions.v1_1] = '2.1.1';
    $._apiMap.ieAddon[$.apiVersions.v1_2] = '2.2.4';
    $._apiMap.ieAddon[$.apiVersions.v1_3] = '2.3.0';
    $._apiMap.ieAddon[$.apiVersions.v1_4] = '2.4.2';
    $._apiMap.ieAddon[$.apiVersions.v1_4_1] = '2.4.5';
	$._apiMap.ieAddon[$.apiVersions.v1_5] = '2.5.0';
	$._apiMap.ieAddon[$.apiVersions.v1_5_1] = '2.5.2';
	$._apiMap.ieAddon[$.apiVersions.v1_5_2] = '2.6.0';
	$._apiMap.ieAddon[$.apiVersions.v1_6] = '2.7.0';
	$._apiMap.ieAddon[$.apiVersions.v1_6_1] = '2.7.2';
	$._apiMap.ieAddon[$.apiVersions.v1_7_0] = '2.8.0';
	$._apiMap.ieAddon[$.apiVersions.v1_7_2] = '2.8.0';
	$._apiMap.ieAddon[$.apiVersions.v1_8_0] = '2.9.0';
	$._apiMap.ieAddon[$.apiVersions.v1_8_1] = '2.9.1';
	$._apiMap.ieAddon[$.apiVersions.v1_8_2] = '2.9.1';
	$._apiMap.ieAddon[$.apiVersions.v1_9_0] = '2.9.1';

    // Linux
    $._apiMap.nativeLinux[$.apiVersions.v1_0] = '2.0.0';
    $._apiMap.nativeLinux[$.apiVersions.v1_1] = '2.4.0';
    $._apiMap.nativeLinux[$.apiVersions.v1_2] = '2.6.2';
    $._apiMap.nativeLinux[$.apiVersions.v1_3] = '2.7.0';
    $._apiMap.nativeLinux[$.apiVersions.v1_4] = '2.7.4';
    $._apiMap.nativeLinux[$.apiVersions.v1_4_1] = '2.7.4';
	$._apiMap.nativeLinux[$.apiVersions.v1_5] = '2.9.0';
	$._apiMap.nativeLinux[$.apiVersions.v1_5_1] = '2.9.0';
	$._apiMap.nativeLinux[$.apiVersions.v1_5_2] = '2.9.5';
	$._apiMap.nativeLinux[$.apiVersions.v1_6] = '2.10.0';
	$._apiMap.nativeLinux[$.apiVersions.v1_6_1] = '2.10.0';
	$._apiMap.nativeLinux[$.apiVersions.v1_7_0] = '2.12.0';
	$._apiMap.nativeLinux[$.apiVersions.v1_7_2] = '2.12.1';
	$._apiMap.nativeLinux[$.apiVersions.v1_8_0] = '2.13.0';
	$._apiMap.nativeLinux[$.apiVersions.v1_8_1] = '2.13.1';
	$._apiMap.nativeLinux[$.apiVersions.v1_8_2] = '2.13.3';
	$._apiMap.nativeLinux[$.apiVersions.v1_9_0] = '2.13.3';

    // Mac
    $._apiMap.nativeMac[$.apiVersions.v1_0] = '2.3.0';
    $._apiMap.nativeMac[$.apiVersions.v1_1] = '2.4.0';
    $._apiMap.nativeMac[$.apiVersions.v1_2] = '2.6.1';
    $._apiMap.nativeMac[$.apiVersions.v1_3] = '2.7.0';
    $._apiMap.nativeMac[$.apiVersions.v1_4] = '2.7.4';
    $._apiMap.nativeMac[$.apiVersions.v1_4_1] = '2.7.4';
	$._apiMap.nativeMac[$.apiVersions.v1_5] = '2.9.0';
	$._apiMap.nativeMac[$.apiVersions.v1_5_1] = '2.9.0';
	$._apiMap.nativeMac[$.apiVersions.v1_5_2] = '2.9.5';
	$._apiMap.nativeMac[$.apiVersions.v1_6] = '2.10.0';
	$._apiMap.nativeMac[$.apiVersions.v1_6_1] = '2.10.0';
	$._apiMap.nativeMac[$.apiVersions.v1_7_0] = '2.12.0';
	$._apiMap.nativeMac[$.apiVersions.v1_7_2] = '2.12.1';
	$._apiMap.nativeMac[$.apiVersions.v1_8_0] = '2.13.0';
	$._apiMap.nativeMac[$.apiVersions.v1_8_1] = '2.13.1';
	$._apiMap.nativeMac[$.apiVersions.v1_8_2] = '2.13.3';
	$._apiMap.nativeMac[$.apiVersions.v1_9_0] = '2.13.3';

    // WebExtension
    $._apiMap.extension[$.apiVersions.v1_0] = '2.3.2';
    $._apiMap.extension[$.apiVersions.v1_1] = '2.7.0';
    $._apiMap.extension[$.apiVersions.v1_2] = '2.9.1';
    $._apiMap.extension[$.apiVersions.v1_3] = '2.10.1';
    $._apiMap.extension[$.apiVersions.v1_4] = '2.11.7';
    $._apiMap.extension[$.apiVersions.v1_4_1] = '2.11.7';
	$._apiMap.extension[$.apiVersions.v1_5] = '2.13.0';
	$._apiMap.extension[$.apiVersions.v1_5_1] = '2.13.0';
	$._apiMap.extension[$.apiVersions.v1_5_2] = '2.14.2';
	$._apiMap.extension[$.apiVersions.v1_6] = '2.15.0';
	$._apiMap.extension[$.apiVersions.v1_6_1] = '2.15.0';
	$._apiMap.extension[$.apiVersions.v1_7_0] = '2.16.0';
	$._apiMap.extension[$.apiVersions.v1_7_2] = '2.16.0';
	$._apiMap.extension[$.apiVersions.v1_8_0] = '2.16.0';
	$._apiMap.extension[$.apiVersions.v1_8_1] = '2.16.0';
	$._apiMap.extension[$.apiVersions.v1_8_2] = '2.16.0';
	$._apiMap.extension[$.apiVersions.v1_9_0] = '2.17.0';

	// Mobile
    $._apiMap.mobile[$.apiVersions.v1_0] = '1.1.0';
    $._apiMap.mobile[$.apiVersions.v1_1] = '1.1.0';
    $._apiMap.mobile[$.apiVersions.v1_2] = '1.1.0';
    $._apiMap.mobile[$.apiVersions.v1_3] = '1.1.0';
	$._apiMap.mobile[$.apiVersions.v1_4] = '1.1.0';
	$._apiMap.mobile[$.apiVersions.v1_4_1] = '1.1.0';
	$._apiMap.mobile[$.apiVersions.v1_5] = '1.1.0';
	$._apiMap.mobile[$.apiVersions.v1_5_1] = '1.1.0';
	$._apiMap.mobile[$.apiVersions.v1_5_2] = '1.1.0';
	$._apiMap.mobile[$.apiVersions.v1_6] = '2.7.0';
	$._apiMap.mobile[$.apiVersions.v1_6_1] = '2.7.0';
	$._apiMap.mobile[$.apiVersions.v1_7_0] = '3.0.0';
	$._apiMap.mobile[$.apiVersions.v1_7_2] = '3.0.0';
	$._apiMap.mobile[$.apiVersions.v1_8_0] = '3.2.0';
	$._apiMap.mobile[$.apiVersions.v1_8_1] = '3.2.0';
	$._apiMap.mobile[$.apiVersions.v1_8_2] = '3.2.0';
	$._apiMap.mobile[$.apiVersions.v1_9_0] = '3.2.0';

    // All latest
    $._apiMap.nativeWin  [$.apiVersions.latest] = $._chromeNativeWinRequiredVersion;
    $._apiMap.ieAddon    [$.apiVersions.latest] = $._ieAddonRequiredVersion;
    $._apiMap.nativeLinux[$.apiVersions.latest] = $._chromeNativeLinuxRequiredVersion;
    $._apiMap.nativeMac  [$.apiVersions.latest] = $._chromeNativeMacRequiredVersion;
    $._apiMap.extension  [$.apiVersions.latest] = $._extensionRequiredVersion;
    $._apiMap.mobile     [$.apiVersions.latest] = $._mobileRequiredVersion;

	// populated after init
    $._nativeInfo = {};

    $.installationStates = {
        INSTALLED: 0,
        NOT_INSTALLED: 1,
        OUTDATED: 2,
        BROWSER_NOT_SUPPORTED: 3
    };


    // WebPKI errors
	$.errorCodes = {
		UNDEFINED:                      'undefined',
	    INTERNAL:                       'internal',
	    USER_CANCELLED:                 'user_cancelled',
	    OS_NOT_SUPPORTED:               'os_not_supported',
	    ADDON_TIMEOUT:                  'addon_timeout',
	    ADDON_NOT_DETECTED:             'addon_not_detected',
	    ADDON_SEND_COMMAND_FAILURE:     'addon_send_command_failure',
	    CERTIFICATE_NOT_FOUND:          'certificate_not_found',
	    COMMAND_UNKNOWN:                'command_unknown',
	    COMMAND_NOT_SUPPORTED:          'command_not_supported',
	    COMMAND_PARAMETER_NOT_SET:      'command_parameter_not_set',
	    COMMAND_INVALID_PARAMETER:      'command_invalid_parameter',
	    COMMAND_PARAMETER_NOT_SUPPORTED:'command_parameter_not_supported',
	    NATIVE_CONNECT_FAILURE:         'native_connect_failure',
	    NATIVE_DISCONNECTED:            'native_disconnected',
	    NATIVE_NO_RESPONSE:             'native_no_response',
	    REST_PKI_GET_PENDING_SIGNATURE: 'rest_pki_get_pending_signature',
	    REST_PKI_POST_SIGNATURE:        'rest_pki_post_signature',
	    REST_PKI_INVALID_CERTIFICATE:   'rest_pki_invalid_certificate',
	    LICENSE_NOT_SET:                'license_not_set',
	    LICENSE_INVALID:                'license_invalid',
	    LICENSE_RESTRICTED:             'license_restricted',
	    LICENSE_EXPIRED:                'license_expired',
	    LICENSE_DOMAIN_NOT_ALLOWED:     'license_domain_not_allowed',
	    VALIDATION_ERROR:               'validation_error',
	    P11_ERROR:                      'p11_error',
	    P11_TOKEN_NOT_FOUND:            'p11_token_not_found',
	    P11_NOT_SUPPORTED:              'p11_not_supported',
	    KEYSET_NOT_FOUND:               'keyset_not_found',
	    ALGORITHM_NOT_SUPPORTED:        'algorithm_not_supported',
	    SIGNED_PDF_TO_MARK:             'signed_pdf_to_mark',
	    JSON_ERROR:                     'json_error',
	    IO_ERROR:                       'io_error',
	    KEYCHAIN_ERROR:                 'keychain_error',
	    KEYCHAIN_SIGN_ERROR:            'keychain_sign_error',
	    DECODE_ERROR:                   'decode_error',
	    CSP_KEYSET_NOT_DEFINED:         'csp_keyset_not_defined',
	    CSP_INVALID_ALGORITHM:          'csp_invalid_algorithm',
	    CSP_INVALID_PROVIDER_TYPE:      'csp_invalid_provider_type',
	    MOBILE_TIMEOUT:                 'mobile_timeout',
	    MOBILE_NOT_AUTHORIZED:          'mobile_not_authorized',
	    MOBILE_SEND_MESSAGE:            'mobile_send_message',
	    COMMAND_DECRYPT_ERROR:          'command_decrypt_error',
		BLOCKED_DOMAIN:                 'blocked_domain',
		INVALID_OPERATION:              'invalid_operation'
	};

	// -------------------- "Private" static functions (no reference to 'this') --------------------

	$._compareVersions = function (v1, v2) {

		var v1parts = v1.split('.');
		var v2parts = v2.split('.');

		function isPositiveInteger(x) {
			return /^\d+$/.test(x);
		}

		function validateParts(parts) {
			for (var i = 0; i < parts.length; ++i) {
				if (!isPositiveInteger(parts[i])) {
					return false;
				}
			}
			return true;
		}

		if (!validateParts(v1parts) || !validateParts(v2parts)) {
			return NaN;
		}

		for (var i = 0; i < v1parts.length; ++i) {

			if (v2parts.length === i) {
				return 1;
			}

			var v1p = parseInt(v1parts[i], 10);
			var v2p = parseInt(v2parts[i], 10);

			if (v1p === v2p) {
				continue;
			}
			if (v1p > v2p) {
				return 1;
			}
			return -1;
		}

		if (v1parts.length != v2parts.length) {
			return -1;
		}

		return 0;
	};


	$._log = function (message, data) {
		if (window.console) {
			if (data) {
				window.console.log(message, data);
			} else {
				window.console.log(message);
			}
		}
	};

	// -------------------- "Private" instance functions (with references to 'this') --------------------

	$._createContext = function (args) {
		var promise = new $.Promise(this.angularScope, this.ngZone);
		if (args && args.success) {
			promise.success(args.success);
		}
		if (args && args.fail) {
		    promise.fail(args.fail);
		} else if (args && args.error) {
		    promise.error(args.error);
		} else {
		    promise.fail(this.defaultFailCallback);
		}
		var context = {
			promise: promise,
			license: this.license,
			useDomainNativePool: this.useDomainNativePool,
			instance: $._supportedMobileDetected ? this : undefined
		};
		return context;
	};

	// -------------------- Public functions --------------------

	$.init = function (args) {

		if (!args) {
			args = {};
		} else if (typeof args === 'function') {
			args = {
				ready: args
			};
		}

		if (args.license) {
			this.license = args.license;
		}
		if (args.defaultError) {
		    this.defaultFailCallback = function (ex) { args.defaultError(ex.message, ex.error, ex.origin, ex.code); };
		}
		if (args.defaultFail) {
            // overwrite any legacy error callback
		    this.defaultFailCallback = args.defaultFail;
		}		
		if (args.angularScope) {
			this.angularScope = args.angularScope;
		}
		if (args.ngZone) {
			this.ngZone = args.ngZone;
		}
		if (args.brand) {
			this.brand = args.brand;
		}
		if (args.restPkiUrl) {
			this.restPkiUrl = args.restPkiUrl[args.restPkiUrl.length - 1] === '/' ? args.restPkiUrl : args.restPkiUrl + '/';
		}

		this.useDomainNativePool = args.useDomainNativePool === true;

		var self = this;
		var onCheckInstalledSuccess = function (result) {
		    if (result.isInstalled) {
				if (args.ready) {
					args.ready();
				} else {
					$._log('Web PKI ready (no callback registered)');
				}
			} else {
				if (args.notInstalled) {
					args.notInstalled(result.status, result.message, result.browserSpecificStatus);
				} else {
					self.redirectToInstallPage();
				}
			}
		};

		var context = this._createContext({
			success: onCheckInstalledSuccess,
			fail: args.fail,
            error: args.error
		});
		$._requestHandler.checkInstalled(context, args.requiredApiVersion);
		return context.promise;
	};

	$.getVersion = function (args) {
		var context = this._createContext(args);
		$._requestHandler.sendCommand(context, 'getVersion', null);
		return context.promise;
	};

	$.listCertificates = function (args) {

		if (!args) {
			args = {};
		} else if (args.filter) {
			if (typeof args.filter !== 'function') {
				if (typeof args.filter === 'boolean') {
					throw 'args.filter must be a function (hint: if you used "pki.filters.xxx()", try removing the "()")';
				} else {
					throw 'args.filter must be a function, received ' + (typeof args.filter);
				}
			}
		}

		var context = this._createContext(args);
		$._requestHandler.sendCommand(context, 'listCertificates', null, function (result) {
			return $._processCertificates(result, args.filter, args.selectId, args.selectOptionFormatter);
		});

		return context.promise;
	};

	$._processCertificate = function (cert) {
		cert.validityStart = new Date(cert.validityStart);
		cert.validityEnd = new Date(cert.validityEnd);
		cert.keyUsage = $._processKeyUsage(cert.keyUsage);
		cert.extendedKeyUsage = $._processExtendedKeyUsage(cert.extendedKeyUsage);
		if (cert.pkiBrazil && cert.pkiBrazil.dateOfBirth) {
			var s = cert.pkiBrazil.dateOfBirth;
			cert.pkiBrazil.dateOfBirth = new Date(parseInt(s.slice(0, 4), 10), parseInt(s.slice(5, 7), 10) - 1, parseInt(s.slice(8, 10), 10));
		}
	};

	$._processCertificates = function (result, filter, selectId, selectOptionFormatter) {
		var toReturn = [];
		for (var i = 0; i < result.length; i++) {
			var cert = result[i];
			$._processCertificate(cert);
			if (filter) {
				if (filter(cert)) {
					toReturn.push(cert);
				}
			} else {
				toReturn.push(cert);
			}
		}

		toReturn.sort(function(a, b) {
			// sort the certificates by its subject common name (case insensitive)
			var aName = a.subjectName;
			var bName = b.subjectName;

			if (!aName || !bName) {
				return !aName && bName ? 1 : -1;
			}

			aName = aName.toLowerCase();
			bName = bName.toLowerCase();

			if (aName > bName) {
				return 1;
			} else if (aName < bName) {
				return -1;
			} else {
				// same common name, sort by the expiration date, the longer date, the first
				return a.validityEnd > b.validityEnd ? -1 : (a.validityEnd < b.validityEnd ? 1 : 0);
			}
		});

		if (selectId) {
			if (!selectOptionFormatter) {
				selectOptionFormatter = function (c) {
					return c.subjectName + ' (issued by ' + c.issuerName + ')';
				};
			}
			var select = document.getElementById(selectId);
			while (select.options.length > 0) {
				select.remove(0);
			}
			for (var j = 0; j < toReturn.length; j++) {
				var c = toReturn[j];
				var option = document.createElement('option');
				option.value = c.thumbprint;
				option.text = selectOptionFormatter(c);
				select.add(option);
			}
		}
		return toReturn;
	};

	$._processKeyUsage = function (keyUsageValue) {
	    return {
	        crlSign: (keyUsageValue & $._certKeyUsages.crlSign) !== 0,
	        dataEncipherment: (keyUsageValue & $._certKeyUsages.dataEncipherment) !== 0,
	        decipherOnly: (keyUsageValue & $._certKeyUsages.decipherOnly) !== 0,
	        digitalSignature: (keyUsageValue & $._certKeyUsages.digitalSignature) !== 0,
	        encipherOnly: (keyUsageValue & $._certKeyUsages.encipherOnly) !== 0,
	        keyAgreement: (keyUsageValue & $._certKeyUsages.keyAgreement) !== 0,
	        keyCertSign: (keyUsageValue & $._certKeyUsages.keyCertSign) !== 0,
	        keyEncipherment: (keyUsageValue & $._certKeyUsages.keyEncipherment) !== 0,
	        nonRepudiation: (keyUsageValue & $._certKeyUsages.nonRepudiation) !== 0
	    };
	};

	$._processExtendedKeyUsage = function (extendedKeyUsageValue) {
		if (typeof extendedKeyUsageValue !== 'number') {
			return null;
		}
		return {
			clientAuth: (extendedKeyUsageValue & $._certExtendedKeyUsages.clientAuth) !== 0,
			serverAuth: (extendedKeyUsageValue & $._certExtendedKeyUsages.serverAuth) !== 0,
			codeSigning: (extendedKeyUsageValue & $._certExtendedKeyUsages.codeSigning) !== 0,
			emailProtection: (extendedKeyUsageValue & $._certExtendedKeyUsages.emailProtection) !== 0,
			timeStamping: (extendedKeyUsageValue & $._certExtendedKeyUsages.timeStamping) !== 0,
			ocspSigning: (extendedKeyUsageValue & $._certExtendedKeyUsages.ocspSigning) !== 0,
			ipsecEndSystem: (extendedKeyUsageValue & $._certExtendedKeyUsages.ipsecEndSystem) !== 0,
			ipsecTunnel: (extendedKeyUsageValue & $._certExtendedKeyUsages.ipsecTunnel) !== 0,
			ipsecUser: (extendedKeyUsageValue & $._certExtendedKeyUsages.ipsecUser) !== 0,
			any: (extendedKeyUsageValue & $._certExtendedKeyUsages.any) !== 0
		};
	};

	$._processSignResult = function (result) {
		if (!result || !result.signatureInfo) {
			return result;
		}
		if (result.signatureInfo.signerCertificate) {
			$._processCertificate(result.signatureInfo.signerCertificate);
		}
		if (result.signatureInfo.signingTime) {
			result.signatureInfo.signingTime = new Date(result.signatureInfo.signingTime);
		}
		return result;
	};

	$._processSignerModel = function (signer) {
		if (!signer) {
			return;
		}
		if (signer.certificate) {
			$._processCertificate(signer.certificate);
		}
		if (signer.signingTime) {
			signer.signingTime = new Date(signer.signingTime);
		}
		if (signer.certifiedDateReference) {
			signer.certifiedDateReference = new Date(signer.certifiedDateReference);
		}
		if (signer.timestamps && signer.timestamps.length > 0) {
			for (var i = 0; i < signer.timestamps.length; i++) {
				var tst = signer.timestamps[i];
				$._processOpenResult(tst);
			}
		}
	};

	$._processOpenResult = function (result) {
		if (!result || !result.signers || result.signers.length <= 0) {
			return result;
		}
		// case is a CadesTimestampModel
		if (result.genTime) {
			result.genTime = new Date(result.genTime);
		}
		for (var i = 0; i < result.signers.length; i++) {
			var signer = result.signers[i];
			$._processSignerModel(signer);
		}
		return result;
	};

	$.filters = {
		isPkiBrazilPessoaFisica: function (cert) {
			if (typeof cert == 'undefined') {
				throw 'filter called without cert argument (hint: if you are using "pki.filters.isPkiBrazilPessoaFisica()", try "pki.filters.isPkiBrazilPessoaFisica")';
			}
			return (cert.pkiBrazil && (cert.pkiBrazil.cpf || '') !== '' && (cert.pkiBrazil.cnpj || '') === '');
		},
		hasPkiBrazilCpf: function (cert) {
			if (typeof cert == 'undefined') {
				throw 'filter called without cert argument (hint: if you are using "pki.filters.hasPkiBrazilCpf()", try "pki.filters.hasPkiBrazilCpf")';
			}
			return (cert.pkiBrazil && (cert.pkiBrazil.cpf || '') !== '');
		},
		hasPkiBrazilCnpj: function (cert) {
			if (typeof cert == 'undefined') {
				throw 'filter called without cert argument (hint: if you are using "pki.filters.hasPkiBrazilCnpj()", try "pki.filters.hasPkiBrazilCnpj")';
			}
			return (cert.pkiBrazil && (cert.pkiBrazil.cnpj || '') !== '');
		},
		pkiBrazilCpfEquals: function (cpf) {
			if (typeof cpf !== 'string') {
				throw 'cpf must be a string (hint: if you are using "pki.filters.pkiBrazilCpfEquals", try "pki.filters.pkiBrazilCpfEquals(' + "'" + 'somecpf' + "'" + ')")';
			}
			return function (cert) {
				return (cert.pkiBrazil && cert.pkiBrazil.cpf === cpf);
			};
		},
		pkiBrazilCnpjEquals: function (cnpj) {
			if (typeof cnpj !== 'string') {
				throw 'cnpj must be a string (hint: if you are using "pki.filters.pkiBrazilCnpjEquals", try "pki.filters.pkiBrazilCnpjEquals(' + "'" + 'somecnpj' + "'" +')")';
			}
			return function (cert) {
				return (cert.pkiBrazil && cert.pkiBrazil.cnpj === cnpj);
			};
		},
		hasPkiItalyCodiceFiscale: function (cert) {
			if (typeof cert == 'undefined') {
				throw 'filter called without cert argument (hint: if you are using "pki.filters.hasPkiItalyCodiceFiscale()", try "pki.filters.hasPkiItalyCodiceFiscale")';
			}
			return (cert.pkiItaly && (cert.pkiItaly.codiceFiscale || '') !== '');
		},
		pkiItalyCodiceFiscaleEquals: function (cf) {
			if (typeof cf !== 'string') {
				throw 'cf must be a string (hint: if you are using "pki.filters.pkiItalyCodiceFiscaleEquals", try "pki.filters.pkiItalyCodiceFiscaleEquals(' + "'" + 'someCodice' + "'" + ')")';
			}
			return function (cert) {
				return (cert.pkiItaly && cert.pkiItaly.codiceFiscale === cf);
			};
		},
		isWithinValidity: function (cert) {
			if (typeof cert == 'undefined') {
				throw 'filter called without cert argument (hint: if you are using "pki.filters.isWithinValidity()", try "pki.filters.isWithinValidity")';
			}
			var now = new Date();
			return (cert.validityStart <= now && now <= cert.validityEnd);
		},
		all: function () {
			var filters;
			if (arguments.length === 1 && typeof arguments[0] === 'object') {
				filters = arguments[0];
			} else {
				filters = arguments;
			}
			return function (cert) {
				for (var i = 0; i < filters.length; i++) {
					var filter = filters[i];
					if (!filter(cert)) {
						return false;
					}
				}
				return true;
			};
		},
		any: function () {
			var filters;
			if (arguments.length === 1 && typeof arguments[0] === 'object') {
				filters = arguments[0];
			} else {
				filters = arguments;
			}
			return function (cert) {
				for (var i = 0; i < filters.length; i++) {
					var filter = filters[i];
					if (filter(cert)) {
						return true;
					}
				}
				return false;
			};
		}
	};

	$.readCertificate = function (args) {

		if (typeof args === 'string') {
			args = {
				thumbprint: args
			};
		}

		var context = this._createContext(args);
		$._requestHandler.sendCommand(context, 'readCertificate', { certificateThumbprint: args.thumbprint });
		return context.promise;
	};

	$.pollNative = function (args) {
		if (!args) {
			args = {};
		}
		var context = this._createContext(args);
		var apiVersion = args.requiredApiVersion;

		if (!apiVersion) {
			apiVersion = $.apiVersions.latest;
		}
		if (!$._apiMap.nativeWin[apiVersion]) {
			throw 'Unknown JSlib API version: ' + apiVersion;
		}

		$._requestHandler.sendCommand(context, 'pollNative', {
            requiredNativeWinVersion:   $._apiMap.nativeWin[apiVersion],
            requiredNativeLinuxVersion: $._apiMap.nativeLinux[apiVersion],
            requiredNativeMacVersion:   $._apiMap.nativeMac[apiVersion]
		});
		return context.promise;
	};


	$.importPkcs12 = function (args) {
		var context = this._createContext(args);
		$._requestHandler.sendCommand(context, 'importPkcs12', null);
		return context.promise;
	};

	$.removeCertificate = function (args) {
		if (!args) {
			args = {};
		}
		var context = this._createContext(args);
		$._requestHandler.sendCommand(context, 'removeCertificate', args.thumbprint);
		return context.promise;
	};

	$.startSyncDevice = function (args) {
		var context = this._createContext(args);
		$._requestHandler.sendCommand(context, 'startSyncDevice', args);
		return context.promise;
	};

	$.waitSyncDevice = function (args) {
		var context = this._createContext(args);
		$._requestHandler.sendCommand(context, 'waitSyncDevice', args);
		return context.promise;
	};

	$.finishSyncDevice = function (args) {
		var context = this._createContext(args);
		$._requestHandler.sendCommand(context, 'finishSyncDevice', args);
		return context.promise;
	};

	$.refreshDevice = function (args) {
		var context = this._createContext(args);
		$._requestHandler.sendCommand(context, 'refreshDevice', args);
		return context.promise;
	};



	// -------------------- Browser-dependent singleton --------------------

	if ($._requestHandler === undefined) {

		var extensionRequiredVersion = '0.0.0';
		var extensionFirstVersionWithSelfUpdate = null;

		var chromeNativeWinRequiredVersion = null;
		var chromeNativeLinuxRequiredVersion = null;
		var chromeNativeMacRequiredVersion = null;
		var ieAddonRequiredVersion = null;
		var mobileRequiredVersion = null;

		var isIE = null;
		var isChrome = null;
		var isFirefox = null;
		var isEdge = null;
		var isSafari = null;
		var isAndroid = null;
		var isiOS = null;

		var setRequiredComponentVersions = function (apiVersion) {
			if (!apiVersion) {
				apiVersion = $.apiVersions.v1_3;

			}
			if (!$._apiMap.nativeWin[apiVersion]) {
				throw 'Unknown JSlib API version: ' + apiVersion;
			}

			chromeNativeWinRequiredVersion   = $._apiMap.nativeWin[apiVersion];
			chromeNativeLinuxRequiredVersion = $._apiMap.nativeLinux[apiVersion];
			chromeNativeMacRequiredVersion   = $._apiMap.nativeMac[apiVersion];
			ieAddonRequiredVersion           = $._apiMap.ieAddon[apiVersion];
			extensionRequiredVersion         = $._apiMap.extension[apiVersion];
			mobileRequiredVersion            = $._apiMap.mobile[apiVersion];
			if (isChrome) {
				extensionFirstVersionWithSelfUpdate = $._chromeExtensionFirstVersionWithSelfUpdate;
			}
		};


			$._requestHandler = new function () {

				var requestEventName = 'com.lacunasoftware.WebPKI.RequestEvent';
				var responseEventName = 'com.lacunasoftware.WebPKI.ResponseEvent';
				var pendingRequests = {};

				if (isEdge && $._buildChannel !== 'stable') {
					requestEventName = 'com.lacunasoftware.WebPKI.RequestEvent';
					responseEventName = 'com.lacunasoftware.WebPKI.ResponseEvent';
				}

				var eventPagePortName = 'com.lacunasoftware.WebPKI.Port';
				var port = null;

				var s4 = function () {
					return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
				};

				var generateGuid = function () {
					return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
				};

				var registerPromise = function (promise, responseProcessor) {
					var requestId = generateGuid();
					pendingRequests[requestId] = { promise: promise, responseProcessor: responseProcessor };
					return requestId;
				};

				var sendCommand = function (context, command, request, responseProcessor) {
					var requestId = registerPromise(context.promise, responseProcessor);
					var message = {
						requestId: requestId,
						license: context.license,
						useDomainNativePool: context.useDomainNativePool,
						jslibVersion: $._jslibVersion,
						command: command,
						request: request
					};
					if (port === null) {
						port = browser.runtime.connect({ name: eventPagePortName });
						port.onMessage.addListener(function (response) {
							onResponseReceived(response);
							console.log(response);
						});
						console.log('[ContentScript] opened port with extension');
					}
					message.domain = '@popup';
					port.postMessage(message);
				};

				var checkInstalled = function (context, apiVersion) {
					setRequiredComponentVersions(apiVersion);
					initializeExtension(context);
				};


				var initializeExtension = function (context) {
					$._log('initializing extension');
					var subPromise = new $.Promise(null);
					subPromise.success(function (response) {
						if (response.isReady) {
							$._nativeInfo = response.nativeInfo;
							if (response.nativeInfo.os === 'Windows' && $._compareVersions(response.nativeInfo.installedVersion, chromeNativeWinRequiredVersion) < 0) {
								context.promise._invokeSuccess({
									isInstalled: false,
									status: $.installationStates.OUTDATED,
									browserSpecificStatus: $._chromeInstallationStates.NATIVE_OUTDATED,
									message: 'The Web PKI native component is outdated (installed version: ' + response.nativeInfo.installedVersion + ', required version: ' + chromeNativeWinRequiredVersion + ')',
									platformInfo: response.platformInfo,
									nativeInfo: response.nativeInfo
								});
							} else if (response.nativeInfo.os === 'Linux' && $._compareVersions(response.nativeInfo.installedVersion, chromeNativeLinuxRequiredVersion) < 0) {
								context.promise._invokeSuccess({
									isInstalled: false,
									status: $.installationStates.OUTDATED,
									browserSpecificStatus: $._chromeInstallationStates.NATIVE_OUTDATED,
									message: 'The Web PKI native component is outdated (installed version: ' + response.nativeInfo.installedVersion + ', required version: ' + chromeNativeLinuxRequiredVersion + ')',
									platformInfo: response.platformInfo,
									nativeInfo: response.nativeInfo
								});
							} else if (response.nativeInfo.os === 'Darwin' && $._compareVersions(response.nativeInfo.installedVersion, chromeNativeMacRequiredVersion) < 0) {
								context.promise._invokeSuccess({
									isInstalled: false,
									status: $.installationStates.OUTDATED,
									browserSpecificStatus: $._chromeInstallationStates.NATIVE_OUTDATED,
									message: 'The Web PKI native component is outdated (installed version: ' + response.nativeInfo.installedVersion + ', required version: ' + chromeNativeMacRequiredVersion + ')',
									platformInfo: response.platformInfo,
									nativeInfo: response.nativeInfo
								});
							} else {	
								context.promise._invokeSuccess({
									platformInfo: response.platformInfo, 
									nativeInfo: response.nativeInfo,
									isInstalled: true
								});
							}

						} else {
							context.promise._invokeSuccess({
								isInstalled: false,
								status: convertInstallationStatus(response.status),
								browserSpecificStatus: response.status,
								message: response.message,
								platformInfo: response.platformInfo,
								nativeInfo: response.nativeInfo
							});
						}
					});
					subPromise.fail(function (ex) {
						context.promise._invokeError(ex);
					});
					sendCommand({ license: context.license, useDomainNativePool: context.useDomainNativePool, promise: subPromise }, 'initialize', null);
				};

				var convertInstallationStatus = function (bss) {
					if (bss === $._chromeInstallationStates.INSTALLED) {
						return $.installationStates.INSTALLED;
					} else if (bss === $._chromeInstallationStates.EXTENSION_OUTDATED || bss === $._chromeInstallationStates.NATIVE_OUTDATED) {
						return $.installationStates.OUTDATED;
					} else {
						return $.installationStates.NOT_INSTALLED;
					}
				};

				var onResponseReceived = function (result) {
					var request = pendingRequests[result.requestId];
					delete pendingRequests[result.requestId];
					if (result.success) {
						if (request.responseProcessor) {
							result.response = request.responseProcessor(result.response);
						}
						request.promise._invokeSuccess(result.response);
					} else {
						request.promise._invokeError(result.exception);
					}
				};

				this.sendCommand = sendCommand;
				this.checkInstalled = checkInstalled;


			};

	}

})(LacunaWebPKI.prototype);

if (typeof exports === 'object') {
	if (Object.defineProperties) {
		Object.defineProperties(exports, {
			//Using this syntax instead of "exports.default = ..." to maintain compatibility with ES3 (because of the .default)
			'default': {
				value: LacunaWebPKI
			},
			// https://github.com/webpack/webpack/issues/2945
			'__esModule': {
				value: true
			},
			'LacunaWebPKI': {
				value: LacunaWebPKI
			}
		});
	} else {
		exports['default'] = LacunaWebPKI;
		exports.__esModule = true;
		exports.LacunaWebPKI = LacunaWebPKI;
	}
}