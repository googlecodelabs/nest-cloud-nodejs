'use strict';

// IMPORTS: NODE.JS CORE
const EventEmitter = require('events').EventEmitter;

// IMPORTS: NODE.JS THIRD-PARTY
const request = require('request');
const RSVP = require('rsvp');
const forEach = require('lodash').forEach;
const isNull = require('lodash').isNull;
const isUndefined = require('lodash').isUndefined;
const isString = require('lodash').isString;
const cloneDeep = require('lodash').cloneDeep;
const has = require('lodash').has;

// IMPORTS: NEST RESOURCES
const NetworkManagerErrors = require('./NetworkManagerErrors');
const NestNetworkManagerUtils = require('./NestNetworkManagerUtils');
const EMITABLE_EVENTS = require('./NestNetworkManagerContants').EMITABLE_EVENTS;
const NETWORK_STREAM_EVENTS = require('./NestNetworkManagerContants').NETWORK_STREAM_EVENTS;
const NETWORK_ERROR_EVENTS = require('./NestNetworkManagerContants').NETWORK_ERROR_EVENTS;

/**
 * The network manager deals with the REST streaming event loop, handles
 * PUT and GET events and is the only Nest library which stores a copy of the
 * OAUTH2 token so that requests can be made against WWN API.
 * @class NestNetworkManager
 * @extends EventEmitter
 * @property {String|Null} accessToken - the OAUTH2 token for use with WWN API
 * @property {Object|Null} serviceStream - the ongoing service REST stream; null if no stream is present
 * @property {Boolean} isUnderRateLimitation - a boolean indicating whether or not the NestNetworkManager is being rate limited
 * @property {Boolean} autoReinitStream - a setable boolean used by the NestNetworkManager to determine whether or not to automatically attempt REST stream reconnect
 * @property {String} baseUrl - the root WWN API url
 * @property {Object} STREAM_EVENT_BODY_PROCESSING_MAP - mapping used for directing side-effects when specific events occur on the REST stream
 * @property {Object} STREAM_EVENT_EMISSION_OPERATION_MAP - mapping used for directing class event emissions when specific event occur on the REST stream
 * @property {Array} chunkedPutMessagesAwaitingCompletion - a buffer used to store incoming chunked PUT message from the REST stream
 * @property {Null|String} cachedRedirectUrl - the cached redirect url given by WWN service
 * @property {Function} boundStreamListener - a bound instance of the _determineStreamUpdateType function, created once to prevent eventEmitter leaks
 * @property {Object<Function>} reservedErrorCodes - a object keyed by HTTP response code where each value is a reference to the instances handler function
 */
class NestNetworkManager extends EventEmitter {

    /** @constructor */
    constructor ( ) {

        super();

        this.accessToken = null;
        this.serviceStream = null;
        this.isUnderRateLimitation = false;
        this.autoReinitStream = false;
        this.cachedRedirectUrl = null;
        this.boundStreamListener = this._determineStreamUpdateType.bind(this);

        this.apiUrl =  "https://developer-api.nest.com";

        this.STREAM_EVENT_BODY_PROCESSING_MAP = {
            [NETWORK_STREAM_EVENTS.auth_revoked]: this._processAuthTokenRevokedEvent.bind(this)
        };

        this.STREAM_EVENT_EMISSION_OPERATION_MAP = {
            [NETWORK_STREAM_EVENTS.put]: this._emitServiceStreamDataUpdateEvent.bind(this)
            // , [NETWORK_STREAM_EVENTS.auth_revoked]: this._emitServiceAuthRevokedEvent.bind(this)
        };

        this.reservedErrorCodes = {
            307: this._handleRedirect
            , 400: this._handleInvalidRequest
            , 404: this._handleNotFound
            , 500: this._handleInternalAPIError
            , 401: this._handleAuthError
            , 403: this._handleForbidden
            , 503: this._handleServiceUnavailable
            , 429: this._handleBlocked
        };

        this.chunkedPutMessagesAwaitingCompletion = [];
    }

    /**
     * Call with TRUE/FALSE to set whether or not the Network Manager
     * should attempt to automatically reinit the REST stream after it is closed.
     * @public
     * @memberof NestNetworkManager
     * @method setAutoReinitStream
     * @param {Boolean} shouldAutoReinit
     */
    setAutoReinitStream ( shouldAutoReinit ) {

        this.autoReinitStream = shouldAutoReinit;
    }

    /**
     * Caches the redirect url that may be returned by a WWN API request.
     * @public
     * @memberof NestNetworkManager
     * @method _cacheRedirectUrl
     * @param {String} redirectUrl
     */
    _cacheRedirectUrl ( redirectUrl ) {

        this.cachedRedirectUrl = [
            "https://"
            , redirectUrl.split("/")[2]
        ].join("");
    }

    /**
     * Sets the cachedRedirectUrl to null
     * @public
     * @memberof NestNetworkManager
     * @method _wipeCachedRedirectUrl
     */
    _wipeCachedRedirectUrl ( ) {

        this.cachedRedirectUrl = null;
    }

    /**
     * Called when a deauth event is received on the REST stream; clears
     * the token on the Network Manager instance
     * @private
     * @memberof NestNetworkManager
     * @method _processAuthTokenRevokedEvent
     */
    _processAuthTokenRevokedEvent ( eventContainer ) {

        // remove the now invalid auth token
        this.accessToken = null;
        this.cachedRedirectUrl = null;
    }

    /**
     * Called when a REST stream is ended. Sets the serviceStream to null
     * on the network manager instance and emits the serviceStreamClosed event
     * on the instance.
     * @private
     * @memberof NestNetworkManager
     * @method _cleanupServiceStream
     */
    _cleanupServiceStream ( ) {

        console.log("Cleaning up the service stream at", Date.now());

        this.serviceStream = null;
        this._emitServiceStreamClosedEvent();
    }

    /**
     * Attempts to determine if a chunked queue has been completed by trying to
     * parse the string-so-far. If successful will return the parsed object otherwise
     * will return false.
     * @private
     * @memberof NestNetworkManager
     * @method _determineIfChunkedMessagesHaveCompleted
     * @returns {Object|Boolean} - The parsed object if successful or FALSE if unsuccessful
     */
    _determineIfChunkedMessagesHaveCompleted ( ) {

        var parsedBody;

        try {

            parsedBody = JSON.parse(
                this.chunkedPutMessagesAwaitingCompletion.join("")
            );
        } catch ( e ) {

            // still more chunked messages to capture
            return false;
        }

        // all chunks received, return parsed body
        return parsedBody;
    }

    /**
     * Clears the chunked message queue on the instance by setting a new
     * array on the property.
     * @private
     * @memberof NestNetworkManager
     * @method _wipeChunkedMessageQueue
     */
    _wipeChunkedMessageQueue ( ) {

        this.chunkedPutMessagesAwaitingCompletion = [];
    }

    /**
     * Attempts to parse the string received in the REST stream update. May add
     * to or call _wipeChunkedMessageQueue to reset the chunked message queue.
     * May return an instance of NestServiceStreamEventContainer if a message is
     * found requiring emission of a specific event by the network manager instance
     * but will otherwise return false if the stream event does not mandate
     * event emission.
     * @private
     * @memberof NestNetworkManager
     * @method _attemptToParseUpdate
     * @param {String} body - the raw string received by streaming connection
     * @returns {NestServiceStreamEventContainer|Boolean} - will return a filled instance of the event container if applicable otherwise FALSE
     */
    _attemptToParseUpdate ( body ) {

        const checkForChunkedMessage = /event\: /;
        const rawBodyExtraction = NestNetworkManagerUtils
            .splitStringByNewlines( body );

        var eventContainer = {
            event: "unknown"
            , body: null
        };
        var processedEventBody = {};

        if ( !checkForChunkedMessage.test( body ) ) {
            // message is chunked and this could be middle or end
            // add to the chunk queue

            this.chunkedPutMessagesAwaitingCompletion.push(body);
            processedEventBody = this._determineIfChunkedMessagesHaveCompleted();

            if ( processedEventBody === false ) {

                // still capturing chunks, return false
                // to deny emission of stream update event
                return false;
            }

            // return the full body after wiping the chunked queue
            this._wipeChunkedMessageQueue();
            eventContainer.event = "put";
            eventContainer.body = processedEventBody;

        } else {

            eventContainer.event = NestNetworkManagerUtils
                .extractStreamUpdateEventType( rawBodyExtraction );

            if ( eventContainer.event === "put" ) {

                processedEventBody = NestNetworkManagerUtils
                    .extractAndParseStreamUpdateEventBody( rawBodyExtraction );

                if ( processedEventBody.parsed === false ) {
                    // message is the start of a chunked series; push into the chunk queue
                    // but make it the first entry of the chunk queue since this is the
                    // start of a new put update. Return false to stop event propagation
                    // by parent class.

                    if ( this.chunkedPutMessagesAwaitingCompletion.length > 0 ) {

                        this._warnOfPotentialDataLossInOverwritingQueue();
                    }

                    this._wipeChunkedMessageQueue();
                    this.chunkedPutMessagesAwaitingCompletion
                        .push(processedEventBody.raw);


                    // immediately return false since this message is part
                    // of a chunked queue
                    return false;
                }

                eventContainer.body = processedEventBody.parsed;
            }
        }

        return eventContainer;
    }

    /**
     * Handler for the 'data' event of the node request library when streaming
     * over HTTP (REST stream). Attempts to convert the given buffer to a string,
     * if successful will attempt to process & parse the string, calling event
     * emission on the instance if applicable to the content of the stream update.
     * @private
     * @memberof NestNetworkManager
     * @method _determineStreamUpdateType
     * @param {Buffer} buffer - the buffer created by the Node Request library
     * @listens {module:request~event:data}
     */
    _determineStreamUpdateType ( buffer ) {

        const body = buffer.toString();
        var eventContainer = {};

        if ( !isString(body) ) {

            console.warn(
                "Received a stream update with an unsupported type:"
                , ( typeof body )
                , "- should be of type String"
                , "\n Dump:"
                , body
            );

            return ;
        }

        eventContainer = this._attemptToParseUpdate( body );

        if ( eventContainer === false ) {
            // The parser has signaled that received information belongs to a
            // chunked queue of messages, therefore delay propagating any event
            // until the all chunks have been collected.
            return ;
        }

        if ( has(this.STREAM_EVENT_BODY_PROCESSING_MAP, eventContainer.event) ) {

            eventContainer = this
                .STREAM_EVENT_BODY_PROCESSING_MAP[eventContainer.event](
                    eventContainer
                );
        }

        if ( has(this.STREAM_EVENT_EMISSION_OPERATION_MAP, eventContainer.event) ) {

            this.STREAM_EVENT_EMISSION_OPERATION_MAP[eventContainer.event](
                eventContainer
            );
        }
    }

    /**
     * Emits the authTokenRevoked event.
     * @private
     * @memberof NestNetworkManager
     * @method _emitServiceAuthRevokedEvent
     * @fires NestNetworkManager#authTokenRevoked
     */
    _emitServiceAuthRevokedEvent ( ) {

        super.emit(
            EMITABLE_EVENTS.authTokenRevoked
        );
    }

    /**
     * Emits the serviceStreamDataUpdate event.
     * @private
     * @memberof NestNetworkManager
     * @method _emitServiceStreamDataUpdateEvent
     * @fires NestNetworkManager#serviceStreamDataUpdate
     */
    _emitServiceStreamDataUpdateEvent ( dataUpdate ) {

        super.emit(
            EMITABLE_EVENTS.serviceStreamDataUpdate
            , dataUpdate
        );
    }

    /**
     * Emits the serviceStreamClosed event.
     * @private
     * @memberof NestNetworkManager
     * @method _emitServiceStreamClosedEvent
     * @fires NestNetworkManager#serviceStreamClosed
     */
    _emitServiceStreamClosedEvent ( ) {

        super.emit(
            EMITABLE_EVENTS.serviceStreamClosed
            , this
        );
    }

    /**
     * Adds the given function as a listener to the authTokenRevoked event.
     * @public
     * @memberof NestNetworkManager
     * @method addServiceAuthRevokedEventListener
     * @param {Function} fnCallback - the function to be called when the event is emitted.
     * @returns {NestNetworkManager} - the network manager instance so that calls can be chained
     */
    addServiceAuthRevokedEventListener ( fnCallback ) {

        super.on(
            EMITABLE_EVENTS.authTokenRevoked
            , fnCallback
        );

        return this;
    }

    /**
     * Adds the given function as a listener to the serviceStreamDataUpdate event.
     * @public
     * @memberof NestNetworkManager
     * @method addServiceStreamDataUpdateListener
     * @param {Function} fnCallback - the function to be called when the event is emitted.
     * @returns {NestNetworkManager} - the network manager instance so that calls can be chained
     */
    addServiceStreamDataUpdateListener ( fnCallback ) {

        super.on(
            EMITABLE_EVENTS.serviceStreamDataUpdate
            , fnCallback
        );

        return this;
    }

    /**
     * Adds the given function as a listener to the serviceStreamClosed event.
     * @public
     * @memberof NestNetworkManager
     * @method addServiceStreamClosedEventListener
     * @param {Function} fnCallback - the function to be called when the event is emitted.
     * @returns {NestNetworkManager} - the network manager instance so that calls can be chained
     */
    addServiceStreamClosedEventListener ( fnCallback ) {

        super.on(
            EMITABLE_EVENTS.serviceStreamClosed
            , fnCallback
        );

        return this;
    }

    /**
     * Removes the given function as a listener to the authTokenRevoked event.
     * @public
     * @memberof NestNetworkManager
     * @method removeServiceAuthRevokedListener
     * @param {Function} fnCallback - the function to be removed from the event emission callback chain
     * @returns {NestNetworkManager} - the network manager instance so that calls can be chained
     */
    removeServiceAuthRevokedListener ( fnCallback ) {

        super.removeListener(
            EMITABLE_EVENTS.authTokenRevoked
            , fnCallback
        );

        return this;
    }

    /**
     * Removes the given function as a listener to the serviceStreamDataUpdate event.
     * @public
     * @memberof NestNetworkManager
     * @method removeServiceStreamDataUpdateListener
     * @param {Function} fnCallback - the function to be removed from the event emission callback chain
     * @returns {NestNetworkManager} - the network manager instance so that calls can be chained
     */
    removeServiceStreamDataUpdateListener ( fnCallback ) {

        super.removeListener(
            EMITABLE_EVENTS.serviceStreamDataUpdate
            , fnCallback
        );

        return this;
    }

    /**
     * Removes the given function as a listener to the serviceStreamClosed event.
     * @public
     * @memberof NestNetworkManager
     * @method removeServiceStreamClosedEventListener
     * @param {Function} fnCallback - the function to be removed from the event emission callback chain
     * @returns {NestNetworkManager} - the network manager instance so that calls can be chained
     */
    removeServiceStreamClosedEventListener ( fnCallback ) {

        super.removeListener(
            EMITABLE_EVENTS.serviceStreamClosed
            , fnCallback
        );

        return this;
    }

    /**
     * Sets the accessToken property on the network manager instance thereby
     * allowing the network manager to make HTTP requests against the WWN API.
     * @public
     * @memberof NestNetworkManager
     * @method setToken
     * @param {String} accessToken - the WWN API OAUTH2 access token
     * @returns {NestNetworkManager} - the network manager instance so that calls can be chained
     */
    setToken ( accessToken ) {

        if ( !isString(accessToken) ) {

            throw new NetworkManagerErrors.TokenMustBeString;

            return this;
        }

        this.accessToken = accessToken;

        return this;
    }

    /**
     * Wipes the accessToken property on the network manager instance thereby
     * disallowing further account-centric requests against the WWN API.
     * @public
     * @memberof NestNetworkManager
     * @method removeToken
     * @returns {NestNetworkManager} - the network manager instance so that calls can be chained
     */
    removeToken ( ) {

        this.accessToken = null;

        return this;
    }

    /**
     * Initiates an HTTP GET request against the WWN API for a users structures.
     * MUST have the accessToken property set as a string to initiate the request.
     * @public
     * @memberof NestNetworkManager
     * @method getStructures
     * @returns {RSVP.Promise} - a promise to be resolved/rejected on success/failure of the request with the response from the WWN API
     */
    getStructures ( ) {

        return new RSVP.Promise(
            ( resolve, reject ) => {

                var fullUrl = NestNetworkManagerUtils.generateStructureGetUrl();

                if ( this.accessToken === null ) {

                    reject( null );

                    throw new NetworkManagerErrors.NoTokenSetWhileMakingRequest;

                    return null;
                }

                console.info("Getting structures with url:", fullUrl);

                const req = request(
                    fullUrl
                    , function ( error, response, body ) {

                        if ( error ) {

                            reject({ error: error });

                            return body;
                        } else {

                            resolve({ body: body });

                            return body;
                        }
                    }
                );
            }
        );
    }

    /**
     * Sets the serviceStream property on the Network Manager instance with
     * the given options. Will follow and cache redirects.
     * @private
     * @memberof NestNetworkManager
     * @method _setServiceStream
     * @param {Object} options - the options object used to set up the request
     * @param {Function} resolve - the callback to resolve the returned promise
     * @param {Function} reject - the callback to reject the returned promise
     */
    _setServiceStream ( options, resolve, reject, repeatRequest )  {

        this.serviceStream = request(
            options
            , ( error, response, body ) => {

                this._removeServiceStreamDataListener();

                if ( has( this.reservedErrorCodes, response.statusCode ) ) {

                    this.reservedErrorCodes[response.statusCode].call(
                        this
                        , response
                        , repeatRequest
                        , resolve
                        , reject
                    );

                    return ;
                }

                if ( error ) {

                    console.error(
                        "Request reported error:"
                        , error
                        , response
                    );

                    reject(error);
                } else {

                    console.warn(
                        "Request ended with response:"
                        , body
                        , response
                    );

                    resolve(body);
                }

                this._cleanupServiceStream();
            }
        );
    }


    /**
     * Removes a listener on the 'data' event on the service stream property.
     * @private
     * @memberof NestNetworkManager
     * @method _removeServiceStreamDataListener
     */
    _removeServiceStreamDataListener ( ) {

        this.serviceStream.removeListener(
            'data'
            , this.boundStreamListener
        );
    }

    /**
     * Adds a listener to the 'data' event on the service stream property.
     * @private
     * @memberof NestNetworkManager
     * @method _addServiceStreamDataListener
     */
    _addServiceStreamDataListener ( ) {

        this.serviceStream.on(
            'data'
            , this.boundStreamListener
        );
    }

    /**
     * Attempts to begin a REST stream against the WWN API. Returns a promise
     * which will be resolved/rejected when the REST stream ends and whether it
     * ends in error. Will also add a listener to the streams 'data' event so
     * that updates on the stream can be emitted to applicable listeners.
     * @public
     * @memberof NestNetworkManager
     * @method _addServiceStreamDataListener
     * @returns {RSVP.Promise} - a promise to be resolved/reject upon normal closure/failure of the stream
     */
    streamServiceChanges ( ) {

        return new RSVP.Promise(
            ( resolve, reject ) => {

                if ( !isNull(this.serviceStream) ) {

                    // there is already an active stream from the service
                    // reject with the current service stream
                    reject( this.serviceStream );

                    return this.serviceStream;
                }

                this._createServiceStreamRequest(resolve, reject);
            }
        );
    }

    /**
     * Creates the parameters for the service stream request
     * @private
     * @memberof NestNetworkManager
     * @method _createServiceStreamRequest
     * @param {Function} resolve - the resolution function to the promise for the public-function request interface
     * @param {Function} reject - the rejection function to the promise for the public-function request interface
     */
    _createServiceStreamRequest ( resolve, reject ) {

        const targetUrl = isNull(this.cachedRedirectUrl) ? this.apiUrl : this.cachedRedirectUrl;
        const options = NestNetworkManagerUtils
            .generateServiceStreamRequestOptions( targetUrl, this.accessToken );

        this._setServiceStream(
            options
            , resolve
            , reject
            , this._createServiceStreamRequest.bind(
                this
                , resolve
                , reject
            )
        );
        this._addServiceStreamDataListener();
    }

    /**
     * Returns a promise for resolution/rejection upon transaction completion
     * with the WWN API with the given parameters.
     * @public
     * @memberof NestNetworkManager
     * @method updateDevice
     * @param {Object} deviceData - the device object which can be requested from the Representation Manager
     * @param {String} keyToUpdate - the key to update on the service relative to the device being updated
     * @param {String|Number} valueToUpdateWith - the value to update the WWN API with
     * @returns {RSVP.Promise} - a promise to be resolved/reject upon failure/success of the PUT request
     */
    updateDevice ( deviceData, keyToUpdate, valueToUpdateWith ) {

        return new RSVP.Promise(
            ( resolve, reject ) => {

                this._createUpdateDeviceRequest(
                    deviceData
                    , keyToUpdate
                    , valueToUpdateWith
                    , resolve
                    , reject
                );
            }
        );
    }

    /**
     * Creates the parameters for a device update request
     * @private
     * @memberof NestNetworkManager
     * @method _createUpdateDeviceRequest
     * @param {Object} deviceData - the device object which can be requested from the Representation Manager
     * @param {String} keyToUpdate - the key to update on the service relative to the device being updated
     * @param {String|Number} valueToUpdateWith - the value to update the WWN API with
     * @param {Function} resolve - the resolution function to the promise for the public-function request interface
     * @param {Function} reject - the rejection function to the promise for the public-function request interface
     */
    _createUpdateDeviceRequest ( deviceData, keyToUpdate, valueToUpdateWith, resolve, reject ) {

        const targetUrl = isNull(this.cachedRedirectUrl) ? this.apiUrl : this.cachedRedirectUrl;

        const options = NestNetworkManagerUtils.generateDeviceUpdateRequestOptions(
            targetUrl
            , this.accessToken
            , deviceData
            , keyToUpdate
            , valueToUpdateWith
        );

        this._putRequest(
            options
            , resolve
            , reject
            , this._createUpdateDeviceRequest.bind(
                this
                , deviceData
                , keyToUpdate
                , valueToUpdateWith
                , resolve
                , reject
            )
        );
    }

    /**
     * Executes an HTTP PUT request with the given options object; will follow
     * and cache redirects.
     * @private
     * @memberof NestNetworkManager
     * @method _putRequest
     * @param {Object} options - a request-compatible options object used to set-up the PUT request.
     * @param {Function} resolve - the resolution function to the promise for the public-function request interface
     * @param {Function} reject - the rejection function to the promise for the public-function request interface
     * @param {Function} repeatRequest - A bound version of the invoking setup function, used to repeat the request after redirect
     */
    _putRequest ( options, resolve, reject, repeatRequest ) {

        request(
            options
            , ( error, response, body ) => {

                if ( has( this.reservedErrorCodes, response.statusCode ) ) {

                    this.reservedErrorCodes[response.statusCode].call(
                        this
                        , response
                        , repeatRequest
                        , resolve
                        , reject
                    );

                    return ;
                }

                if ( error ) {

                    console.error("Got error in request", response, body);
                    if ( !isNull( this.cachedRedirectUrl ) ) {
                        console.log("Wiping cached url and attempting a re-request.");
                        // the host may be down or have changed location, wipe
                        // the cache url and attempt a re-request
                        this._wipeCachedUrl();
                        this._putRequest(
                            NestNetworkManagerUtils.generateDeviceUpdateRequestOptions(
                                this.apiUrl
                                , this.accessToken
                                , deviceData
                                , keyToUpdate
                                , valueToUpdateWith
                            )
                            , resolve
                            , reject
                            , deviceData
                            , keyToUpdate
                            , valueToUpdateWith
                        );
                    } else {

                        reject(error);
                    }

                } else {

                    console.log("Got success response in request", body);
                    resolve(body);
                }
            }
        );
    }

    /**
     * Handles a redirect response from an HTTP request (307). Will cache the redirected
     * header on the instance to prevent request duplication. Will attempt repeat
     * of the original request after caching the redirect url.
     * @private
     * @memberof NestNetworkManager
     * @method _handleRedirect
     * @param {Object} response - the response from the WWN API.
     * @param {Function} repeatRequest - A bound version of the invoking setup function, used to repeat the request
     * @param {Function} resolve - the resolution function to the promise for the public-function request interface
     * @param {Function} reject - the rejection function to the promise for the public-function request interface
     */
    _handleRedirect ( response, repeatRequest, resolve, reject ) {
        console.log("Got redirect, caching url..");

        this._cacheRedirectUrl( response.headers.location );
        // repeat the request, the network manager will now
        // use the redirect url
        repeatRequest();
    }

    /**
     * Handles a blocked response from a HTTP request (429). Will log the response
     * info and reject the associated promise.
     * @private
     * @memberof NestNetworkManager
     * @method _handleBlocked
     * @param {Object} response - the response from the WWN API.
     * @param {Function} repeatRequest - A bound version of the invoking setup function, used to repeat the request
     * @param {Function} resolve - the resolution function to the promise for the public-function request interface
     * @param {Function} reject - the rejection function to the promise for the public-function request interface
     */
    _handleBlocked ( response, repeatRequest, resolve, reject ) {

        console.warn(
            "REJECTED DUE TO RATE LIMITATIONS: the WWN API has reported"
            , "that this client has reached its rate limits. Please retry this"
            , "request at a later date"
        );

        reject({
            error: NETWORK_ERROR_EVENTS.UNDER_RATE_LIMITS
            , response: response
        });
    }

    /**
     * Handles a not found response from a HTTP request (404). Will log the response
     * info and reject the associated promise.
     * @private
     * @memberof NestNetworkManager
     * @method _handleNotFound
     * @param {Object} response - the response from the WWN API.
     * @param {Function} repeatRequest - A bound version of the invoking setup function, used to repeat the request
     * @param {Function} resolve - the resolution function to the promise for the public-function request interface
     * @param {Function} reject - the rejection function to the promise for the public-function request interface
     */
    _handleNotFound ( response, repeatRequest, resolve, reject ) {

        console.warn(
            "NOT FOUND: the WWN API has reported that the requested path could"
            , "not be found"
        );

        reject({
            error: NETWORK_ERROR_EVENTS.PATH_NOT_FOUND
            , response: response
        });
    }

    /**
     * Handles an internal error response from a HTTP request (500). Will log
     * the response info and reject the associated promise.
     * @private
     * @memberof NestNetworkManager
     * @method _handleInternalAPIError
     * @param {Object} response - the response from the WWN API.
     * @param {Function} repeatRequest - A bound version of the invoking setup function, used to repeat the request
     * @param {Function} resolve - the resolution function to the promise for the public-function request interface
     * @param {Function} reject - the rejection function to the promise for the public-function request interface
     */
    _handleInternalAPIError ( response, repeatRequest, resolve, reject ) {

        console.error(
            "INTERNAL ERROR: the WWN API has reported an internal server error (500)"
            , "please review the request and re-attempt at a later point in time"
        );

        reject({
            error: NETWORK_ERROR_EVENTS.API_INTERNAL_ERROR
            , response: response
        });
    }

    /**
     * Handles an auth error response from a HTTP request (401). Will log
     * the response info, set the access token on the network manager instance
     * to NULL and reject the associated promise.
     * @private
     * @memberof NestNetworkManager
     * @method _handleAuthError
     * @param {Object} response - the response from the WWN API.
     * @param {Function} repeatRequest - A bound version of the invoking setup function, used to repeat the request
     * @param {Function} resolve - the resolution function to the promise for the public-function request interface
     * @param {Function} reject - the rejection function to the promise for the public-function request interface
     */
    _handleAuthError ( response, repeatRequest, resolve, reject ) {

        console.error(
            "AUTHENTICATION ERROR: the WWN API has reported that the provided"
            , "token is invalid, please set a valid token an retry the request"
        );

        this.removeToken();

        reject({
            error: NETWORK_ERROR_EVENTS.AUTH_ERROR
            , response: response
        });
    }

    /**
     * Handles an forbidden error response from a HTTP request (403). Will log
     * the response info and reject the associated promise.
     * @private
     * @memberof NestNetworkManager
     * @method _handleForbidden
     * @param {Object} response - the response from the WWN API.
     * @param {Function} repeatRequest - A bound version of the invoking setup function, used to repeat the request
     * @param {Function} resolve - the resolution function to the promise for the public-function request interface
     * @param {Function} reject - the rejection function to the promise for the public-function request interface
     */
    _handleForbidden ( response, repeatRequest, resolve, reject ) {

        console.error(
            "FORBIDDEN: the WWN API has reported that the provided"
            , "path is forbidden to this client. This request should not be repeated."
        );

        reject({
            error: NETWORK_ERROR_EVENTS.FORBIDDEN
            , response: response
        });
    }

    /**
     * Handles a service unavailable error response from a HTTP request (503).
     * Will log the response info and reject the associated promise.
     * @private
     * @memberof NestNetworkManager
     * @method _handleServiceUnavailable
     * @param {Object} response - the response from the WWN API.
     * @param {Function} repeatRequest - A bound version of the invoking setup function, used to repeat the request
     * @param {Function} resolve - the resolution function to the promise for the public-function request interface
     * @param {Function} reject - the rejection function to the promise for the public-function request interface
     */
    _handleServiceUnavailable ( response, repeatRequest, resolve, reject ) {

        console.error(
            "SERVICE UNAVAILABLE: the WWN API is not currently available"
            , "to service client requests, please retry at a later time."
        );

        reject({
            error: NETWORK_ERROR_EVENTS.SERVICE_UNAVAILABLE
            , response: response
        });
    }

    /**
     * Handles an invalid request error response from a HTTP request (400).
     * Will log the response info and reject the associated promise.
     * @private
     * @memberof NestNetworkManager
     * @method _handleServiceUnavailable
     * @param {Object} response - the response from the WWN API.
     * @param {Function} repeatRequest - A bound version of the invoking setup function, used to repeat the request
     * @param {Function} resolve - the resolution function to the promise for the public-function request interface
     * @param {Function} reject - the rejection function to the promise for the public-function request interface
     */
    _handleInvalidRequest ( response, repeatRequest, resolve, reject ) {

        console.error(
            "INVALID REQUEST: the WWN API has reported that the request"
            , "made by this client was not valid. Please revise this request"
            , "before repeating it."
        );

        var parsedResponseBody = {};

        try {

            parsedResponseBody = JSON.parse(response.body);
        } catch ( e ) {

            parsedResponseBody = {
                unableToParseAPIError: true
                , rawError: response.body
                , parsingError: e
            };
        }

        reject(parsedResponseBody);
    }

    /**
     * Handles the Nest OAUTH2 pin flow, requesting an access token from
     * the WWN API.
     * @public
     * @memberof NestNetworkManager
     * @method doOauth
     * @param {String} clientId
     * @param {String} clientSecret
     * @param {String} pinCode - the pin generated during the oauth flow from the WWN API
     * @returns {RSVP.Promise} - a promise that will be resolved or rejected after the OAuth process is finished
     */
    doOauth ( clientId, clientSecret, pinCode ) {

        return new RSVP.Promise (
            ( resolve, reject ) => {

                var options = {
                    url: "https://api.home.nest.com/oauth2/access_token"
                    , method: "POST"
                    , form: {
                        code: pinCode
                        , client_id: clientId
                        , client_secret: clientSecret
                        , grant_type: "authorization_code"
                    }
                };

                request(
                    options
                    , ( error, response, body ) => {
                        var parsedBody;

                        if ( error ) {
                            reject(error);

                            return ;
                        } else {
                            parsedBody = JSON.parse(body);
                            console.log(
                                "Successfully completed authorization flow");
                            this.setToken(parsedBody.access_token);
                            resolve({token: parsedBody.access_token});

                            return ;
                        }
                    }
                );
            }
        );
    }
}

/**
 * serviceStreamDataUpdate event, used to indicate that the network manager
 * has received an update from the WWN API.
 *
 * @event NestNetworkManager#serviceStreamDataUpdate
 * @type {NestServiceStreamEventContainer}
 */

/**
 * serviceStreamClosed event, used to indicate that the network manager
 * has had its REST stream closed.
 *
 * @event NestNetworkManager#serviceStreamClosed
*/

/**
 * authTokenRevoked event, used to indicate that the network manager
 * has had its authToken revoked, meaning its stream will also be closed (if applicable)
 *
 * @event NestNetworkManager#serviceStreamClosed
*/

module.exports = NestNetworkManager;
