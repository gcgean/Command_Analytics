console.log('event-page start');

// -------------------- Constants --------------------

var extensionVersion = '2.17.0';
var nativeApplicationName = 'com.lacunasoftware.webpki';
var extensionInstallUrl = 'https://get.webpkiplugin.com/';
var eventPagePortName = 'com.lacunasoftware.WebPKI.Port';

var chromeInstallationStates = {
	INSTALLED: 0,
	EXTENSION_NOT_INSTALLED: 1,
	EXTENSION_OUTDATED: 2,
	NATIVE_NOT_INSTALLED: 3,
	NATIVE_OUTDATED: 4
};

// -------------------- Browser compatibility --------------------

var browserId = 'chrome';
var browser = chrome;
var extensionId = 'dcngeagmmhegagicpcmpinaoklddcgon';
browser.browserAction = browser.browserAction || browser.action;



// -------------------- Global variables --------------------

var browserSupport = {
    syncStorage: (browser.storage.sync != null && browserId === 'chrome'),
    updateNotification: (browser.runtime.onUpdateAvailable != null),
    updateCheck: (browser.runtime.requestUpdateCheck != null),
    getPlatformInfo: (browser.runtime.getPlatformInfo != null)
};
var updateAvailable = false;
var wpkiHomeData = {};
var blacklistTypes = {
	restPki: 1,
	forceRequireLicense: 2,
	webpkiForbidden: 4
};

// -------------------- Modules --------------------

var window = window ?? self;
importScripts("scripts/forge-cipher.js", "scripts/signalr-client-1.0.4.js", "scripts/sjcl.js");
configureHttpClient(signalR.DefaultHttpClient);

var configManager = new function () {

	var config = {

		// from local storage
		trace: false,
		pkcs11Modules: [],

		// from sync storage
		certs: {},
		sites: {},
		remoteDevices: {},
		remoteDevicesChanged: false

    };

    var loaded = false;
    var syncOrLocal = browserSupport.syncStorage ? browser.storage.sync : browser.storage.local;
    var storagesToLoad = ['local'];
    if (browserSupport.syncStorage) {
        storagesToLoad.push('sync');
    }

    var init = function () {

        var storagesLoaded = 0;

        var loadSettings = function (storageName) {
            browser.storage[storageName].get(null, function (items) {
                for (var key in items) {
                    if (items.hasOwnProperty(key)) {
                        updateConfig(key, items[key], storageName);
                    }
                }
                console.log('[ConfigManager] ' + storageName + ' config loaded');
                if (++storagesLoaded === storagesToLoad.length) {
                    loaded = true;
                    browser.storage.onChanged.addListener(onStorageChanged);
                }
            });
        };

        for (var i = 0; i < storagesToLoad.length; i++) {
            loadSettings(storagesToLoad[i]);
        }
    };

    var onStorageChanged = function (changes, storageName) {
        for (var key in changes) {
            if (changes.hasOwnProperty(key)) {
                var newValue = changes[key].newValue;
                console.log('[ConfigManager] setting ' + key + ' changed to ' + newValue + ' on storage ' + storageName);
                updateConfig(key, newValue, storageName);
            }
        }
    };

    var updateConfig = function (key, value, storageName) {
        var processed = false;
        if (key.indexOf('trust:') == 0) {
            var parts = key.split(':');
            if (parts.length === 3) {
                var domain = parts[1];
                var certThumb = parts[2];
                getOrCreateSiteConfig(domain).certAccess[certThumb] = (value === true);
                processed = true;
            }
        } else if (key.indexOf('certSubject:') == 0) {
            var certThumb = key.substring(12);
            getOrCreateCertConfig(certThumb).subjectName = value;
            processed = true;
        } else if (key.indexOf('certIssuer:') == 0) {
            var certThumb = key.substring(11);
            getOrCreateCertConfig(certThumb).issuerName = value;
            processed = true;
        } else if (key.indexOf('certCache:') == 0) {
            var certThumb = key.substring(10);
            getOrCreateCertConfig(certThumb).content = value;
            processed = true;
        }
        if (key === 'trace') {
            config.trace = value;
            processed = true;
        } else if (key === 'pkcs11') {
            config.pkcs11Modules = value;
            processed = true;
        } else if (key === 'askLaterDate') {
            config.askLaterDate = value;
            processed = true;
        } else if (key === 'uid') {
        	config.uid = value;
        	processed = true;
        } else if (key === 'remoteDevices') {
        	config.remoteDevices = value;
        	processed = true;
        	config.remoteDevicesChanged = true;
		} else if (key === 'experimentalAccess') {
			config.experimentalAccess = value;
			processed = true;
		}
        if (!processed) {
            console.log('[ConfigMager] ignored changes to ' + storageName + ' storage (key: ' + key + ', value: ' + value + ')');
        }
    };

    var get = function (callback) {
        if (loaded) {
            callback(config);
        } else {
            // config still loading, try again later
            setTimeout(function () {
                get(callback);
            }, 100);
        }
    };

    var getCertificate = function (certThumb, callback) {
        get(function () {
            callback(getOrCreateCertConfig(certThumb));
        });
    };

    var getOrCreateCertConfig = function (certThumb) {
        var certConfig = config.certs[certThumb];
        if (certConfig === undefined) {
            certConfig = {
                trustedSites: {},
                content: null,
                subjectName: null,
                issuerName: null
            };
            config.certs[certThumb] = certConfig;
        }
        return certConfig;
    };

    var getSite = function (domain, callback) {
        get(function () {
            callback(getOrCreateSiteConfig(domain));
        });
    };

    var getOrCreateSiteConfig = function (domain) {
        var siteConfig = config.sites[domain.toLowerCase()];
        if (siteConfig === undefined) {
            siteConfig = {
                certAccess: {}
            };
            config.sites[domain.toLowerCase()] = siteConfig;
        }
        return siteConfig;
    };

    var setTrace = function (value, callback) {
        browser.storage.local.set({
            trace: value
        }, function () {
            console.log('[ConfigManager] trace setting saved');
            if (callback) {
                callback();
            }
        });
	};

	var setExperimentalAccess = function (value, callback) {
		browser.storage.local.set({
			experimentalAccess: value
		}, function () {
			if (callback) {
				callback();
			}
		});
	};

    var setSiteTrust = function (domain, cert, callback) {
        var setRequest = {};
        setRequest['trust:' + domain.toLowerCase() + ':' + cert.thumbprint] = true;
        setRequest['certSubject:' + cert.thumbprint] = cert.subjectName;
        setRequest['certIssuer:' + cert.thumbprint] = cert.issuerName;
        syncOrLocal.set(setRequest, function () {
            console.log('[ConfigManager] site trust setting saved');
            if (callback) {
                callback();
            }
        });
    };

    var clearSiteTrust = function (domain, certThumb, callback) {
        syncOrLocal.remove('trust:' + domain.toLowerCase() + ':' + certThumb, function () {
            console.log('[ConfigManager] site trust cleared');
            if (callback) {
                callback();
            }
        });
    };

    var setPkcs11Modules = function (modules, callback) {
        browser.storage.local.set({
            pkcs11: modules
        }, function () {
            console.log('[ConfigManager] pkcs11 modules setting saved');
            if (callback) {
                callback();
            }
        });
    };

    var addPkcs11Modules = function (modules, callback) {
    	this.get(function (config) {
    		if ((modules || []).length > 0 && config) {
    			var tmodules = config.pkcs11Modules || [];
    			var prevLen = tmodules.length;
    			for (var i = 0; i < modules.length; i++) {
    				if (!(tmodules.find(function (m) { return m.toLowerCase() === modules[i].toLowerCase() }))) {
    					tmodules.push(modules[i]);
    				}
    			}
    			if (prevLen < tmodules.length) {
    				console.log('[ConfigManager] adding pkcs11 modules from command request');
    				setPkcs11Modules(tmodules, callback);
    			}
    		}
    	});

    };

    var setCertCache = function (thumb, content, callback) {
        var setRequest = {};
        setRequest['certCache:' + thumb] = content;
        browser.storage.local.set(setRequest, function () {
            console.log('[ConfigManager] certificate added to cache');
            if (callback) {
                callback();
            }
        });
    };


    var getUid = function(callback) {
    	this.get(function (config) {
    		if (config.uid) {
    			callback(config.uid);

            } else {
    			var uid = generateGuid(true);
            	browser.storage.local.set({ uid: uid }, function () {
            		console.log('[ConfigManager] UID created');
            		callback(uid);
            	});
            }
    	});
    };

	var addOrUpdateDevice = function (remoteDevices, deviceInfo, callback) {
		remoteDevices[deviceInfo.deviceId] = deviceInfo;
		browser.storage.local.set({
			remoteDevices: remoteDevices
		}, function () {
			console.log('[ConfigManager] remote device set');
			if (callback) {
				callback(deviceInfo);
			}
		});
	};

	var updateDevice = function (deviceInfo, callback) {
		this.get(function (config) {
			var remoteDevices = config.remoteDevices || {};
			if (remoteDevices[deviceInfo.deviceId]) {
				addOrUpdateDevice(remoteDevices, deviceInfo, callback);
			} else {
				console.log('[ConfigManager] cannot update remote device: removed');
			}
		});
	};

	var addDevice = function (deviceInfo, callback) {
		this.get(function (config) {
			addOrUpdateDevice(config.remoteDevices || {}, deviceInfo, callback);
		});
	};

    var removeDevice = function (deviceId, callback) {
    	this.get(function (config) {
    		delete config.remoteDevices[deviceId];

    		browser.storage.local.set({
    			remoteDevices: config.remoteDevices
    		}, function () {
    			console.log('[ConfigManager] remote device removed');
    			if (callback) {
    				callback();
    			}
    		});
    	});
    };

    var setRemoteDevicesRefreshed = function () {
    	config.remoteDevicesChanged = false;
    };

    this.get = get;
    this.getCertificate = getCertificate;
    this.getSite = getSite;
	this.setTrace = setTrace;
	this.setExperimentalAccess = setExperimentalAccess;
    this.setSiteTrust = setSiteTrust;
    this.clearSiteTrust = clearSiteTrust;
    this.setPkcs11Modules = setPkcs11Modules;
    this.setCertCache = setCertCache;
    this.addPkcs11Modules = addPkcs11Modules;
    this.getUid = getUid;
	this.addDevice = addDevice;
	this.updateDevice = updateDevice;
    this.removeDevice = removeDevice;
    this.setRemoteDevicesRefreshed = setRemoteDevicesRefreshed;

    init();
};

// -------------------- Variables --------------------

var pages = [];

var nativePool = {};

var remoteActionTypes = {
	mergeable:  'mergeable',
	priority: 'priority' 
};

// -------------------- Functions --------------------

function init() {
	gaEvent('ext', 'startup', extensionVersion);
	browser.runtime.onConnect.addListener(onPageConnected);
	if (browserSupport.updateNotification) {
	    browser.runtime.onUpdateAvailable.addListener(onUpdateAvailable);
	} else {
	    console.log('[EventPage] update notification not supported!');
	}

	// set empty badge
	browser.browserAction.setBadgeBackgroundColor({ color: '#ff0000' });
	setAlertBadge(false);
	forceExtInstalledDetection();
	getWebPkiHomeData();
}

function setAlertBadge(status) {
	// disables for now this confusion alert on icon
	if (status) {
		return;
	}
	var text = status ? ' ! ' : '';
	browser.browserAction.setBadgeText({ text: text });
}

function onUpdateAvailable(details) {
	console.log('[EventPage] update available: ' + details.version);
	updateAvailable = true;
}

function waitForOnUpdateAvailable(callback) {
	if (updateAvailable) {
		callback();
	} else {
		console.log('[EventPage] onUpdateAvailable not received, waiting ...');
		setTimeout(function () {
			waitForOnUpdateAvailable(callback);
		}, 1000);
	}
}

function onPageConnected(port) {

	if (port.name !== eventPagePortName) {
		console.log('[EventPage] ignored connect event on port ' + port.name);
		return;
	}

	console.log('### port                : ', port);
	console.log('### port.sender         : ', port.sender);
	if (port.sender) {
		console.log('### port.sender.url     : ' + port.sender.url);
		console.log('### port.sender.tab     : ', port.sender.tab);
		if (port.sender.tab) {
			console.log('### port.sender.tab.url : ' + port.sender.tab.url);
		}
	}
	console.log('### extensionId         : ' + extensionId);

	var isPopup = false;
	if (!port.sender) {
		isPopup = true;
	} else {
		switch (browserId) {
			case 'chrome':
			case 'edge':
				isPopup = port.sender.url.indexOf('chrome-extension://' + extensionId) === 0;
				break;
			case 'firefox':
				isPopup = port.sender.url.indexOf('moz-extension://') === 0 && (port.sender.extensionId === extensionId || port.sender.id === extensionId);
				break;
			default:
				break;
		}
	}

	var domain = null;
	if (isPopup) {
		domain = '@popup';
	} else {
		var tabUrl = (port.sender.tab && port.sender.tab.url) ? port.sender.tab.url : port.sender.url;
		var m = /\/\/([^\/:]*)/.exec(tabUrl);
		if (!m) {
			throw 'Unable to parse port domain: ' + tabUrl;
		}
		domain = m[1].toLowerCase();
	}

	var page = {
		pagePort: port,
		nativePort: null,
		pageDisconnected: false,
		callbacks: {},
		paths: {},
		preauthorizedSignatures: {},
		domain: domain
	};
	pages.push(page);

	port.onMessage.addListener(function (message) {
		onPageMessage(page, message);
	});
	port.onDisconnect.addListener(function () {
		onPageDisconnected(page);
	});
}

function connectToNative(page) {
	var nativeConnector = page.useDomainNativePool ? connectToNativePool : connectToNativePrivate;
	nativeConnector(page);
	startKeepAlive();
}

function connectToNativePrivate(page) {
	page.nativePort = browser.runtime.connectNative(nativeApplicationName);
	page.nativePort.onMessage.addListener(function (message) {
		onNativeMessage(page, message);
	});
	page.nativePort.onDisconnect.addListener(function (callbackPort) {
		onNativeDisconnected(page, callbackPort);
	});
	console.log('[EventPage] page connected to native private');
}

function connectToNativePool(page) {
	var native = nativePool[page.domain];
	if (!native) {
		native = {};
		native.port = browser.runtime.connectNative(nativeApplicationName);
		native.refCount = 0;
		native.shutdownTimeoutId = null;

		native.port.onMessage.addListener(function (message) {
			onNativePoolMessage(page.domain, message);
		});
		native.port.onDisconnect.addListener(function (callbackPort) {
			onNativePoolDisconnected(page.domain, callbackPort);
		});

		nativePool[page.domain] = native;
	}

	if (native.shutdownTimeoutId !== null) {
		clearTimeout(native.shutdownTimeoutId);
		native.shutdownTimeoutId = null;
		console.log('[EventPage] native shutdown timeout cancelled');
	}

	native.refCount++;
	page.nativePort = native.port;
	console.log('[EventPage] page ' + page.domain + ' connected to native pool');
}

function onPageMessage(page, request) {
	console.log('[EventPage] request received', request);
	page.license = request.license;
	page.useDomainNativePool = request.useDomainNativePool;
	
	var requestContext = {
		page: page,
		requestId: request.requestId,
		command: request.command,
		request: request.request
	};
	var action = commands[request.command];
	if (action === undefined) {
		action = commands._default;
	}

	if (checkRestrictedDomain(page.domain, blacklistTypes.webpkiForbidden)) {
		replyRequestError(requestContext, 'The (' + page.domain + ') domain is currently forbidden on Web PKI.', 'blocked_domain');
		// refresh blacklist
		setTimeout(getWebPkiHomeData, 100);
		return;
	}

	try {
		action(requestContext);
	} catch (err) {
		console.log('[EventPage] error while executing command ' + request.command, err);
		if (typeof err === 'object' && err.error && err.code) {
			replyRequestError(requestContext, err.error, err.code);
		} else {
			replyRequestError(requestContext, 'An unhandled exception occurred: ' + err);
		}
	}
}

function onPageDisconnected(page) {
	console.log('[EventPage] page disconnected');
	page.pageDisconnected = true;

	var shutdownMessage = {
		domain: 'localhost',
		command: 'getInfo',
		language: browser.i18n.getUILanguage(),
		keepAlive: false,
		request: { cancelInstances: false }
	};

	if (!page.useDomainNativePool) {
		if (page.nativePort) {
			console.log('[EventPage] sending command getInfo to force native shutdown');
			page.nativePort.postMessage(shutdownMessage);
		}

	} else {
		var native = nativePool[page.domain];
		if (native) {
			native.refCount--;
			console.log('[EventPage] native pool [' + page.domain + '] ref count: ' + native.refCount);

			if (native.refCount <= 0) {
				var shutdownDelay = page.domain === '@popup' ? 100 : 30000;
				native.shutdownTimeoutId = setTimeout(function () {
					console.log('[EventPage] sending command getInfo to force native shutdown');
					page.nativePort.postMessage(shutdownMessage);
					delete nativePool[page.domain];
				}, shutdownDelay);
				console.log('[EventPage] native shutdown scheduled: ' + shutdownDelay);
			}
		}
	}

	// tell mobiles
	// TODO for sure?
	//remoteDevicesManager.getConnectedDevices(function (devices) {
	//	for (var id in devices) {
	//		devices[id].client.sendMessage({ domain: 'localhost', command: 'getInfo', language: userLanguage, keepAlive: false });
	//	}
	//});
	pages.splice(pages.indexOf(page), 1); // remove page from list of connected pages
}

var anyConnectedDevice = false;

function callNative(requestContext, command, request, successCallback, errorCallback, keepAlive, bypassLicensing) {
	if (errorCallback === undefined || errorCallback === null) {
		errorCallback = function (exceptionModel) {
			replyRequestException(requestContext, exceptionModel);
		};
	}
	if (keepAlive === undefined) {
		keepAlive = true;
	}
	if (bypassLicensing === undefined) {
		bypassLicensing = false;
	}
	var page = requestContext.page;
	var requestId = generateGuid();

	var forceRequireLicense = false;
	if (checkRestrictedDomain(page.domain, blacklistTypes.forceRequireLicense)) {
		forceRequireLicense = true;
	}
	
	// reconnect if necessary
	if (page.nativePort === null) {
		reconnectPort(page, errorCallback);
	}

	configManager.get(function (config) {
		var message = {
			requestId: requestId,
			license: page.license,
			domain: page.domain,
			command: command,
			request: request,
			language: browser.i18n.getUILanguage(),
			keepAlive: keepAlive,
			trace: config.trace,
			pkcs11Modules: config.pkcs11Modules,
			requireLicense: forceRequireLicense
		};
		if (bypassLicensing || page.domain === '@popup') {
			message.domain = 'localhost';
		}

		// final success callback
		var finalSuccessCallback = successCallback;
		// the page callback (assigned to page if local native is called)
		var pageCallback = function (result) {
			try {
				if (result.success) {
					finalSuccessCallback(result.response);
					return;
				}

				if (isBufferedResponse(result)) {
					console.log('[EventPage] starting buffered read response from command: ' + command);
					startReadNativeBufferedResponse(requestContext, result, config, finalSuccessCallback, errorCallback);
					return;
				}

				errorCallback(result.exception);

			} catch (err) {
				replyRequestError(requestContext, err.toString());
			}
		};

		// local native call
		var callLocalNative = function () {
			// assign page callback before local native call
			page.callbacks[requestId] = pageCallback;

			console.log('[EventPage] sending command ' + command + ' to native');
			page.nativePort.postMessage(message);
		};

		// if command cannot be remote callable
		if (remoteCommands[command] === undefined) {
			callLocalNative();
			return;
		}

		remoteDevicesManager.getConnectedDevices(function (devices) {
			// if any remote connected
			anyConnectedDevice = Object.keys(devices).length > 0;

			if (!anyConnectedDevice) {
				callLocalNative();
				return;
			}

			// if remote command is pre callable
			if (remoteCommands[command].preCall !== undefined) {
				remoteCommands[command].preCall(message, devices, successCallback, errorCallback, callLocalNative);
			}

			// if remote command is post callable
			if (remoteCommands[command].postCall !== undefined) {
				// set final callback to call remote on local native success
				finalSuccessCallback = function (response) {
					remoteCommands[command].postCall(message, response, devices, successCallback, errorCallback);
				};
				callLocalNative();
			}

		});
	});
}

function reconnectPort(page, errorCallback) {
	if (page.nativePort !== null) {
		// already connected
		return;
	}

	try {
		connectToNative(page);
	} catch (err) {
		// setTimeout so we don't call errorCallback synchronously
		setTimeout(function () {
			errorCallback(createExceptionModel('Failed to connect to native application', 'native_connect_failure'));
		}, 100);
	}
}

function isBufferedResponse(result) {
	// use IO_ERROR failure so native and extension can be backward compatible to each other
	return result.exception && result.exception.code === 'io_error' && result.streamId;
}

function startReadNativeBufferedResponse(requestContext, result, config, successCallback, errorCallback) {
	var context = {
		requestContext: requestContext,
		page: requestContext.page,
		originalResult: result,
		successCallback: successCallback,
		errorCallback: errorCallback,
		config: config,
		buffer: '',
		streamId: result.streamId,
		offset: 0
	};

	readNativeBufferedResponse(context);
}

function readNativeBufferedResponse(context) {
	var page = context.page;

	if (page.nativePort === null) {
		reconnectPort(page, context.errorCallback);
	}

	var requestId = generateGuid();
	var readRequest = {
		streamId: context.streamId,
		offset: context.offset
	};

	var message = {
		requestId: requestId,
		domain: page.domain,
		command: 'readBufferedResponse',
		request: readRequest,
		language: browser.i18n.getUILanguage(),
		keepAlive: true,
		trace: context.config.trace
	};
	
	var iterationCallback = function (result) {
		if (!result.success) {
			context.errorCallback(result.exception);
			return;
		}

		if (result.response.buffer && result.response.buffer.length > 0) {
			console.log('[EventPage] buffer written length: ' + result.response.buffer.length);
			context.buffer += result.response.buffer;
			context.offset += result.response.buffer.length;
		}

		if (context.offset >= context.originalResult.streamLength) {
			context.originalResult.response = JSON.parse(context.buffer);
			context.buffer = null;
			delete context.buffer;
			delete result.response.buffer;
			console.log('[EventPage] reading buffer finished. Final length: ' + context.offset);
			context.successCallback(context.originalResult.response);
			callNative(context.requestContext, 'finishBufferedResponse', { streamId: context.streamId }, function () { });
			return;
		}

		readNativeBufferedResponse(context);
	};

	page.callbacks[requestId] = iterationCallback;
	console.log('[EventPage] sending command readBufferedResponse to native');
	page.nativePort.postMessage(message);
}

function onNativeMessage(page, message) {
	if (page.pageDisconnected) {
		console.log('[EventPage] received message from native component (page already disconnected)');
		return;
	}

	if (typeof message === 'string') {
		message = JSON.parse(message);
	}

	console.log('[EventPage] received message from native component', message);
	if (message.requestId !== undefined) {
		var callback = page.callbacks[message.requestId];
		delete page.callbacks[message.requestId];
		callback(message);
	} else {
		var callbackCount = 0;
		var lastId;
		for (var id in page.callbacks) {
			if (page.callbacks.hasOwnProperty(id)) {
				++callbackCount;
				lastId = id;
			}
		}
		if (callbackCount === 1) {
			var callback = page.callbacks[lastId];
			delete page.callbacks[lastId];
			callback(message);
		} else {
			throw 'Response does not have a requestId and there is more than one callback registered';
		}
	}
}

function onNativeDisconnected(page, port) {
	stopKeepAlive();
	if (page.pageDisconnected) {
		console.log('[EventPage] native component disconnected (page already disconnected)');
		return;
	}

	var errorMsg = 'Did not receive response from native application';
	if (port && port.error && port.error.message) {
		errorMsg = port.error.message;
	} else if (browser.runtime.lastError) {
		if (typeof browser.runtime.lastError === 'string') {
			errorMsg = browser.runtime.lastError;
		} else if (browser.runtime.lastError.message) {
			errorMsg = browser.runtime.lastError.message;
		}
	}
	
	console.log('[EventPage] native component disconnected: ' + errorMsg);

	page.nativePort = null;
	for (var requestId in page.callbacks) {
		if (page.callbacks.hasOwnProperty(requestId)) {
			var callback = page.callbacks[requestId];
			callback({
				success: false,
				exception: {
					message: errorMsg,
					complete: errorMsg,
					origin: 'eventpage',
					code: 'native_disconnected'
				}
			});
			delete page.callbacks[requestId];
		}
	}
}

function onNativePoolMessage(domain, message) {
	var domainPages = pages.filter(function (p) {
		return p.domain === domain && !p.pageDisconnected;
	});

	if (domainPages.length === 0) {
		console.log('[EventPage] received message from native component (page already disconnected)');
		return;
	}

	if (typeof message === 'string') {
		message = JSON.parse(message);
	}

	var page = null;
	for (var i=0; i<domainPages.length; i++) {
		page = domainPages[i];
		if (message.requestId !== undefined) {
			if (page.callbacks[message.requestId]) {
				console.log('[EventPage] received message from native component', message);
				var callback = page.callbacks[message.requestId];
				delete page.callbacks[message.requestId];
				callback(message);
			}
		} else {
			var callbackCount = 0;
			var lastId;
			for (var id in page.callbacks) {
				if (page.callbacks.hasOwnProperty(id)) {
					++callbackCount;
					lastId = id;
				}
			}
			if (callbackCount === 1) {
				var callback = page.callbacks[lastId];
				delete page.callbacks[lastId];
				callback(message);
			} else {
				throw 'Response does not have a requestId and there is more than one callback registered';
			}
		}
	}
}

function onNativePoolDisconnected(domain, port) {
	stopKeepAlive();
	var domainPages = pages.filter(function (p) {
		return p.domain === domain && !p.pageDisconnected;
	});

	if (domainPages.length === 0) {
		console.log('[EventPage] native component disconnected (page already disconnected)');
		return;
	}

	var errorMsg = 'Did not receive response from native application';
	if (port && port.error && port.error.message) {
		errorMsg = port.error.message;
	} else if (browser.runtime.lastError) {
		if (typeof browser.runtime.lastError === 'string') {
			errorMsg = browser.runtime.lastError;
		} else if (browser.runtime.lastError.message) {
			errorMsg = browser.runtime.lastError.message;
		}
	}
	
	console.log('[EventPage] native component disconnected: ' + errorMsg);

	for (var i=0; i<domainPages.length; i++) {
		page = domainPages[i];
		page.nativePort = null;

		for (var requestId in page.callbacks) {
			if (page.callbacks.hasOwnProperty(requestId)) {
				var callback = page.callbacks[requestId];
				callback({
					success: false,
					exception: {
						message: errorMsg,
						complete: errorMsg,
						origin: 'eventpage',
						code: 'native_disconnected'
					}
				});
				delete page.callbacks[requestId];
			}
		}
	}
}

var _keepAliveId = null;
var _keepAliveLength = 0;

function startKeepAlive() {
	if (_keepAliveId !== null) {
		return;
	}
	_keepAliveId = setInterval(function () {
		browser.storage.local.get(null, function (items) {
			_keepAliveLength = (items || {}).length;
		});
	}, 20 * 1000);
}

function stopKeepAlive() {
	if (_keepAliveId === null) {
		return;
	}
	clearInterval(_keepAliveId);
	_keepAliveId = null;
}

function replyRequest(requestContext, result) {
	configManager.get(function (config) {
		var message = {
			requestId: requestContext.requestId,
			success: result.success,
			response: result.response,
			exception: result.exception,
			trace: config.trace
		};
		requestContext.page.pagePort.postMessage(message);
	});

	if (!result.success && result.exception) {
		gaEvent('error', result.exception.code, result.exception.message, requestContext.page.domain);
	}
}

function replyRequestSuccess(requestContext, response) {
	var result = {
		success: true,
		response: response
	};
	replyRequest(requestContext, result);
}

function replyRequestError(requestContext, error, code) {
	var result = {
		success: false,
		exception: createExceptionModel(error, code)
	};
	replyRequest(requestContext, result);
}

function createExceptionModel(error, code) {
	return {
		message: error,
		complete: error,
		origin: 'eventpage',
		code: code || 'undefined'
	};
}

function replyRequestException(requestContext, exception) {
	var result = {
		success: false,
		exception: exception
	};
	replyRequest(requestContext, result);
}

function createParameterNotSetError(error) {
	return {
		error: error,
		code: 'command_parameter_not_set'
	};
}

// -----------------------------------------------
// HTTP request

var httpGet = function() {};
var httpPost = function() {};
var httpPut = function() {};


// -----------------------------------------------
// Fetch

function _fetchSend(url, options) {
	var request = new Request(url, {
		method: options.method,
		mode: 'cors',
		redirect: 'follow',
		headers: options.headers,
		credentials: options.withCredentials ? 'include' : 'same-origin',
		body: options.body,
		signal: options.signal
	});

	return fetch(request);
}

httpGet = function(url, successCallback, errorCallback) {
	var method = 'GET';
	_fetchSend(url, {
		method: method,
		headers: new Headers({
			'Accept': 'application/json'
		})
	})
	.then(response => _handleFetchResponse(url, method, response, successCallback, errorCallback))
	.catch(reason => _handleFetchCatch(reason, errorCallback));
}

httpPost = function(url, data, successCallback, errorCallback) {
	var method = 'POST';
	_fetchSend(url, {
		method: method,
		headers: new Headers({
			'Content-Type': 'application/json',
			'Accept': 'application/json'
		}),
		body: JSON.stringify(data)
	})
	.then(response => _handleFetchResponse(url, method, response, successCallback, errorCallback))
	.catch(reason => _handleFetchCatch(reason, errorCallback));
}

httpPut = function(url, data, successCallback, errorCallback) {
	var method = 'PUT';
	_fetchSend(url, {
		method: method,
		headers: new Headers({
			'Content-Type': 'application/json',
			'Accept': 'application/json'
		}),
		body: JSON.stringify(data)
	})
	.then(response => _handleFetchResponse(url, method, response, successCallback, errorCallback))
	.catch(reason => _handleFetchCatch(reason, errorCallback));
}

function _handleFetchResponse(url, method, response, successCallback, errorCallback) {
	response.text()
		.then(responseText => {
			if (!response.ok) {
				var errorModel = null;
				try {
					errorModel = JSON.parse(responseText);
				} catch (e) {}
				var errorCaller = errorCallback || function (status, e) { console.log('[HttpHandler] Fetch HTTP Error (' + status + ') ' + method + ' on ' + url, e); };
				errorCaller(response.status, errorModel);
				return;
			}

			var responseObject = null;
			if (response.status === 200 || response.status === 201) {
				responseObject = JSON.parse(responseText || "null");
			}

			console.log('[HttpHandler] received response from ' + method + ' ' + url, responseObject);
			if (successCallback) {
				successCallback(responseObject);
			}

		}).catch(reason => {
			console.log(`[HttpHandler] Fetch Error reading response ${request.method} on ${request.url}: ${response?.statusText}`, reason);
			if (errorCallback) {
				errorCallback(response?.status ?? -1, createExceptionModel(reason?.toString()));
			}
		});
}

function _handleFetchCatch(url, method, reason, errorCallback) {
	var errorCaller = errorCallback || function (e) { console.log('[HttpHandler] Fetch Error with ' + method + ' on ' + url + ': ', reason); };
	errorCaller(-1, createExceptionModel(reason?.toString()));
}

function configureHttpClient(singalHttpClient) {
	var commonCatch = function (reason, request, response, reject) {
		console.log(`Error on singal HttpClient fetch call ${request.method} on ${request.url}: ${response?.statusText}`, reason);
		if (reject) {
			reject(new signalR.HttpError(reason?.toString(), response?.status ?? -1));
		}
	};

	singalHttpClient.prototype.send = function (request) {
		return new Promise(function (resolve, reject) {
			var options = {
				method: request.method,
				withCredentials: true,
				headers: new Headers({
					//'X-Requested-With': 'XMLHttpRequest', // not anymore
					// Explicitly setting the Content-Type header for React Native on Android platform.
					'Content-Type': 'text/plain;charset=UTF-8'
				}),
			};

			if (request.headers) {
				Object.keys(request.headers)
					.forEach(function (header) {
						options.headers.append(header, request.headers[header]);
					});
			}

			if (request.responseType) {
				options.headers.append('Accept', request.responseType);
			} else {
				options.headers.append('Accept', '*');
			}
			if (request.abortSignal) {
				options.signal = request.abortSignal;
			}
			
			_fetchSend(request.url, options)
			.then(response => {
				if (!response.ok) {
					console.log(`singal HttpClient fetch call returned ${resonse.statusText} (${response.status}) with ${request.method} on ${request.url}`, reason);
					var httpError = new signalR.HttpError(response.statusText, response.status);
					reject(httpError);
					return;
				}
				response.text()
				.then(content => {
					var httpResponse = new signalR.HttpResponse(response.status, response.statusText, content);
					resolve(httpResponse);
				})
				.catch(reason => commonCatch(reason, reject));
			})
			.catch(reason => commonCatch(reason, reject));
		});
	};
}

// -----------------------------------------------

function getVersion() {
	return extensionVersion;
}

// Adapted from
//http://codingrepo.com/regular-expression/2015/11/23/javascript-generate-uuidguid-for-rfc-4122-version-4-compliant-with-regular-expression/
function generateGuid(tryCryptoRandom) {

	function genRandomNibble(tryCryptoRandom) {
		var cryptoObj = window.crypto || window.msCrypto || crypto || msCrypto;

		if (tryCryptoRandom && cryptoObj && cryptoObj.getRandomValues && (window.Uint8Array || Uint8Array)) {
			// crypto random supported
			return cryptoObj.getRandomValues(new Uint8Array(1))[0] % 16 | 0;
		}
		return Math.random() * 16 | 0;
	}
	return 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'.replace(/[x]/g, function (c) {
		return genRandomNibble(tryCryptoRandom).toString(16);
	});
}

function compareVersions(v1, v2) {

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

		var v1p = parseInt(v1parts[i]);
		var v2p = parseInt(v2parts[i]);

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
}

function forceExtInstalledDetection() {
	if (browserId !== 'chrome' && browserId !== 'edge') {
		return;
	}

	// if any opened tab on setup site, refresh it in order to detect extension install
	// and close web store tab
	var baseStoreAddress = null;
	baseStoreAddress = 'https://chromewebstore.google.com/detail/';
	var storeUrls = [
		baseStoreAddress + extensionId,
		baseStoreAddress + '*/' + extensionId,
		baseStoreAddress + '*/' + extensionId + '/*'
	];
	var setupSiteInstallUrls = [
		'https://get.webpkiplugin.com/*',
		'https://getwebpkibeta.lacunasoftware.com/*',
		'https://getwebpkialpha.lacunasoftware.com/*'
	];

	browser.tabs.query({ url: setupSiteInstallUrls }, function (t) {
		if (t.length > 0) {
			browser.tabs.query({
				url: storeUrls
			}, function (tc) {
				tc.forEach(function (ec) {
					console.log('[EventPage] closing webstore tab id: ', ec.id);
					browser.tabs.remove(ec.id);
				});
			});
		}
		t.forEach(function (e) {
			console.log('[EventPage] refreshing setup-site tab id: ', e.id);
			browser.tabs.reload(e.id, { bypassCache: true });
		});
	});
}

function initialize(requestContext, successCallback, errorCallback) {

	var getNativeInfo = function (platformInfo) {

		var result = {
			platformInfo: platformInfo
		};

		callNative(requestContext, 'getInfo', {

			cancelInstances: false

		}, function (response) {

			if (response.os !== 'Windows' && response.os !== 'Linux' && response.os !== 'Darwin') {
				// we mustn't throw exceptions here!
			    errorCallback(createExceptionModel('Not supported OS: ' + response.os, 'os_not_supported'));
			}

			result.nativeInfo = {
				os: response.os,
				installedVersion: response.version
			};
			result.isReady = true;
			result.status = chromeInstallationStates.INSTALLED;

			successCallback(result);
			gaEvent('ext', 'nativeInfo', response.os + ' ' + response.version, requestContext.page.domain);

		}, function (exceptionModel) {

			if (exceptionModel.code && exceptionModel.code.toLowerCase() === 'native_disconnected') {
				result.isReady = false;
				result.status = chromeInstallationStates.NATIVE_NOT_INSTALLED;
				result.message = 'The Web PKI native component is not installed';
				successCallback(result);
			} else if (exceptionModel.code && exceptionModel.code.toLowerCase() === 'command_unknown') {
				// native version is prior to existance of getInfo, therefore it is outdated
				result.isReady = false;
				result.status = chromeInstallationStates.NATIVE_OUTDATED;
				result.message = 'The Web PKI native component is outdated';
				successCallback(result);
			} else {
				errorCallback(exceptionModel);
			}

		});

		gaEvent('command', 'getInfo', requestContext.page.domain, requestContext.page.domain);
	};

	if (browserSupport.getPlatformInfo) {
		browser.runtime.getPlatformInfo(getNativeInfo);
	} else {
		getNativeInfo(browserId === 'edge' ? { os: 'win' } : null);
	}
}

function createCommonSignerCallRequest(requestContext, fileType, callback) {
	var certThumb = requestContext.request.certificateThumbprint;
	if (!certThumb) {
		throw createParameterNotSetError('The certificateThumbprint parameter cannot be empty');
	}
	var fileId = requestContext.request.fileId;
	if (!fileId && !requestContext.request.content) {
		throw createParameterNotSetError('A ' + fileType + ' fileId or content parameter must be passed');
	}
	var filePath = null;
	if (fileId) {
		filePath = getPath(fileId, 'File', requestContext);
	}

	var folderPath = null;
	if (requestContext.request.output.folderId) {
		folderPath = getPath(requestContext.request.output.folderId, 'Folder', requestContext);
	}

	var commonRequest = {
		certificateThumbprint: certThumb,
		filePath: filePath,
		content: requestContext.request.content,
		output: {
			mode: requestContext.request.output.mode,
			folderPath: folderPath,
			dialogTitle: requestContext.request.output.dialogTitle,
			fileNameSuffix: requestContext.request.output.fileNameSuffix
		},
		trustArbitrators: requestContext.request.trustArbitrators,
		clearPolicyTrustArbitrators: requestContext.request.clearPolicyTrustArbitrators,
		timestampRequester: requestContext.request.timestampRequester,
		certificateValidationLevel: requestContext.request.certificateValidationLevel,
		policy: requestContext.request.policy
	};

	if (anyConnectedDevice) {
		remoteDevicesManager.getConnectedDevices(function (devices) {
			for (var id in devices) {
				var device = devices[id];
				var knownCerts = device.deviceInfo.knownCertificates || {};
				if (certThumb in knownCerts) {
					// remote device has the certificate
					// add device info to request
					commonRequest.remoteDevice = {
						sessionId: device.deviceInfo.sessionId,
						key: device.deviceInfo.key
					};
					break;
				}
			}
			callback(commonRequest);
		});
	} else {
		callback(commonRequest);
	}
}

function createCommonOpenCallRequest(requestContext, fileType) {
	var fileId = requestContext.request.signatureFileId;
	if (!fileId && !requestContext.request.signatureContent) {
		throw createParameterNotSetError('A ' + fileType + ' fileId or content parameter must be passed');
	}
	var filePath = null;
	if (fileId) {
		filePath = getPath(fileId, 'File', requestContext);
	}

	return {
		signatureFilePath: filePath,
		signatureContent: requestContext.request.signatureContent,
		validate: requestContext.request.validate,
		dateReference: requestContext.request.dateReference,
		trustArbitrators: requestContext.request.trustArbitrators,
		clearPolicyTrustArbitrators: requestContext.request.clearPolicyTrustArbitrators,
		specificPolicy: requestContext.request.specificPolicy
	};
}

var commands = {

	_default: function (requestContext) {
		callNative(requestContext, requestContext.command, requestContext.request, function (response) {
			replyRequestSuccess(requestContext, response);
		}, function (exceptionModel) {
			replyRequestException(requestContext, exceptionModel);
		});

		gaEvent('command', requestContext.command, '', requestContext.page.domain);
	},

	getExtensionVersion: function (requestContext) {
		var version = getVersion();
		replyRequestSuccess(requestContext, version);
	},

	// Function called by older versions of JS lib to get the native component version and decide whether it's necessary to update it
	getVersion: function (requestContext) {

		// We'll call our initialize method here, since the "initialize" command will NOT be issued by this older version of the JS lib
		initialize(requestContext, function (response) {

			// NOTE: Any calls replyRequestSuccess must return as response a string, which is the old getVersion command behavior
			if (response.isReady) {

				// Initialized reported all OK, let's just reply with the detected version, which will be greater than the required version on the JS lib
				replyRequestSuccess(requestContext, response.nativeInfo.installedVersion);

			} else if (response.status === chromeInstallationStates.NATIVE_OUTDATED) {

				// Initialized reported that the native component is outdated. We'll return version 0 to trick
				// the JS lib into thinking that the native component is older than the version it requires.
				replyRequestSuccess(requestContext, '0');

			} else {

				// Initialized reported that the native component is not installed. We'll reply with the same
				// error that would happen if the getVersion command was forwarded to the native component
			    replyRequestError(requestContext, 'Did not receive response from native component', 'native_no_response');

			}

		}, function (exceptionModel) {

			replyRequestException(requestContext, exceptionModel);

		});
	},

	initialize: function (requestContext) {
		initialize(requestContext, function (response) {
			replyRequestSuccess(requestContext, response);
		}, function (exceptionModel) {
			replyRequestException(requestContext, exceptionModel);
		});
	},

	showFolderBrowser: function (requestContext) {
		callNative(requestContext, 'showFolderBrowser', {
			message: requestContext.request.message
		}, function (response) {
			var pageResponse = {};
			if (response.userCancelled) {
				pageResponse.userCancelled = true;
			} else {
			    pageResponse.userCancelled = false;
			    pageResponse.folderId = registerPath(response.path, requestContext);
			}
			replyRequestSuccess(requestContext, pageResponse);
		});
		gaEvent('command', requestContext.command, '', requestContext.page.domain);
	},

	downloadToFolder: function (requestContext) {
		var url = requestContext.request.url;
		if (!url) {
			throw createParameterNotSetError('The url parameter cannot be empty');
		}
		var folderId = requestContext.request.folderId;
		if (!folderId) {
			throw createParameterNotSetError('The folderId parameter cannot be empty');
		}
		var path = getPath(folderId, 'Folder', requestContext);
		callNative(requestContext, 'downloadToFolder', {
			url: requestContext.request.url,
			folderPath: path,
			filename: requestContext.request.filename
		}, function (response) {
			replyRequestSuccess(requestContext, response);
		});
		gaEvent('command', requestContext.command, '', requestContext.page.domain);
	},

	openFolder: function (requestContext) {
	    var path = getPath(requestContext.request, 'Folder', requestContext);
		callNative(requestContext, 'openFolder', path, function () {
			replyRequestSuccess(requestContext, null);
		});
		gaEvent('command', requestContext.command, '', requestContext.page.domain);
	},

	showFileBrowser: function (requestContext) {
	    callNative(requestContext, 'showFileBrowser', requestContext.request, function (response) {
	        var pageResponse = {};
	        if (response.userCancelled) {
	            pageResponse.userCancelled = true;
	        } else {
	            pageResponse.userCancelled = false;
	            if (response.files) {
	                pageResponse.files = [];
	                for (var i = 0; i < response.files.length; i++) {
	                    pageResponse.files.push({
	                        id: registerPath(response.files[i].path, requestContext),
	                        name: response.files[i].name,
	                        length: response.files[i].length
	                    });
	                }
	            }
	        }
	        replyRequestSuccess(requestContext, pageResponse);
	    });
	    gaEvent('command', requestContext.command, '', requestContext.page.domain);
	},

	openFile: function (requestContext) {
	    var path = getPath(requestContext.request, 'File', requestContext);
	    callNative(requestContext, 'openFile', path, function () {
	        replyRequestSuccess(requestContext, null);
	    });
	    gaEvent('command', requestContext.command, '', requestContext.page.domain);
	},

	updateExtension: function (requestContext) {
	    if (!browserSupport.updateNotification) {
	        console.log('[EventPage] update notifications are not supported');
	        replyRequestSuccess(requestContext, { updating: false, reason: 'not_supported' });
	    } else if (updateAvailable) {
		    notifyUpdateSuccessAndReload(requestContext);
		} else if (browserSupport.updateCheck) {
			console.log('[EventPage] there is no update ready to be installed, checking for updates');
			browser.runtime.requestUpdateCheck(function (status, details) {
				if (status === 'update_available') {
					console.log('[EventPage] requestUpdateCheck reported that an update is available, waiting for onUpdateAvailable event.');
					waitForOnUpdateAvailable(function () {
					    notifyUpdateSuccessAndReload(requestContext);
					});
				} else {
					console.log('[EventPage] requestUpdateCheck reported that no update is available (status: ' + status + ')');
					replyRequestSuccess(requestContext, { updating: false, reason: 'no_update' });
				}
			});
		} else {
			console.log('[EventPage] there is no update ready to be installed and update checks are not supported, waiting 5 seconds to see if a notification arrives on its own');
			var checkCount = 10;
			var check = function () {
				if (updateAvailable) {
					notifyUpdateSuccessAndReload(requestContext);
				} else if (--checkCount > 0) {
					setTimeout(check, 500);
				} else {
					console.log('[EventPage] waited 5 seconds and still no update available, giving up');
					replyRequestSuccess(requestContext, { updating: false, reason: 'check_timeout' });
				}
			};
			setTimeout(check, 500);
		}
	},

	pollNative: function (requestContext) {

		if (requestContext.page.pageDisconnected) {
			return;
		}

		callNative(requestContext, 'getInfo', {

			cancelInstances: true

		}, function (response) {

			var requiredVersion;
			if (response.os === 'Windows') {
				requiredVersion = requestContext.request.requiredNativeWinVersion;
			} else if (response.os === 'Linux') {
					requiredVersion = requestContext.request.requiredNativeLinuxVersion;
			} else if (response.os === 'Darwin') {
					requiredVersion = requestContext.request.requiredNativeMacVersion;
			} else {
				throw 'Unsupported OS: ' + response.os;
			}

			if (compareVersions(response.version, requiredVersion) >= 0) {
				console.log('[EventPage] finished polling native, detected version ' + response.version);
				replyRequestSuccess(requestContext, response.version);
			} else {
				console.log('[EventPage] native still in version ' + response.version);
				if (!response.cancelRequested) {
					console.log('[EventPage] could not register cancellation for native instances');
					// TODO
				}
				setTimeout(function () {
					commands.pollNative(requestContext);
				}, 4000); // bigger timeout to allow time for the installer to update the necessary files
			}

		}, function (exceptionModel) {

			console.log('[EventPage] native still not responding', exceptionModel);
			setTimeout(function () {
				commands.pollNative(requestContext);
			}, 1000);

		}, false);
	},

	listCertificates: function (requestContext) {

		callNative(requestContext, requestContext.command, requestContext.request, function (response) {
			if (userOsInfo.startsWith('Mac OS')) {
				response = filterMacSystemCertificates(response);
			}
			replyRequestSuccess(requestContext, response);
		}, function (exceptionModel) {
			replyRequestException(requestContext, exceptionModel);
		});
		gaEvent('command', requestContext.command, requestContext.page.domain, requestContext.page.domain);
	},

	readCertificate: function (requestContext) {

		var certThumb = requestContext.request.certificateThumbprint;
		if (!certThumb) {
			throw createParameterNotSetError('The certificateThumbprint parameter cannot be empty');
		}

		getCertificate(requestContext, certThumb, function (certContent) {
			replyRequestSuccess(requestContext, certContent);
		});
		gaEvent('command', requestContext.command, requestContext.page.domain, requestContext.page.domain);
	},

	signData: function (requestContext) {

		var certThumb = requestContext.request.certificateThumbprint;
		if (!certThumb) {
			throw createParameterNotSetError('The certificateThumbprint parameter cannot be empty');
		}

		authorizeSignatures(requestContext, certThumb, 1, function () {
			callNative(requestContext, 'signData', {
				certificateThumbprint: certThumb,
				data: requestContext.request.data,
				digestAlgorithm: requestContext.request.digestAlgorithm
			}, function (signature) {
				replyRequestSuccess(requestContext, signature);
			});
		});
		gaEvent('command', requestContext.command, requestContext.request.digestAlgorithm, requestContext.page.domain);
	},

	signHash: function (requestContext) {

		var certThumb = requestContext.request.certificateThumbprint;
		if (!certThumb) {
			throw createParameterNotSetError('The certificateThumbprint parameter cannot be empty');
		}

		authorizeSignatures(requestContext, certThumb, 1, function () {
			callNative(requestContext, 'signHash', {
				certificateThumbprint: certThumb,
				hash: requestContext.request.hash,
				digestAlgorithm: requestContext.request.digestAlgorithm
			}, function (signature) {
				replyRequestSuccess(requestContext, signature);
			});
		});
		gaEvent('command', requestContext.command, requestContext.request.digestAlgorithm, requestContext.page.domain);
	},

	keySignData: function (requestContext) {

		var privateKeyId = requestContext.request.privateKeyId;
		if (!privateKeyId) {
			throw createParameterNotSetError('The privateKeyId parameter cannot be empty');
		}

		callNative(requestContext, 'keySignData', {
			privateKeyId: privateKeyId,
			data: requestContext.request.data,
			digestAlgorithm: requestContext.request.digestAlgorithm,
			pkcs11Modules: requestContext.request.pkcs11Modules,
			tokenSerialNumber: requestContext.request.tokenSerialNumber
		}, function (signature) {
			replyRequestSuccess(requestContext, signature);
		});
		gaEvent('command', requestContext.command, requestContext.request.digestAlgorithm, requestContext.page.domain);
	},

	keySignHash: function (requestContext) {

		var privateKeyId = requestContext.request.privateKeyId;
		if (!privateKeyId) {
			throw createParameterNotSetError('The privateKeyId parameter cannot be empty');
		}
		callNative(requestContext, 'keySignHash', {
			privateKeyId: privateKeyId,
			hash: requestContext.request.hash,
			digestAlgorithm: requestContext.request.digestAlgorithm,
			pkcs11Modules: requestContext.request.pkcs11Modules,
			tokenSerialNumber: requestContext.request.tokenSerialNumber
		}, function (signature) {
			replyRequestSuccess(requestContext, signature);
		});
		gaEvent('command', requestContext.command, requestContext.request.digestAlgorithm, requestContext.page.domain);
	},

	signHashBatch: function (requestContext) {
		var batch = requestContext.request.batch;
		if (!batch || !batch.length) {
			throw createParameterNotSetError('The batch parameter cannot be empty');
		}

		var certThumb = requestContext.request.certificateThumbprint;
		if (!certThumb) {
			throw createParameterNotSetError('The certificateThumbprint parameter cannot be empty');
		}

		if (requestContext.request.usePreauthorizedSignatures) {
			signBatch(requestContext, certThumb, batch, 0, []);
			return;
		}

		authorizeSignatures(requestContext, certThumb, batch.length, function () {
			requestContext.page.preauthorizedSignatures[certThumb] = batch.length;
			signBatch(requestContext, certThumb, batch, 0, []);
		});
	},

	signHashes: function (requestContext) {
		var hashes = requestContext.request.hashes;
		if (!hashes || !hashes.length) {
			throw createParameterNotSetError('The hashes parameter cannot be empty');
		}

		var certThumb = requestContext.request.certificateThumbprint;
		if (!certThumb) {
			throw createParameterNotSetError('The certificateThumbprint parameter cannot be empty');
		}

		authorizeSignatures(requestContext, certThumb, hashes.length, function () {
			callNative(requestContext, 'signHashes', {
				certificateThumbprint: certThumb,
				hashes: hashes
			}, function (result) {
				replyRequestSuccess(requestContext, result);
			});
		});
		gaEvent('command', requestContext.command, hashes.length, requestContext.page.domain);
	},

	signWithRestPki: function (requestContext) {
		var token = requestContext.request.token;
		if (!token) {
			throw createParameterNotSetError('The token parameter cannot be empty');
		}
		startRestPkiSignature(requestContext, requestContext.request.restPkiUrl, token, requestContext.request.certificateThumbprint);
	},

	signPdf: function (requestContext) {

		createCommonSignerCallRequest(requestContext, 'PDF', function (callRequest) {
			// pades fields
			callRequest.visualRepresentation = requestContext.request.visualRepresentation;
			callRequest.pdfMarks = requestContext.request.pdfMarks;
			callRequest.bypassMarksIfSigned = requestContext.request.bypassMarksIfSigned;
			callRequest.reason = requestContext.request.reason;
			callRequest.location = requestContext.request.location;
			callRequest.signerName = requestContext.request.signerName;
			callRequest.customSignatureFieldName = requestContext.request.customSignatureFieldName;
			callRequest.metadata = requestContext.request.metadata;

			authorizeSignatures(requestContext, callRequest.certificateThumbprint, 1, function () {
				callNative(requestContext, 'signPdf', callRequest, function (response) {
					handleDocumentSignatureResult(requestContext, response);
				});
			});
			gaEvent('command', requestContext.command, '', requestContext.page.domain);
		});
	},

	signCades: function (requestContext) {

		// common fields
		createCommonSignerCallRequest(requestContext, 'Data', function (callRequest) {

			var cmsToCosignFilePath = null;
			if (requestContext.request.cmsToCosignFileId) {
				cmsToCosignFilePath = getPath(requestContext.request.cmsToCosignFileId, 'File', requestContext);
			}

			// cades fields
			callRequest.cmsToCosignFilePath = cmsToCosignFilePath;
			callRequest.cmsToCosignContent = requestContext.request.cmsToCosignContent;
			callRequest.includeEncapsulatedContent = requestContext.request.includeEncapsulatedContent;
			callRequest.autoDetectCosign = requestContext.request.autoDetectCosign;
			callRequest.signingDescription = requestContext.request.signingDescription;

			authorizeSignatures(requestContext, callRequest.certificateThumbprint, 1, function () {
				callNative(requestContext, 'signCades', callRequest, function (response) {
					handleDocumentSignatureResult(requestContext, response);
				});
			});
			gaEvent('command', requestContext.command, '', requestContext.page.domain);
		});
	},

	signXml: function (requestContext) {

		// commons fields
		createCommonSignerCallRequest(requestContext, 'XML', function (callRequest) {

			if (!requestContext.request.signerType) {
				throw createParameterNotSetError('The signerType parameter cannot be empty');
			}

			// xml fields
			callRequest.namespaces = requestContext.request.namespaces;
			callRequest.signatureElementId = requestContext.request.signatureElementId;
			callRequest.signatureElementLocation = requestContext.request.signatureElementLocation;
			callRequest.signingDescription = requestContext.request.signingDescription;

			// xml element fields
			callRequest.toSignElementId = requestContext.request.toSignElementId;
			callRequest.toSignElementsIds = requestContext.request.toSignElementsIds;
			callRequest.toSignElementsXPath = requestContext.request.toSignElementsXPath;
			callRequest.idResolutionTable = requestContext.request.idResolutionTable;
			//callRequest.detachedResourceToSignContent = requestContext.request.detachedResourceToSignContent;
			//callRequest.detachedResourceReferenceUri = requestContext.request.detachedResourceReferenceUri;
			callRequest.signerType = requestContext.request.signerType;

			authorizeSignatures(requestContext, callRequest.certificateThumbprint, 1, function () {
				callNative(requestContext, 'signXml', callRequest, function (response) {
					handleDocumentSignatureResult(requestContext, response);
				});
			});
			gaEvent('command', requestContext.command, requestContext.request.signerType, requestContext.page.domain);
		});
	},

	openPades: function (requestContext) {
		var callRequest = createCommonOpenCallRequest(requestContext, 'PDF');
	    callNative(requestContext, 'openPades', callRequest, function (response) {
	        replyRequestSuccess(requestContext, response);
	    });

	    gaEvent('command', requestContext.command, '', requestContext.page.domain);
	},

	openCades: function (requestContext) {
		var callRequest = createCommonOpenCallRequest(requestContext, 'CAdES');

		var originalFileId = requestContext.request.originalFileId;
	    var originalFilePath = null;
	    if (originalFileId) {
	        originalFilePath = getPath(originalFileId, 'File', requestContext);
	    }

	    callRequest.originalFilePath = originalFilePath;
	    callRequest.originalContent = requestContext.request.originalContent;
	    callRequest.acceptablePolicies = requestContext.request.acceptablePolicies;
		callRequest.returnEncapsulatedContent = requestContext.request.returnEncapsulatedContent;

	    callNative(requestContext, 'openCades', callRequest, function (response) {
	        replyRequestSuccess(requestContext, response);
	    });

	    gaEvent('command', requestContext.command, '', requestContext.page.domain);
	},

	openXmlSignature: function (requestContext) {
		var callRequest = createCommonOpenCallRequest(requestContext, 'XML');
		callRequest.idResolutionTable = requestContext.request.idResolutionTable;
		callRequest.acceptablePolicies = requestContext.request.acceptablePolicies;

		callNative(requestContext, 'openXmlSignature', callRequest, function (response) {
	        replyRequestSuccess(requestContext, response);
		});

		gaEvent('command', requestContext.command, '', requestContext.page.domain);
	},

	preauthorizeSignatures: function (requestContext) {

		var certThumb = requestContext.request.certificateThumbprint;
		if (!certThumb) {
			throw createParameterNotSetError('The certificateThumbprint parameter cannot be empty');
		}

		var sigCount = requestContext.request.signatureCount;
		if (!sigCount) {
			throw createParameterNotSetError('The signatureCount parameter cannot be empty');
		}

		requestContext.page.preauthorizedSignatures[certThumb] = 0;

		authorizeSignatures(requestContext, certThumb, sigCount, function () {
			requestContext.page.preauthorizedSignatures[certThumb] = sigCount;
			replyRequestSuccess(requestContext, null);
		});

		gaEvent('command', requestContext.command, sigCount, requestContext.page.domain);
	},

	removeCertificate: function (requestContext) {

		if (requestContext.page.domain !== '@popup') {
			throw 'Forbidden';
		}

		var certThumb = requestContext.request;
		if (certThumb == null || certThumb == '') {
			throw 'The request cannot be empty';
		}

		callNative(requestContext, 'removeCertificate', certThumb, function (response) {
			replyRequestSuccess(requestContext, response);
		});

		gaEvent('command', requestContext.command, '', requestContext.page.domain);
	},

	generateTokenRsaKeyPair: function (requestContext) {
		if (!requestContext.request.tokenSerialNumber) {
			throw createParameterNotSetError('The tokenSerialNumber parameter cannot be empty');
		}

		if (!requestContext.request.keySize) {
			throw createParameterNotSetError('The keySize parameter cannot be empty');
		}

		callNative(requestContext, 'generateTokenRsaKeyPair', requestContext.request, function (response) {
			if (requestContext.request.enableUsedPkcs11Module !== false && response.pkcs11ModuleUsed) {
				configManager.addPkcs11Modules([response.pkcs11ModuleUsed]);
			}

			replyRequestSuccess(requestContext, { csr: response.csr, privateKeyId: response.privateKeyId });
		});

		gaEvent('command', requestContext.command, requestContext.request.keySize, requestContext.page.domain);
	},

	generateSoftwareRsaKeyPair: function (requestContext) {
		if (!requestContext.request.keySize) {
			throw createParameterNotSetError('The keySize parameter cannot be empty');
		}
		
		callNative(requestContext, 'generateSoftwareRsaKeyPair', requestContext.request, function (response) {
			replyRequestSuccess(requestContext, response);
		});

		gaEvent('command', requestContext.command, requestContext.request.keySize, requestContext.page.domain);
	},

	importTokenCertificate: function (requestContext) {
		if (!requestContext.request.tokenSerialNumber) {
			throw createParameterNotSetError('The tokenSerialNumber parameter cannot be empty');
		}

		if (!requestContext.request.certificateContent) {
			throw createParameterNotSetError('The certificateContent parameter cannot be empty');
		}

		callNative(requestContext, 'importTokenCertificate', requestContext.request, function (response) {
			if (requestContext.request.enableUsedPkcs11Module !== false && response.pkcs11ModuleUsed) {
				configManager.addPkcs11Modules([response.pkcs11ModuleUsed]);
			}

			replyRequestSuccess(requestContext, { imported: response.imported });
		});

		gaEvent('command', requestContext.command, '', requestContext.page.domain);
	},

	importCertificate: function (requestContext) {
		if (!requestContext.request.certificateContent) {
			throw createParameterNotSetError('The certificateContent parameter cannot be empty');
		}

		callNative(requestContext, 'importCertificate', requestContext.request, function (response) {
			replyRequestSuccess(requestContext, response);
		});

		gaEvent('command', requestContext.command, '', requestContext.page.domain);
	},

	sendAuthenticatedRequest: function (requestContext) {
		if (!requestContext.request.certificateThumbprint) {
			throw createParameterNotSetError('The certificateThumbprint parameter cannot be empty');
		}
		if (!requestContext.request.method) {
			throw createParameterNotSetError('The method parameter cannot be empty');
		}
		if (!requestContext.request.url) {
			throw createParameterNotSetError('The url parameter cannot be empty');
		}
		callNative(requestContext, 'sendAuthenticatedRequest', requestContext.request, function (response) {
			replyRequestSuccess(requestContext, response);
		});

		gaEvent('command', requestContext.command, requestContext.request.method + ': ' + requestContext.request.url, requestContext.page.domain);
	},

	startSyncDevice: function (requestContext) {
		remoteDevicesManager.startNewDeviceConnection()
		.then(function (connectionInfo) {
			replyRequestSuccess(requestContext, connectionInfo);
		})
		.catch(function (error) {
			replyRequestError(requestContext, error, 'code');
		});
	},

	waitSyncDevice: function (requestContext) {
		remoteDevicesManager.getSyncedPendingDevice(requestContext.request.sessionId, false)
		.then(function (deviceInfo) {
			replyRequestSuccess(requestContext, deviceInfo);
		})
		.catch(function (error) {
			replyRequestError(requestContext, error, 'code');
		});
	},

	finishSyncDevice: function (requestContext) {
		remoteDevicesManager.getSyncedPendingDevice(requestContext.request.sessionId, true)
		.then(function (deviceInfo) {
			replyRequestSuccess(requestContext, deviceInfo);
		})
		.catch(function (error) {
			replyRequestError(requestContext, error, 'code');
		});
	},

	refreshDevice: function (requestContext) {
		configManager.get(function (config) {
			var device = config.remoteDevices[requestContext.request.deviceId];
			if (device) {
				device.isEnabled = true;
				configManager.updateDevice(device, function () {
					remoteDevicesManager.getConnectedDevices(function (devices) {
						var toRefreshDevice = getConnectedDeviceById(devices, requestContext.request.deviceId);
						if (toRefreshDevice) {
							toRefreshDevice.client.sendMessage({
								command: 'getInfo',
								domain: 'localhost',
								userLanguage: browser.i18n.getUILanguage()
							}).then(function () {
								// reset status and update on success
								toRefreshDevice.deviceInfo.resyncNeededLevel = null;
								refreshRemoteDeviceCertificates(toRefreshDevice, function () {
									replyRequestSuccess(requestContext, null);
								});
							}).catch(function (ex) {
								handleRemoteDeviceError(toRefreshDevice.deviceInfo, ex, function (ex) {
										replyRequestException(requestContext, ex);
								},
								null, false);
							});
						}
					});
				});
			} else {
				replyRequestSuccess(requestContext, null);
			}
		});
	}
};

function filterMacSystemCertificates(certificates) {
	if (!certificates || !certificates.length) {
		return certificates;
	}
	var filtered = [];
	certificates.forEach(function (c) {
		var subjectName = c.subjectName || '';
		if (!subjectName.startsWith('com.apple.')) {
			filtered.push(c);
		}
	});
	return filtered;
}

function getConnectedDeviceById(devices, deviceId) {
	for (var id in devices) {
		if (devices[id].deviceInfo && devices[id].deviceInfo.deviceId === deviceId) {
			return devices[id];
		}
	}
	return null;
}

var handleRemoteDeviceError = function (deviceInfo, exception, reject, resolve, silent) {
	
	if (exception.code === 'mobile_not_authorized') {
		deviceInfo.resyncNeededLevel = 'alert';
		deviceInfo.isEnabled = false;
		setAlertBadge(true);
		configManager.updateDevice(deviceInfo);

	} else if (exception.code === 'mobile_timeout' || exception.code === 'mobile_send_message') {

		deviceInfo.resyncNeededLevel = 'warn';
		configManager.updateDevice(deviceInfo);

	} else {
		if (reject) {
			reject(exception);
		} else {
			console.log('[EventPage] No reject callback. Exception: ', exception);
		}
		return;
	}

	silent ? (resolve ? resolve() : null) : (reject ? reject(exception) : null);
};

var _certificateThumbprintBasedPreCall = function (message, devices, successCallback, errorCallback, callLocalNative, removeLicense) {
	var certThumb = message.request.certificateThumbprint;
	for (var id in devices) {
		var device = devices[id];
		var knownCerts = device.deviceInfo.knownCertificates || {};
		if (certThumb in knownCerts) {
			// remote device has the certificate
			var tmpLicense = message.license;
			if (removeLicense) {
				message.license = null;
			}
			device.client.sendMessage(message)
			.then(function (response) {
				message.license = tmpLicense;
				successCallback(response);
			})
			.catch(function (exception) {
				message.license = tmpLicense;
				handleRemoteDeviceError(device.deviceInfo, exception, errorCallback, successCallback, false);
			});
			return;
		}
	}

	// certificate not found on cached remote devices
	callLocalNative();
};

// optimization for commands which license is not mandatory. Less content on cloud communication
var _certificateThumbprintBasedPreCallWithoutLicense = function (message, devices, successCallback, errorCallback, callLocalNative) {
	_certificateThumbprintBasedPreCall(message, devices, successCallback, errorCallback, callLocalNative, true);
};

var remoteCommands = {

	getInfo: {
		postCall: function (message, response, devices, successCallback, failCallback) {
			message.license = null;
			var oneHour = 1000 * 60 * 60;

			var handleDevice = function (curDevice) {
				var sinceLastRefresh = new Date().getTime() - curDevice.deviceInfo.refreshedTime;
				if (sinceLastRefresh < oneHour) {
					return;
				}

				curDevice.client.sendMessage(message)
				.then(function () {
					refreshRemoteDeviceCertificates(curDevice);
					if (curDevice.deviceInfo.resyncNeededLevel) {
						curDevice.deviceInfo.resyncNeededLevel = null;
						configManager.updateDevice(curDevice.deviceInfo);
					}
				})
				.catch(function (exception) {
					handleRemoteDeviceError(curDevice.deviceInfo, exception, null, null, true);
				});
			};

			for (var id in devices) {
				handleDevice(devices[id]);
			}

			successCallback(response);
		}
	},

	listCertificates: {
		postCall: function (message, response, devices, successCallback, failCallback) {
			response = response || [];
			var resultPromises = [];
			var certificates = {};

			for (var i in response) {
				var cert = response[i];
				certificates[cert.thumbprint] = cert;
			}
			message.license = null;

			for (var id in devices) {
				resultPromises.push(
					new Promise(function (resolve, reject) {
						var curDevice = devices[id];
						
						var refreshedTime = curDevice.deviceInfo.refreshedTime;
						if (refreshedTime === 0) {
							// never listed,just synced
							refreshRemoteDeviceCertificates(curDevice, function (deviceInfo) {
								if (deviceInfo) {
									var knownCertificates = deviceInfo.knownCertificates || {};
									for (var thumb in knownCertificates) {
										certificates[thumb] = knownCertificates[thumb];
									}
								}
								resolve();
							});

						} else {
							// use cached certificates
							var knownCertificates = curDevice.deviceInfo.knownCertificates || {};
							for (var thumb in knownCertificates) {
								certificates[thumb] = knownCertificates[thumb];
							}
							resolve();
						}
					})
				);
			}

			Promise.all(resultPromises)
			.then(function () {
				var resultCertificates = [];
				for (var i in certificates) {
					resultCertificates.push(certificates[i]);
				}
				successCallback(resultCertificates);
			})
			.catch(failCallback);
		}
	},

	readCertificate: {
		preCall: _certificateThumbprintBasedPreCallWithoutLicense
	},

	signData: {
		preCall: _certificateThumbprintBasedPreCall
	},

	signHash: {
		preCall: _certificateThumbprintBasedPreCall
	},

	signHashBatch: {
		preCall: _certificateThumbprintBasedPreCall
	},

	signHashes: {
		preCall: _certificateThumbprintBasedPreCall
	},

	getGeolocation: {
		preCall: _certificateThumbprintBasedPreCall
	},

	decrypt: {
		preCall: _certificateThumbprintBasedPreCall
	},

	authorizeSignatures: {
		preCall: _certificateThumbprintBasedPreCallWithoutLicense
	}
};

function refreshRemoteDeviceCertificates(device, callback) {
	console.log('[EventPage] refreshing certificates for device: ' + device.deviceInfo.name + ' (' + device.deviceInfo.deviceId + ')');

	var knownCertificatesThumbprints = [];
	var knownCertificates = device.deviceInfo.knownCertificates || {};

	for (var id in knownCertificates) {
		knownCertificatesThumbprints.push(id);
	}

	var message = {
		domain: 'localhost',
		command: 'listCertificates',//'refreshCertificates',
		//request: { knownCertificatesThumbprints: knownCertificatesThumbprints },
		userLanguage: browser.i18n.getUILanguage()
	};

	device.client.sendMessage(message).then(function (remoteResponse) {
		//remoteResponse = remoteResponse || {};
		remoteResponse = remoteResponse || [];
		knownCertificates = {};
		for (var i in remoteResponse) {
			var cert = remoteResponse[i];
			knownCertificates[cert.thumbprint] = cert;
		}

		// TODO refresh certrificates mobile command

		//for (var i in (remoteResponse.added || [])) {
		//	var cert = remoteResponse.added[i];
		//	cert.isRemote = true;
		//	knownCertificates[cert.thumbprint] = cert;
		//}

		//for (var i in (remoteResponse.removed || [])) {
		//	var thumbprint = remoteResponse.removed[i];
		//	delete knownCertificates[thumbprint];
		//}

		device.deviceInfo.knownCertificates = knownCertificates;
		device.deviceInfo.refreshedTime = new Date().getTime();

		configManager.updateDevice(device.deviceInfo, callback);
	})
	.catch(function (exception) {
		handleRemoteDeviceError(device.deviceInfo, exception, null, function () { callback(null); }, true);
	});
}

function getCertificate(requestContext, certThumb, successCallback, errorCallback) {
	configManager.getCertificate(certThumb, function (certConfig) {
		if (certConfig.content !== null) {
			console.log('[EventPage] using cached certificate, thumbprint: ' + certThumb);
			successCallback(certConfig.content);
		} else {
			console.log('[EventPage] certificate not in cache, thumbprint: ' + certThumb);
			callNative(requestContext, 'readCertificate', { certificateThumbprint: certThumb }, function (certContent) {
				successCallback(certContent);
				console.log('[EventPage] saving certificate content on cache: ' + certThumb);
				configManager.setCertCache(certThumb, certContent);
			}, errorCallback);
		}
	});
}

function registerPath(path, requestContext) {
    var pathId = generateGuid();
    requestContext.page.paths[pathId] = path;
    return pathId;
}

function getPath(pathId, kind, requestContext) {
    var path = requestContext.page.paths[pathId];
    if (path === undefined) {
        throw kind + ' not found: ' + pathId;
    }
    return path;
}

function authorizeSignatures(requestContext, certThumb, signatureCount, callback, enableDontAskAgain) {

	if (enableDontAskAgain === undefined) {
		enableDontAskAgain = null;
	}

	var preauthorizedSignatures = requestContext.page.preauthorizedSignatures[certThumb] || 0;
	if (preauthorizedSignatures >= signatureCount) {
		console.log('[EventPage] decrementing preauthorized signature count for certificate ' + certThumb + ' to ' + (preauthorizedSignatures - signatureCount));
		requestContext.page.preauthorizedSignatures[certThumb] = preauthorizedSignatures - signatureCount;
		setTimeout(callback, 10); // call callback asynchronously
		return;
	}

	configManager.getSite(requestContext.page.domain, function (siteConfig) {

		if (siteConfig.certAccess[certThumb] === true) {
			console.log('[EventPage] bypassed signature authorization for domain ' + requestContext.page.domain + ' and certificate ' + certThumb);
			callback();
		} else {
			console.log('[EventPage] requesting authorization for using certificate ' + certThumb + ' by domain ' + requestContext.page.domain + ' for ' + signatureCount + ' signatures');
			callNative(requestContext, 'authorizeSignatures', {
				certificateThumbprint: certThumb,
				signatureCount: signatureCount,
				enableDontAskAgain: enableDontAskAgain
			}, function (response) {
				if (response.authorized) {
					if (response.dontAskAgain) {
						configManager.setSiteTrust(requestContext.page.domain, response.certificate);
					}
					callback();
				} else {
				    replyRequestError(requestContext, browser.i18n.getMessage('userCancelled'), 'user_cancelled');
				}
			});
		}
	});
}

function notifyUpdateSuccessAndReload(requestContext) {
    console.log('[EventPage] an update is ready to be installed, reloading in 2 seconds');
    replyRequestSuccess(requestContext, {
        updating: true,
        updatingIn: 2000
    });
    setTimeout(function () {
        browser.runtime.reload();
    }, 2000);
}

function signBatch(requestContext, certThumbprint, batch, count, signatures) {

	if (count >= batch.length) {
		replyRequestSuccess(requestContext, { signatures: signatures });
		return;
	}
	var bufferLen = 1000;
	var round = batch.length - count;
	if (round > bufferLen) {
		round = bufferLen;
	}

	authorizeSignatures(requestContext, certThumbprint, round, function () {
		callNative(requestContext, 'signHashBatch', {
			certificateThumbprint: certThumbprint,
			batch: batch.slice(count, count + round),
			digestAlgorithm: requestContext.request.digestAlgorithm
		}, function (response) {
			var concatSignatures = signatures.concat(response.signatures);
			signBatch(requestContext, certThumbprint, batch, count + round, concatSignatures);
		});
	});
}

function handleDocumentSignatureResult(requestContext, response) {
	if (response.signatureInfo && response.signatureInfo.file) {
		if (response.signatureInfo.file.path) {
			response.signatureInfo.file.id = registerPath(response.signatureInfo.file.path, requestContext);
			delete response.signatureInfo.file.path;
		}

		if (response.signatureInfo.file.streamId) {
			console.log('[EventPage] document exceeded size limit. Reading buffered content');
			getSignatureBufferedContent(requestContext, response, null);
			return;
		}
	}
	replyRequestSuccess(requestContext, response);
}

function getSignatureBufferedContent(requestContext, response, resultControl) {

	if (!resultControl) {
		resultControl = { buffer: '', offset: 0 };
	}
	console.log('[EventPage] reading buffer with offset ' + resultControl.offset);

	callNative(requestContext, 'readBufferedContent', {
		streamId: response.signatureInfo.file.streamId,
		offset: resultControl.offset
	}, function (readResponse) {

		if (readResponse.buffer && readResponse.written > 0) {
			console.log('[EventPage] buffer written length: ' + readResponse.written);
			resultControl.buffer += atob(readResponse.buffer);
			resultControl.offset += readResponse.written;
		}

		if (resultControl.offset >= response.signatureInfo.file.length) {
			var streamId = response.signatureInfo.file.streamId;
			response.signatureInfo.content = btoa(resultControl.buffer);
			resultControl.buffer = null;
			delete response.signatureInfo.file;
			console.log('[EventPage] reading buffer finished. Final length: ' + resultControl.offset);
			replyRequestSuccess(requestContext, response);
			callNative(requestContext, 'finishBufferedContent', { streamId: streamId }, function() {});
            return;
		}

		getSignatureBufferedContent(requestContext, response, resultControl);
	});
}

// -------------------- REST PKI integration --------------------

var lacunaRestPkiUrls = [
    'https://restpki.lacunasoftware.com/', // first address is the default
    'https://restpkibeta.azurewebsites.net/',
    'https://pki.rest/',
    'https://restpki.com/',
    'https://www.restpki.com/'
];

function startRestPkiSignature(requestContext, restPkiUrl, token, certThumb) {
	if (!restPkiUrl) {
		restPkiUrl = lacunaRestPkiUrls[0];
	}

	if (lacunaRestPkiUrls.indexOf(restPkiUrl) >= 0) {
		if (checkRestrictedDomain(requestContext.page.domain, blacklistTypes.restPki)) {
			replyRequestError(requestContext, 'The domain ' + requestContext.page.domain + ' is blocked on ' + restPkiUrl, 'blocked_domain');
			// refresh blacklist
			setTimeout(getWebPkiHomeData, 100);
			return;
		}
	}

	if (certThumb) {
		getCertificate(requestContext, certThumb, function (certContent) {
			httpPost(restPkiUrl + 'Api/PendingSignatures/' + token + '/Certificate', {
				certificate: certContent
			}, function (response) {
				onPendingSignatureFetched(requestContext, restPkiUrl, token, certThumb, response.toSignHash, response.digestAlgorithmOid);
			}, function (statusCode, errorModel) {
			    var msg;
			    var code = 'undefined';
				if (statusCode === 422 && errorModel && errorModel.code === 'ValidationError') {
				    msg = 'The selected certificate failed validation: ' + validationResultsToString(errorModel.validationResults);
				    code = 'rest_pki_invalid_certificate';
				} else {
					msg = 'Could not get pending signature';
					if (errorModel && errorModel.message) {
						msg += ': ' + errorModel.message;
					}
					code = 'rest_pki_get_pending_signature';
				}
				replyRequestError(requestContext, msg, code);
			});
		});
	} else {
		httpGet(restPkiUrl + 'Api/PendingSignatures/' + token, function (response) {
			onPendingSignatureFetched(requestContext, restPkiUrl, token, response.certificateThumbprint, response.toSignHash, response.digestAlgorithmOid);
		}, function () {
		    replyRequestError(requestContext, 'Could not get pending signature on REST PKI', 'rest_pki_get_pending_signature');
		});
	}
	gaEvent('command', 'signWithRestPki' + (certThumb ? '' : ' -'), restPkiUrl, requestContext.page.domain);
}

function onPendingSignatureFetched(requestContext, restPkiUrl, token, certThumb, toSignHash, digestAlgorithmOid) {
	authorizeSignatures(requestContext, certThumb, 1, function () {
		var bypassLicensing = (lacunaRestPkiUrls.indexOf(restPkiUrl) >= 0);
		callNative(requestContext, 'signHash', {
			certificateThumbprint: certThumb,
			hash: toSignHash,
			digestAlgorithm: digestAlgorithmOid
		}, function (signature) {
			httpPost(restPkiUrl + 'Api/PendingSignatures/' + token, {
				signature: signature
			}, function () {
				replyRequestSuccess(requestContext, token);
			}, function () {
			    replyRequestError(requestContext, 'Could not post signature to REST PKI', 'rest_pki_post_signature');
			});
		}, null, true, bypassLicensing); // default error handler, keepAlive: true and bypassLicensing only if using Lacuna's REST PKI instance
	}, true); // enableDontAskAgain: true
}

function checkRestrictedDomain(domain, restrictionType) {
	if (!wpkiHomeData.bl) {
		return false;
	}
	var match = false;
	var keys = Object.keys(wpkiHomeData.bl);

	for (var i = 0; i < keys.length; i++) {
		var cur = keys[i];
		if (cur.startsWith('*.')) {
			match = domain === cur.substring(2) || domain.endsWith(cur.substring(1));
		} else {
			match = domain === cur;
		}

		if (match && (wpkiHomeData.bl[cur] & restrictionType) > 0) {
			return true;
		}
	}

	return false;
}

function validationResultsToString(vr) {
	var s = '';
	for (var i = 0; i < vr.errors.length; i++) {
		if (i > 0) {
			s += ' / ';
		}
		s += vr.errors[i].message;
		if (vr.errors[i].detail) {
			s += ' (' + vr.errors[i].detail + ')';
		}
	}
	return s;
}

// -------------------- Remote Devices --------------------
var remoteDevicesManager = new function () {

	// private vars
	var pendingSyncDevices = {};
	var connectedDevices = {};
	var ready = false;
	var initialized = false;

	// ------------------------------------

	// private functions
	var init = function (callback) {
		initialized = true;
		console.log('[EventPage]::remoteDevicesManager initializing');
		refreshConnectedDevices(function (devices) {
			ready = true;
			callback(devices);
		});
	};

	var refreshConnectedDevices = function (callback) {
		configManager.get(function (config) {
			var id = '';
			if (ready && !config.remoteDevicesChanged) {
				if (callback) {
					callback(connectedDevices);
				}
				console.log('[RDMan] no changes on mobile');
				return;
			}

			var devices = config.remoteDevices || {};
			var refreshedConnectedDevices = {};
			var toDispose = {};
			var showAlertBadge = false;

			// add all to dispose
			for (id in connectedDevices) {
				toDispose[id] = true;
			}

			for (id in devices) {
				var device = devices[id];
				if (device.isEnabled) {
					if (!connectedDevices[device.sessionId] || !connectedDevices[device.sessionId].client) {
						// starts new client connection
						var client = new CloudClient();
						connectedDevices[device.sessionId] = { client: client, deviceInfo: device };
						client.connect(device.sessionId, device.name, device.key, id);
					} else {
						// already connected
						connectedDevices[device.sessionId].deviceInfo = device;
					}
					refreshedConnectedDevices[device.sessionId] = connectedDevices[device.sessionId];
					toDispose[device.sessionId] = false;
				}
				if (device.resyncNeededLevel === 'alert') {
					showAlertBadge = true;
				}
			}

			// dispose the not refreshed ones
			for (id in toDispose) {
				if (toDispose[id]) {
					if (connectedDevices[id].client) {
						console.log('[RDMan] disposing device: ' + id);
						connectedDevices[id].client.stop();
						delete connectedDevices[id];
					}
				}
			}
			
			connectedDevices = refreshedConnectedDevices;
			if (callback) {
				callback(connectedDevices);
			}
			console.log('[RDMan] set mobiles refreshed');
			configManager.setRemoteDevicesRefreshed();

			if (showAlertBadge) {
				setAlertBadge(true);
			}
		});
	};

	var getConnectedDevices = function (callback) {
		if (!initialized) {
			init(callback);
		} else if (ready) {
			refreshConnectedDevices(callback);
		} else {
			setTimeout(function () {
				getConnectedDevices(callback);
			}, 200);
		}
	};

	var waitForSyncComplete = function (client, finishSync, resolve, reject, count) {
		count = count || 1;

		var resolveCondition = finishSync ? client.syncState === client.syncStates.COMPLETE : client.syncState === client.syncStates.START;
		if (resolveCondition) {
			resolve();
			if (client.syncState === client.syncStates.COMPLETE) {
				// if synced, remove from pending
				delete pendingSyncDevices[client.sessionId];
			}
			return;
		}

		// waits 35 seconds (not 60 because signalR will timeout on 40, so we avoid a start sync with a timeout signal)
		if (count > 175) {
			reject('Sync attempt timed out after 50 seconds');
			return;
		}

		setTimeout(function () {
			waitForSyncComplete(client, finishSync, resolve, reject, count + 1);
		}, 200);
	};

	// ------------------------------------

	// public functions
	var startNewDeviceConnection = function () {

		// create EC key pair
		var keyPairInfo = ecGenerateKeyPair();
		// create new connection
		var client = new CloudClient();
		var device = {};

		var completeSync = function (result) {
			client.syncState = client.syncStates.START;

			console.log('[EventPage] completing sync device');
			device.sessionId = client.sessionId;
				
			// send handshake
			client.sendHandshake()
			.then(function (result) {
				// handshake returned
				// generate shared key
				var key = ecGenerateSharedSecret(keyPairInfo.keyPair, result.encodedXY);
				client.secretKey = key;
				// decrypt mobile info and update device info
				device.key = key;
				device.isEnabled = true;
				device.resyncNeededLevel = null;
				device.refreshedTime = 0;
				device.name = decryptMessage(result.name, key);
				device.os = decryptMessage(result.deviceType, key);
				device.deviceId = decryptMessage(result.deviceId, key);
				client.deviceName = device.name;
				// add client to connected
				connectedDevices[device.sessionId] = { client: client, deviceInfo: device };
				configManager.addDevice(device, function () {
					client.syncState = client.syncStates.COMPLETE;
					refreshRemoteDeviceCertificates(connectedDevices[device.sessionId]);
					refreshConnectedDevices();
				});
			});
		};

		return new Promise(function (resolve, reject) {
			client.startSync(completeSync)
			.then(function (connectionInfo) {
				pendingSyncDevices[connectionInfo.sessionId] = client;
				resolve({ sessionId: connectionInfo.sessionId, sessionIdRaw: connectionInfo.sessionIdRaw, encodedX: keyPairInfo.encodedX });
			})
			.catch(reject);
		});
	};

	var getSyncedPendingDevice = function (sessionId, finishSync) {
		return new Promise(function (resolve, reject) {
			var client = pendingSyncDevices[sessionId];

			if (!client) {
				reject('Pending device nof found');
				return;
			}

			var subReject = function (msg) {
				configManager.get(function (config) {
					client.stop();
					delete pendingSyncDevices[sessionId];
					reject(msg);
				});
			};

			var subResolve = function () {
				if (!finishSync) {
					resolve();
					return;
				}
				configManager.get(function (config) {
					// find device by connected device
					for (var id in connectedDevices) {
						if (connectedDevices[id].client.sessionId === client.sessionId && connectedDevices[id].deviceInfo) {
							delete pendingSyncDevices[client.sessionId];
							// pass device info on higher resolve
							resolve(connectedDevices[id].deviceInfo);
							return;
						}
					}
					reject('Connected device not found');
				});
			};

			waitForSyncComplete(client, finishSync, subResolve, subReject);
		});
	};

	// public definitions
	this.startNewDeviceConnection = startNewDeviceConnection;
	this.getSyncedPendingDevice = getSyncedPendingDevice;
	this.getConnectedDevices = getConnectedDevices;
};

// -------------------- Cloud --------------------

var CloudClient = function () {
	this.connectTime = null;
	this.sessionId = null;
	this.sessionIdRaw = null;
	this.secretKey = null;
	this.deviceName = null;
	this.deviceId = null;

	this.pendingRequests = [];
	this.syncRequest = null;

	this.signalConnection = null;
	this.isConnected = false;
	this.syncState = null;

	this._connecting = false;
	this._onSyncResponse = null;
	this._working = false;
};

(function (_p) {

	var sendCommandMaxAttemps = 3;
	var msDelayBetweenRetries = 5000;

	_p.syncStates = {
		START: 'start',
		COMPLETE: 'complete'
	};

	_p.startSync = function (completeSync) {
		this._onSyncResponse = function (result) {
			completeSync(result);
		};
		var instance = this;
		return new Promise(function (resolve, reject) {
			if (!instance.isConnected) {
				instance._startConnection('sync')
				.then(function (data) {
					instance.isConnected = true;
					instance.connectTime = new Date().getTime();
					resolve({ sessionId: data.sessionId, sessionIdRaw: data.sessionIdRaw });
				})
				.catch(reject);

			} else {
				resolve({ sessionId: instance.sessionId, sessionIdRaw: instance.sessionIdRaw });
			}
		});
	};

	_p.connect = function (sessionId, deviceName, secretKey, deviceId) {
		this.sessionId = sessionId;
		this.deviceName = deviceName;
		this.secretKey = secretKey;
		this.deviceId = deviceId;
		var instance = this;
		return new Promise(function (resolve, reject) {
			if (!instance.isConnected) {
				instance._connecting = true;
				instance._startConnection('connect').then(function () {
					instance.isConnected = true;
					instance._connecting = false;
					instance.connectTime = new Date().getTime();
					resolve();
				}, function (err) {
					instance._connecting = false;
					reject(err);
				});

			} else {
				resolve();
			}
		});
	};

	_p._reconnect = function () {
		var instance = this;
		if (!instance.isConnected) {
			instance._connecting = true;
			instance._startConnection('connect').then(function () {
				instance.isConnected = true;
				instance._connecting = false;
				instance.connectTime = new Date().getTime();
			},
			function (e) {
				instance._connecting = false;
				console.log('[Signal] Could not REconnect device ' + instance.deviceName, e);
			});
		}
	};

	_p.stop = function () {
		if (this.signalConnection) {
			try {
				console.log('[Signal] stopping session');
				this.signalConnection.stop();
			} catch (exception) {
				console.log('[Signal] error while stopping signal session: ' + exception);
			}
		}
	};

	var _onConnected = function (instance, resolve, reject, count) {
		count = count || 1;
		if (instance.isConnected) {
			resolve();
		} else if (count > 10) { // 10 seconds timeout
			reject();
		} else {
			setTimeout(function () {
				_onConnected(instance, resolve, reject, count + 1);
			}, 1000);
		}
	};

	_p.sendHandshake = function () {
		if (this.syncState === _p.syncStates.COMPLETE) {
			return;
		}
		var instance = this;
		return new Promise(function (resolve, reject) {
			instance.syncRequest = { resolve: resolve, reject: reject, time: new Date().getTime() };
			httpPost(_p._signalApiSessionUrl + instance.sessionId + '/request', { type: 'sync', content: null }, null, reject);
		});
	};

	_p._startWork = function () {
		this._working = true;
		this._sendWork();
	};

	_p._sendNext = function () {
		this.pendingRequests.shift();
		this._sendWork();
	};

	_p._sendWork = function () {
		var instance = this;
		if (instance.pendingRequests.length > 0) {
			var request = instance.pendingRequests[0];
			request.time = new Date().getTime();
			request.sendAttempt++;
			console.log('[Signal] sending request (attempt ' + request.sendAttempt + '): ' + request.requestId);

			httpPost(_p._signalApiSessionUrl + instance.sessionId + '/request', request.data,
				// success
				function (data) {
					if ((!data || !data.sentToDevice) && request.sendAttempt >= sendCommandMaxAttemps) {
						// on last attempt
						request.reject({
							userMessage: browser.i18n.getMessage('mobileSendMessage').replace('{{deviceName}}', instance.deviceName),
							message: 'Could not send message to mobile',
							code: 'mobile_send_message'
						});
						instance._sendNext();
					}
				},
				// error
				function (status, error) {
					if (request.sendAttempt >= sendCommandMaxAttemps) {
						// on last attempt
						request.reject({
							userMessage: browser.i18n.getMessage('mobileSendMessage').replace('{{deviceName}}', instance.deviceName),
							message: 'Error while sending message to mobile: ' + status,
							complete: typeof error === 'string' ? error : JSON.stringify(error),
							code: 'mobile_send_message'
						});
						instance._sendNext();
					}
				});

			if (request.sendAttempt <= 1) {
				_sendTimeout(instance, request);
			}
		} else {
			instance._working = false;
		}
	};

	_p._setAcknowledgeReceipt = function (id) {
		var request = _getCurrentPendingRequest(this.pendingRequests, id);
		if (request !== null) {
			request.receipt = true;
			console.log('[Signal] got receipt for request: ' + id);
		} else {
			console.log('[Signal] disposed! Got receipt for DISPOSED request: ' + id);
		}
	};

	_p.sendMessage = function (message, timeout) {
		var instance = this;
		return new Promise(function (resolve, reject) {

			var msgRequestId = message && message.requestId ? message.requestId : generateGuid();
			var encrypted = message ? encryptMessage(JSON.stringify(message), instance.secretKey) : null;
			var data = {
				type: 'request',
				id: msgRequestId,
				content: encrypted
			};

			instance.pendingRequests.push({
				requestId: msgRequestId,
				resolve: resolve,
				reject: reject,
				timeout: timeout,
				data: data,
				receipt: false,
				sendAttempt: 0
			});

			if (instance.isConnected) {

				if (!instance._working) {
					// straightforward
					instance._startWork();
				}

			} else {

				if (!instance._connecting) {
					instance._reconnect();
				}

				_onConnected(instance,
				function () {
					// we are connected here
					if (!instance._working) {
						console.log('[Signal] recovered from reconnect. Start work');
						instance._startWork();
					} else {
						console.log('[Signal] recovered from reconnect and already working');
					}
				},
				function () {
					// client did not connect
					reject({
						userMessage: browser.i18n.getMessage('mobileConnectTimeout').replace('{{deviceName}}', instance.deviceName),
						message: 'The device did not connect with signal. Please Disable, remove or try to reconnect it',
						code: 'mobile_timeout'
					});
					if (!instance._working) {
						instance.pendingRequests.shift();
						instance._startWork();
					}
				});
			}
		});
	};

	_p._startConnection = function (actionType) {
		var instance = this;
		return new Promise(function (resolve, reject) {
			var deviceConnected = false;
			var connectionId = null;

			startSignalConnection(_p._signalSessionUrl, function (connection) {
				connection.on('connected', function (result) {
					console.log('[Signal] mobile connected');
					deviceConnected = true;
					if (instance.syncState !== _p.syncStates.COMPLETE && instance._onSyncResponse) {
						instance._onSyncResponse(result);
					}
				});
				connection.on('message', function (message) {
					console.log('[Signal] available response');
					httpGet(_p._signalApiSessionUrl + instance.sessionId + '/response', function (data) { _onResponseReceived(data, instance); });
				});
				connection.on('connectionId', function (id) {
					console.log('[Signal] Got connection id: ' + id);
					connectionId = id;
				});
				connection.on('receipt', function (id) {
					instance._setAcknowledgeReceipt(id);
				});
				connection.onclose(function (e) {
					console.log('[Signal] Device ' + instance.deviceName + ' disconnected', e);
					instance.isConnected = false;
				});
			})
			.then(function (connection) {

				var startSession = function (count) {
					console.log('[Signal] Getting connection Id');
					count = count || 1;
					if (count > 10) {
						console.log('[Signal] Fail. connectionId timeout');
						if (reject) {
							reject('Connection Id timeout');
						}
						return;
					}

					if (!connectionId) {
						setTimeout(function () { startSession(count + 1); }, 1000);
						return;
					}

					console.log('[Signal] getting session');
					var request = {
						connectionId: connectionId,
						properties: { browser: browserId[0].toUpperCase() + browserId.substring(1), operatingSystem: userOsInfo }
					};
					if (actionType === 'sync') {
						httpPost(_p._signalApiSessionUrl, request, function (data) {
							instance.sessionId = data.sessionId;
							instance.sessionIdRaw = data.sessionIdRaw;
							console.log('[Signal] sync session started');
							resolve(data);
						});
					} else if (actionType === 'connect') {
						httpPut(_p._signalApiSessionUrl + instance.sessionId, request, function () {
							console.log('[Signal] session recovered');
							deviceConnected = true;
							resolve();
						});
					}
					connectTimeout(connection.connection);
				};

				setTimeout(startSession, 100);
			})
			.catch(reject);

			// connection timeout after 40 seconds without connected message
			var connectTimeout = function (curConnection, count) {
				count = count || 1;
				if (deviceConnected) {
					instance.signalConnection = curConnection;
					return;
				}
				// 40 seconds timeout
				if (count > 20) { // TODO dev test (increase)
					console.log('[Signal] start connection timed out');
					curConnection.stop();
					reject();
					return;
				}

				setTimeout(function () {
					connectTimeout(curConnection, count + 1);
				}, 2000);
			};
		});
	};

	var _onResponseReceived = function (data, instance) {
		console.log('[Signal] Cloud response ', data);
		data = (typeof data === 'string') ? JSON.parse(data) : data;

		var result = {};
		try {
			if (data.format != 0) {
				throw { message: 'Unknown data format: ' + data.format };
			}

			if (data.type !== 'Error') {

				if (data.type === 'Sync') {
					result = JSON.parse(data.content);
				} else {
					result = JSON.parse(decryptMessage(data.content, instance.secretKey));
				}

			} else {
				result = {
					requestId: data.id,
					success: false,
					exception: data.content ? typeof data.content === 'string' ? JSON.parse(data.content) : data.content : {
						message: 'Cryptographic error on mobile native',
						error: 'Cryptographic error on mobile native',
						code: 'command_decrypt_error'
					}
				};
			}
		} catch (ex) {
			result = {
				requestId: data.id,
				success: false,
				exception: {
					message: 'Error while decrypting response message',
					error: typeof ex === 'object' ? ex.message || JSON.stringify(ex) : ex,
					code: 'command_decrypt_error'
				}
			};
		}

		if (data.type === 'Sync') {
			instance.syncRequest.resolve(result);
			return;
		}

		var request = _getCurrentPendingRequest(instance.pendingRequests, data.id);
		if (request === null) {
			// this is a response for a previous request that timed out
			// do nothing
			console.log('[Signal] got response for disposed request: ' + data.id);
			return;
		}

		if (result.success) {
			request.resolve(result.response);		
		} else {
			// TODO better come from mobile already
			if (result.exception && result.exception.code === 'mobile_not_authorized') {
				result.exception.userMessage = browser.i18n.getMessage('mobileNotAuthorized').replace('{{deviceName}}', instance.deviceName || browser.i18n.getMessage('device').toLocaleLowerCase());
			}

			request.reject(result.exception);
		}
		// work
		instance._sendNext();
	};

	var _invokeTimeout = function (instance, request) {
		// dequeue and reject
		request.reject({
			userMessage: browser.i18n.getMessage('mobileTimeout').replace('{{deviceName}}', instance.deviceName),
			message: 'The mobile is not responding',
			complete: 'The operation has timed out',
			origin: 'helper',
			code: 'mobile_timeout'
		});
		// send next
		instance._sendNext();
	};

	var _sendTimeout = function (instance, request) {
		if (_getCurrentPendingRequest(instance.pendingRequests, request.requestId) === null) {
			console.log('[Signal] stop request timeout (shift): ' + request.requestId);
			return;
		}
		var now = new Date().getTime();
		var timeoutEnd = request.time + (request.timeout || 60000);

		if (!request.receipt) {
			if (now > request.time + msDelayBetweenRetries) {
				if (request.sendAttempt < sendCommandMaxAttemps) {
					// send again
					instance._sendWork();

				} else {
					_invokeTimeout(instance, request);
					console.log('[Signal] stop request timeout (short timeout): ' + request.requestId);
					// No response from mobile (or signal is zombieing)
					// force signal reconnect on next send message
					if (request.requestId) {
						instance.isConnected = false;
						instance.stop();
					}
					return;
				}
			}

		} else if (now > timeoutEnd) {
			_invokeTimeout(instance, request);
			console.log('[Signal] stop request timeout (long timeout): ' + request.requestId);
			return;
		}

		setTimeout(function () { _sendTimeout(instance, request); }, 1000);
	};

	var _getCurrentPendingRequest = function (pendingRequests, expectedId) {
		return pendingRequests.length !== 0 && pendingRequests[0].requestId === expectedId ? pendingRequests[0] : null;
	};

	_p._signalServerUrl = 'https://cloud.lacunasoftware.com/';
	_p._signalApiSessionUrl = _p._signalServerUrl + 'api/sessions/';
	_p._signalSessionUrl = _p._signalServerUrl + 'session/';

})(CloudClient.prototype);


function startSignalConnection(url, configureConnection) {
	return function start() {
		console.log('[Signal] Starting connection');
		var connection = new signalR.HubConnectionBuilder()
			.withUrl(url)
			.build();

		if (configureConnection && typeof configureConnection === 'function') {
			configureConnection(connection);
		}

		return connection.start()
			.then(function () {
				return connection;
			})
			.catch(function (error) {
				console.log('[Signal] Cannot start the connection. Erro: ', error);
				return (window.Promise || Promise).reject(error?.toString()); // EDIT added 'window.' before Promise
			});
	}();
}

// -------------------- Forge --------------------

function encryptMessage(message, key) {
	var iv = forge.random.getBytesSync(16);
	var keyBytes = forge.util.decode64(key);

	var buffer = new forge.util.ByteBuffer();
	// message
	buffer.putBuffer(forge.util.createBuffer(message));

	// ciphertext
	var cipher = forge.cipher.createCipher('AES-CBC', keyBytes);
	cipher.start({ iv: iv });
	cipher.update(buffer);
	cipher.finish();
	var ciphertext = cipher.output.bytes();

	// hmac
	var hmac = forge.hmac.create();
	hmac.start('sha256', keyBytes);
	hmac.update(ciphertext);
	hmacContent = hmac.digest().bytes();

	// write iv | hmac | ciphertext
	var outBuffer = new forge.util.ByteBuffer();
	outBuffer.putBytes(iv);
	outBuffer.putBytes(hmacContent);
	outBuffer.putBytes(ciphertext);
	return forge.util.encode64(outBuffer.bytes());
}

function decryptMessage(encrypted, key) {
	var keyBytes = forge.util.decode64(key);

	var buffer = new forge.util.ByteBuffer();
	buffer.putBytes(forge.util.decode64(encrypted));
	var iv = buffer.getBytes(16);
	var hmacCheck = buffer.getBytes(32);
	var ciphertext = buffer.bytes();

	// hmac
	var hmac = forge.hmac.create();
	hmac.start('sha256', keyBytes);
	hmac.update(ciphertext);
	var computedHmac = hmac.digest().bytes();

	if (computedHmac !== hmacCheck) {
		throw { message: 'Error on message integrity' };
	}

	var decipher = forge.cipher.createDecipher('AES-CBC', keyBytes);
	decipher.start({ iv: iv });
	decipher.update(buffer);
	var result = decipher.finish();

	if (!result) {
		throw { message: 'Error on message decryption' };
	}

	return forge.util.decodeUtf8(decipher.output.getBytes());
}

// -------------------- EC-DH --------------------

var _eCurve = sjcl.ecc.curves['k256'];

function ecGenerateKeyPair() {
	var kp = sjcl.ecc.elGamal.generateKeys(_eCurve);
	return {
		keyPair: kp,
		encodedX: sjcl.codec.base64.fromBits(kp.pub.get().x)
	};
}

function ecGenerateSharedSecret(keyPair, encodedXY) {
	var devicePoint = new sjcl.ecc.elGamal.publicKey(_eCurve, sjcl.codec.base64.toBits(encodedXY));
	var secret = keyPair.sec.dhJavaEc(devicePoint);
	return sjcl.codec.base64.fromBits(sjcl.hash.sha256.hash(secret));
}
// -------------------- OS Detection --------------------

var userOsInfo = (function () {

	// http://stackoverflow.com/a/18706818
	// Christian Ludwig, altered by Lacuna Software

	var nAgt = navigator.userAgent;

	// system 
	var os = '';
	var clientStrings = [
		 { s: 'Windows 10', r: /(Windows 10.0|Windows NT 10.0)/ },
		 { s: 'Windows 8.1', r: /(Windows 8.1|Windows NT 6.3)/ },
		 { s: 'Windows 8', r: /(Windows 8|Windows NT 6.2)/ },
		 { s: 'Windows 7', r: /(Windows 7|Windows NT 6.1)/ },
		 { s: 'Windows Vista', r: /Windows NT 6.0/ },
		 { s: 'Windows Server 2003', r: /Windows NT 5.2/ },
		 { s: 'Windows XP', r: /(Windows NT 5.1|Windows XP)/ },
		 { s: 'Windows 2000', r: /(Windows NT 5.0|Windows 2000)/ },
		 { s: 'Windows ME', r: /(Win 9x 4.90|Windows ME)/ },
		 { s: 'Windows 98', r: /(Windows 98|Win98)/ },
		 { s: 'Windows 95', r: /(Windows 95|Win95|Windows_95)/ },
		 { s: 'Windows NT 4.0', r: /(Windows NT 4.0|WinNT4.0|WinNT|Windows NT)/ },
		 { s: 'Windows CE', r: /Windows CE/ },
		 { s: 'Windows 3.11', r: /Win16/ },
		 { s: 'Android', r: /Android/ },
		 { s: 'Open BSD', r: /OpenBSD/ },
		 { s: 'Sun OS', r: /SunOS/ },
		 { s: 'Fedora', r: /Fedora/ },
		 { s: 'Linux Mint', r: /Linux Mint/ },
		 { s: 'Ubuntu', r: /Ubuntu/ },
		 { s: 'Debian', r: /Debian/ },
		 { s: 'Linux', r: /(Linux|X11)/ },
		 { s: 'iOS', r: /(iPhone|iPad|iPod)/ },
		 { s: 'Mac OS X', r: /Mac OS X/ },
		 { s: 'Mac OS', r: /(MacPPC|MacIntel|Mac_PowerPC|Macintosh)/ },
		 { s: 'QNX', r: /QNX/ },
		 { s: 'UNIX', r: /UNIX/ },
		 { s: 'BeOS', r: /BeOS/ },
		 { s: 'OS/2', r: /OS\/2/ },
		 { s: 'Search Bot', r: /(nuhk|Googlebot|Yammybot|Openbot|Slurp|MSNBot|Ask Jeeves\/Teoma|ia_archiver)/ }
	];
	for (var id in clientStrings) {
		var cs = clientStrings[id];
		if (cs.r.test(nAgt)) {
			os = cs.s;
			break;
		}
	}

	return os;
})();

// ----------------------------------------------------

function getWebPkiHomeData() {
	var ep = 'https://fx.lacunasoftware.com/api/home-data?code=VGc6L0JxptpjgJXKLyWu11e9G07OgvrG5FBXte6Smeyo3tmc6Phcyw==';
	if (ep && ep !== 'undefined') {
		try {
			httpGet(ep, function (data) {
				wpkiHomeData = data;
			});
		} catch (e) {
			console.log('[EventPage] Home error', e);
		}
	}
}

/// -------------------- Analytics --------------------

function gaEvent(category, action, label, domain) {
	// Analytics disabled
}

// -------------------- Initialization --------------------

init();
