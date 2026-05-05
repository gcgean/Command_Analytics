export default LacunaWebPKI;

export declare class LacunaWebPKI {

	/**************************************************************
	 * Instatiates a new Lacuna Web PKI object.
	 * @param license The license for the component. May be a string or an object (see [Licensing](http://docs.lacunasoftware.com/articles/web-pki/licensing)).
	 * In order for the component to work, you must set a valid purchased license that matches the URL of the site running the code.
	 * If no licesnse is set, the component will work in localhost only, so you can test as much as you want in development before deciding to license it.
	 *
	 * @returns
	 *
	 * Binary license sample
	 * ```javascript
	 * // Here, we use the binary format of our license. This is preferred if you want to hide the details of your license
	 * // (expiration date and allowed domains). Please note that the details are not encrypted, just encoded in Base64.
	 * var pki = new LacunaWebPKI('ASYAanNmaWRkbGUubmV0LHdlYnBraS5sYWN1bmFzb2Z0d2FyZS5jb20AAAABClKvO1J22vAD+YmfANiKQLbcLE1lNraPKCel6tRM+ZxR+h6M/crtJYRRVGGz7hrdbM0Y0mfTu15RMYGqQMi1QNZS6GrT4vNzIayv552Fl0EFWQA7jWlctUwfYoHRHVEnCNx9YGXDiA9+yDoGlVwgTR7fjzNeS3Fen1MVIyKBF464gN0JvdiCRJMI47JGVDkPmKjcrYIvJs6y5Lg25RW4ZnBKVruS+HR2s3k8ZrV4y4RCQE4UYMKbukF9vsF+JqAEifRlPq2xLcrNdxBveVDSXS/LRHAcrZrMM+Iw4A79jl0ngWPcy+CwinAhT+3dxVo5ZWMRQFpmTkylEMDvTjV9wQ==');
	 * ```
	 *
	 * JSON license sample
	 * ```javascript
	 * // Here, we use the JSON format of our license. If you don't mind having the details of your license (expiration
	 * // date and allowed domains) in the source code of your page, this option is preferred because it makes it
	 * // easier to diagnose problems such as an expired license.
	 * var pki = new LacunaWebPKI( {
	 *     "format": 1,
	 *     "allowedDomains": [
	 *         "webpki.lacunasoftware.com",
	 *         "jsfiddle.net"
	 *     ],
	 *     "expiration": null,
	 *     "signature": "ClKvO1J22vAD+YmfANiKQLbcLE1lNraPKCel6tRM+ZxR+h6M/crtJYRRVGGz7hrdbM0Y0mfTu15RMYGqQMi1QNZS6GrT4vNzIayv552Fl0EFWQA7jWlctUwfYoHRHVEnCNx9YGXDiA9+yDoGlVwgTR7fjzNeS3Fen1MVIyKBF464gN0JvdiCRJMI47JGVDkPmKjcrYIvJs6y5Lg25RW4ZnBKVruS+HR2s3k8ZrV4y4RCQE4UYMKbukF9vsF+JqAEifRlPq2xLcrNdxBveVDSXS/LRHAcrZrMM+Iw4A79jl0ngWPcy+CwinAhT+3dxVo5ZWMRQFpmTkylEMDvTjV9wQ=="
	 * });
	 * ```
	 */
	constructor(license?: string | Object);


	/**************************************************************
	 * Initializes the instance of the LacunaWebPKI object. This method must be called before calling any other methods.
	 *
	 * @returns
	 *
	 * Simple `ready` example
	 * ```javascript
	 * // This is the simplest way to call the method, in case you don't wish to register a default error callback nor
	 * // define a custom behavior for when the component is not installed/outdated.
	 * pki.init({ ready: onWebPkiReady });
	 * 
	 * // The ready callback receives no arguments
	 * function onWebPkiReady() {
	 *     // start using the component
	 * }
	 * ```
	 * 
	 * Complete example
	 * ```javascript
	 * // If you wish to pass any other argument, you must use the extended version of the method:
	 * pki.init({
	 *     ready: onWebPkiReady,
	 *     notInstalled: onWebPkiNotInstalled,
	 *     defaultFail: onWebPkiFail
	 * });
	 * 
	 * function onWebPkiReady() {
	 *     // start using the component
	 * }
	 * 
	 * // The notInstalled callback
	 * function onWebPkiNotInstalled(status, message) {
	 *     alert(message + '\n\nYou will be redirected to the installation page');
	 *     pki.redirectToInstallPage();
	 * }
	 * 
	 * // The default fail callback
	 * function onWebPkiFail(ex) {
	 *     alert(ex.userMessage);
	 *     console.log('Web PKI error from ' + ex.origin + ': ' + ex.error + ' (' + ex.code + ')');
	 * }
	 * ```
	 *
	 * JSFiddle live example: [init method full example](https://jsfiddle.net/LacunaSoftware/apak22ba/)
	 */
	init(args: {
		/** A function to be called when the component is ready to be used. The function receives no arguments. */
		ready: () => any,

		/** The license for the component, if not already set when instantiating the object. */
		license?: string | Object,
		
		/** If you intend to use a specifc features set, pass the equivalent API version required parameter, so you can ensure that the users will have the minimum components required versions and will not force any unecessary update. See the [API changelog](http://docs.lacunasoftware.com/articles/web-pki/changelog) for more information. */
		requiredApiVersion?: LacunaWebPKI.ApiVersions,
		
		/** A function to be called if the component's installation is not OK (component not installed, outdated or user is using an unsupported browser). If no callback is given, the user is automatically redirected to the installation website and will be redirected back once the installation is completed. If you do pass a callback to override the default behavior, use the [[redirectToInstallPage]] method to redirect the user to the installation page whenever you think it's convenient. */
		notInstalled?: (
			/** The reason for the failed verification */
			status: LacunaWebPKI.InstallationStates,
			/** A user-friendly message describing the reason for the failure. */
			message: string
		) => any,
		
		/** The default callback to be called when an error occurrs (please refer to examples below for the exact function signature). */
		defaultFail?: FailCallback,

		/** Whether or not to share and persiste the native app instances per hostname. Default is one native app instance per page. */
		useDomainNativePool?: boolean,
		
		/** If your webpage uses AngularJS, you can pass here a reference to your $scope, which will then be used to call the callback functions properly, relieving you of doing a `$scope.$apply(function() { ... });` on every callback. The calls are actually wrapped around a "safe $apply", as described in [coderwall](https://coderwall.com/p/ngisma/safe-apply-in-angular-js). */
		angularScope?: Object,
		
		/** If your webpage uses Angular2+ technologies, you can pass a [NgZone](https://angular.io/api/core/NgZone) reference, so the page can properly detect elements changes on the callback functions. */
		ngZone?: Object,
		
		/** The brand name for customized install page, if license covered. */
		brand?: string,

		/** The mobile integration mode. Default is [[LacunaWebPKI.MobileIntegrationModes.AppIntegration]]. */
		mobileIntegrationMode?: LacunaWebPKI.MobileIntegrationModes,
		
		/** The *on premises* Rest PKI URL. For *on premises* Rest PKI clients integration only. */
		restPkiUrl?: string
	}): Promise<Object>;

	/**************************************************************
	 * Lists the user available certificates in OS certificate store or connected crypto devices
	 * 
	 * @returns A promise object that can register [[fail]] and [[success]] callbacks to be called when the operation completes. The [[success]] callback for this promise receives an array of [[CertificateModel]]
	 *
	 * Usage example (JavaScript)
	 * ```javascript
	 * pki.listCertificates().success(function (certs) {
	 *     // Use certificate list "certs"
	 * });
	 * ```
	 * Lacuna Live Example: [Listing Certificates](https://jsfiddle.net/LacunaSoftware/ezg6hz7n/)
	 * Lacuna Live Example: [Listing Certificates And Show Details](https://jsfiddle.net/LacunaSoftware/fxpavm8y/)
	 */
	listCertificates(args?: {
		/** A html `<select>` (dropdown) element `id` to be automatically populated with the available certificates. You can also pass the `selectOptionFormatter` function argument for formatting the populated options text. If no formatter function is passed, the default text formatting for a certificate `c` is "`c.subjectName` (issued by `c.issuerName`)" */
		selectId?: string,

		/** An `<option>` text formatter for the passed `selectId`. The formatter function must return a desired text for each [[CertificateModel]]. */
		selectOptionFormatter?: (c: CertificateModel) => string
	}): Promise<CertificateModel[]>;

	/**************************************************************
	 * Gets a certificate content
	 * @returns A promise object that can register [[fail]] and [[success]] callbacks to be called when the operation completes. The [[success]] callback for this promise receives the (Base64 encoded) certificate DER bytes.
	 *
	 * Usage example (JavaScript)
	 * ```javascript
	 * pki.readCertificate({
	 *     thumbprint: $('#certificateSelect').val()
	 * }).success(function (content) {
	 *     // Use certificate content
	 * });
	 * ```
	 *
	 * JSFiddle live example: [Listing and reading certificates](https://jsfiddle.net/LacunaSoftware/ezg6hz7n/)
	 */
	readCertificate(args: {
		/** The certificate thumbprint. Available in [[CertificateModel.thumbprint]] property returned by [[listCertificates]] method. */
		thumbprint: string
	}): Promise<string>;


	pollNative(args: { requiredApiVersion?: string }): Promise<null>;

	importPkcs12(): Promise<boolean>;

	removeCertificate(args: { thumbprint: string }): Promise<boolean>;

	startSyncDevice(): Promise<RemoteConnectionInfo>;

	waitSyncDevice(args: { sessionId: string }): Promise<RemoteDeviceInfo>;

	finishSyncDevice(args: { sessionId: string }): Promise<RemoteDeviceInfo>;

	refreshDevice(args: { deviceId: string }): Promise<{ version: string }>;


}

// USABLE ENUMS

export namespace LacunaWebPKI {

	export const enum InstallationStates {
		INSTALLED = 0,
		NOT_INSTALLED = 1,
		OUTDATED = 2,
		BROWSER_NOT_SUPPORTED = 3
	}

	export const enum ApiVersions {
		v1_0 = '1.0',
		v1_1 = '1.1',
		v1_2 = '1.2',
		v1_3 = '1.3',
		v1_4 = '1.4',
		v1_4_1 = '1.4.1',
		v1_5 = '1.5',
		v1_5_1 = '1.5.1',
		v1_5_2 = '1.5.2',
		v1_6 = '1.6.0',
		v1_6_1 = '1.6.1',
		v1_7_0 = '1.7.0',
		v1_7_2 = '1.7.2',
		v1_8_0 = '1.8.0',
		v1_8_1 = '1.8.1',
		v1_8_2 = '1.8.2',
		v1_9_0 = '1.9.0',
	}

	/**************************************************************
	 * Web PKI error codes.
	 */
	export const enum ErrorCodes {
		/** Undefined error. */
		UNDEFINED                      = 'undefined',
		/** Internal error. */
		INTERNAL                       = 'internal',
		/** User cancelled the operation. */
		USER_CANCELLED                 = 'user_cancelled',
		/** The user Operating System is not supported */
		OS_NOT_SUPPORTED               = 'os_not_supported',
		/** The Internet Explorer Addon did not respond */
		ADDON_TIMEOUT                  = 'addon_timeout',
		/** The Internet Explorer Addon was not detected. It is not installed or not working well. */
		ADDON_NOT_DETECTED             = 'addon_not_detected',
		/** The Internet Explorer Addon failed to send command to the native component. */
		ADDON_SEND_COMMAND_FAILURE     = 'addon_send_command_failure',
		/** The selected certificate was not found on user store or crypto device. If a crypto device use is intended, check is drivers or PKCS#11 configuratin is setup properly. */
		CERTIFICATE_NOT_FOUND          = 'certificate_not_found',
		/** The request command is unknown. */
		COMMAND_UNKNOWN                = 'command_unknown',
		/** The request command is not supported on the user Operating System. */
		COMMAND_NOT_SUPPORTED          = 'command_not_supported',
		/** A mandatory command parameter is missing in the request. */
		COMMAND_PARAMETER_NOT_SET      = 'command_parameter_not_set',
		/** A command parameter is not valid. */
		COMMAND_INVALID_PARAMETER      = 'command_invalid_parameter',
		/** A command parameter is not supported on this platform */
		COMMAND_PARAMETER_NOT_SUPPORTED= 'command_parameter_not_supported',
		/** The web extension failed to connect to native component. */
		NATIVE_CONNECT_FAILURE         = 'native_connect_failure',
		/** The native component disconnected from web extension. */
		NATIVE_DISCONNECTED            = 'native_disconnected',
		/** The web extension did not receive a response from native component. */
		NATIVE_NO_RESPONSE             = 'native_no_response',
		/** Error while getting pending signature on [[signWithRestPki]] method. */
		REST_PKI_GET_PENDING_SIGNATURE = 'rest_pki_get_pending_signature',
		/** Error while sending signature on [[signWithRestPki]] method. */
		REST_PKI_POST_SIGNATURE        = 'rest_pki_post_signature',
		/** The Rest PKI did not accept the selected certificate. */
		REST_PKI_INVALID_CERTIFICATE   = 'rest_pki_invalid_certificate',
		/** A license is required and was not set. See [[constructor]]. */
		LICENSE_NOT_SET                = 'license_not_set',
		/** The license passed is not valid. */
		LICENSE_INVALID                = 'license_invalid',
		/** The license passed does not allow the requested command. */
		LICENSE_RESTRICTED             = 'license_restricted',
		/** The license passed has expired. */
		LICENSE_EXPIRED                = 'license_expired',
		/** The license passed does not allow the domain being used. */
		LICENSE_DOMAIN_NOT_ALLOWED     = 'license_domain_not_allowed',
		/** Validation error. */
		VALIDATION_ERROR               = 'validation_error',
		/** Error on PKCS#11 communication. */
		P11_ERROR                      = 'p11_error',
		/** The selected device was not found. Disconnected or PKCS#11 not being recognized. */
		P11_TOKEN_NOT_FOUND            = 'p11_token_not_found',
		/** The device does not support the PKCS#11 requested operation. */
		P11_NOT_SUPPORTED              = 'p11_not_supported',
		/** The private key was not found for the selected certificate. */
		KEYSET_NOT_FOUND               = 'keyset_not_found',
		ALGORITHM_NOT_SUPPORTED        = 'algorithm_not_supported',
		SIGNED_PDF_TO_MARK             = 'signed_pdf_to_mark',
		JSON_ERROR                     = 'json_error',
		IO_ERROR                       = 'io_error',
		KEYCHAIN_ERROR                 = 'keychain_error',
		KEYCHAIN_SIGN_ERROR            = 'keychain_sign_error',
		DECODE_ERROR                   = 'decode_error',
		/** Certificate key not found. Please check if the selected certificate smart-card or USB token is connected to your computer or remove and insert it again. */
		CSP_KEYSET_NOT_DEFINED         = 'csp_keyset_not_defined',
		CSP_INVALID_ALGORITHM          = 'csp_invalid_algorithm',
		CSP_INVALID_PROVIDER_TYPE      = 'csp_invalid_provider_type',
		MOBILE_TIMEOUT                 = 'mobile_timeout',
		MOBILE_NOT_AUTHORIZED          = 'mobile_not_authorized',
		MOBILE_SEND_MESSAGE            = 'mobile_send_message',
		COMMAND_DECRYPT_ERROR          = 'command_decrypt_error',
		BLOCKED_DOMAIN                 = 'blocked_domain',
		INVALID_OPERATION              = 'invalid_operation'
	}

	export const enum CertificateTypes {
		A1 = 'A1',
		A2 = 'A2',
		A3 = 'A3',
		A4 = 'A4',
		S1 = 'S1',
		S2 = 'S2',
		S3 = 'S3',
		S4 = 'S4',
		T3 = 'T3',
		T4 = 'T4',
		Unknown = 'Unknown'
	}

	export const enum CertificatePolicyQualifierTypes {
		Cps = 'Cps',
		UserNotice = 'UserNotice'
	}

	export const enum MobileIntegrationModes {
		/** Redirects and continue execution inside Web PKI App. Direct integration without bouncing between Browser App and Web PKI App. */
		AppIntegration = 'appIntegration',
		/** Integration on Browser App. Requires bouncing between Browser App and Web PKI App. */
		BrowserIntegration = 'browserIntegration'
	}


	export const enum MobileOSs {
		Android = 'Android',
		iOS = 'iOS'
	}

	export const enum ResyncLevels {
		Good = 'good',
		Warn = 'warn',
		Alert = 'alert'
	}


}


/**************************************************************
 * An object that represents a promise to be fulfilled, through which the programmer can register callbacks for when the promise is fulfilled successfully or for when an error occurrs. 
 * All asyncronous methods from the [[LacunaWebPKI]] class return an instance of this object.

 * For instance, the method [[listCertificates]] returns a promise which is fulfilled when the list of certificates is finally available. 
 * You could register a callback for when that happens, and another one for if an error occurs, in the following manner:
 *
 *```js
 * pki.listCertificates()
 * .success(function(certs) {
 *     // Every success callback receives a single argument. Its type (either string, array or object) and meaning depend on the method that returned the promise.
 *     $scope.certificates = certs;
 * })
 * .fail(function (ex) {
 * 	   // The fail callback always receives an ExceptionModel object.
 *     alert('pki error from ' + ex.origin + ': ' + ex.message);
 *     console.log('pki error', ex);
 * });
 * ```
 */
export interface Promise<T> {
	success(callback: SuccessCallback<T>): Promise<T>;
	//error(callback: ErrorCallback): Promise<T>;
	fail(callback: FailCallback): Promise<T>;
}

/**************************************************************
 * Object that holds the exception information.
 */
export interface ExceptionModel {
	/** An i18n, when possible, user-friendly message describing the problem. */
	userMessage: string,
	/** A message describing the error that occurred. */
	message: string,
	/** A detailed string containing as much information about the error as possible, for instance the stack trace. This is a good value to be logged, not to be shown to the user. */
	error: string,
	/** A string denoting where the error originated. This should also not be shown to the user, but rather logged for diagnostic purposes. */
	origin: string,
	/** The error code */
	code: LacunaWebPKI.ErrorCodes
}

/**************************************************************
 * Object with returned certificate informations.
 *
 * Each property on the [[PkiBrazilModel]] and [[PkiItalyModel]] objects may be null, but the objects themselves (`cert.pkiBrazil` or `cert.pkiItaly`) are **never** null.
 */
export interface CertificateModel {
	/** The Common Name (CN) part of the certificate's subject DN name field. */
	subjectName: string,
	/** The subject Distinguished Name (DN) formatted string */
	subjectDN: string,
	/** The Common Name (CN) part of the certificate's issuer name field. */
	issuerName: string,
	/** The issuer Distinguished Name (DN) formatted string */
	issuerDN: string,
	/** `true` if the certificate is stored on Web PKI mobile app. `null` or `false` otherwise. */
	isRemote?: boolean,
	/** The subject e-mail address. */
	email: string,
	/** The SHA-256 thumbprint (Base64 encoded) of the certificate's DER encoding. Used to reference the certificate on subsequent calls. */
	thumbprint: string,
	/** Object with boolean properties indicating wether each possible key usage is set on the certificate. */
	keyUsage: KeyUsagesModel,
	/** Object with boolean properties indicating wether each possible EXTENDED key usage is set on the certificate. If null, certificate does not have the ExtendedKeyUsage extension */
	extendedKeyUsage?: ExtendedKeyUsagesModel,
	/** Array with certificate policies info */
	certificatePolicies: CertificatePolicyModel[],
	/** Object with Brazil-specific fields. */
	pkiBrazil: PkiBrazilModel,
	/** Object with Argentina-specific fields. */
	pkiArgentina: PkiArgentinaModel,
	/** Object with Ecuador-specific fields. */
	pkiEcuador: PkiEcuadorModel,
	/** Object with Italy-specific fields. */
	pkiItaly: PkiItalyModel,
	/** Object with Paraguay-specific fields. */
	pkiParaguay: PkiParaguayModel,
	/** Object with Peru-specific fields. */
	pkiPeru: PkiPeruModel,
	/** The not before field of the certificate. */
	validityStart: Date,
	/** The not after field of the certificate. */
	validityEnd: Date
}

export interface KeyUsagesModel {
	crlSign: boolean,
	dataEncipherment: boolean,
	decipherOnly: boolean,
	digitalSignature: boolean,
	encipherOnly: boolean,
	keyAgreement: boolean,
	keyCertSign: boolean,
	keyEncipherment: boolean,
	nonRepudiation: boolean
}

export interface ExtendedKeyUsagesModel {
	clientAuth: boolean,
	serverAuth: boolean,
	codeSigning: boolean,
	emailProtection: boolean,
	timeStamping: boolean,
	ocspSigning: boolean,
	ipsecEndSystem: boolean,
	ipsecTunnel: boolean,
	ipsecUser: boolean,
	any: boolean
}

/**************************************************************
 * Object with PKI Brazil specific fields.
 *
 */
export interface PkiBrazilModel {
	/** Certificate holder's CPF (CPF do titular/responsável). */
	cpf: string,
	/** Company's CNPJ. */
	cnpj: string,
	/** Name of the certificate's holder (nome do titular/responsável). */
	responsavel: string,
	/** Date of birth of the certificate's holder (time as midnight in the current machine's time zone). */
	dateOfBirth: Date,
	/** The ICP-Brasil certificate type. */
	certificateType: LacunaWebPKI.CertificateTypes,
	/** Whether the certificate is an application certificate. */
	isAplicacao: boolean,
	/** Whether the certificate is a personal certificate (pessoa física). */
	isPessoaFisica: boolean,
	/** Whether the certificate is a company certificate (pessoa jurídica). */
	isPessoaJuridica: boolean,
	/** The responsible company name if it is an ICP-Brasil application certificate. The subject's common name without end id numbers if it is an ICP-Brasil company certificate. Null otherwise. */
	companyName: string,
	/** The certificate holder's "Número de Identificação Social - NIS (PIS, PASEP ou CI)". Returns value without leading zeroes. Returns null if information is not present. */
	nis: string,
	/** Certificate holder's ID number (número do RG do titular/responsável) without leading zeroes. */
	rgNumero: string,
	/** Issuing entity of the certificate holder's ID (órgão emissor do RG do titular/responsável). */
	rgEmissor: string,
	/** State code of the issuing entity of the certificate holder's ID (UF do órgão emissor do RG do titular/responsável). */
	rgEmissorUF: string,
	/** OAB's Número de Inscrição junto a Seccional (without leading zeroes). */
	oabNumero: string,
	/** OAB's sigla do Estado da Seccional. */
	oabUF: string
}

/**************************************************************
 * Object with PKI Italy specific fields.
 */
export interface PkiItalyModel {
	/** Subject's codice fiscale. */
	codiceFiscale: string
}

/**************************************************************
 * Object with PKI Argentina specific fields.
 */
export interface PkiArgentinaModel {
	/** Clave Única de Identificación Laboral */
	cuil: string,
	/** Clave Única de Identificación Tributaria */
	cuit: string
}

/**************************************************************
 * Object with PKI Ecuador specific fields.
 */
export interface PkiEcuadorModel {
	/** */
	certificateType: string,
	cedulaDeIdentidad: string,
	pasaporte: string,
	/** Registro Único de Proveedores */
	rup: string,
	/** Registro Único de Contribuyentes */
	ruc: string,
	nombres: string,
	apellidos: string,
	razonSocial: string
}

/**************************************************************
 * Object with PKI Paraguay specific fields.
 */
export interface PkiParaguayModel {
	personCertificateType: string,
	certificateType: string,
	/** Cédula de identidad */
	ci: string,
	/** Cédula de identidad para extranjero */
	cie: string,
	/** Registro Único de Contribuyente. Número de Cédula Tributaria correspondiente al Titular */
	ruc: string,
	pasaporte: string,
	/** Nombre y apellido del responsable del certificado */
	responsable: string
}

/**************************************************************
 * Object with PKI Peru specific fields.
 */
export interface PkiPeruModel {
	/** Documento Nacional de Identidad */
	dni: string,
	/** Registro Único de Contribuyentes */
	ruc: string
}

/**************************************************************
 * Object with certificate policy info
 */
export interface CertificatePolicyModel {
	/** Certificate Policy Identifier */
	id: string,
	/** Certificate Policy Qualifiers */
	qualifiers: CertificatePolicyQualifierModel[]
}

/**************************************************************
 * Object with certificate policy qualifier
 */
export interface CertificatePolicyQualifierModel {
	type: LacunaWebPKI.CertificatePolicyQualifierTypes,
	cpsUri: string,
	unOrganization: string,
	unExplicitText: string,
	unNoticeNumbers: number[],
}

// Common Functions

export interface SuccessCallback<T> {
	(arg: T) : void;
}

export interface FailCallback {
	(ex: ExceptionModel) : void;
}

//export interface ErrorCallback {
//	(message: string, error: string, origin: string, code: string) : void;
//}

export interface Filter {
	(cert: CertificateModel) : boolean;
}


export interface RemoteConnectionInfo {
	sessionId: string,
	sessionIdRaw: string,
	encodedX: string
}

export interface RemoteDeviceInfo {
	deviceId: string,
	name: string,
	os: LacunaWebPKI.MobileOSs,
	resyncNeededLevel?: LacunaWebPKI.ResyncLevels,
	knownCertificates?: { [thumbprint: string]: CertificateModel },
}

export interface InitResult {
	isInstalled?: boolean,
	status?: LacunaWebPKI.InstallationStates,
	platformInfo?: any,
	nativeInfo?: any,
}

