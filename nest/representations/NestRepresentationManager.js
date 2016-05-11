// Copyright 2016 Google Inc.
// 
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
// 
//      http://www.apache.org/licenses/LICENSE-2.0
// 
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict';
// IMPORTS
const EventEmitter = require('events').EventEmitter;
const difference = require('lodash').difference;
const cloneDeep = require('lodash').cloneDeep;
const isObject = require('lodash').isObject;
const isEmpty = require('lodash').isEmpty;
const forEach = require('lodash').forEach;
const values = require('lodash').values;
const first = require('lodash').first;
const merge = require('lodash').merge;
const find = require('lodash').find;
const omit = require('lodash').omit;
const keys = require('lodash').keys;
const has = require('lodash').has;

const hydrated = 'hydrated';
const update = 'update';

/**
 * The representation manager deals with cache balancing and data storage for
 * devices and structures relative to the WWN API. The reprenstation manager is
 * meant to attach to a network manager instance and keep an accurate cache of
 * device/structure state.
 * @class NestRepresentationManager
 * @extends EventEmitter
 * @property {Object} EMITABLE_EVENTS - a map of events emitted by this class
 * @property {Object} localDeviceCache - a two-level map where deviceType is the first key and is object containing all related devices keyed by device id.
 * @property {Object} localStructureCache - a replica map of the structure output from the WWN API
 * @property {Boolean} hydrated - a boolean indicating whether or not the RepresentationManager has been 'hydrated' (inited) by a Network Manager.
 */
class NestRepresentationManager extends EventEmitter {

    /** @constructor */
    constructor ( ) {

        super();

        this.EMITABLE_EVENTS = {
            hydrated
            , update
        };
        this.localDeviceCache = {};
        this.localStructureCache = {};
        this.hydrated = false;
    };

    /**
     * Emits the hydrated event.
     * @private
     * @memberof NestRepresentationManager
     * @method _emitHydratedEvent
     * @fires NestRepresentationManager#hydrated
     */
    _emitHydratedEvent ( ) {

        super.emit(
            this.EMITABLE_EVENTS.hydrated
            , {
                devices: cloneDeep(this.localDeviceCache)
                , structures: cloneDeep(this.localStructureCache)
            }
        );
    }

    /**
     * Emits the update event.
     * @private
     * @memberof NestRepresentationManager
     * @method _emitUpdateEvent
     * @fires NestRepresentationManager#update
     */
    _emitUpdateEvent ( ) {

        super.emit(
            this.EMITABLE_EVENTS.update
            , {
                devices: cloneDeep(this.localDeviceCache)
                , structures: cloneDeep(this.localStructureCache)
            }
        );
    }

    /**
     * Adds the given function as a listener to the hydrated event.
     * @public
     * @memberof NestRepresentationManager
     * @method addHydratedListener
     * @param {Function} fnCallback - the function to be called when the event is emitted.
     * @returns {NestRepresentationManager} - the representation manager instance so that calls can be chained
     */
    addHydratedListener ( callbackFn ) {

        super.on(
            this.EMITABLE_EVENTS.hydrated
            , callbackFn
        );

        if ( this.hydrated === true ) {

            callbackFn( this.localDeviceCache );
        }

        return this;
    }

    /**
     * Adds the given function as a listener to the update event.
     * @public
     * @memberof NestRepresentationManager
     * @method addUpdateListener
     * @param {Function} fnCallback - the function to be called when the event is emitted.
     * @returns {NestRepresentationManager} - the representation manager instance so that calls can be chained
     */
    addUpdateListener ( callbackFn ) {

        super.on(
            this.EMITABLE_EVENTS.update
            , callbackFn
        );

        return this;
    }

    /**
     * Removes the given function as a listener to the hydrated event.
     * @public
     * @memberof NestRepresentationManager
     * @method removeHydratedListener
     * @param {Function} fnCallback - the function to be removed from the event emission callback chain
     * @returns {NestNetworkManager} - the representation manager instance so that calls can be chained
     */
    removeHydratedListener ( callbackFn ) {

        super.removeListener(
            this.EMITABLE_EVENTS.hydrated
            , callbackFn
        );
    }

    /**
     * Removes the given function as a listener to the update event.
     * @public
     * @memberof NestRepresentationManager
     * @method removeUpdateListener
     * @param {Function} fnCallback - the function to be removed from the event emission callback chain
     * @returns {NestNetworkManager} - the representation manager instance so that calls can be chained
     */
    removeUpdateListener ( callbackFn ) {

        super.removeListener(
            this.EMITABLE_EVENTS.update
            , callbackFn
        );
    }

    /**
     * Returns the device cache
     * @public
     * @memberof NestRepresentationManager
     * @method getAllDevices
     * @returns {Object} - a copy of the instances localDeviceCache property
     */
    getAllDevices ( ) {

        return cloneDeep(this.localDeviceCache);
    }

    /**
     * Returns the structure cache
     * @public
     * @memberof NestRepresentationManager
     * @method getAllStructures
     * @returns {Object} - a copy of the instances localStructureCache property
     */
    getAllStructures ( ) {

        return cloneDeep(this.localStructureCache);
    }

    /**
     * Searches for a device in the local cache on the 'name' property. If
     * multiple devices are found with the same name the function will return
     * an array of these devices, otherwise it will return just the singular
     * device object if only one result is found or will return null if a device
     * cannot be found in the cache under the given name.
     * @public
     * @memberof NestRepresentationManager
     * @method getDeviceByName
     * @param {String} stringName - the string to search with
     * @returns {Array<Object>|Object|Null} - An array of devices if multiple instances are found,
     *  a singular device object if only one is found or null if no matches are found
     */
    getDeviceByName ( stringName ) {

        var results = [];

        forEach(
            this.localDeviceCache
            , function ( deviceTypeMap, deviceType ) {

                var mapValues = values(deviceTypeMap);
                var isInMap = find( mapValues, { name: stringName } );

                if ( isInMap ) {

                    results.push( cloneDeep(isInMap) );
                }
            }
        );

        if ( results.length === 0 ) {

            return null;
        } else if ( results.length === 1 ) {

            return first(results);
        }

        return results;
    }

    /**
     * Searches for a device in the local cache based on the device id. Will
     * only return null if a device cannot be found with the given id; will
     * otherwise return the device object if found.
     * @public
     * @memberof NestRepresentationManager
     * @method getDeviceById
     * @param {String} stringId - the string to search with
     * @returns {Object|Null} - The device object if a match if found, otherwise Null indicating a match could not be found.
     */
    getDeviceById ( stringId ) {

        var returnValue = null;

        forEach(
            this.localDeviceCache
            , function ( deviceTypeMap, deviceType ) {

                var mapValues = values(deviceTypeMap);
                var isInMap = find( mapValues, { device_id: stringId } );

                if ( isInMap ) {

                    returnValue = cloneDeep(isInMap);
                }

                return false;
            }
        );

        return returnValue;
    }

    /**
     * Handler for the NestNetworkManager serviceStreamDataUpdate event emission.
     * Will initiate cache balancing when the event is received. During the first
     * execution will emit the 'hydrated' event on the instance, indicating that
     * the instance has data and is ready to be queried.
     * @public
     * @memberof NestRepresentationManager
     * @method handleNetworkManagerStreamUpdate
     * @param {module:NestNetworkManager~event:serviceStreamDataUpdate} updateObject - a serviceStreamDataUpdate event
     * @listens module:NestNetworkManager~event:serviceStreamDataUpdate
     * @fires NestRepresentationManager#hydrated
     */
    handleNetworkManagerStreamUpdate ( updateObject ) {
        console.info("Handling network stream update", updateObject);

        this._balanceDeviceCacheAgainstUpstream( updateObject );
        this._balanceStructureCacheAgainstUpstream( updateObject );

        if ( this.hydrated === false ) {

            this.hydrated = true;
            this._emitHydratedEvent();
        } else {

            this._emitUpdateEvent();
        }
    }


    _balanceStructureCacheAgainstUpstream ( updateObject ) {

        if ( !isObject(updateObject)
            || !has( updateObject, [ "body", "data", "structures" ] ) ) {

            // the update does not have any devices to update against; defer

            return ;
        } else if ( isEmpty( updateObject.body.data.structures ) ) {

            // reset the cache
            this.localStructureCache = {};

            return ;
        }

        var upstreamStructures = updateObject.body.data.structures;
        var newLocalStructureCache = cloneDeep(this.localStructureCache);

        newLocalStructureCache = omit(
            newLocalStructureCache
            , difference(
                keys(newLocalStructureCache)
                , keys(upstreamStructures)
            )
        );

        this.localStructureCache = merge(
            {}
            , newLocalStructureCache
            , upstreamStructures
        );
    }

    /**
     * Takes a PUT stream event container and attempts to balance the local
     * device cache against the upstream data emission. If the upstream data
     * emission is applicable the function will set the instances
     * localDeviceCache property to the newly balanced cache.
     * @private
     * @memberof NestRepresentationManager
     * @method _balanceDeviceCacheAgainstUpstream
     * @param {NestServiceStreamEventContainer} updateObject - an instance of the NestServiceStreamEventContainer class
     */
    _balanceDeviceCacheAgainstUpstream ( updateObject ) {

        if ( !isObject(updateObject)
            || !has( updateObject, [ "body", "data", "devices" ] ) ) {

            // the update does not have any devices to update against; defer

            return ;
        } else if ( isEmpty(updateObject.body.data.devices) ) {

            // reset the cache
            this.localDeviceCache = {};

            return ;
        }

        var upstreamDevices = updateObject.body.data.devices;
        var newLocalCache = cloneDeep(this.localDeviceCache);

        // first balance at the top-level since going from 1 device of x type
        // to no devices of x type removes the device type key in the map itself.
        newLocalCache = omit(
            newLocalCache
            , difference(
                 keys(newLocalCache)
                , keys(upstreamDevices)
            )
        );

        forEach(
            upstreamDevices
            , function ( deviceCategoryMap, deviceTypeKey ) {

                var representationKeysToRemove = [];
                var representationKeysToAdd = [];
                var representationKeysTheSame = [];

                // when the upstream goes from zero to at least one of a type of
                // device then the key will be "new" and require initing
                if ( !has( newLocalCache, deviceTypeKey ) ) {

                    newLocalCache[deviceTypeKey] = {};
                }

                // second, find and remove cached info that belongs to devices
                // that no longer exist in the upstream pool
                representationKeysToRemove = difference(
                    keys( newLocalCache[deviceTypeKey] )
                    , keys( deviceCategoryMap )
                );
                newLocalCache[deviceTypeKey] = omit(
                    newLocalCache[deviceTypeKey]
                    , representationKeysToRemove
                );

                forEach(
                    newLocalCache[deviceTypeKey]
                    , function ( deviceValue, deviceKey ) {

                        if ( has(deviceCategoryMap, deviceKey) ) {

                            newLocalCache[deviceTypeKey][deviceKey] = merge(
                                {}
                                , newLocalCache[deviceTypeKey][deviceKey]
                                , deviceCategoryMap[deviceKey]
                            );
                        }
                    }
                )

                // lastly, find all representations that may have newly appeared
                // in the upstream pool and store that info
                representationKeysToAdd = difference(
                    keys( deviceCategoryMap )
                    , keys( newLocalCache[deviceTypeKey] )
                );

                for ( var i = 0; i < representationKeysToAdd.length; i++ ) {

                    newLocalCache[deviceTypeKey]
                        [representationKeysToAdd[i]] = cloneDeep(
                            deviceCategoryMap[representationKeysToAdd[i]]
                    );

                    newLocalCache[deviceTypeKey][representationKeysToAdd[i]]._deviceType = deviceTypeKey;
                }
            }
        );

        this.localDeviceCache = newLocalCache;
    }
}

/**
 * hydrated event, used to indicate that the representation manager
 * has received its first stream update from a network manager.
 *
 * @event NestRepresentationManager#hydrated
 * @type {Object} - an object containing the stucture and device cache of the instance
 */

 /**
  * update event, used to indicate that the representation manager
  * has received a stream update from a network manager.
  *
  * @event NestRepresentationManager#update
  * @type {Object} - an object containing the stucture and device cache of the instance
  */

module.exports = NestRepresentationManager;
