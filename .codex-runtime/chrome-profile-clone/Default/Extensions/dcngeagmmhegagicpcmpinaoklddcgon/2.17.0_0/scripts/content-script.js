// -------------------- Constants --------------------

var requestEventName = 'com.lacunasoftware.WebPKI.RequestEvent';
var responseEventName = 'com.lacunasoftware.WebPKI.ResponseEvent';
var eventPagePortName = 'com.lacunasoftware.WebPKI.Port';

// -------------------- Globals --------------------

var port = null;
var browserId = null;
var extensionId = null;
var compatibleExtensionIds = null;
var trace = false;

// -------------------- Browser compatibility --------------------

browserId = 'chrome';
var browser = chrome;
extensionId = 'dcngeagmmhegagicpcmpinaoklddcgon';



// -------------------- Functions --------------------

function init() {
    injectDiv();
    if (browserId === 'chrome' || browserId === 'edge') {
        document.addEventListener(requestEventName, function (event) {
            onPageMessage(event.detail);
        });
	} else {
        window.addEventListener('message', function (event) {
            if (event && event.data && event.data.port === requestEventName) {
                onPageMessage(event.data.message);
            }
        });
    }
}

function onPageMessage(message) {
	logEvent('request', message);
	if (port === null) {
		port = browser.runtime.connect({ name: eventPagePortName });
		port.onMessage.addListener(onExtensionMessage);
		console.log('[ContentScript] opened port with extension');
	}
	port.postMessage(message);
}

function onExtensionMessage(message) {
	if (message && typeof message.trace === 'boolean') {
		trace = message.trace;
	}
    logEvent('response', message);
	if (browserId === 'chrome' || browserId === 'edge') {
		var event = new CustomEvent(responseEventName, { detail: message });
    	document.dispatchEvent(event);
    } else {
        window.postMessage({
            port: responseEventName,
            message: message
        }, '*');
    }
}

function injectDiv() {
	var installedIds = [extensionId].concat(compatibleExtensionIds || []);
	
	for (var i = 0; i < installedIds.length; i++) {
		var isInstalledNode = document.createElement('meta');
		isInstalledNode.id = installedIds[i];
		if (document.head) {
			document.head.appendChild(isInstalledNode);
		} else {
			console.log('[ContentScript] no head element on (' + document.location.href + '). Skip append id');
		}
	}
}

function logEvent(event, message) {
	if (trace) {
		console.log('[ContentScript] ' + event + ' received', message);
	} else if (message.success === false && message.exception) {
		console.log('[ContentScript] ' + event + ' received Error: ' + message.exception.message + ' (code: ' + message.exception.code + ')');
	}
}

// -------------------- Initialization --------------------

init();
