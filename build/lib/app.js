require=(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var util = require("util")
  , events = require("events")
  , RSVP = require('rsvp')
  , Promise = RSVP.Promise
  , Repository = require('./repository');

// Adapter
//    .resource( 'card', ModelFactory.constructor )
//    .schema( ModelFactory.schema )
//    .validator( ModelFactory.validator )
//    .beforeCreate( onBeforeCreate )         // function returns data to succeed, returns falsey to fail
//    .beforeUpdate( onBeforeUpdate );        // function returns data to succeed, returns falsey to fail
//
//  Adapter.create( 'card', data ).then( done, fail );
//  Adapter.update( 'card', data ).then( done, fail );
//  Adapter.delete( 'card', id ).then( done, fail );
//  Adapter.find( 'card', id ).then( done, fail );
//  Adapter.findMany( 'card', query || [ id ] ).then( done, fail );
//  Adapter.findAll( 'card' ).then( done, fail );

// public interface

function Adapter( dbname, options ) {
    this._repository = new Repository( dbname, options );

    events.EventEmitter.call(this);
}

util.inherits( Adapter, events.EventEmitter );

Adapter.prototype.constructor = Adapter;

Adapter.prototype._factories = {};
Adapter.prototype._validators = {};
Adapter.prototype._beforeCreate = {};
Adapter.prototype._beforeUpdate = {};

Adapter.prototype.resource = function( schema, factory ) {
    if (!factory) {
        if (!this._context) throw new Error( 'No schema name defined in context' );

        factory = schema;
        schema = this._context;
    }

    this._factories[schema] = factory;

    this._context = schema;

    return this;
};

Adapter.prototype.schema = function( schema, definition ) {
    if (!definition) {
        if (!this._context) throw new Error( 'No schema name defined in context' );

        definition = schema;
        schema = this._context;
    }

    this._repository.schema( schema, definition, true );

    this._context = schema;

    return this;
};

Adapter.prototype.validator = function( schema, validator ) {
    if (!validator) {
        if (!this._context) throw new Error( 'No schema name defined in context' );

        validator = schema;
        schema = this._context;
    }

    this._validators[schema] = validator;

    this._context = schema;

    return this;
};

Adapter.prototype.beforeCreate = function( schema, transform ) {
    if (!transform) {
        if (!this._context) throw new Error( 'No schema name defined in context' );

        transform = schema;
        schema = this._context;
    }

    this._beforeCreate[schema] = this._beforeCreate[schema] || [];
    this._beforeCreate[schema].push(transform);

    this._context = schema;

    return this;
};

Adapter.prototype.beforeUpdate = function( schema, transform ) {
    if (!transform) {
        if (!this._context) throw new Error( 'No schema name defined in context' );

        transform = schema;
        schema = this._context;
    }

    this._beforeUpdate[schema] = this._beforeUpdate[schema] || [];
    this._beforeUpdate[schema].push(transform);

    this._context = schema;

    return this;
};

Adapter.prototype.create = function( schema, data ) {
    var _this = this
      , validator = _this._validators[schema]( data );

    if ( !validator.validForCreate ) {
        _this.emit( schema + ':createfail', {
            id: data.id,
            err: new Error( validator.issues.join(', ') )
        });

        return;
    }

    return this._repository
        .create( schema, _onBeforeTransforms( _this._beforeCreate[schema], data ) )
        .then( _this._factories[schema] )
        .then(function( doc ) {
              _this.emit( schema + ':created', doc );

              return doc;
        })
        .catch(function( err ) {
              _this.emit( schema + ':createfail', {
                  id: data._id,
                  err: err
              });
        });
};

Adapter.prototype.update = function( schema, data ) {
    var _this = this
      , validator = _this._validators[schema]( data );

    if ( !validator.validForUpdate ) {
        _this.emit( schema + ':updatefail', {
            id: data.id,
            err: new Error( validator.issues.join(', ') )
        });

        return;
    }

    return this._repository
        .update( schema, _onBeforeTransforms( _this._beforeUpdate[schema], data ) )
        .then( _this._factories[schema] )
        .then(function( doc ) {
              _this.emit( schema + ':updated', doc );

              return doc;
        })
        .catch(function( err ) {
              _this.emit( schema + ':updatefail', {
                  id: data._id,
                  err: err
              });
        });
};

Adapter.prototype.delete = function( schema, id ) {
    var _this = this;

    return this._repository
        .delete( schema, id )
        .then(function( doc ) {
              _this.emit( schema + ':deleted', doc );

              return doc;
        })
        .catch(function( err ) {
              _this.emit( schema + ':deletefail', {
                  id: data._id,
                  err: err
              });
        });
};

Adapter.prototype.find = function( schema, id ) {
    var _this = this;

    return this._repository
        .find( schema, id )
        .then( _this._factories[schema] );
};

Adapter.prototype.findMany = function( schema, ids ) {
    var _this = this;

    return this._repository
        .findMany( schema, ids )
        .then(function( resources ) {
            return resources.map(function( resource ) {
                return new _this._factories[schema]( resource );
            });
        });
};

Adapter.prototype.findAll = function( schema ) {
    return this.findMany( schema );
};

// private methods

function _onBeforeTransforms( transforms, data ) {
    transforms
        .forEach(function( transform ) {
            data = transform( data );
        });

    return data;
}

module.exports = Adapter;

},{"./repository":3,"events":8,"rsvp":74,"util":12}],2:[function(require,module,exports){

/*
  TODO: if model had access to the shema it could store optimised views for quickly finding related documents

  view key could be [ PROPERTY_NAME, RELATED_DOC_ID, DOC_ID ]
*/

function _docMatchesQuery( doc, query ) {
    for (var key in query) {
        if (!doc.hasOwnProperty( key ) || doc[ key ] !== query[ key ]) return false;
    }

    return true;
}

function Model( db, name ) {
    this._db = db;
    this._name = name;
}

Model.prototype = {

    constructor: Model

  , post: function( data, cb /* error, resource */ ) {
        var model = this;

        data.doctype = this._name;

        model._db.post( data, function( err, info ) {
            if ( err && err.message ) {
                return cb( new Error( err.message ) );
            }

            cb( undefined, info );
        });
    }

  , postMany: function( updates, cb ) {
        this.putMany( updates, cb );
    }

  , put: function( update, id, cb /* error */ ) {
        if ( typeof id === 'function' ) {
            cb = id;
            id = update.id;
        }

        var model = this;

        update.doctype = model._name;

        model._db.put( update, id, update._rev, onComplete);

        function onComplete( err, info ) {
            if ( err && err.message ) {
                return cb( new Error( err.message ) );
            }

            cb( undefined, info );
        }
    }

  , putMany: function( updates, cb ) {
        var model = this;

        updates.forEach(function( update ) {
            update.doctype = model._name;
        });

        model._db.bulkDocs( updates, onComplete);

        function onComplete( err, info ) {
            if ( err && err.message ) {
                return cb( new Error( err.message ) );
            }

            cb( undefined, info );
        }
    }

  , remove: function( id, rev, cb /* error */ ) {
        if ( typeof rev === 'function' ) {
          cb = rev;
          rev = id._rev;
          id = id._id;
        }

        var model = this;

        model._db.remove( id, rev, onComplete);

        function onComplete( err, info ) {
            if ( err && err.message ) {
                return cb( new Error( err.message ) );
            }

            cb( undefined, info );
        }
    }

  , get: function( id, cb /* error, resource */ ) {
        var model = this;

        model._db.get( id, onComplete);

        function onComplete( err, resource ) {
            if ( err && err.message ) {
                return cb( new Error( err.message ) );
            }

            cb( undefined, resource );
        }
    }

  , query: function( mapObj, options, cb /* error, resource */ ) {
        if ( typeof options === 'function' ) {
          cb = options;
          options = {};
        }

        var model = this;

        options.include_docs = true;

        var mapQuery = {
            map: function( doc, emit ) {
                if ( doc.doctype === model._name ) {
                    mapObj.map( doc, emit );
                }
            }
        };

        model._db.query( mapQuery, { include_docs: true }, onComplete );

        function onComplete( err, response ) {
            if ( err && err.message ) {
                return cb( new Error( err.message ) );
            }

            if ( response.total_rows === 0 ) {
                return cb( undefined, [] );
            }

            cb( undefined, response.rows.map(function( row ) { return row.doc; }) );
        }
    }

  , firstDoc: function( query, cb /* error, resource */ ) {
        var model = this;

        model.allDocs( query, onComplete);

        function onComplete( err, response ) {
            if ( err ) return cb( err );

            if ( response.length ) {
                cb( undefined, response[0] );
            }
        }
    }

  , allDocs: function( query, cb /* error, resources */ ) {
        var model = this;

        if ( Array.isArray(query.keys) ) {
            model._db
                .allDocs({ keys: query.keys, include_docs: true }, function( err, response ) {
                    if ( err && err.message ) {
                        return cb( new Error( err.message ) );
                    }

                    onComplete( err, response );
                });

            return;
        }

        var map = {
            map: function( doc, emit ) {
                if ( doc.doctype === model._name && _docMatchesQuery( doc, query ) ) {
                    emit();
                }
            }
        };

        model.query( map, onComplete );

        function onComplete( err, response ) {
            if ( err ) return cb( err );

            if ( Array.isArray(response) ) return cb( undefined, response );

            if ( response.total_rows === 0 ) return cb( undefined, [] );

            cb( undefined, response.rows.map(function( row ) { return row.doc; }) );
        }
    }

};

module.exports = Model;

},{}],3:[function(require,module,exports){
var util = require("util")
  , events = require("events")
  , PouchDB = require('pouchdb')
  , RSVP = require('rsvp')
  , Promise = RSVP.Promise
  , Model = require('./model');

// Repository
// Follows the interface for the fortuneJS library adapters in an attempt to provide additional db options easily

function Repository( dbname, options ) {
    if ( typeof dbname !== 'string' ) {
        throw new Error( 'dbname must be provided' );
    }

    options = options || {};
    options.dbname = dbname;

    this._init( options );
}

util.inherits( Repository, events.EventEmitter );

Repository.prototype.constructor = Repository;

Repository.prototype._models = {};
Repository.prototype._schemas = {};
Repository.prototype._options = {};

Repository.prototype._init = function( options ) {
    for (var key in options) {
        if (key === 'dbname' || !options.hasOwnProperty(key)) continue;

        this._options[key] = options[key];
    }

    this.db = new PouchDB( options.dbname, this._options );

    _watchForChanges.call( this, {
        include_docs: true
      , since: 'now'
      , live: true
    });

    events.EventEmitter.call(this);
};

Repository.prototype.schema = function( name, schema, alsoCreateModel ) {
    for( var key in schema ) {
        var value = schema[ key ]
          , obj = {}
          , isArray = Array.isArray( value );

        value = isArray ? value[0] : value;

        var isObject = _isObject( value )
          , ref = isObject ? value.ref : value
          , inverse = isObject ? value.inverse : undefined;

        // Convert string to association object
        if ( typeof ref === 'string' ) {
            obj.ref = ref;
            obj.inverse = inverse;
            schema[ key ] = isArray ? [ obj ] : obj;
        }

        // Wrap native type in object
        if ( typeof value === 'function' ) {
            schema[ key ] = isArray ? [{ type: schema[ key ] }] : { type: schema[ key ] };
        }

    }

    this._schemas[ name ] = schema;

    if (alsoCreateModel) this.model( name, schema );

    return schema;
};

Repository.prototype.model = function( name, schema ) {
    var model;

    if ( schema ) {
        model = new Model( this.db, name );

        this._models[ name ] = model;
    } else {
        model = this._models[ name ];

        if (!model) throw new Error( 'Schema ['+name+'] not registered.' );
    }

    return model;
};

// TODO: array of updates should invoke postMany

Repository.prototype.create = function( model, id, resource ) {
    var _this = this;

    if (!resource) {
        resource = id;
    } else {
        resource.id = id;
    }

    model = typeof model === 'string' ? this.model( model ) : model;
    resource = _serialize.call( _this, model, resource );

    return new Promise(function ( resolve, reject ) {
        model.post( resource, function ( error, info ) {
            if (error) return reject(error);

            resource._id = info.id;
            resource._rev = info.rev;

            _handleWrite.call( _this, model, resource, error, resolve, reject );
        });
    });
};

// TODO: array of updates should invoke putMany

Repository.prototype.update = function( model, id, update ) {
    var _this = this;

    if (!update) {
        update = id;
    } else {
        update.id = id;
    }

    id = update.id;

    model = typeof model === 'string' ? this.model( model ) : model;
    update = _serialize.call( _this, model, update);

    return new Promise(function (resolve, reject) {
        // have to do a get to find the latest revision
        model.get( id, function( err, resource ) {
            if ( err ) return cb( err );

            update._id = id;
            update._rev = resource._rev;

            model.put( update, function (error, info) {
                if (error) return reject(error);

                update._rev = info.rev;

                _handleWrite.call( _this, model, update, error, resolve, reject );
            });
        });
    });
};

// TODO: array of ids should invoke removeMany

Repository.prototype.delete = function( model, id ) {
    var _this = this;

    model = typeof model === 'string' ? this.model(model) : model;

    return new Promise(function ( resolve, reject ) {
        model.get(id, function ( error, resource ) {
            if (error || !resource) return reject(error);

            resource = _dissociate.call( _this, model, resource );

            model.remove( resource, function ( error ) {
                _handleWrite.call( _this, model, resource, error, resolve, reject );
            });
        });
    });
};

Repository.prototype.find = function( model, query ) {
    var _this = this
      , method = typeof query != 'object' ? 'get' : 'firstDoc';

    model = typeof model == 'string' ? this.model(model) : model;

    return new Promise(function (resolve, reject) {
        model[method](query, function (error, resource) {
                if (error || !resource) return reject(error);

                resolve( _deserialize.call( _this, model, resource) );
            });
    });
};

Repository.prototype.findMany = function( model, query ) {
    var _this = this;

    if ( Array.isArray(query) ) {
        query = query.length ? { keys: query } : {};
    } else if (!query) {
        query = {};
    }

    model = typeof model === 'string' ? this.model(model) : model;

    return new RSVP.Promise(function (resolve, reject) {
        model.allDocs( query, function (error, resources) {
            if (error) return reject(error);

            resources = resources.map(function (resource) {
                return _deserialize.call( _this, model, resource);
            });

            resolve(resources);
        });
    });
};


// private methods

function _watchForChanges(options ) {
    var _this = this;

    _this.db.changes( options )
        .on('create', function( ev ) {
            var doc = ev.doc;
            _this.emit( doc.doctype + ':created', doc );
        })
        .on('update', function( ev ) {
            var doc = ev.doc;
            _this.emit( doc.doctype + ':updated', doc );
        })
        .on('delete', function( ev ) {
            var doc = ev.doc;
            _this.emit( doc.doctype + ':deleted', doc );
        });
}

function _handleWrite( model, resource, error, resolve, reject ) {
    var _this = this;

    if (error || !resource) return reject(error);

    _updateRelationships
        .call( this, model, resource)
        .then(function (resource) {
            resolve( _deserialize.call( _this, model, resource ) );
        }, reject);
}

function _serialize( model, resource ) {
    // setting ID is not allowed
    if (resource.hasOwnProperty('id')) {
        delete resource.id;
    }
    if (resource.hasOwnProperty('_id')) {
        delete resource._id;
    }
    // setting rev is not allowed
    if (resource.hasOwnProperty('rev')) {
        delete resource.rev;
    }
    if (resource.hasOwnProperty('_rev')) {
        delete resource._rev;
    }
    // setting doctype is not allowed
    if (resource.hasOwnProperty('doctype')) {
        delete resource.doctype;
    }

    // flatten links
    if (resource.hasOwnProperty('links') && typeof resource.links === 'object') {
        for ( var key in resource.links ) {
            resource[key] = resource.links[key];
        }

        delete resource.links;
    }

    return _scrubResource.call( this, model, resource );
}

function _deserialize( model, resource ) {
    var json = {}
      , schema = this._schemas[ model._name ];

    json.id = resource._id;
    json.rev = resource._rev;

    var relations = [];
    for ( var key in schema ) {
        if (key === '_id') continue;

        var value = schema[key];

        json[key] = resource[key];

        if (Array.isArray(value) ? value[0].ref : value.ref) {
            relations.push(key);
        }
    }

    if (relations.length) {
        var links = {}
          , linksAdded = false;

        relations.forEach(function (relation) {
            if ( Array.isArray(json[relation]) ? json[relation].length : json[relation] ) {
                links[relation] = json[relation];
                linksAdded = true;
            }

            delete json[relation];
        });

        if ( linksAdded ) {
            json.links = links;
        }
    }

    return json;
}

function _scrubResource( model, resource ) {
    var json = {};

    var schema = this._schemas[ model._name ];

    for (var key in schema ) {
        if (!resource.hasOwnProperty(key)) continue;

        var value = schema[key]
          , type = value.type
          , typeString = type ? typeCheck(type) : ''
          , ref = Array.isArray(value) ? value[0].ref : value.ref;

        if (type && !ref) {
            json[key] = type(resource[key]);

            if (typeString === 'date') {
                json[key] = new Date(resource[key]);
            } else if (typeString === 'array' || typeString === 'object') {
                json[key] = typeof resource[key] === 'object' ? resource[key] : null;
            }
        } else if (ref) {
            json[key] = resource[key];
        }
    }

    return json;

    function typeCheck (fn) {
        return Object.prototype.toString.call(new fn(''))
            .slice(1, -1).split(' ')[1].toLowerCase();
    }
}

function _updateRelationships( model, resource ) {
    var _this = this
      , schema = this._schemas[ model._name ]
      , references = _getSchemaFields( schema, function( obj, schema ) { return ( typeof obj === 'object' && obj.hasOwnProperty('ref') ); })
      , promises = [];

    references
        .forEach(function( reference ) {
            if (reference.inverse !== undefined && !reference.inverse) {
                return;
            }

            var relatedModel = _this._models[ reference.model ]
              , relatedSchema = _this._schemas[ reference.model ];

            // Get fields on the related model that reference this model
            if (typeof reference.inverse === 'string') {
                var inverted = {};

                inverted[ reference.inverse ] = relatedSchema[ reference.inverse ];
                relatedSchema = inverted;
            }

            var fields = _getSchemaFields( relatedSchema, function( obj, schema ) { return (typeof obj === 'object' && obj.ref === model._name ); });

            fields
                .forEach(function( field ) {
                    // One-to-one
                    if ( reference.singular && field.singular ) {
                        return promises.push( _updateOneToOne.call( _this, relatedModel, resource, reference, field ) );
                    }
                    // One-to-many
                    if ( reference.singular && !field.singular ) {
                        return promises.push( _updateOneToMany.call( _this, relatedModel, resource, reference, field ) );
                    }
                    // Many-to-one
                    if ( !reference.singular && field.singular ) {
                        return promises.push( _updateManyToOne.call( _this, relatedModel, resource, reference, field ) );
                    }
                    // Many-to-many
                    if ( !reference.singular && !field.singular ) {
                        return promises.push( _updateManyToMany.call( _this, relatedModel, resource, reference, field ) );
                    }
                });
        });

    return new Promise(function (resolve, reject) {
        RSVP.all(promises)
            .then(function () {
                resolve( resource );
            }, function ( errors ) {
                reject( errors );
            });
    });
}

function _getSchemaFields( schema, isValid ) {
    var fields = [];

    for (var key in schema ) {
        var value = schema[ key ]
          , singular = !Array.isArray( value )
          , obj = singular ? value : value[0];

        if ( isValid( obj ) ) {
            fields.push({
                path: key,
                model: obj.ref,
                singular: singular,
                inverse: obj.inverse
            });
          }
    }

    return fields;
}



function _updateOneToOne( relatedModel, resource, reference, field ) {
    var _this = this
      , options = { reduce: false, include_docs: true }
      , dissociate = function( related, emit ) {
            // looking for related document that is set
            if ( related[ field.path ] === resource._id ) {
                emit( related );
            }
        };

    return new Promise(function (resolve, reject) {
        relatedModel
            .query({ map: dissociate }, options, function ( error, responses ) {
                if (error) return reject(error);

                if (!responses.length) return resolve();

                _unsetSingleDocs
                    .call( _this, responses, relatedModel, reference, field, resource )
                    .then( resolve )
                    .catch( reject );
            });
    })
    .then(function() {
        if ( resource[ reference.path ] ) {
            return new Promise(function (resolve, reject) {
                // have to do a get to find the latest revision
                relatedModel.get( resource[ reference.path ], function( error, response ) {
                    if ( error ) return reject( error );

                    var update = _setSingleDoc.call( _this, response, relatedModel, reference, field, resource );

                    relatedModel.put( update, response._id, function( error, info ) {
                        if ( error ) return reject( error );

                        resolve();
                    });
                });
            });
        }
    });
}


function _updateOneToMany( relatedModel, resource, reference, field ) {
      var _this = this
        , options = { reduce: false, include_docs: true }
        , dissociate = function( doc, emit ) {
            if ( doc[ field.path ] !== undefined && ~doc[ field.path ].indexOf( resource._id ) ) {
                emit( doc );
            }
        };

      return new Promise(function (resolve, reject) {
          relatedModel
              .query({ map: dissociate }, options, function ( error, responses ) {
                  if (error) return reject(error);

                  if (!responses.length) return resolve();

                  _removeFromManyDocs
                      .call( _this, responses, relatedModel, reference, field, resource )
                      .then( resolve )
                      .catch( reject );
              });
      })
      .then(function() {
          if ( resource[ reference.path ] ) {
              return new Promise(function (resolve, reject) {
                  // have to do a get to find the latest revision
                  relatedModel.get( resource[ reference.path ], function( error, response ) {
                      if ( error ) return reject( error );

                      var update = _addSingleDoc.call( _this, response, relatedModel, reference, field, resource );

                      relatedModel.put( update, response._id, function( error, info ) {
                          if ( error ) return reject( error );

                          resolve();
                      });
                  });
              });
          }
      });
}

function _updateManyToOne( relatedModel, resource, reference, field ) {
    var _this = this
      , options = { reduce: false, include_docs: true }
      , dissociate = function( doc, emit ) {
          if ( doc[ field.path ] === resource._id ) {
              emit( doc );
          }
      };

    return new Promise(function (resolve, reject) {
        relatedModel
            .query({ map: dissociate }, options, function ( error, responses ) {
                if ( error ) return reject( error );

                if (!responses.length) return resolve();

                _unsetSingleDocs
                    .call( _this, responses, relatedModel, reference, field, resource )
                    .then( resolve )
                    .catch( reject );
            });
    })
    .then(function() {
        if ( resource[ reference.path ] ) {
            return new Promise(function (resolve, reject) {
                relatedModel.allDocs({ keys: resource[ reference.path ], include_docs: true }, function ( error, responses ) {
                    if ( error ) return reject( error );

                    if (!responses.length) return resolve();

                    var updates = _applyToManyDocs.call( _this, _setSingleDoc, responses, relatedModel, reference, field, resource );

                    return relatedModel.putMany( updates, function( error, info ) {
                        if ( error ) return reject( error );

                        resolve();
                    });
                });
            });
        }
    });
}

function _updateManyToMany( relatedModel, resource, reference, field ) {
    var _this = this
      , options = { reduce: false, include_docs: true }
      , dissociate = function( doc, emit ) {
          if ( doc._id === resource._id || doc[ field.path ] === undefined ) return;

          var docIsLinked = doc[ field.path ].indexOf( resource._id ) >= 0;
          var resourceIsNoLongerLinked = ( resource[ reference.path ] === undefined || resource[ reference.path ].indexOf( doc._id ) < 0 );

          if ( docIsLinked && resourceIsNoLongerLinked ) emit( doc );
      };

    return new Promise(function (resolve, reject) {
        relatedModel
            .query({ map: dissociate }, options, function ( error, responses ) {
                if ( error ) return reject( error );

                if (!responses.length) return resolve();

                _removeFromManyDocs
                    .call( _this, responses, relatedModel, reference, field, resource )
                    .then( resolve )
                    .catch( reject );
            });
    })
    .then(function() {
        if ( resource[ reference.path ] ) {
            return new Promise(function (resolve, reject) {
                relatedModel.allDocs({ keys: resource[ reference.path ], include_docs: true }, function ( error, responses ) {
                    if ( error ) return reject( error );

                    if (!responses.length) return resolve();

                    var updates = _applyToManyDocs.call( _this, _addSingleDoc, responses, relatedModel, reference, field, resource );

                    return relatedModel.putMany( updates, function( error, info ) {
                        if ( error ) return reject( error );

                        resolve();
                    });
                });
            });
        }
    });
}

function _unsetSingleDocs( rows, relatedModel, reference, field, resource ) {
    var _this = this;

    return new Promise(function ( resolve, reject ) {
        var updates = rows.map(function( doc ) {
                doc[ field.path ] = undefined;

                return doc;
            });

        return relatedModel.putMany( updates, function( error, info ) {
            if ( error ) return reject( error );

            resolve();
        });
    });
}

function _removeFromManyDocs( rows, relatedModel, reference, field, resource ) {
    var _this = this;

    return new Promise(function ( resolve, reject ) {
        var updates = rows.map(function( doc ) {
                doc[ field.path ].splice( doc[ field.path ].indexOf( resource._id ), 1 );

                if ( doc[ field.path ].length <= 0 ) {
                    doc[ field.path ] = undefined;
                }

                return doc;
            });

        return relatedModel.putMany( updates, function( error, info ) {
            if ( error ) return reject( error );

            resolve();
        });
    });
}

function _applyToManyDocs( fun, rows, relatedModel, reference, field, resource ) {
    return rows.map(function( doc ) {
        return fun( doc, relatedModel, reference, field, resource );
    });
}

function _setSingleDoc( doc, relatedModel, reference, field, resource ) {
    doc[ field.path ] = resource._id;

    return doc;
}

function _addSingleDoc( doc, relatedModel, reference, field, resource ) {
    doc[ field.path ] = doc[ field.path ] || [];

    if ( doc[ field.path ].indexOf( resource._id ) < 0 ) {
        doc[ field.path ].push( resource._id );
    }

    return doc;
}

function _dissociate( model, resource ) {
  var schema = this._schemas[model._name];
  for ( var key in schema ) {
      var value = schema[key];

      if ( Array.isArray(value) ? value[0].ref : value.ref ) {
          resource[key] = null;
      }
  }

  return resource;
}

// util methods

function _isObject( o ) {
    return typeof o === "object" && o.constructor === Object && o !== null;
}

module.exports = Repository;

},{"./model":2,"events":8,"pouchdb":36,"rsvp":74,"util":12}],4:[function(require,module,exports){

},{}],5:[function(require,module,exports){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */

var base64 = require('base64-js')
var ieee754 = require('ieee754')

exports.Buffer = Buffer
exports.SlowBuffer = Buffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192

/**
 * If `Buffer._useTypedArrays`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (compatible down to IE6)
 */
Buffer._useTypedArrays = (function () {
  // Detect if browser supports Typed Arrays. Supported browsers are IE 10+, Firefox 4+,
  // Chrome 7+, Safari 5.1+, Opera 11.6+, iOS 4.2+. If the browser does not support adding
  // properties to `Uint8Array` instances, then that's the same as no `Uint8Array` support
  // because we need to be able to add all the node Buffer API methods. This is an issue
  // in Firefox 4-29. Now fixed: https://bugzilla.mozilla.org/show_bug.cgi?id=695438
  try {
    var buf = new ArrayBuffer(0)
    var arr = new Uint8Array(buf)
    arr.foo = function () { return 42 }
    return 42 === arr.foo() &&
        typeof arr.subarray === 'function' // Chrome 9-10 lack `subarray`
  } catch (e) {
    return false
  }
})()

/**
 * Class: Buffer
 * =============
 *
 * The Buffer constructor returns instances of `Uint8Array` that are augmented
 * with function properties for all the node `Buffer` API functions. We use
 * `Uint8Array` so that square bracket notation works as expected -- it returns
 * a single octet.
 *
 * By augmenting the instances, we can avoid modifying the `Uint8Array`
 * prototype.
 */
function Buffer (subject, encoding, noZero) {
  if (!(this instanceof Buffer))
    return new Buffer(subject, encoding, noZero)

  var type = typeof subject

  // Find the length
  var length
  if (type === 'number')
    length = subject > 0 ? subject >>> 0 : 0
  else if (type === 'string') {
    if (encoding === 'base64')
      subject = base64clean(subject)
    length = Buffer.byteLength(subject, encoding)
  } else if (type === 'object' && subject !== null) { // assume object is array-like
    if (subject.type === 'Buffer' && Array.isArray(subject.data))
      subject = subject.data
    length = +subject.length > 0 ? Math.floor(+subject.length) : 0
  } else
    throw new Error('First argument needs to be a number, array or string.')

  var buf
  if (Buffer._useTypedArrays) {
    // Preferred: Return an augmented `Uint8Array` instance for best performance
    buf = Buffer._augment(new Uint8Array(length))
  } else {
    // Fallback: Return THIS instance of Buffer (created by `new`)
    buf = this
    buf.length = length
    buf._isBuffer = true
  }

  var i
  if (Buffer._useTypedArrays && typeof subject.byteLength === 'number') {
    // Speed optimization -- use set if we're copying from a typed array
    buf._set(subject)
  } else if (isArrayish(subject)) {
    // Treat array-ish objects as a byte array
    if (Buffer.isBuffer(subject)) {
      for (i = 0; i < length; i++)
        buf[i] = subject.readUInt8(i)
    } else {
      for (i = 0; i < length; i++)
        buf[i] = ((subject[i] % 256) + 256) % 256
    }
  } else if (type === 'string') {
    buf.write(subject, 0, encoding)
  } else if (type === 'number' && !Buffer._useTypedArrays && !noZero) {
    for (i = 0; i < length; i++) {
      buf[i] = 0
    }
  }

  return buf
}

// STATIC METHODS
// ==============

Buffer.isEncoding = function (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.isBuffer = function (b) {
  return !!(b != null && b._isBuffer)
}

Buffer.byteLength = function (str, encoding) {
  var ret
  str = str.toString()
  switch (encoding || 'utf8') {
    case 'hex':
      ret = str.length / 2
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8ToBytes(str).length
      break
    case 'ascii':
    case 'binary':
    case 'raw':
      ret = str.length
      break
    case 'base64':
      ret = base64ToBytes(str).length
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = str.length * 2
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.concat = function (list, totalLength) {
  assert(isArray(list), 'Usage: Buffer.concat(list[, length])')

  if (list.length === 0) {
    return new Buffer(0)
  } else if (list.length === 1) {
    return list[0]
  }

  var i
  if (totalLength === undefined) {
    totalLength = 0
    for (i = 0; i < list.length; i++) {
      totalLength += list[i].length
    }
  }

  var buf = new Buffer(totalLength)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var item = list[i]
    item.copy(buf, pos)
    pos += item.length
  }
  return buf
}

Buffer.compare = function (a, b) {
  assert(Buffer.isBuffer(a) && Buffer.isBuffer(b), 'Arguments must be Buffers')
  var x = a.length
  var y = b.length
  for (var i = 0, len = Math.min(x, y); i < len && a[i] === b[i]; i++) {}
  if (i !== len) {
    x = a[i]
    y = b[i]
  }
  if (x < y) {
    return -1
  }
  if (y < x) {
    return 1
  }
  return 0
}

// BUFFER INSTANCE METHODS
// =======================

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  assert(strLen % 2 === 0, 'Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var byte = parseInt(string.substr(i * 2, 2), 16)
    assert(!isNaN(byte), 'Invalid hex string')
    buf[offset + i] = byte
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  var charsWritten = blitBuffer(utf8ToBytes(string), buf, offset, length)
  return charsWritten
}

function asciiWrite (buf, string, offset, length) {
  var charsWritten = blitBuffer(asciiToBytes(string), buf, offset, length)
  return charsWritten
}

function binaryWrite (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  var charsWritten = blitBuffer(base64ToBytes(string), buf, offset, length)
  return charsWritten
}

function utf16leWrite (buf, string, offset, length) {
  var charsWritten = blitBuffer(utf16leToBytes(string), buf, offset, length)
  return charsWritten
}

Buffer.prototype.write = function (string, offset, length, encoding) {
  // Support both (string, offset, length, encoding)
  // and the legacy (string, encoding, offset, length)
  if (isFinite(offset)) {
    if (!isFinite(length)) {
      encoding = length
      length = undefined
    }
  } else {  // legacy
    var swap = encoding
    encoding = offset
    offset = length
    length = swap
  }

  offset = Number(offset) || 0
  var remaining = this.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }
  encoding = String(encoding || 'utf8').toLowerCase()

  var ret
  switch (encoding) {
    case 'hex':
      ret = hexWrite(this, string, offset, length)
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8Write(this, string, offset, length)
      break
    case 'ascii':
      ret = asciiWrite(this, string, offset, length)
      break
    case 'binary':
      ret = binaryWrite(this, string, offset, length)
      break
    case 'base64':
      ret = base64Write(this, string, offset, length)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = utf16leWrite(this, string, offset, length)
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.prototype.toString = function (encoding, start, end) {
  var self = this

  encoding = String(encoding || 'utf8').toLowerCase()
  start = Number(start) || 0
  end = (end === undefined) ? self.length : Number(end)

  // Fastpath empty strings
  if (end === start)
    return ''

  var ret
  switch (encoding) {
    case 'hex':
      ret = hexSlice(self, start, end)
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8Slice(self, start, end)
      break
    case 'ascii':
      ret = asciiSlice(self, start, end)
      break
    case 'binary':
      ret = binarySlice(self, start, end)
      break
    case 'base64':
      ret = base64Slice(self, start, end)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = utf16leSlice(self, start, end)
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.prototype.toJSON = function () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

Buffer.prototype.equals = function (b) {
  assert(Buffer.isBuffer(b), 'Argument must be a Buffer')
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.compare = function (b) {
  assert(Buffer.isBuffer(b), 'Argument must be a Buffer')
  return Buffer.compare(this, b)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function (target, target_start, start, end) {
  var source = this

  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (!target_start) target_start = 0

  // Copy 0 bytes; we're done
  if (end === start) return
  if (target.length === 0 || source.length === 0) return

  // Fatal error conditions
  assert(end >= start, 'sourceEnd < sourceStart')
  assert(target_start >= 0 && target_start < target.length,
      'targetStart out of bounds')
  assert(start >= 0 && start < source.length, 'sourceStart out of bounds')
  assert(end >= 0 && end <= source.length, 'sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length)
    end = this.length
  if (target.length - target_start < end - start)
    end = target.length - target_start + start

  var len = end - start

  if (len < 100 || !Buffer._useTypedArrays) {
    for (var i = 0; i < len; i++) {
      target[i + target_start] = this[i + start]
    }
  } else {
    target._set(this.subarray(start, start + len), target_start)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  var res = ''
  var tmp = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    if (buf[i] <= 0x7F) {
      res += decodeUtf8Char(tmp) + String.fromCharCode(buf[i])
      tmp = ''
    } else {
      tmp += '%' + buf[i].toString(16)
    }
  }

  return res + decodeUtf8Char(tmp)
}

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function binarySlice (buf, start, end) {
  return asciiSlice(buf, start, end)
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256)
  }
  return res
}

Buffer.prototype.slice = function (start, end) {
  var len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len;
    if (start < 0)
      start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0)
      end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start)
    end = start

  if (Buffer._useTypedArrays) {
    return Buffer._augment(this.subarray(start, end))
  } else {
    var sliceLen = end - start
    var newBuf = new Buffer(sliceLen, undefined, true)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
    return newBuf
  }
}

// `get` will be removed in Node 0.13+
Buffer.prototype.get = function (offset) {
  console.log('.get() is deprecated. Access using array indexes instead.')
  return this.readUInt8(offset)
}

// `set` will be removed in Node 0.13+
Buffer.prototype.set = function (v, offset) {
  console.log('.set() is deprecated. Access using array indexes instead.')
  return this.writeUInt8(v, offset)
}

Buffer.prototype.readUInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  return this[offset]
}

function readUInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    val = buf[offset]
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
  } else {
    val = buf[offset] << 8
    if (offset + 1 < len)
      val |= buf[offset + 1]
  }
  return val
}

Buffer.prototype.readUInt16LE = function (offset, noAssert) {
  return readUInt16(this, offset, true, noAssert)
}

Buffer.prototype.readUInt16BE = function (offset, noAssert) {
  return readUInt16(this, offset, false, noAssert)
}

function readUInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    if (offset + 2 < len)
      val = buf[offset + 2] << 16
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
    val |= buf[offset]
    if (offset + 3 < len)
      val = val + (buf[offset + 3] << 24 >>> 0)
  } else {
    if (offset + 1 < len)
      val = buf[offset + 1] << 16
    if (offset + 2 < len)
      val |= buf[offset + 2] << 8
    if (offset + 3 < len)
      val |= buf[offset + 3]
    val = val + (buf[offset] << 24 >>> 0)
  }
  return val
}

Buffer.prototype.readUInt32LE = function (offset, noAssert) {
  return readUInt32(this, offset, true, noAssert)
}

Buffer.prototype.readUInt32BE = function (offset, noAssert) {
  return readUInt32(this, offset, false, noAssert)
}

Buffer.prototype.readInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null,
        'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  var neg = this[offset] & 0x80
  if (neg)
    return (0xff - this[offset] + 1) * -1
  else
    return this[offset]
}

function readInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = readUInt16(buf, offset, littleEndian, true)
  var neg = val & 0x8000
  if (neg)
    return (0xffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt16LE = function (offset, noAssert) {
  return readInt16(this, offset, true, noAssert)
}

Buffer.prototype.readInt16BE = function (offset, noAssert) {
  return readInt16(this, offset, false, noAssert)
}

function readInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = readUInt32(buf, offset, littleEndian, true)
  var neg = val & 0x80000000
  if (neg)
    return (0xffffffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt32LE = function (offset, noAssert) {
  return readInt32(this, offset, true, noAssert)
}

Buffer.prototype.readInt32BE = function (offset, noAssert) {
  return readInt32(this, offset, false, noAssert)
}

function readFloat (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 23, 4)
}

Buffer.prototype.readFloatLE = function (offset, noAssert) {
  return readFloat(this, offset, true, noAssert)
}

Buffer.prototype.readFloatBE = function (offset, noAssert) {
  return readFloat(this, offset, false, noAssert)
}

function readDouble (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 7 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 52, 8)
}

Buffer.prototype.readDoubleLE = function (offset, noAssert) {
  return readDouble(this, offset, true, noAssert)
}

Buffer.prototype.readDoubleBE = function (offset, noAssert) {
  return readDouble(this, offset, false, noAssert)
}

Buffer.prototype.writeUInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'trying to write beyond buffer length')
    verifuint(value, 0xff)
  }

  if (offset >= this.length) return

  this[offset] = value
  return offset + 1
}

function writeUInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 2); i < j; i++) {
    buf[offset + i] =
        (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
            (littleEndian ? i : 1 - i) * 8
  }
  return offset + 2
}

Buffer.prototype.writeUInt16LE = function (value, offset, noAssert) {
  return writeUInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt16BE = function (value, offset, noAssert) {
  return writeUInt16(this, value, offset, false, noAssert)
}

function writeUInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffffffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 4); i < j; i++) {
    buf[offset + i] =
        (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
  return offset + 4
}

Buffer.prototype.writeUInt32LE = function (value, offset, noAssert) {
  return writeUInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt32BE = function (value, offset, noAssert) {
  return writeUInt32(this, value, offset, false, noAssert)
}

Buffer.prototype.writeInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7f, -0x80)
  }

  if (offset >= this.length)
    return

  if (value >= 0)
    this.writeUInt8(value, offset, noAssert)
  else
    this.writeUInt8(0xff + value + 1, offset, noAssert)
  return offset + 1
}

function writeInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fff, -0x8000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    writeUInt16(buf, value, offset, littleEndian, noAssert)
  else
    writeUInt16(buf, 0xffff + value + 1, offset, littleEndian, noAssert)
  return offset + 2
}

Buffer.prototype.writeInt16LE = function (value, offset, noAssert) {
  return writeInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt16BE = function (value, offset, noAssert) {
  return writeInt16(this, value, offset, false, noAssert)
}

function writeInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fffffff, -0x80000000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    writeUInt32(buf, value, offset, littleEndian, noAssert)
  else
    writeUInt32(buf, 0xffffffff + value + 1, offset, littleEndian, noAssert)
  return offset + 4
}

Buffer.prototype.writeInt32LE = function (value, offset, noAssert) {
  return writeInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt32BE = function (value, offset, noAssert) {
  return writeInt32(this, value, offset, false, noAssert)
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifIEEE754(value, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 7 < buf.length,
        'Trying to write beyond buffer length')
    verifIEEE754(value, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  assert(end >= start, 'end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  assert(start >= 0 && start < this.length, 'start out of bounds')
  assert(end >= 0 && end <= this.length, 'end out of bounds')

  var i
  if (typeof value === 'number') {
    for (i = start; i < end; i++) {
      this[i] = value
    }
  } else {
    var bytes = utf8ToBytes(value.toString())
    var len = bytes.length
    for (i = start; i < end; i++) {
      this[i] = bytes[i % len]
    }
  }

  return this
}

Buffer.prototype.inspect = function () {
  var out = []
  var len = this.length
  for (var i = 0; i < len; i++) {
    out[i] = toHex(this[i])
    if (i === exports.INSPECT_MAX_BYTES) {
      out[i + 1] = '...'
      break
    }
  }
  return '<Buffer ' + out.join(' ') + '>'
}

/**
 * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
 * Added in Node 0.12. Only available in browsers that support ArrayBuffer.
 */
Buffer.prototype.toArrayBuffer = function () {
  if (typeof Uint8Array !== 'undefined') {
    if (Buffer._useTypedArrays) {
      return (new Buffer(this)).buffer
    } else {
      var buf = new Uint8Array(this.length)
      for (var i = 0, len = buf.length; i < len; i += 1) {
        buf[i] = this[i]
      }
      return buf.buffer
    }
  } else {
    throw new Error('Buffer.toArrayBuffer not supported in this browser')
  }
}

// HELPER FUNCTIONS
// ================

var BP = Buffer.prototype

/**
 * Augment a Uint8Array *instance* (not the Uint8Array class!) with Buffer methods
 */
Buffer._augment = function (arr) {
  arr._isBuffer = true

  // save reference to original Uint8Array get/set methods before overwriting
  arr._get = arr.get
  arr._set = arr.set

  // deprecated, will be removed in node 0.13+
  arr.get = BP.get
  arr.set = BP.set

  arr.write = BP.write
  arr.toString = BP.toString
  arr.toLocaleString = BP.toString
  arr.toJSON = BP.toJSON
  arr.equals = BP.equals
  arr.compare = BP.compare
  arr.copy = BP.copy
  arr.slice = BP.slice
  arr.readUInt8 = BP.readUInt8
  arr.readUInt16LE = BP.readUInt16LE
  arr.readUInt16BE = BP.readUInt16BE
  arr.readUInt32LE = BP.readUInt32LE
  arr.readUInt32BE = BP.readUInt32BE
  arr.readInt8 = BP.readInt8
  arr.readInt16LE = BP.readInt16LE
  arr.readInt16BE = BP.readInt16BE
  arr.readInt32LE = BP.readInt32LE
  arr.readInt32BE = BP.readInt32BE
  arr.readFloatLE = BP.readFloatLE
  arr.readFloatBE = BP.readFloatBE
  arr.readDoubleLE = BP.readDoubleLE
  arr.readDoubleBE = BP.readDoubleBE
  arr.writeUInt8 = BP.writeUInt8
  arr.writeUInt16LE = BP.writeUInt16LE
  arr.writeUInt16BE = BP.writeUInt16BE
  arr.writeUInt32LE = BP.writeUInt32LE
  arr.writeUInt32BE = BP.writeUInt32BE
  arr.writeInt8 = BP.writeInt8
  arr.writeInt16LE = BP.writeInt16LE
  arr.writeInt16BE = BP.writeInt16BE
  arr.writeInt32LE = BP.writeInt32LE
  arr.writeInt32BE = BP.writeInt32BE
  arr.writeFloatLE = BP.writeFloatLE
  arr.writeFloatBE = BP.writeFloatBE
  arr.writeDoubleLE = BP.writeDoubleLE
  arr.writeDoubleBE = BP.writeDoubleBE
  arr.fill = BP.fill
  arr.inspect = BP.inspect
  arr.toArrayBuffer = BP.toArrayBuffer

  return arr
}

var INVALID_BASE64_RE = /[^+\/0-9A-z]/g

function base64clean (str) {
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = stringtrim(str).replace(INVALID_BASE64_RE, '')
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '='
  }
  return str
}

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

function isArray (subject) {
  return (Array.isArray || function (subject) {
    return Object.prototype.toString.call(subject) === '[object Array]'
  })(subject)
}

function isArrayish (subject) {
  return isArray(subject) || Buffer.isBuffer(subject) ||
      subject && typeof subject === 'object' &&
      typeof subject.length === 'number'
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    var b = str.charCodeAt(i)
    if (b <= 0x7F) {
      byteArray.push(b)
    } else {
      var start = i
      if (b >= 0xD800 && b <= 0xDFFF) i++
      var h = encodeURIComponent(str.slice(start, i+1)).substr(1).split('%')
      for (var j = 0; j < h.length; j++) {
        byteArray.push(parseInt(h[j], 16))
      }
    }
  }
  return byteArray
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(str)
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length))
      break
    dst[i + offset] = src[i]
  }
  return i
}

function decodeUtf8Char (str) {
  try {
    return decodeURIComponent(str)
  } catch (err) {
    return String.fromCharCode(0xFFFD) // UTF 8 invalid char
  }
}

/*
 * We have to make sure that the value is a valid integer. This means that it
 * is non-negative. It has no fractional component and that it does not
 * exceed the maximum allowed value.
 */
function verifuint (value, max) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value >= 0, 'specified a negative value for writing an unsigned value')
  assert(value <= max, 'value is larger than maximum value for type')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifsint (value, max, min) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifIEEE754 (value, max, min) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
}

function assert (test, message) {
  if (!test) throw new Error(message || 'Failed assertion')
}

},{"base64-js":6,"ieee754":7}],6:[function(require,module,exports){
var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

;(function (exports) {
	'use strict';

  var Arr = (typeof Uint8Array !== 'undefined')
    ? Uint8Array
    : Array

	var PLUS   = '+'.charCodeAt(0)
	var SLASH  = '/'.charCodeAt(0)
	var NUMBER = '0'.charCodeAt(0)
	var LOWER  = 'a'.charCodeAt(0)
	var UPPER  = 'A'.charCodeAt(0)

	function decode (elt) {
		var code = elt.charCodeAt(0)
		if (code === PLUS)
			return 62 // '+'
		if (code === SLASH)
			return 63 // '/'
		if (code < NUMBER)
			return -1 //no match
		if (code < NUMBER + 10)
			return code - NUMBER + 26 + 26
		if (code < UPPER + 26)
			return code - UPPER
		if (code < LOWER + 26)
			return code - LOWER + 26
	}

	function b64ToByteArray (b64) {
		var i, j, l, tmp, placeHolders, arr

		if (b64.length % 4 > 0) {
			throw new Error('Invalid string. Length must be a multiple of 4')
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		var len = b64.length
		placeHolders = '=' === b64.charAt(len - 2) ? 2 : '=' === b64.charAt(len - 1) ? 1 : 0

		// base64 is 4/3 + up to two characters of the original data
		arr = new Arr(b64.length * 3 / 4 - placeHolders)

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length

		var L = 0

		function push (v) {
			arr[L++] = v
		}

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (decode(b64.charAt(i)) << 18) | (decode(b64.charAt(i + 1)) << 12) | (decode(b64.charAt(i + 2)) << 6) | decode(b64.charAt(i + 3))
			push((tmp & 0xFF0000) >> 16)
			push((tmp & 0xFF00) >> 8)
			push(tmp & 0xFF)
		}

		if (placeHolders === 2) {
			tmp = (decode(b64.charAt(i)) << 2) | (decode(b64.charAt(i + 1)) >> 4)
			push(tmp & 0xFF)
		} else if (placeHolders === 1) {
			tmp = (decode(b64.charAt(i)) << 10) | (decode(b64.charAt(i + 1)) << 4) | (decode(b64.charAt(i + 2)) >> 2)
			push((tmp >> 8) & 0xFF)
			push(tmp & 0xFF)
		}

		return arr
	}

	function uint8ToBase64 (uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length

		function encode (num) {
			return lookup.charAt(num)
		}

		function tripletToBase64 (num) {
			return encode(num >> 18 & 0x3F) + encode(num >> 12 & 0x3F) + encode(num >> 6 & 0x3F) + encode(num & 0x3F)
		}

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
			output += tripletToBase64(temp)
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1]
				output += encode(temp >> 2)
				output += encode((temp << 4) & 0x3F)
				output += '=='
				break
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1])
				output += encode(temp >> 10)
				output += encode((temp >> 4) & 0x3F)
				output += encode((temp << 2) & 0x3F)
				output += '='
				break
		}

		return output
	}

	exports.toByteArray = b64ToByteArray
	exports.fromByteArray = uint8ToBase64
}(typeof exports === 'undefined' ? (this.base64js = {}) : exports))

},{}],7:[function(require,module,exports){
exports.read = function(buffer, offset, isLE, mLen, nBytes) {
  var e, m,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      nBits = -7,
      i = isLE ? (nBytes - 1) : 0,
      d = isLE ? -1 : 1,
      s = buffer[offset + i];

  i += d;

  e = s & ((1 << (-nBits)) - 1);
  s >>= (-nBits);
  nBits += eLen;
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8);

  m = e & ((1 << (-nBits)) - 1);
  e >>= (-nBits);
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8);

  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity);
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
};

exports.write = function(buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0),
      i = isLE ? 0 : (nBytes - 1),
      d = isLE ? 1 : -1,
      s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

  value = Math.abs(value);

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }

    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8);

  e = (e << mLen) | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8);

  buffer[offset + i - d] |= s * 128;
};

},{}],8:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      } else {
        throw TypeError('Uncaught, unspecified "error" event.');
      }
      return false;
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        len = arguments.length;
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    len = arguments.length;
    args = new Array(len - 1);
    for (i = 1; i < len; i++)
      args[i - 1] = arguments[i];

    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    var m;
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      if (typeof console.trace === 'function') {
        // not supported in IE 10
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  var ret;
  if (!emitter._events || !emitter._events[type])
    ret = 0;
  else if (isFunction(emitter._events[type]))
    ret = 1;
  else
    ret = emitter._events[type].length;
  return ret;
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],9:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],10:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],11:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],12:[function(require,module,exports){
(function (process,global){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnviron;
exports.debuglog = function(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

}).call(this,require("JkpR2F"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./support/isBuffer":11,"JkpR2F":10,"inherits":9}],"UErKnN":[function(require,module,exports){
// Uses Node, AMD or browser globals to create a module.

// If you want something that will work in other stricter CommonJS environments,
// or if you need to create a circular dependency, see commonJsStrict.js

// Defines a module "returnExports" that depends another module called "b".
// Note that the name of the module is implied by the file name. It is best
// if the file name and the exported global have matching names.

// If the 'b' module also uses this type of boilerplate, then
// in the browser, it will create a global .b that is used below.

// If you do not want to support the browser global path, then you
// can remove the `root` use and the passing `this` as the first arg to
// the top function.

(function (root, factory) {
    if (typeof exports === 'object') {
        // Node. Does not work with strict CommonJS, but
        // only CommonJS-like enviroments that support module.exports,
        // like Node.
        module.exports = factory();
    } else if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define([], factory);
    } else {
        // Browser globals
        root.returnExports = factory();
    }
}(this, function () {/*!
 * jQuery JavaScript Library v1.8.1
 * http://jquery.com/
 *
 * Includes Sizzle.js
 * http://sizzlejs.com/
 *
 * Copyright 2012 jQuery Foundation and other contributors
 * Released under the MIT license
 * http://jquery.org/license
 *
 * Date: Thu Aug 30 2012 17:17:22 GMT-0400 (Eastern Daylight Time)
 */
return (function( window, undefined ) {
var
	// A central reference to the root jQuery(document)
	rootjQuery,

	// The deferred used on DOM ready
	readyList,

	// Use the correct document accordingly with window argument (sandbox)
	document = window.document,
	location = window.location,
	navigator = window.navigator,

	// Map over jQuery in case of overwrite
	_jQuery = window.jQuery,

	// Map over the $ in case of overwrite
	_$ = window.$,

	// Save a reference to some core methods
	core_push = Array.prototype.push,
	core_slice = Array.prototype.slice,
	core_indexOf = Array.prototype.indexOf,
	core_toString = Object.prototype.toString,
	core_hasOwn = Object.prototype.hasOwnProperty,
	core_trim = String.prototype.trim,

	// Define a local copy of jQuery
	jQuery = function( selector, context ) {
		// The jQuery object is actually just the init constructor 'enhanced'
		return new jQuery.fn.init( selector, context, rootjQuery );
	},

	// Used for matching numbers
	core_pnum = /[\-+]?(?:\d*\.|)\d+(?:[eE][\-+]?\d+|)/.source,

	// Used for detecting and trimming whitespace
	core_rnotwhite = /\S/,
	core_rspace = /\s+/,

	// Make sure we trim BOM and NBSP (here's looking at you, Safari 5.0 and IE)
	rtrim = /^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g,

	// A simple way to check for HTML strings
	// Prioritize #id over <tag> to avoid XSS via location.hash (#9521)
	rquickExpr = /^(?:[^#<]*(<[\w\W]+>)[^>]*$|#([\w\-]*)$)/,

	// Match a standalone tag
	rsingleTag = /^<(\w+)\s*\/?>(?:<\/\1>|)$/,

	// JSON RegExp
	rvalidchars = /^[\],:{}\s]*$/,
	rvalidbraces = /(?:^|:|,)(?:\s*\[)+/g,
	rvalidescape = /\\(?:["\\\/bfnrt]|u[\da-fA-F]{4})/g,
	rvalidtokens = /"[^"\\\r\n]*"|true|false|null|-?(?:\d\d*\.|)\d+(?:[eE][\-+]?\d+|)/g,

	// Matches dashed string for camelizing
	rmsPrefix = /^-ms-/,
	rdashAlpha = /-([\da-z])/gi,

	// Used by jQuery.camelCase as callback to replace()
	fcamelCase = function( all, letter ) {
		return ( letter + "" ).toUpperCase();
	},

	// The ready event handler and self cleanup method
	DOMContentLoaded = function() {
		if ( document.addEventListener ) {
			document.removeEventListener( "DOMContentLoaded", DOMContentLoaded, false );
			jQuery.ready();
		} else if ( document.readyState === "complete" ) {
			// we're here because readyState === "complete" in oldIE
			// which is good enough for us to call the dom ready!
			document.detachEvent( "onreadystatechange", DOMContentLoaded );
			jQuery.ready();
		}
	},

	// [[Class]] -> type pairs
	class2type = {};

jQuery.fn = jQuery.prototype = {
	constructor: jQuery,
	init: function( selector, context, rootjQuery ) {
		var match, elem, ret, doc;

		// Handle $(""), $(null), $(undefined), $(false)
		if ( !selector ) {
			return this;
		}

		// Handle $(DOMElement)
		if ( selector.nodeType ) {
			this.context = this[0] = selector;
			this.length = 1;
			return this;
		}

		// Handle HTML strings
		if ( typeof selector === "string" ) {
			if ( selector.charAt(0) === "<" && selector.charAt( selector.length - 1 ) === ">" && selector.length >= 3 ) {
				// Assume that strings that start and end with <> are HTML and skip the regex check
				match = [ null, selector, null ];

			} else {
				match = rquickExpr.exec( selector );
			}

			// Match html or make sure no context is specified for #id
			if ( match && (match[1] || !context) ) {

				// HANDLE: $(html) -> $(array)
				if ( match[1] ) {
					context = context instanceof jQuery ? context[0] : context;
					doc = ( context && context.nodeType ? context.ownerDocument || context : document );

					// scripts is true for back-compat
					selector = jQuery.parseHTML( match[1], doc, true );
					if ( rsingleTag.test( match[1] ) && jQuery.isPlainObject( context ) ) {
						this.attr.call( selector, context, true );
					}

					return jQuery.merge( this, selector );

				// HANDLE: $(#id)
				} else {
					elem = document.getElementById( match[2] );

					// Check parentNode to catch when Blackberry 4.6 returns
					// nodes that are no longer in the document #6963
					if ( elem && elem.parentNode ) {
						// Handle the case where IE and Opera return items
						// by name instead of ID
						if ( elem.id !== match[2] ) {
							return rootjQuery.find( selector );
						}

						// Otherwise, we inject the element directly into the jQuery object
						this.length = 1;
						this[0] = elem;
					}

					this.context = document;
					this.selector = selector;
					return this;
				}

			// HANDLE: $(expr, $(...))
			} else if ( !context || context.jquery ) {
				return ( context || rootjQuery ).find( selector );

			// HANDLE: $(expr, context)
			// (which is just equivalent to: $(context).find(expr)
			} else {
				return this.constructor( context ).find( selector );
			}

		// HANDLE: $(function)
		// Shortcut for document ready
		} else if ( jQuery.isFunction( selector ) ) {
			return rootjQuery.ready( selector );
		}

		if ( selector.selector !== undefined ) {
			this.selector = selector.selector;
			this.context = selector.context;
		}

		return jQuery.makeArray( selector, this );
	},

	// Start with an empty selector
	selector: "",

	// The current version of jQuery being used
	jquery: "1.8.1",

	// The default length of a jQuery object is 0
	length: 0,

	// The number of elements contained in the matched element set
	size: function() {
		return this.length;
	},

	toArray: function() {
		return core_slice.call( this );
	},

	// Get the Nth element in the matched element set OR
	// Get the whole matched element set as a clean array
	get: function( num ) {
		return num == null ?

			// Return a 'clean' array
			this.toArray() :

			// Return just the object
			( num < 0 ? this[ this.length + num ] : this[ num ] );
	},

	// Take an array of elements and push it onto the stack
	// (returning the new matched element set)
	pushStack: function( elems, name, selector ) {

		// Build a new jQuery matched element set
		var ret = jQuery.merge( this.constructor(), elems );

		// Add the old object onto the stack (as a reference)
		ret.prevObject = this;

		ret.context = this.context;

		if ( name === "find" ) {
			ret.selector = this.selector + ( this.selector ? " " : "" ) + selector;
		} else if ( name ) {
			ret.selector = this.selector + "." + name + "(" + selector + ")";
		}

		// Return the newly-formed element set
		return ret;
	},

	// Execute a callback for every element in the matched set.
	// (You can seed the arguments with an array of args, but this is
	// only used internally.)
	each: function( callback, args ) {
		return jQuery.each( this, callback, args );
	},

	ready: function( fn ) {
		// Add the callback
		jQuery.ready.promise().done( fn );

		return this;
	},

	eq: function( i ) {
		i = +i;
		return i === -1 ?
			this.slice( i ) :
			this.slice( i, i + 1 );
	},

	first: function() {
		return this.eq( 0 );
	},

	last: function() {
		return this.eq( -1 );
	},

	slice: function() {
		return this.pushStack( core_slice.apply( this, arguments ),
			"slice", core_slice.call(arguments).join(",") );
	},

	map: function( callback ) {
		return this.pushStack( jQuery.map(this, function( elem, i ) {
			return callback.call( elem, i, elem );
		}));
	},

	end: function() {
		return this.prevObject || this.constructor(null);
	},

	// For internal use only.
	// Behaves like an Array's method, not like a jQuery method.
	push: core_push,
	sort: [].sort,
	splice: [].splice
};

// Give the init function the jQuery prototype for later instantiation
jQuery.fn.init.prototype = jQuery.fn;

jQuery.extend = jQuery.fn.extend = function() {
	var options, name, src, copy, copyIsArray, clone,
		target = arguments[0] || {},
		i = 1,
		length = arguments.length,
		deep = false;

	// Handle a deep copy situation
	if ( typeof target === "boolean" ) {
		deep = target;
		target = arguments[1] || {};
		// skip the boolean and the target
		i = 2;
	}

	// Handle case when target is a string or something (possible in deep copy)
	if ( typeof target !== "object" && !jQuery.isFunction(target) ) {
		target = {};
	}

	// extend jQuery itself if only one argument is passed
	if ( length === i ) {
		target = this;
		--i;
	}

	for ( ; i < length; i++ ) {
		// Only deal with non-null/undefined values
		if ( (options = arguments[ i ]) != null ) {
			// Extend the base object
			for ( name in options ) {
				src = target[ name ];
				copy = options[ name ];

				// Prevent never-ending loop
				if ( target === copy ) {
					continue;
				}

				// Recurse if we're merging plain objects or arrays
				if ( deep && copy && ( jQuery.isPlainObject(copy) || (copyIsArray = jQuery.isArray(copy)) ) ) {
					if ( copyIsArray ) {
						copyIsArray = false;
						clone = src && jQuery.isArray(src) ? src : [];

					} else {
						clone = src && jQuery.isPlainObject(src) ? src : {};
					}

					// Never move original objects, clone them
					target[ name ] = jQuery.extend( deep, clone, copy );

				// Don't bring in undefined values
				} else if ( copy !== undefined ) {
					target[ name ] = copy;
				}
			}
		}
	}

	// Return the modified object
	return target;
};

jQuery.extend({
	noConflict: function( deep ) {
		if ( window.$ === jQuery ) {
			window.$ = _$;
		}

		if ( deep && window.jQuery === jQuery ) {
			window.jQuery = _jQuery;
		}

		return jQuery;
	},

	// Is the DOM ready to be used? Set to true once it occurs.
	isReady: false,

	// A counter to track how many items to wait for before
	// the ready event fires. See #6781
	readyWait: 1,

	// Hold (or release) the ready event
	holdReady: function( hold ) {
		if ( hold ) {
			jQuery.readyWait++;
		} else {
			jQuery.ready( true );
		}
	},

	// Handle when the DOM is ready
	ready: function( wait ) {

		// Abort if there are pending holds or we're already ready
		if ( wait === true ? --jQuery.readyWait : jQuery.isReady ) {
			return;
		}

		// Make sure body exists, at least, in case IE gets a little overzealous (ticket #5443).
		if ( !document.body ) {
			return setTimeout( jQuery.ready, 1 );
		}

		// Remember that the DOM is ready
		jQuery.isReady = true;

		// If a normal DOM Ready event fired, decrement, and wait if need be
		if ( wait !== true && --jQuery.readyWait > 0 ) {
			return;
		}

		// If there are functions bound, to execute
		readyList.resolveWith( document, [ jQuery ] );

		// Trigger any bound ready events
		if ( jQuery.fn.trigger ) {
			jQuery( document ).trigger("ready").off("ready");
		}
	},

	// See test/unit/core.js for details concerning isFunction.
	// Since version 1.3, DOM methods and functions like alert
	// aren't supported. They return false on IE (#2968).
	isFunction: function( obj ) {
		return jQuery.type(obj) === "function";
	},

	isArray: Array.isArray || function( obj ) {
		return jQuery.type(obj) === "array";
	},

	isWindow: function( obj ) {
		return obj != null && obj == obj.window;
	},

	isNumeric: function( obj ) {
		return !isNaN( parseFloat(obj) ) && isFinite( obj );
	},

	type: function( obj ) {
		return obj == null ?
			String( obj ) :
			class2type[ core_toString.call(obj) ] || "object";
	},

	isPlainObject: function( obj ) {
		// Must be an Object.
		// Because of IE, we also have to check the presence of the constructor property.
		// Make sure that DOM nodes and window objects don't pass through, as well
		if ( !obj || jQuery.type(obj) !== "object" || obj.nodeType || jQuery.isWindow( obj ) ) {
			return false;
		}

		try {
			// Not own constructor property must be Object
			if ( obj.constructor &&
				!core_hasOwn.call(obj, "constructor") &&
				!core_hasOwn.call(obj.constructor.prototype, "isPrototypeOf") ) {
				return false;
			}
		} catch ( e ) {
			// IE8,9 Will throw exceptions on certain host objects #9897
			return false;
		}

		// Own properties are enumerated firstly, so to speed up,
		// if last one is own, then all properties are own.

		var key;
		for ( key in obj ) {}

		return key === undefined || core_hasOwn.call( obj, key );
	},

	isEmptyObject: function( obj ) {
		var name;
		for ( name in obj ) {
			return false;
		}
		return true;
	},

	error: function( msg ) {
		throw new Error( msg );
	},

	// data: string of html
	// context (optional): If specified, the fragment will be created in this context, defaults to document
	// scripts (optional): If true, will include scripts passed in the html string
	parseHTML: function( data, context, scripts ) {
		var parsed;
		if ( !data || typeof data !== "string" ) {
			return null;
		}
		if ( typeof context === "boolean" ) {
			scripts = context;
			context = 0;
		}
		context = context || document;

		// Single tag
		if ( (parsed = rsingleTag.exec( data )) ) {
			return [ context.createElement( parsed[1] ) ];
		}

		parsed = jQuery.buildFragment( [ data ], context, scripts ? null : [] );
		return jQuery.merge( [],
			(parsed.cacheable ? jQuery.clone( parsed.fragment ) : parsed.fragment).childNodes );
	},

	parseJSON: function( data ) {
		if ( !data || typeof data !== "string") {
			return null;
		}

		// Make sure leading/trailing whitespace is removed (IE can't handle it)
		data = jQuery.trim( data );

		// Attempt to parse using the native JSON parser first
		if ( window.JSON && window.JSON.parse ) {
			return window.JSON.parse( data );
		}

		// Make sure the incoming data is actual JSON
		// Logic borrowed from http://json.org/json2.js
		if ( rvalidchars.test( data.replace( rvalidescape, "@" )
			.replace( rvalidtokens, "]" )
			.replace( rvalidbraces, "")) ) {

			return ( new Function( "return " + data ) )();

		}
		jQuery.error( "Invalid JSON: " + data );
	},

	// Cross-browser xml parsing
	parseXML: function( data ) {
		var xml, tmp;
		if ( !data || typeof data !== "string" ) {
			return null;
		}
		try {
			if ( window.DOMParser ) { // Standard
				tmp = new DOMParser();
				xml = tmp.parseFromString( data , "text/xml" );
			} else { // IE
				xml = new ActiveXObject( "Microsoft.XMLDOM" );
				xml.async = "false";
				xml.loadXML( data );
			}
		} catch( e ) {
			xml = undefined;
		}
		if ( !xml || !xml.documentElement || xml.getElementsByTagName( "parsererror" ).length ) {
			jQuery.error( "Invalid XML: " + data );
		}
		return xml;
	},

	noop: function() {},

	// Evaluates a script in a global context
	// Workarounds based on findings by Jim Driscoll
	// http://weblogs.java.net/blog/driscoll/archive/2009/09/08/eval-javascript-global-context
	globalEval: function( data ) {
		if ( data && core_rnotwhite.test( data ) ) {
			// We use execScript on Internet Explorer
			// We use an anonymous function so that context is window
			// rather than jQuery in Firefox
			( window.execScript || function( data ) {
				window[ "eval" ].call( window, data );
			} )( data );
		}
	},

	// Convert dashed to camelCase; used by the css and data modules
	// Microsoft forgot to hump their vendor prefix (#9572)
	camelCase: function( string ) {
		return string.replace( rmsPrefix, "ms-" ).replace( rdashAlpha, fcamelCase );
	},

	nodeName: function( elem, name ) {
		return elem.nodeName && elem.nodeName.toUpperCase() === name.toUpperCase();
	},

	// args is for internal usage only
	each: function( obj, callback, args ) {
		var name,
			i = 0,
			length = obj.length,
			isObj = length === undefined || jQuery.isFunction( obj );

		if ( args ) {
			if ( isObj ) {
				for ( name in obj ) {
					if ( callback.apply( obj[ name ], args ) === false ) {
						break;
					}
				}
			} else {
				for ( ; i < length; ) {
					if ( callback.apply( obj[ i++ ], args ) === false ) {
						break;
					}
				}
			}

		// A special, fast, case for the most common use of each
		} else {
			if ( isObj ) {
				for ( name in obj ) {
					if ( callback.call( obj[ name ], name, obj[ name ] ) === false ) {
						break;
					}
				}
			} else {
				for ( ; i < length; ) {
					if ( callback.call( obj[ i ], i, obj[ i++ ] ) === false ) {
						break;
					}
				}
			}
		}

		return obj;
	},

	// Use native String.trim function wherever possible
	trim: core_trim && !core_trim.call("\uFEFF\xA0") ?
		function( text ) {
			return text == null ?
				"" :
				core_trim.call( text );
		} :

		// Otherwise use our own trimming functionality
		function( text ) {
			return text == null ?
				"" :
				text.toString().replace( rtrim, "" );
		},

	// results is for internal usage only
	makeArray: function( arr, results ) {
		var type,
			ret = results || [];

		if ( arr != null ) {
			// The window, strings (and functions) also have 'length'
			// Tweaked logic slightly to handle Blackberry 4.7 RegExp issues #6930
			type = jQuery.type( arr );

			if ( arr.length == null || type === "string" || type === "function" || type === "regexp" || jQuery.isWindow( arr ) ) {
				core_push.call( ret, arr );
			} else {
				jQuery.merge( ret, arr );
			}
		}

		return ret;
	},

	inArray: function( elem, arr, i ) {
		var len;

		if ( arr ) {
			if ( core_indexOf ) {
				return core_indexOf.call( arr, elem, i );
			}

			len = arr.length;
			i = i ? i < 0 ? Math.max( 0, len + i ) : i : 0;

			for ( ; i < len; i++ ) {
				// Skip accessing in sparse arrays
				if ( i in arr && arr[ i ] === elem ) {
					return i;
				}
			}
		}

		return -1;
	},

	merge: function( first, second ) {
		var l = second.length,
			i = first.length,
			j = 0;

		if ( typeof l === "number" ) {
			for ( ; j < l; j++ ) {
				first[ i++ ] = second[ j ];
			}

		} else {
			while ( second[j] !== undefined ) {
				first[ i++ ] = second[ j++ ];
			}
		}

		first.length = i;

		return first;
	},

	grep: function( elems, callback, inv ) {
		var retVal,
			ret = [],
			i = 0,
			length = elems.length;
		inv = !!inv;

		// Go through the array, only saving the items
		// that pass the validator function
		for ( ; i < length; i++ ) {
			retVal = !!callback( elems[ i ], i );
			if ( inv !== retVal ) {
				ret.push( elems[ i ] );
			}
		}

		return ret;
	},

	// arg is for internal usage only
	map: function( elems, callback, arg ) {
		var value, key,
			ret = [],
			i = 0,
			length = elems.length,
			// jquery objects are treated as arrays
			isArray = elems instanceof jQuery || length !== undefined && typeof length === "number" && ( ( length > 0 && elems[ 0 ] && elems[ length -1 ] ) || length === 0 || jQuery.isArray( elems ) ) ;

		// Go through the array, translating each of the items to their
		if ( isArray ) {
			for ( ; i < length; i++ ) {
				value = callback( elems[ i ], i, arg );

				if ( value != null ) {
					ret[ ret.length ] = value;
				}
			}

		// Go through every key on the object,
		} else {
			for ( key in elems ) {
				value = callback( elems[ key ], key, arg );

				if ( value != null ) {
					ret[ ret.length ] = value;
				}
			}
		}

		// Flatten any nested arrays
		return ret.concat.apply( [], ret );
	},

	// A global GUID counter for objects
	guid: 1,

	// Bind a function to a context, optionally partially applying any
	// arguments.
	proxy: function( fn, context ) {
		var tmp, args, proxy;

		if ( typeof context === "string" ) {
			tmp = fn[ context ];
			context = fn;
			fn = tmp;
		}

		// Quick check to determine if target is callable, in the spec
		// this throws a TypeError, but we will just return undefined.
		if ( !jQuery.isFunction( fn ) ) {
			return undefined;
		}

		// Simulated bind
		args = core_slice.call( arguments, 2 );
		proxy = function() {
			return fn.apply( context, args.concat( core_slice.call( arguments ) ) );
		};

		// Set the guid of unique handler to the same of original handler, so it can be removed
		proxy.guid = fn.guid = fn.guid || proxy.guid || jQuery.guid++;

		return proxy;
	},

	// Multifunctional method to get and set values of a collection
	// The value/s can optionally be executed if it's a function
	access: function( elems, fn, key, value, chainable, emptyGet, pass ) {
		var exec,
			bulk = key == null,
			i = 0,
			length = elems.length;

		// Sets many values
		if ( key && typeof key === "object" ) {
			for ( i in key ) {
				jQuery.access( elems, fn, i, key[i], 1, emptyGet, value );
			}
			chainable = 1;

		// Sets one value
		} else if ( value !== undefined ) {
			// Optionally, function values get executed if exec is true
			exec = pass === undefined && jQuery.isFunction( value );

			if ( bulk ) {
				// Bulk operations only iterate when executing function values
				if ( exec ) {
					exec = fn;
					fn = function( elem, key, value ) {
						return exec.call( jQuery( elem ), value );
					};

				// Otherwise they run against the entire set
				} else {
					fn.call( elems, value );
					fn = null;
				}
			}

			if ( fn ) {
				for (; i < length; i++ ) {
					fn( elems[i], key, exec ? value.call( elems[i], i, fn( elems[i], key ) ) : value, pass );
				}
			}

			chainable = 1;
		}

		return chainable ?
			elems :

			// Gets
			bulk ?
				fn.call( elems ) :
				length ? fn( elems[0], key ) : emptyGet;
	},

	now: function() {
		return ( new Date() ).getTime();
	}
});

jQuery.ready.promise = function( obj ) {
	if ( !readyList ) {

		readyList = jQuery.Deferred();

		// Catch cases where $(document).ready() is called after the browser event has already occurred.
		// we once tried to use readyState "interactive" here, but it caused issues like the one
		// discovered by ChrisS here: http://bugs.jquery.com/ticket/12282#comment:15
		if ( document.readyState === "complete" ) {
			// Handle it asynchronously to allow scripts the opportunity to delay ready
			setTimeout( jQuery.ready, 1 );

		// Standards-based browsers support DOMContentLoaded
		} else if ( document.addEventListener ) {
			// Use the handy event callback
			document.addEventListener( "DOMContentLoaded", DOMContentLoaded, false );

			// A fallback to window.onload, that will always work
			window.addEventListener( "load", jQuery.ready, false );

		// If IE event model is used
		} else {
			// Ensure firing before onload, maybe late but safe also for iframes
			document.attachEvent( "onreadystatechange", DOMContentLoaded );

			// A fallback to window.onload, that will always work
			window.attachEvent( "onload", jQuery.ready );

			// If IE and not a frame
			// continually check to see if the document is ready
			var top = false;

			try {
				top = window.frameElement == null && document.documentElement;
			} catch(e) {}

			if ( top && top.doScroll ) {
				(function doScrollCheck() {
					if ( !jQuery.isReady ) {

						try {
							// Use the trick by Diego Perini
							// http://javascript.nwbox.com/IEContentLoaded/
							top.doScroll("left");
						} catch(e) {
							return setTimeout( doScrollCheck, 50 );
						}

						// and execute any waiting functions
						jQuery.ready();
					}
				})();
			}
		}
	}
	return readyList.promise( obj );
};

// Populate the class2type map
jQuery.each("Boolean Number String Function Array Date RegExp Object".split(" "), function(i, name) {
	class2type[ "[object " + name + "]" ] = name.toLowerCase();
});

// All jQuery objects should point back to these
rootjQuery = jQuery(document);
// String to Object options format cache
var optionsCache = {};

// Convert String-formatted options into Object-formatted ones and store in cache
function createOptions( options ) {
	var object = optionsCache[ options ] = {};
	jQuery.each( options.split( core_rspace ), function( _, flag ) {
		object[ flag ] = true;
	});
	return object;
}

/*
 * Create a callback list using the following parameters:
 *
 *	options: an optional list of space-separated options that will change how
 *			the callback list behaves or a more traditional option object
 *
 * By default a callback list will act like an event callback list and can be
 * "fired" multiple times.
 *
 * Possible options:
 *
 *	once:			will ensure the callback list can only be fired once (like a Deferred)
 *
 *	memory:			will keep track of previous values and will call any callback added
 *					after the list has been fired right away with the latest "memorized"
 *					values (like a Deferred)
 *
 *	unique:			will ensure a callback can only be added once (no duplicate in the list)
 *
 *	stopOnFalse:	interrupt callings when a callback returns false
 *
 */
jQuery.Callbacks = function( options ) {

	// Convert options from String-formatted to Object-formatted if needed
	// (we check in cache first)
	options = typeof options === "string" ?
		( optionsCache[ options ] || createOptions( options ) ) :
		jQuery.extend( {}, options );

	var // Last fire value (for non-forgettable lists)
		memory,
		// Flag to know if list was already fired
		fired,
		// Flag to know if list is currently firing
		firing,
		// First callback to fire (used internally by add and fireWith)
		firingStart,
		// End of the loop when firing
		firingLength,
		// Index of currently firing callback (modified by remove if needed)
		firingIndex,
		// Actual callback list
		list = [],
		// Stack of fire calls for repeatable lists
		stack = !options.once && [],
		// Fire callbacks
		fire = function( data ) {
			memory = options.memory && data;
			fired = true;
			firingIndex = firingStart || 0;
			firingStart = 0;
			firingLength = list.length;
			firing = true;
			for ( ; list && firingIndex < firingLength; firingIndex++ ) {
				if ( list[ firingIndex ].apply( data[ 0 ], data[ 1 ] ) === false && options.stopOnFalse ) {
					memory = false; // To prevent further calls using add
					break;
				}
			}
			firing = false;
			if ( list ) {
				if ( stack ) {
					if ( stack.length ) {
						fire( stack.shift() );
					}
				} else if ( memory ) {
					list = [];
				} else {
					self.disable();
				}
			}
		},
		// Actual Callbacks object
		self = {
			// Add a callback or a collection of callbacks to the list
			add: function() {
				if ( list ) {
					// First, we save the current length
					var start = list.length;
					(function add( args ) {
						jQuery.each( args, function( _, arg ) {
							var type = jQuery.type( arg );
							if ( type === "function" && ( !options.unique || !self.has( arg ) ) ) {
								list.push( arg );
							} else if ( arg && arg.length && type !== "string" ) {
								// Inspect recursively
								add( arg );
							}
						});
					})( arguments );
					// Do we need to add the callbacks to the
					// current firing batch?
					if ( firing ) {
						firingLength = list.length;
					// With memory, if we're not firing then
					// we should call right away
					} else if ( memory ) {
						firingStart = start;
						fire( memory );
					}
				}
				return this;
			},
			// Remove a callback from the list
			remove: function() {
				if ( list ) {
					jQuery.each( arguments, function( _, arg ) {
						var index;
						while( ( index = jQuery.inArray( arg, list, index ) ) > -1 ) {
							list.splice( index, 1 );
							// Handle firing indexes
							if ( firing ) {
								if ( index <= firingLength ) {
									firingLength--;
								}
								if ( index <= firingIndex ) {
									firingIndex--;
								}
							}
						}
					});
				}
				return this;
			},
			// Control if a given callback is in the list
			has: function( fn ) {
				return jQuery.inArray( fn, list ) > -1;
			},
			// Remove all callbacks from the list
			empty: function() {
				list = [];
				return this;
			},
			// Have the list do nothing anymore
			disable: function() {
				list = stack = memory = undefined;
				return this;
			},
			// Is it disabled?
			disabled: function() {
				return !list;
			},
			// Lock the list in its current state
			lock: function() {
				stack = undefined;
				if ( !memory ) {
					self.disable();
				}
				return this;
			},
			// Is it locked?
			locked: function() {
				return !stack;
			},
			// Call all callbacks with the given context and arguments
			fireWith: function( context, args ) {
				args = args || [];
				args = [ context, args.slice ? args.slice() : args ];
				if ( list && ( !fired || stack ) ) {
					if ( firing ) {
						stack.push( args );
					} else {
						fire( args );
					}
				}
				return this;
			},
			// Call all the callbacks with the given arguments
			fire: function() {
				self.fireWith( this, arguments );
				return this;
			},
			// To know if the callbacks have already been called at least once
			fired: function() {
				return !!fired;
			}
		};

	return self;
};
jQuery.extend({

	Deferred: function( func ) {
		var tuples = [
				// action, add listener, listener list, final state
				[ "resolve", "done", jQuery.Callbacks("once memory"), "resolved" ],
				[ "reject", "fail", jQuery.Callbacks("once memory"), "rejected" ],
				[ "notify", "progress", jQuery.Callbacks("memory") ]
			],
			state = "pending",
			promise = {
				state: function() {
					return state;
				},
				always: function() {
					deferred.done( arguments ).fail( arguments );
					return this;
				},
				then: function( /* fnDone, fnFail, fnProgress */ ) {
					var fns = arguments;
					return jQuery.Deferred(function( newDefer ) {
						jQuery.each( tuples, function( i, tuple ) {
							var action = tuple[ 0 ],
								fn = fns[ i ];
							// deferred[ done | fail | progress ] for forwarding actions to newDefer
							deferred[ tuple[1] ]( jQuery.isFunction( fn ) ?
								function() {
									var returned = fn.apply( this, arguments );
									if ( returned && jQuery.isFunction( returned.promise ) ) {
										returned.promise()
											.done( newDefer.resolve )
											.fail( newDefer.reject )
											.progress( newDefer.notify );
									} else {
										newDefer[ action + "With" ]( this === deferred ? newDefer : this, [ returned ] );
									}
								} :
								newDefer[ action ]
							);
						});
						fns = null;
					}).promise();
				},
				// Get a promise for this deferred
				// If obj is provided, the promise aspect is added to the object
				promise: function( obj ) {
					return typeof obj === "object" ? jQuery.extend( obj, promise ) : promise;
				}
			},
			deferred = {};

		// Keep pipe for back-compat
		promise.pipe = promise.then;

		// Add list-specific methods
		jQuery.each( tuples, function( i, tuple ) {
			var list = tuple[ 2 ],
				stateString = tuple[ 3 ];

			// promise[ done | fail | progress ] = list.add
			promise[ tuple[1] ] = list.add;

			// Handle state
			if ( stateString ) {
				list.add(function() {
					// state = [ resolved | rejected ]
					state = stateString;

				// [ reject_list | resolve_list ].disable; progress_list.lock
				}, tuples[ i ^ 1 ][ 2 ].disable, tuples[ 2 ][ 2 ].lock );
			}

			// deferred[ resolve | reject | notify ] = list.fire
			deferred[ tuple[0] ] = list.fire;
			deferred[ tuple[0] + "With" ] = list.fireWith;
		});

		// Make the deferred a promise
		promise.promise( deferred );

		// Call given func if any
		if ( func ) {
			func.call( deferred, deferred );
		}

		// All done!
		return deferred;
	},

	// Deferred helper
	when: function( subordinate /* , ..., subordinateN */ ) {
		var i = 0,
			resolveValues = core_slice.call( arguments ),
			length = resolveValues.length,

			// the count of uncompleted subordinates
			remaining = length !== 1 || ( subordinate && jQuery.isFunction( subordinate.promise ) ) ? length : 0,

			// the master Deferred. If resolveValues consist of only a single Deferred, just use that.
			deferred = remaining === 1 ? subordinate : jQuery.Deferred(),

			// Update function for both resolve and progress values
			updateFunc = function( i, contexts, values ) {
				return function( value ) {
					contexts[ i ] = this;
					values[ i ] = arguments.length > 1 ? core_slice.call( arguments ) : value;
					if( values === progressValues ) {
						deferred.notifyWith( contexts, values );
					} else if ( !( --remaining ) ) {
						deferred.resolveWith( contexts, values );
					}
				};
			},

			progressValues, progressContexts, resolveContexts;

		// add listeners to Deferred subordinates; treat others as resolved
		if ( length > 1 ) {
			progressValues = new Array( length );
			progressContexts = new Array( length );
			resolveContexts = new Array( length );
			for ( ; i < length; i++ ) {
				if ( resolveValues[ i ] && jQuery.isFunction( resolveValues[ i ].promise ) ) {
					resolveValues[ i ].promise()
						.done( updateFunc( i, resolveContexts, resolveValues ) )
						.fail( deferred.reject )
						.progress( updateFunc( i, progressContexts, progressValues ) );
				} else {
					--remaining;
				}
			}
		}

		// if we're not waiting on anything, resolve the master
		if ( !remaining ) {
			deferred.resolveWith( resolveContexts, resolveValues );
		}

		return deferred.promise();
	}
});
jQuery.support = (function() {

	var support,
		all,
		a,
		select,
		opt,
		input,
		fragment,
		eventName,
		i,
		isSupported,
		clickFn,
		div = document.createElement("div");

	// Preliminary tests
	div.setAttribute( "className", "t" );
	div.innerHTML = "  <link/><table></table><a href='/a'>a</a><input type='checkbox'/>";

	all = div.getElementsByTagName("*");
	a = div.getElementsByTagName("a")[ 0 ];
	a.style.cssText = "top:1px;float:left;opacity:.5";

	// Can't get basic test support
	if ( !all || !all.length || !a ) {
		return {};
	}

	// First batch of supports tests
	select = document.createElement("select");
	opt = select.appendChild( document.createElement("option") );
	input = div.getElementsByTagName("input")[ 0 ];

	support = {
		// IE strips leading whitespace when .innerHTML is used
		leadingWhitespace: ( div.firstChild.nodeType === 3 ),

		// Make sure that tbody elements aren't automatically inserted
		// IE will insert them into empty tables
		tbody: !div.getElementsByTagName("tbody").length,

		// Make sure that link elements get serialized correctly by innerHTML
		// This requires a wrapper element in IE
		htmlSerialize: !!div.getElementsByTagName("link").length,

		// Get the style information from getAttribute
		// (IE uses .cssText instead)
		style: /top/.test( a.getAttribute("style") ),

		// Make sure that URLs aren't manipulated
		// (IE normalizes it by default)
		hrefNormalized: ( a.getAttribute("href") === "/a" ),

		// Make sure that element opacity exists
		// (IE uses filter instead)
		// Use a regex to work around a WebKit issue. See #5145
		opacity: /^0.5/.test( a.style.opacity ),

		// Verify style float existence
		// (IE uses styleFloat instead of cssFloat)
		cssFloat: !!a.style.cssFloat,

		// Make sure that if no value is specified for a checkbox
		// that it defaults to "on".
		// (WebKit defaults to "" instead)
		checkOn: ( input.value === "on" ),

		// Make sure that a selected-by-default option has a working selected property.
		// (WebKit defaults to false instead of true, IE too, if it's in an optgroup)
		optSelected: opt.selected,

		// Test setAttribute on camelCase class. If it works, we need attrFixes when doing get/setAttribute (ie6/7)
		getSetAttribute: div.className !== "t",

		// Tests for enctype support on a form(#6743)
		enctype: !!document.createElement("form").enctype,

		// Makes sure cloning an html5 element does not cause problems
		// Where outerHTML is undefined, this still works
		html5Clone: document.createElement("nav").cloneNode( true ).outerHTML !== "<:nav></:nav>",

		// jQuery.support.boxModel DEPRECATED in 1.8 since we don't support Quirks Mode
		boxModel: ( document.compatMode === "CSS1Compat" ),

		// Will be defined later
		submitBubbles: true,
		changeBubbles: true,
		focusinBubbles: false,
		deleteExpando: true,
		noCloneEvent: true,
		inlineBlockNeedsLayout: false,
		shrinkWrapBlocks: false,
		reliableMarginRight: true,
		boxSizingReliable: true,
		pixelPosition: false
	};

	// Make sure checked status is properly cloned
	input.checked = true;
	support.noCloneChecked = input.cloneNode( true ).checked;

	// Make sure that the options inside disabled selects aren't marked as disabled
	// (WebKit marks them as disabled)
	select.disabled = true;
	support.optDisabled = !opt.disabled;

	// Test to see if it's possible to delete an expando from an element
	// Fails in Internet Explorer
	try {
		delete div.test;
	} catch( e ) {
		support.deleteExpando = false;
	}

	if ( !div.addEventListener && div.attachEvent && div.fireEvent ) {
		div.attachEvent( "onclick", clickFn = function() {
			// Cloning a node shouldn't copy over any
			// bound event handlers (IE does this)
			support.noCloneEvent = false;
		});
		div.cloneNode( true ).fireEvent("onclick");
		div.detachEvent( "onclick", clickFn );
	}

	// Check if a radio maintains its value
	// after being appended to the DOM
	input = document.createElement("input");
	input.value = "t";
	input.setAttribute( "type", "radio" );
	support.radioValue = input.value === "t";

	input.setAttribute( "checked", "checked" );

	// #11217 - WebKit loses check when the name is after the checked attribute
	input.setAttribute( "name", "t" );

	div.appendChild( input );
	fragment = document.createDocumentFragment();
	fragment.appendChild( div.lastChild );

	// WebKit doesn't clone checked state correctly in fragments
	support.checkClone = fragment.cloneNode( true ).cloneNode( true ).lastChild.checked;

	// Check if a disconnected checkbox will retain its checked
	// value of true after appended to the DOM (IE6/7)
	support.appendChecked = input.checked;

	fragment.removeChild( input );
	fragment.appendChild( div );

	// Technique from Juriy Zaytsev
	// http://perfectionkills.com/detecting-event-support-without-browser-sniffing/
	// We only care about the case where non-standard event systems
	// are used, namely in IE. Short-circuiting here helps us to
	// avoid an eval call (in setAttribute) which can cause CSP
	// to go haywire. See: https://developer.mozilla.org/en/Security/CSP
	if ( div.attachEvent ) {
		for ( i in {
			submit: true,
			change: true,
			focusin: true
		}) {
			eventName = "on" + i;
			isSupported = ( eventName in div );
			if ( !isSupported ) {
				div.setAttribute( eventName, "return;" );
				isSupported = ( typeof div[ eventName ] === "function" );
			}
			support[ i + "Bubbles" ] = isSupported;
		}
	}

	// Run tests that need a body at doc ready
	jQuery(function() {
		var container, div, tds, marginDiv,
			divReset = "padding:0;margin:0;border:0;display:block;overflow:hidden;",
			body = document.getElementsByTagName("body")[0];

		if ( !body ) {
			// Return for frameset docs that don't have a body
			return;
		}

		container = document.createElement("div");
		container.style.cssText = "visibility:hidden;border:0;width:0;height:0;position:static;top:0;margin-top:1px";
		body.insertBefore( container, body.firstChild );

		// Construct the test element
		div = document.createElement("div");
		container.appendChild( div );

		// Check if table cells still have offsetWidth/Height when they are set
		// to display:none and there are still other visible table cells in a
		// table row; if so, offsetWidth/Height are not reliable for use when
		// determining if an element has been hidden directly using
		// display:none (it is still safe to use offsets if a parent element is
		// hidden; don safety goggles and see bug #4512 for more information).
		// (only IE 8 fails this test)
		div.innerHTML = "<table><tr><td></td><td>t</td></tr></table>";
		tds = div.getElementsByTagName("td");
		tds[ 0 ].style.cssText = "padding:0;margin:0;border:0;display:none";
		isSupported = ( tds[ 0 ].offsetHeight === 0 );

		tds[ 0 ].style.display = "";
		tds[ 1 ].style.display = "none";

		// Check if empty table cells still have offsetWidth/Height
		// (IE <= 8 fail this test)
		support.reliableHiddenOffsets = isSupported && ( tds[ 0 ].offsetHeight === 0 );

		// Check box-sizing and margin behavior
		div.innerHTML = "";
		div.style.cssText = "box-sizing:border-box;-moz-box-sizing:border-box;-webkit-box-sizing:border-box;padding:1px;border:1px;display:block;width:4px;margin-top:1%;position:absolute;top:1%;";
		support.boxSizing = ( div.offsetWidth === 4 );
		support.doesNotIncludeMarginInBodyOffset = ( body.offsetTop !== 1 );

		// NOTE: To any future maintainer, we've window.getComputedStyle
		// because jsdom on node.js will break without it.
		if ( window.getComputedStyle ) {
			support.pixelPosition = ( window.getComputedStyle( div, null ) || {} ).top !== "1%";
			support.boxSizingReliable = ( window.getComputedStyle( div, null ) || { width: "4px" } ).width === "4px";

			// Check if div with explicit width and no margin-right incorrectly
			// gets computed margin-right based on width of container. For more
			// info see bug #3333
			// Fails in WebKit before Feb 2011 nightlies
			// WebKit Bug 13343 - getComputedStyle returns wrong value for margin-right
			marginDiv = document.createElement("div");
			marginDiv.style.cssText = div.style.cssText = divReset;
			marginDiv.style.marginRight = marginDiv.style.width = "0";
			div.style.width = "1px";
			div.appendChild( marginDiv );
			support.reliableMarginRight =
				!parseFloat( ( window.getComputedStyle( marginDiv, null ) || {} ).marginRight );
		}

		if ( typeof div.style.zoom !== "undefined" ) {
			// Check if natively block-level elements act like inline-block
			// elements when setting their display to 'inline' and giving
			// them layout
			// (IE < 8 does this)
			div.innerHTML = "";
			div.style.cssText = divReset + "width:1px;padding:1px;display:inline;zoom:1";
			support.inlineBlockNeedsLayout = ( div.offsetWidth === 3 );

			// Check if elements with layout shrink-wrap their children
			// (IE 6 does this)
			div.style.display = "block";
			div.style.overflow = "visible";
			div.innerHTML = "<div></div>";
			div.firstChild.style.width = "5px";
			support.shrinkWrapBlocks = ( div.offsetWidth !== 3 );

			container.style.zoom = 1;
		}

		// Null elements to avoid leaks in IE
		body.removeChild( container );
		container = div = tds = marginDiv = null;
	});

	// Null elements to avoid leaks in IE
	fragment.removeChild( div );
	all = a = select = opt = input = fragment = div = null;

	return support;
})();
var rbrace = /(?:\{[\s\S]*\}|\[[\s\S]*\])$/,
	rmultiDash = /([A-Z])/g;

jQuery.extend({
	cache: {},

	deletedIds: [],

	// Please use with caution
	uuid: 0,

	// Unique for each copy of jQuery on the page
	// Non-digits removed to match rinlinejQuery
	expando: "jQuery" + ( jQuery.fn.jquery + Math.random() ).replace( /\D/g, "" ),

	// The following elements throw uncatchable exceptions if you
	// attempt to add expando properties to them.
	noData: {
		"embed": true,
		// Ban all objects except for Flash (which handle expandos)
		"object": "clsid:D27CDB6E-AE6D-11cf-96B8-444553540000",
		"applet": true
	},

	hasData: function( elem ) {
		elem = elem.nodeType ? jQuery.cache[ elem[jQuery.expando] ] : elem[ jQuery.expando ];
		return !!elem && !isEmptyDataObject( elem );
	},

	data: function( elem, name, data, pvt /* Internal Use Only */ ) {
		if ( !jQuery.acceptData( elem ) ) {
			return;
		}

		var thisCache, ret,
			internalKey = jQuery.expando,
			getByName = typeof name === "string",

			// We have to handle DOM nodes and JS objects differently because IE6-7
			// can't GC object references properly across the DOM-JS boundary
			isNode = elem.nodeType,

			// Only DOM nodes need the global jQuery cache; JS object data is
			// attached directly to the object so GC can occur automatically
			cache = isNode ? jQuery.cache : elem,

			// Only defining an ID for JS objects if its cache already exists allows
			// the code to shortcut on the same path as a DOM node with no cache
			id = isNode ? elem[ internalKey ] : elem[ internalKey ] && internalKey;

		// Avoid doing any more work than we need to when trying to get data on an
		// object that has no data at all
		if ( (!id || !cache[id] || (!pvt && !cache[id].data)) && getByName && data === undefined ) {
			return;
		}

		if ( !id ) {
			// Only DOM nodes need a new unique ID for each element since their data
			// ends up in the global cache
			if ( isNode ) {
				elem[ internalKey ] = id = jQuery.deletedIds.pop() || ++jQuery.uuid;
			} else {
				id = internalKey;
			}
		}

		if ( !cache[ id ] ) {
			cache[ id ] = {};

			// Avoids exposing jQuery metadata on plain JS objects when the object
			// is serialized using JSON.stringify
			if ( !isNode ) {
				cache[ id ].toJSON = jQuery.noop;
			}
		}

		// An object can be passed to jQuery.data instead of a key/value pair; this gets
		// shallow copied over onto the existing cache
		if ( typeof name === "object" || typeof name === "function" ) {
			if ( pvt ) {
				cache[ id ] = jQuery.extend( cache[ id ], name );
			} else {
				cache[ id ].data = jQuery.extend( cache[ id ].data, name );
			}
		}

		thisCache = cache[ id ];

		// jQuery data() is stored in a separate object inside the object's internal data
		// cache in order to avoid key collisions between internal data and user-defined
		// data.
		if ( !pvt ) {
			if ( !thisCache.data ) {
				thisCache.data = {};
			}

			thisCache = thisCache.data;
		}

		if ( data !== undefined ) {
			thisCache[ jQuery.camelCase( name ) ] = data;
		}

		// Check for both converted-to-camel and non-converted data property names
		// If a data property was specified
		if ( getByName ) {

			// First Try to find as-is property data
			ret = thisCache[ name ];

			// Test for null|undefined property data
			if ( ret == null ) {

				// Try to find the camelCased property
				ret = thisCache[ jQuery.camelCase( name ) ];
			}
		} else {
			ret = thisCache;
		}

		return ret;
	},

	removeData: function( elem, name, pvt /* Internal Use Only */ ) {
		if ( !jQuery.acceptData( elem ) ) {
			return;
		}

		var thisCache, i, l,

			isNode = elem.nodeType,

			// See jQuery.data for more information
			cache = isNode ? jQuery.cache : elem,
			id = isNode ? elem[ jQuery.expando ] : jQuery.expando;

		// If there is already no cache entry for this object, there is no
		// purpose in continuing
		if ( !cache[ id ] ) {
			return;
		}

		if ( name ) {

			thisCache = pvt ? cache[ id ] : cache[ id ].data;

			if ( thisCache ) {

				// Support array or space separated string names for data keys
				if ( !jQuery.isArray( name ) ) {

					// try the string as a key before any manipulation
					if ( name in thisCache ) {
						name = [ name ];
					} else {

						// split the camel cased version by spaces unless a key with the spaces exists
						name = jQuery.camelCase( name );
						if ( name in thisCache ) {
							name = [ name ];
						} else {
							name = name.split(" ");
						}
					}
				}

				for ( i = 0, l = name.length; i < l; i++ ) {
					delete thisCache[ name[i] ];
				}

				// If there is no data left in the cache, we want to continue
				// and let the cache object itself get destroyed
				if ( !( pvt ? isEmptyDataObject : jQuery.isEmptyObject )( thisCache ) ) {
					return;
				}
			}
		}

		// See jQuery.data for more information
		if ( !pvt ) {
			delete cache[ id ].data;

			// Don't destroy the parent cache unless the internal data object
			// had been the only thing left in it
			if ( !isEmptyDataObject( cache[ id ] ) ) {
				return;
			}
		}

		// Destroy the cache
		if ( isNode ) {
			jQuery.cleanData( [ elem ], true );

		// Use delete when supported for expandos or `cache` is not a window per isWindow (#10080)
		} else if ( jQuery.support.deleteExpando || cache != cache.window ) {
			delete cache[ id ];

		// When all else fails, null
		} else {
			cache[ id ] = null;
		}
	},

	// For internal use only.
	_data: function( elem, name, data ) {
		return jQuery.data( elem, name, data, true );
	},

	// A method for determining if a DOM node can handle the data expando
	acceptData: function( elem ) {
		var noData = elem.nodeName && jQuery.noData[ elem.nodeName.toLowerCase() ];

		// nodes accept data unless otherwise specified; rejection can be conditional
		return !noData || noData !== true && elem.getAttribute("classid") === noData;
	}
});

jQuery.fn.extend({
	data: function( key, value ) {
		var parts, part, attr, name, l,
			elem = this[0],
			i = 0,
			data = null;

		// Gets all values
		if ( key === undefined ) {
			if ( this.length ) {
				data = jQuery.data( elem );

				if ( elem.nodeType === 1 && !jQuery._data( elem, "parsedAttrs" ) ) {
					attr = elem.attributes;
					for ( l = attr.length; i < l; i++ ) {
						name = attr[i].name;

						if ( name.indexOf( "data-" ) === 0 ) {
							name = jQuery.camelCase( name.substring(5) );

							dataAttr( elem, name, data[ name ] );
						}
					}
					jQuery._data( elem, "parsedAttrs", true );
				}
			}

			return data;
		}

		// Sets multiple values
		if ( typeof key === "object" ) {
			return this.each(function() {
				jQuery.data( this, key );
			});
		}

		parts = key.split( ".", 2 );
		parts[1] = parts[1] ? "." + parts[1] : "";
		part = parts[1] + "!";

		return jQuery.access( this, function( value ) {

			if ( value === undefined ) {
				data = this.triggerHandler( "getData" + part, [ parts[0] ] );

				// Try to fetch any internally stored data first
				if ( data === undefined && elem ) {
					data = jQuery.data( elem, key );
					data = dataAttr( elem, key, data );
				}

				return data === undefined && parts[1] ?
					this.data( parts[0] ) :
					data;
			}

			parts[1] = value;
			this.each(function() {
				var self = jQuery( this );

				self.triggerHandler( "setData" + part, parts );
				jQuery.data( this, key, value );
				self.triggerHandler( "changeData" + part, parts );
			});
		}, null, value, arguments.length > 1, null, false );
	},

	removeData: function( key ) {
		return this.each(function() {
			jQuery.removeData( this, key );
		});
	}
});

function dataAttr( elem, key, data ) {
	// If nothing was found internally, try to fetch any
	// data from the HTML5 data-* attribute
	if ( data === undefined && elem.nodeType === 1 ) {

		var name = "data-" + key.replace( rmultiDash, "-$1" ).toLowerCase();

		data = elem.getAttribute( name );

		if ( typeof data === "string" ) {
			try {
				data = data === "true" ? true :
				data === "false" ? false :
				data === "null" ? null :
				// Only convert to a number if it doesn't change the string
				+data + "" === data ? +data :
				rbrace.test( data ) ? jQuery.parseJSON( data ) :
					data;
			} catch( e ) {}

			// Make sure we set the data so it isn't changed later
			jQuery.data( elem, key, data );

		} else {
			data = undefined;
		}
	}

	return data;
}

// checks a cache object for emptiness
function isEmptyDataObject( obj ) {
	var name;
	for ( name in obj ) {

		// if the public data object is empty, the private is still empty
		if ( name === "data" && jQuery.isEmptyObject( obj[name] ) ) {
			continue;
		}
		if ( name !== "toJSON" ) {
			return false;
		}
	}

	return true;
}
jQuery.extend({
	queue: function( elem, type, data ) {
		var queue;

		if ( elem ) {
			type = ( type || "fx" ) + "queue";
			queue = jQuery._data( elem, type );

			// Speed up dequeue by getting out quickly if this is just a lookup
			if ( data ) {
				if ( !queue || jQuery.isArray(data) ) {
					queue = jQuery._data( elem, type, jQuery.makeArray(data) );
				} else {
					queue.push( data );
				}
			}
			return queue || [];
		}
	},

	dequeue: function( elem, type ) {
		type = type || "fx";

		var queue = jQuery.queue( elem, type ),
			startLength = queue.length,
			fn = queue.shift(),
			hooks = jQuery._queueHooks( elem, type ),
			next = function() {
				jQuery.dequeue( elem, type );
			};

		// If the fx queue is dequeued, always remove the progress sentinel
		if ( fn === "inprogress" ) {
			fn = queue.shift();
			startLength--;
		}

		if ( fn ) {

			// Add a progress sentinel to prevent the fx queue from being
			// automatically dequeued
			if ( type === "fx" ) {
				queue.unshift( "inprogress" );
			}

			// clear up the last queue stop function
			delete hooks.stop;
			fn.call( elem, next, hooks );
		}

		if ( !startLength && hooks ) {
			hooks.empty.fire();
		}
	},

	// not intended for public consumption - generates a queueHooks object, or returns the current one
	_queueHooks: function( elem, type ) {
		var key = type + "queueHooks";
		return jQuery._data( elem, key ) || jQuery._data( elem, key, {
			empty: jQuery.Callbacks("once memory").add(function() {
				jQuery.removeData( elem, type + "queue", true );
				jQuery.removeData( elem, key, true );
			})
		});
	}
});

jQuery.fn.extend({
	queue: function( type, data ) {
		var setter = 2;

		if ( typeof type !== "string" ) {
			data = type;
			type = "fx";
			setter--;
		}

		if ( arguments.length < setter ) {
			return jQuery.queue( this[0], type );
		}

		return data === undefined ?
			this :
			this.each(function() {
				var queue = jQuery.queue( this, type, data );

				// ensure a hooks for this queue
				jQuery._queueHooks( this, type );

				if ( type === "fx" && queue[0] !== "inprogress" ) {
					jQuery.dequeue( this, type );
				}
			});
	},
	dequeue: function( type ) {
		return this.each(function() {
			jQuery.dequeue( this, type );
		});
	},
	// Based off of the plugin by Clint Helfers, with permission.
	// http://blindsignals.com/index.php/2009/07/jquery-delay/
	delay: function( time, type ) {
		time = jQuery.fx ? jQuery.fx.speeds[ time ] || time : time;
		type = type || "fx";

		return this.queue( type, function( next, hooks ) {
			var timeout = setTimeout( next, time );
			hooks.stop = function() {
				clearTimeout( timeout );
			};
		});
	},
	clearQueue: function( type ) {
		return this.queue( type || "fx", [] );
	},
	// Get a promise resolved when queues of a certain type
	// are emptied (fx is the type by default)
	promise: function( type, obj ) {
		var tmp,
			count = 1,
			defer = jQuery.Deferred(),
			elements = this,
			i = this.length,
			resolve = function() {
				if ( !( --count ) ) {
					defer.resolveWith( elements, [ elements ] );
				}
			};

		if ( typeof type !== "string" ) {
			obj = type;
			type = undefined;
		}
		type = type || "fx";

		while( i-- ) {
			tmp = jQuery._data( elements[ i ], type + "queueHooks" );
			if ( tmp && tmp.empty ) {
				count++;
				tmp.empty.add( resolve );
			}
		}
		resolve();
		return defer.promise( obj );
	}
});
var nodeHook, boolHook, fixSpecified,
	rclass = /[\t\r\n]/g,
	rreturn = /\r/g,
	rtype = /^(?:button|input)$/i,
	rfocusable = /^(?:button|input|object|select|textarea)$/i,
	rclickable = /^a(?:rea|)$/i,
	rboolean = /^(?:autofocus|autoplay|async|checked|controls|defer|disabled|hidden|loop|multiple|open|readonly|required|scoped|selected)$/i,
	getSetAttribute = jQuery.support.getSetAttribute;

jQuery.fn.extend({
	attr: function( name, value ) {
		return jQuery.access( this, jQuery.attr, name, value, arguments.length > 1 );
	},

	removeAttr: function( name ) {
		return this.each(function() {
			jQuery.removeAttr( this, name );
		});
	},

	prop: function( name, value ) {
		return jQuery.access( this, jQuery.prop, name, value, arguments.length > 1 );
	},

	removeProp: function( name ) {
		name = jQuery.propFix[ name ] || name;
		return this.each(function() {
			// try/catch handles cases where IE balks (such as removing a property on window)
			try {
				this[ name ] = undefined;
				delete this[ name ];
			} catch( e ) {}
		});
	},

	addClass: function( value ) {
		var classNames, i, l, elem,
			setClass, c, cl;

		if ( jQuery.isFunction( value ) ) {
			return this.each(function( j ) {
				jQuery( this ).addClass( value.call(this, j, this.className) );
			});
		}

		if ( value && typeof value === "string" ) {
			classNames = value.split( core_rspace );

			for ( i = 0, l = this.length; i < l; i++ ) {
				elem = this[ i ];

				if ( elem.nodeType === 1 ) {
					if ( !elem.className && classNames.length === 1 ) {
						elem.className = value;

					} else {
						setClass = " " + elem.className + " ";

						for ( c = 0, cl = classNames.length; c < cl; c++ ) {
							if ( !~setClass.indexOf( " " + classNames[ c ] + " " ) ) {
								setClass += classNames[ c ] + " ";
							}
						}
						elem.className = jQuery.trim( setClass );
					}
				}
			}
		}

		return this;
	},

	removeClass: function( value ) {
		var removes, className, elem, c, cl, i, l;

		if ( jQuery.isFunction( value ) ) {
			return this.each(function( j ) {
				jQuery( this ).removeClass( value.call(this, j, this.className) );
			});
		}
		if ( (value && typeof value === "string") || value === undefined ) {
			removes = ( value || "" ).split( core_rspace );

			for ( i = 0, l = this.length; i < l; i++ ) {
				elem = this[ i ];
				if ( elem.nodeType === 1 && elem.className ) {

					className = (" " + elem.className + " ").replace( rclass, " " );

					// loop over each item in the removal list
					for ( c = 0, cl = removes.length; c < cl; c++ ) {
						// Remove until there is nothing to remove,
						while ( className.indexOf(" " + removes[ c ] + " ") > -1 ) {
							className = className.replace( " " + removes[ c ] + " " , " " );
						}
					}
					elem.className = value ? jQuery.trim( className ) : "";
				}
			}
		}

		return this;
	},

	toggleClass: function( value, stateVal ) {
		var type = typeof value,
			isBool = typeof stateVal === "boolean";

		if ( jQuery.isFunction( value ) ) {
			return this.each(function( i ) {
				jQuery( this ).toggleClass( value.call(this, i, this.className, stateVal), stateVal );
			});
		}

		return this.each(function() {
			if ( type === "string" ) {
				// toggle individual class names
				var className,
					i = 0,
					self = jQuery( this ),
					state = stateVal,
					classNames = value.split( core_rspace );

				while ( (className = classNames[ i++ ]) ) {
					// check each className given, space separated list
					state = isBool ? state : !self.hasClass( className );
					self[ state ? "addClass" : "removeClass" ]( className );
				}

			} else if ( type === "undefined" || type === "boolean" ) {
				if ( this.className ) {
					// store className if set
					jQuery._data( this, "__className__", this.className );
				}

				// toggle whole className
				this.className = this.className || value === false ? "" : jQuery._data( this, "__className__" ) || "";
			}
		});
	},

	hasClass: function( selector ) {
		var className = " " + selector + " ",
			i = 0,
			l = this.length;
		for ( ; i < l; i++ ) {
			if ( this[i].nodeType === 1 && (" " + this[i].className + " ").replace(rclass, " ").indexOf( className ) > -1 ) {
				return true;
			}
		}

		return false;
	},

	val: function( value ) {
		var hooks, ret, isFunction,
			elem = this[0];

		if ( !arguments.length ) {
			if ( elem ) {
				hooks = jQuery.valHooks[ elem.type ] || jQuery.valHooks[ elem.nodeName.toLowerCase() ];

				if ( hooks && "get" in hooks && (ret = hooks.get( elem, "value" )) !== undefined ) {
					return ret;
				}

				ret = elem.value;

				return typeof ret === "string" ?
					// handle most common string cases
					ret.replace(rreturn, "") :
					// handle cases where value is null/undef or number
					ret == null ? "" : ret;
			}

			return;
		}

		isFunction = jQuery.isFunction( value );

		return this.each(function( i ) {
			var val,
				self = jQuery(this);

			if ( this.nodeType !== 1 ) {
				return;
			}

			if ( isFunction ) {
				val = value.call( this, i, self.val() );
			} else {
				val = value;
			}

			// Treat null/undefined as ""; convert numbers to string
			if ( val == null ) {
				val = "";
			} else if ( typeof val === "number" ) {
				val += "";
			} else if ( jQuery.isArray( val ) ) {
				val = jQuery.map(val, function ( value ) {
					return value == null ? "" : value + "";
				});
			}

			hooks = jQuery.valHooks[ this.type ] || jQuery.valHooks[ this.nodeName.toLowerCase() ];

			// If set returns undefined, fall back to normal setting
			if ( !hooks || !("set" in hooks) || hooks.set( this, val, "value" ) === undefined ) {
				this.value = val;
			}
		});
	}
});

jQuery.extend({
	valHooks: {
		option: {
			get: function( elem ) {
				// attributes.value is undefined in Blackberry 4.7 but
				// uses .value. See #6932
				var val = elem.attributes.value;
				return !val || val.specified ? elem.value : elem.text;
			}
		},
		select: {
			get: function( elem ) {
				var value, i, max, option,
					index = elem.selectedIndex,
					values = [],
					options = elem.options,
					one = elem.type === "select-one";

				// Nothing was selected
				if ( index < 0 ) {
					return null;
				}

				// Loop through all the selected options
				i = one ? index : 0;
				max = one ? index + 1 : options.length;
				for ( ; i < max; i++ ) {
					option = options[ i ];

					// Don't return options that are disabled or in a disabled optgroup
					if ( option.selected && (jQuery.support.optDisabled ? !option.disabled : option.getAttribute("disabled") === null) &&
							(!option.parentNode.disabled || !jQuery.nodeName( option.parentNode, "optgroup" )) ) {

						// Get the specific value for the option
						value = jQuery( option ).val();

						// We don't need an array for one selects
						if ( one ) {
							return value;
						}

						// Multi-Selects return an array
						values.push( value );
					}
				}

				// Fixes Bug #2551 -- select.val() broken in IE after form.reset()
				if ( one && !values.length && options.length ) {
					return jQuery( options[ index ] ).val();
				}

				return values;
			},

			set: function( elem, value ) {
				var values = jQuery.makeArray( value );

				jQuery(elem).find("option").each(function() {
					this.selected = jQuery.inArray( jQuery(this).val(), values ) >= 0;
				});

				if ( !values.length ) {
					elem.selectedIndex = -1;
				}
				return values;
			}
		}
	},

	// Unused in 1.8, left in so attrFn-stabbers won't die; remove in 1.9
	attrFn: {},

	attr: function( elem, name, value, pass ) {
		var ret, hooks, notxml,
			nType = elem.nodeType;

		// don't get/set attributes on text, comment and attribute nodes
		if ( !elem || nType === 3 || nType === 8 || nType === 2 ) {
			return;
		}

		if ( pass && jQuery.isFunction( jQuery.fn[ name ] ) ) {
			return jQuery( elem )[ name ]( value );
		}

		// Fallback to prop when attributes are not supported
		if ( typeof elem.getAttribute === "undefined" ) {
			return jQuery.prop( elem, name, value );
		}

		notxml = nType !== 1 || !jQuery.isXMLDoc( elem );

		// All attributes are lowercase
		// Grab necessary hook if one is defined
		if ( notxml ) {
			name = name.toLowerCase();
			hooks = jQuery.attrHooks[ name ] || ( rboolean.test( name ) ? boolHook : nodeHook );
		}

		if ( value !== undefined ) {

			if ( value === null ) {
				jQuery.removeAttr( elem, name );
				return;

			} else if ( hooks && "set" in hooks && notxml && (ret = hooks.set( elem, value, name )) !== undefined ) {
				return ret;

			} else {
				elem.setAttribute( name, "" + value );
				return value;
			}

		} else if ( hooks && "get" in hooks && notxml && (ret = hooks.get( elem, name )) !== null ) {
			return ret;

		} else {

			ret = elem.getAttribute( name );

			// Non-existent attributes return null, we normalize to undefined
			return ret === null ?
				undefined :
				ret;
		}
	},

	removeAttr: function( elem, value ) {
		var propName, attrNames, name, isBool,
			i = 0;

		if ( value && elem.nodeType === 1 ) {

			attrNames = value.split( core_rspace );

			for ( ; i < attrNames.length; i++ ) {
				name = attrNames[ i ];

				if ( name ) {
					propName = jQuery.propFix[ name ] || name;
					isBool = rboolean.test( name );

					// See #9699 for explanation of this approach (setting first, then removal)
					// Do not do this for boolean attributes (see #10870)
					if ( !isBool ) {
						jQuery.attr( elem, name, "" );
					}
					elem.removeAttribute( getSetAttribute ? name : propName );

					// Set corresponding property to false for boolean attributes
					if ( isBool && propName in elem ) {
						elem[ propName ] = false;
					}
				}
			}
		}
	},

	attrHooks: {
		type: {
			set: function( elem, value ) {
				// We can't allow the type property to be changed (since it causes problems in IE)
				if ( rtype.test( elem.nodeName ) && elem.parentNode ) {
					jQuery.error( "type property can't be changed" );
				} else if ( !jQuery.support.radioValue && value === "radio" && jQuery.nodeName(elem, "input") ) {
					// Setting the type on a radio button after the value resets the value in IE6-9
					// Reset value to it's default in case type is set after value
					// This is for element creation
					var val = elem.value;
					elem.setAttribute( "type", value );
					if ( val ) {
						elem.value = val;
					}
					return value;
				}
			}
		},
		// Use the value property for back compat
		// Use the nodeHook for button elements in IE6/7 (#1954)
		value: {
			get: function( elem, name ) {
				if ( nodeHook && jQuery.nodeName( elem, "button" ) ) {
					return nodeHook.get( elem, name );
				}
				return name in elem ?
					elem.value :
					null;
			},
			set: function( elem, value, name ) {
				if ( nodeHook && jQuery.nodeName( elem, "button" ) ) {
					return nodeHook.set( elem, value, name );
				}
				// Does not return so that setAttribute is also used
				elem.value = value;
			}
		}
	},

	propFix: {
		tabindex: "tabIndex",
		readonly: "readOnly",
		"for": "htmlFor",
		"class": "className",
		maxlength: "maxLength",
		cellspacing: "cellSpacing",
		cellpadding: "cellPadding",
		rowspan: "rowSpan",
		colspan: "colSpan",
		usemap: "useMap",
		frameborder: "frameBorder",
		contenteditable: "contentEditable"
	},

	prop: function( elem, name, value ) {
		var ret, hooks, notxml,
			nType = elem.nodeType;

		// don't get/set properties on text, comment and attribute nodes
		if ( !elem || nType === 3 || nType === 8 || nType === 2 ) {
			return;
		}

		notxml = nType !== 1 || !jQuery.isXMLDoc( elem );

		if ( notxml ) {
			// Fix name and attach hooks
			name = jQuery.propFix[ name ] || name;
			hooks = jQuery.propHooks[ name ];
		}

		if ( value !== undefined ) {
			if ( hooks && "set" in hooks && (ret = hooks.set( elem, value, name )) !== undefined ) {
				return ret;

			} else {
				return ( elem[ name ] = value );
			}

		} else {
			if ( hooks && "get" in hooks && (ret = hooks.get( elem, name )) !== null ) {
				return ret;

			} else {
				return elem[ name ];
			}
		}
	},

	propHooks: {
		tabIndex: {
			get: function( elem ) {
				// elem.tabIndex doesn't always return the correct value when it hasn't been explicitly set
				// http://fluidproject.org/blog/2008/01/09/getting-setting-and-removing-tabindex-values-with-javascript/
				var attributeNode = elem.getAttributeNode("tabindex");

				return attributeNode && attributeNode.specified ?
					parseInt( attributeNode.value, 10 ) :
					rfocusable.test( elem.nodeName ) || rclickable.test( elem.nodeName ) && elem.href ?
						0 :
						undefined;
			}
		}
	}
});

// Hook for boolean attributes
boolHook = {
	get: function( elem, name ) {
		// Align boolean attributes with corresponding properties
		// Fall back to attribute presence where some booleans are not supported
		var attrNode,
			property = jQuery.prop( elem, name );
		return property === true || typeof property !== "boolean" && ( attrNode = elem.getAttributeNode(name) ) && attrNode.nodeValue !== false ?
			name.toLowerCase() :
			undefined;
	},
	set: function( elem, value, name ) {
		var propName;
		if ( value === false ) {
			// Remove boolean attributes when set to false
			jQuery.removeAttr( elem, name );
		} else {
			// value is true since we know at this point it's type boolean and not false
			// Set boolean attributes to the same name and set the DOM property
			propName = jQuery.propFix[ name ] || name;
			if ( propName in elem ) {
				// Only set the IDL specifically if it already exists on the element
				elem[ propName ] = true;
			}

			elem.setAttribute( name, name.toLowerCase() );
		}
		return name;
	}
};

// IE6/7 do not support getting/setting some attributes with get/setAttribute
if ( !getSetAttribute ) {

	fixSpecified = {
		name: true,
		id: true,
		coords: true
	};

	// Use this for any attribute in IE6/7
	// This fixes almost every IE6/7 issue
	nodeHook = jQuery.valHooks.button = {
		get: function( elem, name ) {
			var ret;
			ret = elem.getAttributeNode( name );
			return ret && ( fixSpecified[ name ] ? ret.value !== "" : ret.specified ) ?
				ret.value :
				undefined;
		},
		set: function( elem, value, name ) {
			// Set the existing or create a new attribute node
			var ret = elem.getAttributeNode( name );
			if ( !ret ) {
				ret = document.createAttribute( name );
				elem.setAttributeNode( ret );
			}
			return ( ret.value = value + "" );
		}
	};

	// Set width and height to auto instead of 0 on empty string( Bug #8150 )
	// This is for removals
	jQuery.each([ "width", "height" ], function( i, name ) {
		jQuery.attrHooks[ name ] = jQuery.extend( jQuery.attrHooks[ name ], {
			set: function( elem, value ) {
				if ( value === "" ) {
					elem.setAttribute( name, "auto" );
					return value;
				}
			}
		});
	});

	// Set contenteditable to false on removals(#10429)
	// Setting to empty string throws an error as an invalid value
	jQuery.attrHooks.contenteditable = {
		get: nodeHook.get,
		set: function( elem, value, name ) {
			if ( value === "" ) {
				value = "false";
			}
			nodeHook.set( elem, value, name );
		}
	};
}


// Some attributes require a special call on IE
if ( !jQuery.support.hrefNormalized ) {
	jQuery.each([ "href", "src", "width", "height" ], function( i, name ) {
		jQuery.attrHooks[ name ] = jQuery.extend( jQuery.attrHooks[ name ], {
			get: function( elem ) {
				var ret = elem.getAttribute( name, 2 );
				return ret === null ? undefined : ret;
			}
		});
	});
}

if ( !jQuery.support.style ) {
	jQuery.attrHooks.style = {
		get: function( elem ) {
			// Return undefined in the case of empty string
			// Normalize to lowercase since IE uppercases css property names
			return elem.style.cssText.toLowerCase() || undefined;
		},
		set: function( elem, value ) {
			return ( elem.style.cssText = "" + value );
		}
	};
}

// Safari mis-reports the default selected property of an option
// Accessing the parent's selectedIndex property fixes it
if ( !jQuery.support.optSelected ) {
	jQuery.propHooks.selected = jQuery.extend( jQuery.propHooks.selected, {
		get: function( elem ) {
			var parent = elem.parentNode;

			if ( parent ) {
				parent.selectedIndex;

				// Make sure that it also works with optgroups, see #5701
				if ( parent.parentNode ) {
					parent.parentNode.selectedIndex;
				}
			}
			return null;
		}
	});
}

// IE6/7 call enctype encoding
if ( !jQuery.support.enctype ) {
	jQuery.propFix.enctype = "encoding";
}

// Radios and checkboxes getter/setter
if ( !jQuery.support.checkOn ) {
	jQuery.each([ "radio", "checkbox" ], function() {
		jQuery.valHooks[ this ] = {
			get: function( elem ) {
				// Handle the case where in Webkit "" is returned instead of "on" if a value isn't specified
				return elem.getAttribute("value") === null ? "on" : elem.value;
			}
		};
	});
}
jQuery.each([ "radio", "checkbox" ], function() {
	jQuery.valHooks[ this ] = jQuery.extend( jQuery.valHooks[ this ], {
		set: function( elem, value ) {
			if ( jQuery.isArray( value ) ) {
				return ( elem.checked = jQuery.inArray( jQuery(elem).val(), value ) >= 0 );
			}
		}
	});
});
var rformElems = /^(?:textarea|input|select)$/i,
	rtypenamespace = /^([^\.]*|)(?:\.(.+)|)$/,
	rhoverHack = /(?:^|\s)hover(\.\S+|)\b/,
	rkeyEvent = /^key/,
	rmouseEvent = /^(?:mouse|contextmenu)|click/,
	rfocusMorph = /^(?:focusinfocus|focusoutblur)$/,
	hoverHack = function( events ) {
		return jQuery.event.special.hover ? events : events.replace( rhoverHack, "mouseenter$1 mouseleave$1" );
	};

/*
 * Helper functions for managing events -- not part of the public interface.
 * Props to Dean Edwards' addEvent library for many of the ideas.
 */
jQuery.event = {

	add: function( elem, types, handler, data, selector ) {

		var elemData, eventHandle, events,
			t, tns, type, namespaces, handleObj,
			handleObjIn, handlers, special;

		// Don't attach events to noData or text/comment nodes (allow plain objects tho)
		if ( elem.nodeType === 3 || elem.nodeType === 8 || !types || !handler || !(elemData = jQuery._data( elem )) ) {
			return;
		}

		// Caller can pass in an object of custom data in lieu of the handler
		if ( handler.handler ) {
			handleObjIn = handler;
			handler = handleObjIn.handler;
			selector = handleObjIn.selector;
		}

		// Make sure that the handler has a unique ID, used to find/remove it later
		if ( !handler.guid ) {
			handler.guid = jQuery.guid++;
		}

		// Init the element's event structure and main handler, if this is the first
		events = elemData.events;
		if ( !events ) {
			elemData.events = events = {};
		}
		eventHandle = elemData.handle;
		if ( !eventHandle ) {
			elemData.handle = eventHandle = function( e ) {
				// Discard the second event of a jQuery.event.trigger() and
				// when an event is called after a page has unloaded
				return typeof jQuery !== "undefined" && (!e || jQuery.event.triggered !== e.type) ?
					jQuery.event.dispatch.apply( eventHandle.elem, arguments ) :
					undefined;
			};
			// Add elem as a property of the handle fn to prevent a memory leak with IE non-native events
			eventHandle.elem = elem;
		}

		// Handle multiple events separated by a space
		// jQuery(...).bind("mouseover mouseout", fn);
		types = jQuery.trim( hoverHack(types) ).split( " " );
		for ( t = 0; t < types.length; t++ ) {

			tns = rtypenamespace.exec( types[t] ) || [];
			type = tns[1];
			namespaces = ( tns[2] || "" ).split( "." ).sort();

			// If event changes its type, use the special event handlers for the changed type
			special = jQuery.event.special[ type ] || {};

			// If selector defined, determine special event api type, otherwise given type
			type = ( selector ? special.delegateType : special.bindType ) || type;

			// Update special based on newly reset type
			special = jQuery.event.special[ type ] || {};

			// handleObj is passed to all event handlers
			handleObj = jQuery.extend({
				type: type,
				origType: tns[1],
				data: data,
				handler: handler,
				guid: handler.guid,
				selector: selector,
				namespace: namespaces.join(".")
			}, handleObjIn );

			// Init the event handler queue if we're the first
			handlers = events[ type ];
			if ( !handlers ) {
				handlers = events[ type ] = [];
				handlers.delegateCount = 0;

				// Only use addEventListener/attachEvent if the special events handler returns false
				if ( !special.setup || special.setup.call( elem, data, namespaces, eventHandle ) === false ) {
					// Bind the global event handler to the element
					if ( elem.addEventListener ) {
						elem.addEventListener( type, eventHandle, false );

					} else if ( elem.attachEvent ) {
						elem.attachEvent( "on" + type, eventHandle );
					}
				}
			}

			if ( special.add ) {
				special.add.call( elem, handleObj );

				if ( !handleObj.handler.guid ) {
					handleObj.handler.guid = handler.guid;
				}
			}

			// Add to the element's handler list, delegates in front
			if ( selector ) {
				handlers.splice( handlers.delegateCount++, 0, handleObj );
			} else {
				handlers.push( handleObj );
			}

			// Keep track of which events have ever been used, for event optimization
			jQuery.event.global[ type ] = true;
		}

		// Nullify elem to prevent memory leaks in IE
		elem = null;
	},

	global: {},

	// Detach an event or set of events from an element
	remove: function( elem, types, handler, selector, mappedTypes ) {

		var t, tns, type, origType, namespaces, origCount,
			j, events, special, eventType, handleObj,
			elemData = jQuery.hasData( elem ) && jQuery._data( elem );

		if ( !elemData || !(events = elemData.events) ) {
			return;
		}

		// Once for each type.namespace in types; type may be omitted
		types = jQuery.trim( hoverHack( types || "" ) ).split(" ");
		for ( t = 0; t < types.length; t++ ) {
			tns = rtypenamespace.exec( types[t] ) || [];
			type = origType = tns[1];
			namespaces = tns[2];

			// Unbind all events (on this namespace, if provided) for the element
			if ( !type ) {
				for ( type in events ) {
					jQuery.event.remove( elem, type + types[ t ], handler, selector, true );
				}
				continue;
			}

			special = jQuery.event.special[ type ] || {};
			type = ( selector? special.delegateType : special.bindType ) || type;
			eventType = events[ type ] || [];
			origCount = eventType.length;
			namespaces = namespaces ? new RegExp("(^|\\.)" + namespaces.split(".").sort().join("\\.(?:.*\\.|)") + "(\\.|$)") : null;

			// Remove matching events
			for ( j = 0; j < eventType.length; j++ ) {
				handleObj = eventType[ j ];

				if ( ( mappedTypes || origType === handleObj.origType ) &&
					 ( !handler || handler.guid === handleObj.guid ) &&
					 ( !namespaces || namespaces.test( handleObj.namespace ) ) &&
					 ( !selector || selector === handleObj.selector || selector === "**" && handleObj.selector ) ) {
					eventType.splice( j--, 1 );

					if ( handleObj.selector ) {
						eventType.delegateCount--;
					}
					if ( special.remove ) {
						special.remove.call( elem, handleObj );
					}
				}
			}

			// Remove generic event handler if we removed something and no more handlers exist
			// (avoids potential for endless recursion during removal of special event handlers)
			if ( eventType.length === 0 && origCount !== eventType.length ) {
				if ( !special.teardown || special.teardown.call( elem, namespaces, elemData.handle ) === false ) {
					jQuery.removeEvent( elem, type, elemData.handle );
				}

				delete events[ type ];
			}
		}

		// Remove the expando if it's no longer used
		if ( jQuery.isEmptyObject( events ) ) {
			delete elemData.handle;

			// removeData also checks for emptiness and clears the expando if empty
			// so use it instead of delete
			jQuery.removeData( elem, "events", true );
		}
	},

	// Events that are safe to short-circuit if no handlers are attached.
	// Native DOM events should not be added, they may have inline handlers.
	customEvent: {
		"getData": true,
		"setData": true,
		"changeData": true
	},

	trigger: function( event, data, elem, onlyHandlers ) {
		// Don't do events on text and comment nodes
		if ( elem && (elem.nodeType === 3 || elem.nodeType === 8) ) {
			return;
		}

		// Event object or event type
		var cache, exclusive, i, cur, old, ontype, special, handle, eventPath, bubbleType,
			type = event.type || event,
			namespaces = [];

		// focus/blur morphs to focusin/out; ensure we're not firing them right now
		if ( rfocusMorph.test( type + jQuery.event.triggered ) ) {
			return;
		}

		if ( type.indexOf( "!" ) >= 0 ) {
			// Exclusive events trigger only for the exact event (no namespaces)
			type = type.slice(0, -1);
			exclusive = true;
		}

		if ( type.indexOf( "." ) >= 0 ) {
			// Namespaced trigger; create a regexp to match event type in handle()
			namespaces = type.split(".");
			type = namespaces.shift();
			namespaces.sort();
		}

		if ( (!elem || jQuery.event.customEvent[ type ]) && !jQuery.event.global[ type ] ) {
			// No jQuery handlers for this event type, and it can't have inline handlers
			return;
		}

		// Caller can pass in an Event, Object, or just an event type string
		event = typeof event === "object" ?
			// jQuery.Event object
			event[ jQuery.expando ] ? event :
			// Object literal
			new jQuery.Event( type, event ) :
			// Just the event type (string)
			new jQuery.Event( type );

		event.type = type;
		event.isTrigger = true;
		event.exclusive = exclusive;
		event.namespace = namespaces.join( "." );
		event.namespace_re = event.namespace? new RegExp("(^|\\.)" + namespaces.join("\\.(?:.*\\.|)") + "(\\.|$)") : null;
		ontype = type.indexOf( ":" ) < 0 ? "on" + type : "";

		// Handle a global trigger
		if ( !elem ) {

			// TODO: Stop taunting the data cache; remove global events and always attach to document
			cache = jQuery.cache;
			for ( i in cache ) {
				if ( cache[ i ].events && cache[ i ].events[ type ] ) {
					jQuery.event.trigger( event, data, cache[ i ].handle.elem, true );
				}
			}
			return;
		}

		// Clean up the event in case it is being reused
		event.result = undefined;
		if ( !event.target ) {
			event.target = elem;
		}

		// Clone any incoming data and prepend the event, creating the handler arg list
		data = data != null ? jQuery.makeArray( data ) : [];
		data.unshift( event );

		// Allow special events to draw outside the lines
		special = jQuery.event.special[ type ] || {};
		if ( special.trigger && special.trigger.apply( elem, data ) === false ) {
			return;
		}

		// Determine event propagation path in advance, per W3C events spec (#9951)
		// Bubble up to document, then to window; watch for a global ownerDocument var (#9724)
		eventPath = [[ elem, special.bindType || type ]];
		if ( !onlyHandlers && !special.noBubble && !jQuery.isWindow( elem ) ) {

			bubbleType = special.delegateType || type;
			cur = rfocusMorph.test( bubbleType + type ) ? elem : elem.parentNode;
			for ( old = elem; cur; cur = cur.parentNode ) {
				eventPath.push([ cur, bubbleType ]);
				old = cur;
			}

			// Only add window if we got to document (e.g., not plain obj or detached DOM)
			if ( old === (elem.ownerDocument || document) ) {
				eventPath.push([ old.defaultView || old.parentWindow || window, bubbleType ]);
			}
		}

		// Fire handlers on the event path
		for ( i = 0; i < eventPath.length && !event.isPropagationStopped(); i++ ) {

			cur = eventPath[i][0];
			event.type = eventPath[i][1];

			handle = ( jQuery._data( cur, "events" ) || {} )[ event.type ] && jQuery._data( cur, "handle" );
			if ( handle ) {
				handle.apply( cur, data );
			}
			// Note that this is a bare JS function and not a jQuery handler
			handle = ontype && cur[ ontype ];
			if ( handle && jQuery.acceptData( cur ) && handle.apply( cur, data ) === false ) {
				event.preventDefault();
			}
		}
		event.type = type;

		// If nobody prevented the default action, do it now
		if ( !onlyHandlers && !event.isDefaultPrevented() ) {

			if ( (!special._default || special._default.apply( elem.ownerDocument, data ) === false) &&
				!(type === "click" && jQuery.nodeName( elem, "a" )) && jQuery.acceptData( elem ) ) {

				// Call a native DOM method on the target with the same name name as the event.
				// Can't use an .isFunction() check here because IE6/7 fails that test.
				// Don't do default actions on window, that's where global variables be (#6170)
				// IE<9 dies on focus/blur to hidden element (#1486)
				if ( ontype && elem[ type ] && ((type !== "focus" && type !== "blur") || event.target.offsetWidth !== 0) && !jQuery.isWindow( elem ) ) {

					// Don't re-trigger an onFOO event when we call its FOO() method
					old = elem[ ontype ];

					if ( old ) {
						elem[ ontype ] = null;
					}

					// Prevent re-triggering of the same event, since we already bubbled it above
					jQuery.event.triggered = type;
					elem[ type ]();
					jQuery.event.triggered = undefined;

					if ( old ) {
						elem[ ontype ] = old;
					}
				}
			}
		}

		return event.result;
	},

	dispatch: function( event ) {

		// Make a writable jQuery.Event from the native event object
		event = jQuery.event.fix( event || window.event );

		var i, j, cur, ret, selMatch, matched, matches, handleObj, sel, related,
			handlers = ( (jQuery._data( this, "events" ) || {} )[ event.type ] || []),
			delegateCount = handlers.delegateCount,
			args = [].slice.call( arguments ),
			run_all = !event.exclusive && !event.namespace,
			special = jQuery.event.special[ event.type ] || {},
			handlerQueue = [];

		// Use the fix-ed jQuery.Event rather than the (read-only) native event
		args[0] = event;
		event.delegateTarget = this;

		// Call the preDispatch hook for the mapped type, and let it bail if desired
		if ( special.preDispatch && special.preDispatch.call( this, event ) === false ) {
			return;
		}

		// Determine handlers that should run if there are delegated events
		// Avoid non-left-click bubbling in Firefox (#3861)
		if ( delegateCount && !(event.button && event.type === "click") ) {

			for ( cur = event.target; cur != this; cur = cur.parentNode || this ) {

				// Don't process clicks (ONLY) on disabled elements (#6911, #8165, #11382, #11764)
				if ( cur.disabled !== true || event.type !== "click" ) {
					selMatch = {};
					matches = [];
					for ( i = 0; i < delegateCount; i++ ) {
						handleObj = handlers[ i ];
						sel = handleObj.selector;

						if ( selMatch[ sel ] === undefined ) {
							selMatch[ sel ] = jQuery( sel, this ).index( cur ) >= 0;
						}
						if ( selMatch[ sel ] ) {
							matches.push( handleObj );
						}
					}
					if ( matches.length ) {
						handlerQueue.push({ elem: cur, matches: matches });
					}
				}
			}
		}

		// Add the remaining (directly-bound) handlers
		if ( handlers.length > delegateCount ) {
			handlerQueue.push({ elem: this, matches: handlers.slice( delegateCount ) });
		}

		// Run delegates first; they may want to stop propagation beneath us
		for ( i = 0; i < handlerQueue.length && !event.isPropagationStopped(); i++ ) {
			matched = handlerQueue[ i ];
			event.currentTarget = matched.elem;

			for ( j = 0; j < matched.matches.length && !event.isImmediatePropagationStopped(); j++ ) {
				handleObj = matched.matches[ j ];

				// Triggered event must either 1) be non-exclusive and have no namespace, or
				// 2) have namespace(s) a subset or equal to those in the bound event (both can have no namespace).
				if ( run_all || (!event.namespace && !handleObj.namespace) || event.namespace_re && event.namespace_re.test( handleObj.namespace ) ) {

					event.data = handleObj.data;
					event.handleObj = handleObj;

					ret = ( (jQuery.event.special[ handleObj.origType ] || {}).handle || handleObj.handler )
							.apply( matched.elem, args );

					if ( ret !== undefined ) {
						event.result = ret;
						if ( ret === false ) {
							event.preventDefault();
							event.stopPropagation();
						}
					}
				}
			}
		}

		// Call the postDispatch hook for the mapped type
		if ( special.postDispatch ) {
			special.postDispatch.call( this, event );
		}

		return event.result;
	},

	// Includes some event props shared by KeyEvent and MouseEvent
	// *** attrChange attrName relatedNode srcElement  are not normalized, non-W3C, deprecated, will be removed in 1.8 ***
	props: "attrChange attrName relatedNode srcElement altKey bubbles cancelable ctrlKey currentTarget eventPhase metaKey relatedTarget shiftKey target timeStamp view which".split(" "),

	fixHooks: {},

	keyHooks: {
		props: "char charCode key keyCode".split(" "),
		filter: function( event, original ) {

			// Add which for key events
			if ( event.which == null ) {
				event.which = original.charCode != null ? original.charCode : original.keyCode;
			}

			return event;
		}
	},

	mouseHooks: {
		props: "button buttons clientX clientY fromElement offsetX offsetY pageX pageY screenX screenY toElement".split(" "),
		filter: function( event, original ) {
			var eventDoc, doc, body,
				button = original.button,
				fromElement = original.fromElement;

			// Calculate pageX/Y if missing and clientX/Y available
			if ( event.pageX == null && original.clientX != null ) {
				eventDoc = event.target.ownerDocument || document;
				doc = eventDoc.documentElement;
				body = eventDoc.body;

				event.pageX = original.clientX + ( doc && doc.scrollLeft || body && body.scrollLeft || 0 ) - ( doc && doc.clientLeft || body && body.clientLeft || 0 );
				event.pageY = original.clientY + ( doc && doc.scrollTop  || body && body.scrollTop  || 0 ) - ( doc && doc.clientTop  || body && body.clientTop  || 0 );
			}

			// Add relatedTarget, if necessary
			if ( !event.relatedTarget && fromElement ) {
				event.relatedTarget = fromElement === event.target ? original.toElement : fromElement;
			}

			// Add which for click: 1 === left; 2 === middle; 3 === right
			// Note: button is not normalized, so don't use it
			if ( !event.which && button !== undefined ) {
				event.which = ( button & 1 ? 1 : ( button & 2 ? 3 : ( button & 4 ? 2 : 0 ) ) );
			}

			return event;
		}
	},

	fix: function( event ) {
		if ( event[ jQuery.expando ] ) {
			return event;
		}

		// Create a writable copy of the event object and normalize some properties
		var i, prop,
			originalEvent = event,
			fixHook = jQuery.event.fixHooks[ event.type ] || {},
			copy = fixHook.props ? this.props.concat( fixHook.props ) : this.props;

		event = jQuery.Event( originalEvent );

		for ( i = copy.length; i; ) {
			prop = copy[ --i ];
			event[ prop ] = originalEvent[ prop ];
		}

		// Fix target property, if necessary (#1925, IE 6/7/8 & Safari2)
		if ( !event.target ) {
			event.target = originalEvent.srcElement || document;
		}

		// Target should not be a text node (#504, Safari)
		if ( event.target.nodeType === 3 ) {
			event.target = event.target.parentNode;
		}

		// For mouse/key events, metaKey==false if it's undefined (#3368, #11328; IE6/7/8)
		event.metaKey = !!event.metaKey;

		return fixHook.filter? fixHook.filter( event, originalEvent ) : event;
	},

	special: {
		load: {
			// Prevent triggered image.load events from bubbling to window.load
			noBubble: true
		},

		focus: {
			delegateType: "focusin"
		},
		blur: {
			delegateType: "focusout"
		},

		beforeunload: {
			setup: function( data, namespaces, eventHandle ) {
				// We only want to do this special case on windows
				if ( jQuery.isWindow( this ) ) {
					this.onbeforeunload = eventHandle;
				}
			},

			teardown: function( namespaces, eventHandle ) {
				if ( this.onbeforeunload === eventHandle ) {
					this.onbeforeunload = null;
				}
			}
		}
	},

	simulate: function( type, elem, event, bubble ) {
		// Piggyback on a donor event to simulate a different one.
		// Fake originalEvent to avoid donor's stopPropagation, but if the
		// simulated event prevents default then we do the same on the donor.
		var e = jQuery.extend(
			new jQuery.Event(),
			event,
			{ type: type,
				isSimulated: true,
				originalEvent: {}
			}
		);
		if ( bubble ) {
			jQuery.event.trigger( e, null, elem );
		} else {
			jQuery.event.dispatch.call( elem, e );
		}
		if ( e.isDefaultPrevented() ) {
			event.preventDefault();
		}
	}
};

// Some plugins are using, but it's undocumented/deprecated and will be removed.
// The 1.7 special event interface should provide all the hooks needed now.
jQuery.event.handle = jQuery.event.dispatch;

jQuery.removeEvent = document.removeEventListener ?
	function( elem, type, handle ) {
		if ( elem.removeEventListener ) {
			elem.removeEventListener( type, handle, false );
		}
	} :
	function( elem, type, handle ) {
		var name = "on" + type;

		if ( elem.detachEvent ) {

			// #8545, #7054, preventing memory leaks for custom events in IE6-8 –
			// detachEvent needed property on element, by name of that event, to properly expose it to GC
			if ( typeof elem[ name ] === "undefined" ) {
				elem[ name ] = null;
			}

			elem.detachEvent( name, handle );
		}
	};

jQuery.Event = function( src, props ) {
	// Allow instantiation without the 'new' keyword
	if ( !(this instanceof jQuery.Event) ) {
		return new jQuery.Event( src, props );
	}

	// Event object
	if ( src && src.type ) {
		this.originalEvent = src;
		this.type = src.type;

		// Events bubbling up the document may have been marked as prevented
		// by a handler lower down the tree; reflect the correct value.
		this.isDefaultPrevented = ( src.defaultPrevented || src.returnValue === false ||
			src.getPreventDefault && src.getPreventDefault() ) ? returnTrue : returnFalse;

	// Event type
	} else {
		this.type = src;
	}

	// Put explicitly provided properties onto the event object
	if ( props ) {
		jQuery.extend( this, props );
	}

	// Create a timestamp if incoming event doesn't have one
	this.timeStamp = src && src.timeStamp || jQuery.now();

	// Mark it as fixed
	this[ jQuery.expando ] = true;
};

function returnFalse() {
	return false;
}
function returnTrue() {
	return true;
}

// jQuery.Event is based on DOM3 Events as specified by the ECMAScript Language Binding
// http://www.w3.org/TR/2003/WD-DOM-Level-3-Events-20030331/ecma-script-binding.html
jQuery.Event.prototype = {
	preventDefault: function() {
		this.isDefaultPrevented = returnTrue;

		var e = this.originalEvent;
		if ( !e ) {
			return;
		}

		// if preventDefault exists run it on the original event
		if ( e.preventDefault ) {
			e.preventDefault();

		// otherwise set the returnValue property of the original event to false (IE)
		} else {
			e.returnValue = false;
		}
	},
	stopPropagation: function() {
		this.isPropagationStopped = returnTrue;

		var e = this.originalEvent;
		if ( !e ) {
			return;
		}
		// if stopPropagation exists run it on the original event
		if ( e.stopPropagation ) {
			e.stopPropagation();
		}
		// otherwise set the cancelBubble property of the original event to true (IE)
		e.cancelBubble = true;
	},
	stopImmediatePropagation: function() {
		this.isImmediatePropagationStopped = returnTrue;
		this.stopPropagation();
	},
	isDefaultPrevented: returnFalse,
	isPropagationStopped: returnFalse,
	isImmediatePropagationStopped: returnFalse
};

// Create mouseenter/leave events using mouseover/out and event-time checks
jQuery.each({
	mouseenter: "mouseover",
	mouseleave: "mouseout"
}, function( orig, fix ) {
	jQuery.event.special[ orig ] = {
		delegateType: fix,
		bindType: fix,

		handle: function( event ) {
			var ret,
				target = this,
				related = event.relatedTarget,
				handleObj = event.handleObj,
				selector = handleObj.selector;

			// For mousenter/leave call the handler if related is outside the target.
			// NB: No relatedTarget if the mouse left/entered the browser window
			if ( !related || (related !== target && !jQuery.contains( target, related )) ) {
				event.type = handleObj.origType;
				ret = handleObj.handler.apply( this, arguments );
				event.type = fix;
			}
			return ret;
		}
	};
});

// IE submit delegation
if ( !jQuery.support.submitBubbles ) {

	jQuery.event.special.submit = {
		setup: function() {
			// Only need this for delegated form submit events
			if ( jQuery.nodeName( this, "form" ) ) {
				return false;
			}

			// Lazy-add a submit handler when a descendant form may potentially be submitted
			jQuery.event.add( this, "click._submit keypress._submit", function( e ) {
				// Node name check avoids a VML-related crash in IE (#9807)
				var elem = e.target,
					form = jQuery.nodeName( elem, "input" ) || jQuery.nodeName( elem, "button" ) ? elem.form : undefined;
				if ( form && !jQuery._data( form, "_submit_attached" ) ) {
					jQuery.event.add( form, "submit._submit", function( event ) {
						event._submit_bubble = true;
					});
					jQuery._data( form, "_submit_attached", true );
				}
			});
			// return undefined since we don't need an event listener
		},

		postDispatch: function( event ) {
			// If form was submitted by the user, bubble the event up the tree
			if ( event._submit_bubble ) {
				delete event._submit_bubble;
				if ( this.parentNode && !event.isTrigger ) {
					jQuery.event.simulate( "submit", this.parentNode, event, true );
				}
			}
		},

		teardown: function() {
			// Only need this for delegated form submit events
			if ( jQuery.nodeName( this, "form" ) ) {
				return false;
			}

			// Remove delegated handlers; cleanData eventually reaps submit handlers attached above
			jQuery.event.remove( this, "._submit" );
		}
	};
}

// IE change delegation and checkbox/radio fix
if ( !jQuery.support.changeBubbles ) {

	jQuery.event.special.change = {

		setup: function() {

			if ( rformElems.test( this.nodeName ) ) {
				// IE doesn't fire change on a check/radio until blur; trigger it on click
				// after a propertychange. Eat the blur-change in special.change.handle.
				// This still fires onchange a second time for check/radio after blur.
				if ( this.type === "checkbox" || this.type === "radio" ) {
					jQuery.event.add( this, "propertychange._change", function( event ) {
						if ( event.originalEvent.propertyName === "checked" ) {
							this._just_changed = true;
						}
					});
					jQuery.event.add( this, "click._change", function( event ) {
						if ( this._just_changed && !event.isTrigger ) {
							this._just_changed = false;
						}
						// Allow triggered, simulated change events (#11500)
						jQuery.event.simulate( "change", this, event, true );
					});
				}
				return false;
			}
			// Delegated event; lazy-add a change handler on descendant inputs
			jQuery.event.add( this, "beforeactivate._change", function( e ) {
				var elem = e.target;

				if ( rformElems.test( elem.nodeName ) && !jQuery._data( elem, "_change_attached" ) ) {
					jQuery.event.add( elem, "change._change", function( event ) {
						if ( this.parentNode && !event.isSimulated && !event.isTrigger ) {
							jQuery.event.simulate( "change", this.parentNode, event, true );
						}
					});
					jQuery._data( elem, "_change_attached", true );
				}
			});
		},

		handle: function( event ) {
			var elem = event.target;

			// Swallow native change events from checkbox/radio, we already triggered them above
			if ( this !== elem || event.isSimulated || event.isTrigger || (elem.type !== "radio" && elem.type !== "checkbox") ) {
				return event.handleObj.handler.apply( this, arguments );
			}
		},

		teardown: function() {
			jQuery.event.remove( this, "._change" );

			return !rformElems.test( this.nodeName );
		}
	};
}

// Create "bubbling" focus and blur events
if ( !jQuery.support.focusinBubbles ) {
	jQuery.each({ focus: "focusin", blur: "focusout" }, function( orig, fix ) {

		// Attach a single capturing handler while someone wants focusin/focusout
		var attaches = 0,
			handler = function( event ) {
				jQuery.event.simulate( fix, event.target, jQuery.event.fix( event ), true );
			};

		jQuery.event.special[ fix ] = {
			setup: function() {
				if ( attaches++ === 0 ) {
					document.addEventListener( orig, handler, true );
				}
			},
			teardown: function() {
				if ( --attaches === 0 ) {
					document.removeEventListener( orig, handler, true );
				}
			}
		};
	});
}

jQuery.fn.extend({

	on: function( types, selector, data, fn, /*INTERNAL*/ one ) {
		var origFn, type;

		// Types can be a map of types/handlers
		if ( typeof types === "object" ) {
			// ( types-Object, selector, data )
			if ( typeof selector !== "string" ) { // && selector != null
				// ( types-Object, data )
				data = data || selector;
				selector = undefined;
			}
			for ( type in types ) {
				this.on( type, selector, data, types[ type ], one );
			}
			return this;
		}

		if ( data == null && fn == null ) {
			// ( types, fn )
			fn = selector;
			data = selector = undefined;
		} else if ( fn == null ) {
			if ( typeof selector === "string" ) {
				// ( types, selector, fn )
				fn = data;
				data = undefined;
			} else {
				// ( types, data, fn )
				fn = data;
				data = selector;
				selector = undefined;
			}
		}
		if ( fn === false ) {
			fn = returnFalse;
		} else if ( !fn ) {
			return this;
		}

		if ( one === 1 ) {
			origFn = fn;
			fn = function( event ) {
				// Can use an empty set, since event contains the info
				jQuery().off( event );
				return origFn.apply( this, arguments );
			};
			// Use same guid so caller can remove using origFn
			fn.guid = origFn.guid || ( origFn.guid = jQuery.guid++ );
		}
		return this.each( function() {
			jQuery.event.add( this, types, fn, data, selector );
		});
	},
	one: function( types, selector, data, fn ) {
		return this.on( types, selector, data, fn, 1 );
	},
	off: function( types, selector, fn ) {
		var handleObj, type;
		if ( types && types.preventDefault && types.handleObj ) {
			// ( event )  dispatched jQuery.Event
			handleObj = types.handleObj;
			jQuery( types.delegateTarget ).off(
				handleObj.namespace ? handleObj.origType + "." + handleObj.namespace : handleObj.origType,
				handleObj.selector,
				handleObj.handler
			);
			return this;
		}
		if ( typeof types === "object" ) {
			// ( types-object [, selector] )
			for ( type in types ) {
				this.off( type, selector, types[ type ] );
			}
			return this;
		}
		if ( selector === false || typeof selector === "function" ) {
			// ( types [, fn] )
			fn = selector;
			selector = undefined;
		}
		if ( fn === false ) {
			fn = returnFalse;
		}
		return this.each(function() {
			jQuery.event.remove( this, types, fn, selector );
		});
	},

	bind: function( types, data, fn ) {
		return this.on( types, null, data, fn );
	},
	unbind: function( types, fn ) {
		return this.off( types, null, fn );
	},

	live: function( types, data, fn ) {
		jQuery( this.context ).on( types, this.selector, data, fn );
		return this;
	},
	die: function( types, fn ) {
		jQuery( this.context ).off( types, this.selector || "**", fn );
		return this;
	},

	delegate: function( selector, types, data, fn ) {
		return this.on( types, selector, data, fn );
	},
	undelegate: function( selector, types, fn ) {
		// ( namespace ) or ( selector, types [, fn] )
		return arguments.length == 1? this.off( selector, "**" ) : this.off( types, selector || "**", fn );
	},

	trigger: function( type, data ) {
		return this.each(function() {
			jQuery.event.trigger( type, data, this );
		});
	},
	triggerHandler: function( type, data ) {
		if ( this[0] ) {
			return jQuery.event.trigger( type, data, this[0], true );
		}
	},

	toggle: function( fn ) {
		// Save reference to arguments for access in closure
		var args = arguments,
			guid = fn.guid || jQuery.guid++,
			i = 0,
			toggler = function( event ) {
				// Figure out which function to execute
				var lastToggle = ( jQuery._data( this, "lastToggle" + fn.guid ) || 0 ) % i;
				jQuery._data( this, "lastToggle" + fn.guid, lastToggle + 1 );

				// Make sure that clicks stop
				event.preventDefault();

				// and execute the function
				return args[ lastToggle ].apply( this, arguments ) || false;
			};

		// link all the functions, so any of them can unbind this click handler
		toggler.guid = guid;
		while ( i < args.length ) {
			args[ i++ ].guid = guid;
		}

		return this.click( toggler );
	},

	hover: function( fnOver, fnOut ) {
		return this.mouseenter( fnOver ).mouseleave( fnOut || fnOver );
	}
});

jQuery.each( ("blur focus focusin focusout load resize scroll unload click dblclick " +
	"mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave " +
	"change select submit keydown keypress keyup error contextmenu").split(" "), function( i, name ) {

	// Handle event binding
	jQuery.fn[ name ] = function( data, fn ) {
		if ( fn == null ) {
			fn = data;
			data = null;
		}

		return arguments.length > 0 ?
			this.on( name, null, data, fn ) :
			this.trigger( name );
	};

	if ( rkeyEvent.test( name ) ) {
		jQuery.event.fixHooks[ name ] = jQuery.event.keyHooks;
	}

	if ( rmouseEvent.test( name ) ) {
		jQuery.event.fixHooks[ name ] = jQuery.event.mouseHooks;
	}
});
/*!
 * Sizzle CSS Selector Engine
 *  Copyright 2012 jQuery Foundation and other contributors
 *  Released under the MIT license
 *  http://sizzlejs.com/
 */
(function( window, undefined ) {

var dirruns,
	cachedruns,
	assertGetIdNotName,
	Expr,
	getText,
	isXML,
	contains,
	compile,
	sortOrder,
	hasDuplicate,

	baseHasDuplicate = true,
	strundefined = "undefined",

	expando = ( "sizcache" + Math.random() ).replace( ".", "" ),

	document = window.document,
	docElem = document.documentElement,
	done = 0,
	slice = [].slice,
	push = [].push,

	// Augment a function for special use by Sizzle
	markFunction = function( fn, value ) {
		fn[ expando ] = value || true;
		return fn;
	},

	createCache = function() {
		var cache = {},
			keys = [];

		return markFunction(function( key, value ) {
			// Only keep the most recent entries
			if ( keys.push( key ) > Expr.cacheLength ) {
				delete cache[ keys.shift() ];
			}

			return (cache[ key ] = value);
		}, cache );
	},

	classCache = createCache(),
	tokenCache = createCache(),
	compilerCache = createCache(),

	// Regex

	// Whitespace characters http://www.w3.org/TR/css3-selectors/#whitespace
	whitespace = "[\\x20\\t\\r\\n\\f]",
	// http://www.w3.org/TR/css3-syntax/#characters
	characterEncoding = "(?:\\\\.|[-\\w]|[^\\x00-\\xa0])+",

	// Loosely modeled on CSS identifier characters
	// An unquoted value should be a CSS identifier (http://www.w3.org/TR/css3-selectors/#attribute-selectors)
	// Proper syntax: http://www.w3.org/TR/CSS21/syndata.html#value-def-identifier
	identifier = characterEncoding.replace( "w", "w#" ),

	// Acceptable operators http://www.w3.org/TR/selectors/#attribute-selectors
	operators = "([*^$|!~]?=)",
	attributes = "\\[" + whitespace + "*(" + characterEncoding + ")" + whitespace +
		"*(?:" + operators + whitespace + "*(?:(['\"])((?:\\\\.|[^\\\\])*?)\\3|(" + identifier + ")|)|)" + whitespace + "*\\]",

	// Prefer arguments not in parens/brackets,
	//   then attribute selectors and non-pseudos (denoted by :),
	//   then anything else
	// These preferences are here to reduce the number of selectors
	//   needing tokenize in the PSEUDO preFilter
	pseudos = ":(" + characterEncoding + ")(?:\\((?:(['\"])((?:\\\\.|[^\\\\])*?)\\2|([^()[\\]]*|(?:(?:" + attributes + ")|[^:]|\\\\.)*|.*))\\)|)",

	// For matchExpr.POS and matchExpr.needsContext
	pos = ":(nth|eq|gt|lt|first|last|even|odd)(?:\\(((?:-\\d)?\\d*)\\)|)(?=[^-]|$)",

	// Leading and non-escaped trailing whitespace, capturing some non-whitespace characters preceding the latter
	rtrim = new RegExp( "^" + whitespace + "+|((?:^|[^\\\\])(?:\\\\.)*)" + whitespace + "+$", "g" ),

	rcomma = new RegExp( "^" + whitespace + "*," + whitespace + "*" ),
	rcombinators = new RegExp( "^" + whitespace + "*([\\x20\\t\\r\\n\\f>+~])" + whitespace + "*" ),
	rpseudo = new RegExp( pseudos ),

	// Easily-parseable/retrievable ID or TAG or CLASS selectors
	rquickExpr = /^(?:#([\w\-]+)|(\w+)|\.([\w\-]+))$/,

	rnot = /^:not/,
	rsibling = /[\x20\t\r\n\f]*[+~]/,
	rendsWithNot = /:not\($/,

	rheader = /h\d/i,
	rinputs = /input|select|textarea|button/i,

	rbackslash = /\\(?!\\)/g,

	matchExpr = {
		"ID": new RegExp( "^#(" + characterEncoding + ")" ),
		"CLASS": new RegExp( "^\\.(" + characterEncoding + ")" ),
		"NAME": new RegExp( "^\\[name=['\"]?(" + characterEncoding + ")['\"]?\\]" ),
		"TAG": new RegExp( "^(" + characterEncoding.replace( "w", "w*" ) + ")" ),
		"ATTR": new RegExp( "^" + attributes ),
		"PSEUDO": new RegExp( "^" + pseudos ),
		"CHILD": new RegExp( "^:(only|nth|last|first)-child(?:\\(" + whitespace +
			"*(even|odd|(([+-]|)(\\d*)n|)" + whitespace + "*(?:([+-]|)" + whitespace +
			"*(\\d+)|))" + whitespace + "*\\)|)", "i" ),
		"POS": new RegExp( pos, "ig" ),
		// For use in libraries implementing .is()
		"needsContext": new RegExp( "^" + whitespace + "*[>+~]|" + pos, "i" )
	},

	// Support

	// Used for testing something on an element
	assert = function( fn ) {
		var div = document.createElement("div");

		try {
			return fn( div );
		} catch (e) {
			return false;
		} finally {
			// release memory in IE
			div = null;
		}
	},

	// Check if getElementsByTagName("*") returns only elements
	assertTagNameNoComments = assert(function( div ) {
		div.appendChild( document.createComment("") );
		return !div.getElementsByTagName("*").length;
	}),

	// Check if getAttribute returns normalized href attributes
	assertHrefNotNormalized = assert(function( div ) {
		div.innerHTML = "<a href='#'></a>";
		return div.firstChild && typeof div.firstChild.getAttribute !== strundefined &&
			div.firstChild.getAttribute("href") === "#";
	}),

	// Check if attributes should be retrieved by attribute nodes
	assertAttributes = assert(function( div ) {
		div.innerHTML = "<select></select>";
		var type = typeof div.lastChild.getAttribute("multiple");
		// IE8 returns a string for some attributes even when not present
		return type !== "boolean" && type !== "string";
	}),

	// Check if getElementsByClassName can be trusted
	assertUsableClassName = assert(function( div ) {
		// Opera can't find a second classname (in 9.6)
		div.innerHTML = "<div class='hidden e'></div><div class='hidden'></div>";
		if ( !div.getElementsByClassName || !div.getElementsByClassName("e").length ) {
			return false;
		}

		// Safari 3.2 caches class attributes and doesn't catch changes
		div.lastChild.className = "e";
		return div.getElementsByClassName("e").length === 2;
	}),

	// Check if getElementById returns elements by name
	// Check if getElementsByName privileges form controls or returns elements by ID
	assertUsableName = assert(function( div ) {
		// Inject content
		div.id = expando + 0;
		div.innerHTML = "<a name='" + expando + "'></a><div name='" + expando + "'></div>";
		docElem.insertBefore( div, docElem.firstChild );

		// Test
		var pass = document.getElementsByName &&
			// buggy browsers will return fewer than the correct 2
			document.getElementsByName( expando ).length === 2 +
			// buggy browsers will return more than the correct 0
			document.getElementsByName( expando + 0 ).length;
		assertGetIdNotName = !document.getElementById( expando );

		// Cleanup
		docElem.removeChild( div );

		return pass;
	});

// If slice is not available, provide a backup
try {
	slice.call( docElem.childNodes, 0 )[0].nodeType;
} catch ( e ) {
	slice = function( i ) {
		var elem, results = [];
		for ( ; (elem = this[i]); i++ ) {
			results.push( elem );
		}
		return results;
	};
}

function Sizzle( selector, context, results, seed ) {
	results = results || [];
	context = context || document;
	var match, elem, xml, m,
		nodeType = context.nodeType;

	if ( nodeType !== 1 && nodeType !== 9 ) {
		return [];
	}

	if ( !selector || typeof selector !== "string" ) {
		return results;
	}

	xml = isXML( context );

	if ( !xml && !seed ) {
		if ( (match = rquickExpr.exec( selector )) ) {
			// Speed-up: Sizzle("#ID")
			if ( (m = match[1]) ) {
				if ( nodeType === 9 ) {
					elem = context.getElementById( m );
					// Check parentNode to catch when Blackberry 4.6 returns
					// nodes that are no longer in the document #6963
					if ( elem && elem.parentNode ) {
						// Handle the case where IE, Opera, and Webkit return items
						// by name instead of ID
						if ( elem.id === m ) {
							results.push( elem );
							return results;
						}
					} else {
						return results;
					}
				} else {
					// Context is not a document
					if ( context.ownerDocument && (elem = context.ownerDocument.getElementById( m )) &&
						contains( context, elem ) && elem.id === m ) {
						results.push( elem );
						return results;
					}
				}

			// Speed-up: Sizzle("TAG")
			} else if ( match[2] ) {
				push.apply( results, slice.call(context.getElementsByTagName( selector ), 0) );
				return results;

			// Speed-up: Sizzle(".CLASS")
			} else if ( (m = match[3]) && assertUsableClassName && context.getElementsByClassName ) {
				push.apply( results, slice.call(context.getElementsByClassName( m ), 0) );
				return results;
			}
		}
	}

	// All others
	return select( selector, context, results, seed, xml );
}

Sizzle.matches = function( expr, elements ) {
	return Sizzle( expr, null, null, elements );
};

Sizzle.matchesSelector = function( elem, expr ) {
	return Sizzle( expr, null, null, [ elem ] ).length > 0;
};

// Returns a function to use in pseudos for input types
function createInputPseudo( type ) {
	return function( elem ) {
		var name = elem.nodeName.toLowerCase();
		return name === "input" && elem.type === type;
	};
}

// Returns a function to use in pseudos for buttons
function createButtonPseudo( type ) {
	return function( elem ) {
		var name = elem.nodeName.toLowerCase();
		return (name === "input" || name === "button") && elem.type === type;
	};
}

/**
 * Utility function for retrieving the text value of an array of DOM nodes
 * @param {Array|Element} elem
 */
getText = Sizzle.getText = function( elem ) {
	var node,
		ret = "",
		i = 0,
		nodeType = elem.nodeType;

	if ( nodeType ) {
		if ( nodeType === 1 || nodeType === 9 || nodeType === 11 ) {
			// Use textContent for elements
			// innerText usage removed for consistency of new lines (see #11153)
			if ( typeof elem.textContent === "string" ) {
				return elem.textContent;
			} else {
				// Traverse its children
				for ( elem = elem.firstChild; elem; elem = elem.nextSibling ) {
					ret += getText( elem );
				}
			}
		} else if ( nodeType === 3 || nodeType === 4 ) {
			return elem.nodeValue;
		}
		// Do not include comment or processing instruction nodes
	} else {

		// If no nodeType, this is expected to be an array
		for ( ; (node = elem[i]); i++ ) {
			// Do not traverse comment nodes
			ret += getText( node );
		}
	}
	return ret;
};

isXML = Sizzle.isXML = function isXML( elem ) {
	// documentElement is verified for cases where it doesn't yet exist
	// (such as loading iframes in IE - #4833)
	var documentElement = elem && (elem.ownerDocument || elem).documentElement;
	return documentElement ? documentElement.nodeName !== "HTML" : false;
};

// Element contains another
contains = Sizzle.contains = docElem.contains ?
	function( a, b ) {
		var adown = a.nodeType === 9 ? a.documentElement : a,
			bup = b && b.parentNode;
		return a === bup || !!( bup && bup.nodeType === 1 && adown.contains && adown.contains(bup) );
	} :
	docElem.compareDocumentPosition ?
	function( a, b ) {
		return b && !!( a.compareDocumentPosition( b ) & 16 );
	} :
	function( a, b ) {
		while ( (b = b.parentNode) ) {
			if ( b === a ) {
				return true;
			}
		}
		return false;
	};

Sizzle.attr = function( elem, name ) {
	var attr,
		xml = isXML( elem );

	if ( !xml ) {
		name = name.toLowerCase();
	}
	if ( Expr.attrHandle[ name ] ) {
		return Expr.attrHandle[ name ]( elem );
	}
	if ( assertAttributes || xml ) {
		return elem.getAttribute( name );
	}
	attr = elem.getAttributeNode( name );
	return attr ?
		typeof elem[ name ] === "boolean" ?
			elem[ name ] ? name : null :
			attr.specified ? attr.value : null :
		null;
};

Expr = Sizzle.selectors = {

	// Can be adjusted by the user
	cacheLength: 50,

	createPseudo: markFunction,

	match: matchExpr,

	order: new RegExp( "ID|TAG" +
		(assertUsableName ? "|NAME" : "") +
		(assertUsableClassName ? "|CLASS" : "")
	),

	// IE6/7 return a modified href
	attrHandle: assertHrefNotNormalized ?
		{} :
		{
			"href": function( elem ) {
				return elem.getAttribute( "href", 2 );
			},
			"type": function( elem ) {
				return elem.getAttribute("type");
			}
		},

	find: {
		"ID": assertGetIdNotName ?
			function( id, context, xml ) {
				if ( typeof context.getElementById !== strundefined && !xml ) {
					var m = context.getElementById( id );
					// Check parentNode to catch when Blackberry 4.6 returns
					// nodes that are no longer in the document #6963
					return m && m.parentNode ? [m] : [];
				}
			} :
			function( id, context, xml ) {
				if ( typeof context.getElementById !== strundefined && !xml ) {
					var m = context.getElementById( id );

					return m ?
						m.id === id || typeof m.getAttributeNode !== strundefined && m.getAttributeNode("id").value === id ?
							[m] :
							undefined :
						[];
				}
			},

		"TAG": assertTagNameNoComments ?
			function( tag, context ) {
				if ( typeof context.getElementsByTagName !== strundefined ) {
					return context.getElementsByTagName( tag );
				}
			} :
			function( tag, context ) {
				var results = context.getElementsByTagName( tag );

				// Filter out possible comments
				if ( tag === "*" ) {
					var elem,
						tmp = [],
						i = 0;

					for ( ; (elem = results[i]); i++ ) {
						if ( elem.nodeType === 1 ) {
							tmp.push( elem );
						}
					}

					return tmp;
				}
				return results;
			},

		"NAME": function( tag, context ) {
			if ( typeof context.getElementsByName !== strundefined ) {
				return context.getElementsByName( name );
			}
		},

		"CLASS": function( className, context, xml ) {
			if ( typeof context.getElementsByClassName !== strundefined && !xml ) {
				return context.getElementsByClassName( className );
			}
		}
	},

	relative: {
		">": { dir: "parentNode", first: true },
		" ": { dir: "parentNode" },
		"+": { dir: "previousSibling", first: true },
		"~": { dir: "previousSibling" }
	},

	preFilter: {
		"ATTR": function( match ) {
			match[1] = match[1].replace( rbackslash, "" );

			// Move the given value to match[3] whether quoted or unquoted
			match[3] = ( match[4] || match[5] || "" ).replace( rbackslash, "" );

			if ( match[2] === "~=" ) {
				match[3] = " " + match[3] + " ";
			}

			return match.slice( 0, 4 );
		},

		"CHILD": function( match ) {
			/* matches from matchExpr.CHILD
				1 type (only|nth|...)
				2 argument (even|odd|\d*|\d*n([+-]\d+)?|...)
				3 xn-component of xn+y argument ([+-]?\d*n|)
				4 sign of xn-component
				5 x of xn-component
				6 sign of y-component
				7 y of y-component
			*/
			match[1] = match[1].toLowerCase();

			if ( match[1] === "nth" ) {
				// nth-child requires argument
				if ( !match[2] ) {
					Sizzle.error( match[0] );
				}

				// numeric x and y parameters for Expr.filter.CHILD
				// remember that false/true cast respectively to 0/1
				match[3] = +( match[3] ? match[4] + (match[5] || 1) : 2 * ( match[2] === "even" || match[2] === "odd" ) );
				match[4] = +( ( match[6] + match[7] ) || match[2] === "odd" );

			// other types prohibit arguments
			} else if ( match[2] ) {
				Sizzle.error( match[0] );
			}

			return match;
		},

		"PSEUDO": function( match, context, xml ) {
			var unquoted, excess;
			if ( matchExpr["CHILD"].test( match[0] ) ) {
				return null;
			}

			if ( match[3] ) {
				match[2] = match[3];
			} else if ( (unquoted = match[4]) ) {
				// Only check arguments that contain a pseudo
				if ( rpseudo.test(unquoted) &&
					// Get excess from tokenize (recursively)
					(excess = tokenize( unquoted, context, xml, true )) &&
					// advance to the next closing parenthesis
					(excess = unquoted.indexOf( ")", unquoted.length - excess ) - unquoted.length) ) {

					// excess is a negative index
					unquoted = unquoted.slice( 0, excess );
					match[0] = match[0].slice( 0, excess );
				}
				match[2] = unquoted;
			}

			// Return only captures needed by the pseudo filter method (type and argument)
			return match.slice( 0, 3 );
		}
	},

	filter: {
		"ID": assertGetIdNotName ?
			function( id ) {
				id = id.replace( rbackslash, "" );
				return function( elem ) {
					return elem.getAttribute("id") === id;
				};
			} :
			function( id ) {
				id = id.replace( rbackslash, "" );
				return function( elem ) {
					var node = typeof elem.getAttributeNode !== strundefined && elem.getAttributeNode("id");
					return node && node.value === id;
				};
			},

		"TAG": function( nodeName ) {
			if ( nodeName === "*" ) {
				return function() { return true; };
			}
			nodeName = nodeName.replace( rbackslash, "" ).toLowerCase();

			return function( elem ) {
				return elem.nodeName && elem.nodeName.toLowerCase() === nodeName;
			};
		},

		"CLASS": function( className ) {
			var pattern = classCache[ expando ][ className ];
			if ( !pattern ) {
				pattern = classCache( className, new RegExp("(^|" + whitespace + ")" + className + "(" + whitespace + "|$)") );
			}
			return function( elem ) {
				return pattern.test( elem.className || (typeof elem.getAttribute !== strundefined && elem.getAttribute("class")) || "" );
			};
		},

		"ATTR": function( name, operator, check ) {
			if ( !operator ) {
				return function( elem ) {
					return Sizzle.attr( elem, name ) != null;
				};
			}

			return function( elem ) {
				var result = Sizzle.attr( elem, name ),
					value = result + "";

				if ( result == null ) {
					return operator === "!=";
				}

				switch ( operator ) {
					case "=":
						return value === check;
					case "!=":
						return value !== check;
					case "^=":
						return check && value.indexOf( check ) === 0;
					case "*=":
						return check && value.indexOf( check ) > -1;
					case "$=":
						return check && value.substr( value.length - check.length ) === check;
					case "~=":
						return ( " " + value + " " ).indexOf( check ) > -1;
					case "|=":
						return value === check || value.substr( 0, check.length + 1 ) === check + "-";
				}
			};
		},

		"CHILD": function( type, argument, first, last ) {

			if ( type === "nth" ) {
				var doneName = done++;

				return function( elem ) {
					var parent, diff,
						count = 0,
						node = elem;

					if ( first === 1 && last === 0 ) {
						return true;
					}

					parent = elem.parentNode;

					if ( parent && (parent[ expando ] !== doneName || !elem.sizset) ) {
						for ( node = parent.firstChild; node; node = node.nextSibling ) {
							if ( node.nodeType === 1 ) {
								node.sizset = ++count;
								if ( node === elem ) {
									break;
								}
							}
						}

						parent[ expando ] = doneName;
					}

					diff = elem.sizset - last;

					if ( first === 0 ) {
						return diff === 0;

					} else {
						return ( diff % first === 0 && diff / first >= 0 );
					}
				};
			}

			return function( elem ) {
				var node = elem;

				switch ( type ) {
					case "only":
					case "first":
						while ( (node = node.previousSibling) ) {
							if ( node.nodeType === 1 ) {
								return false;
							}
						}

						if ( type === "first" ) {
							return true;
						}

						node = elem;

						/* falls through */
					case "last":
						while ( (node = node.nextSibling) ) {
							if ( node.nodeType === 1 ) {
								return false;
							}
						}

						return true;
				}
			};
		},

		"PSEUDO": function( pseudo, argument, context, xml ) {
			// pseudo-class names are case-insensitive
			// http://www.w3.org/TR/selectors/#pseudo-classes
			// Prioritize by case sensitivity in case custom pseudos are added with uppercase letters
			var args,
				fn = Expr.pseudos[ pseudo ] || Expr.pseudos[ pseudo.toLowerCase() ];

			if ( !fn ) {
				Sizzle.error( "unsupported pseudo: " + pseudo );
			}

			// The user may use createPseudo to indicate that
			// arguments are needed to create the filter function
			// just as Sizzle does
			if ( !fn[ expando ] ) {
				if ( fn.length > 1 ) {
					args = [ pseudo, pseudo, "", argument ];
					return function( elem ) {
						return fn( elem, 0, args );
					};
				}
				return fn;
			}

			return fn( argument, context, xml );
		}
	},

	pseudos: {
		"not": markFunction(function( selector, context, xml ) {
			// Trim the selector passed to compile
			// to avoid treating leading and trailing
			// spaces as combinators
			var matcher = compile( selector.replace( rtrim, "$1" ), context, xml );
			return function( elem ) {
				return !matcher( elem );
			};
		}),

		"enabled": function( elem ) {
			return elem.disabled === false;
		},

		"disabled": function( elem ) {
			return elem.disabled === true;
		},

		"checked": function( elem ) {
			// In CSS3, :checked should return both checked and selected elements
			// http://www.w3.org/TR/2011/REC-css3-selectors-20110929/#checked
			var nodeName = elem.nodeName.toLowerCase();
			return (nodeName === "input" && !!elem.checked) || (nodeName === "option" && !!elem.selected);
		},

		"selected": function( elem ) {
			// Accessing this property makes selected-by-default
			// options in Safari work properly
			if ( elem.parentNode ) {
				elem.parentNode.selectedIndex;
			}

			return elem.selected === true;
		},

		"parent": function( elem ) {
			return !Expr.pseudos["empty"]( elem );
		},

		"empty": function( elem ) {
			// http://www.w3.org/TR/selectors/#empty-pseudo
			// :empty is only affected by element nodes and content nodes(including text(3), cdata(4)),
			//   not comment, processing instructions, or others
			// Thanks to Diego Perini for the nodeName shortcut
			//   Greater than "@" means alpha characters (specifically not starting with "#" or "?")
			var nodeType;
			elem = elem.firstChild;
			while ( elem ) {
				if ( elem.nodeName > "@" || (nodeType = elem.nodeType) === 3 || nodeType === 4 ) {
					return false;
				}
				elem = elem.nextSibling;
			}
			return true;
		},

		"contains": markFunction(function( text ) {
			return function( elem ) {
				return ( elem.textContent || elem.innerText || getText( elem ) ).indexOf( text ) > -1;
			};
		}),

		"has": markFunction(function( selector ) {
			return function( elem ) {
				return Sizzle( selector, elem ).length > 0;
			};
		}),

		"header": function( elem ) {
			return rheader.test( elem.nodeName );
		},

		"text": function( elem ) {
			var type, attr;
			// IE6 and 7 will map elem.type to 'text' for new HTML5 types (search, etc)
			// use getAttribute instead to test this case
			return elem.nodeName.toLowerCase() === "input" &&
				(type = elem.type) === "text" &&
				( (attr = elem.getAttribute("type")) == null || attr.toLowerCase() === type );
		},

		// Input types
		"radio": createInputPseudo("radio"),
		"checkbox": createInputPseudo("checkbox"),
		"file": createInputPseudo("file"),
		"password": createInputPseudo("password"),
		"image": createInputPseudo("image"),

		"submit": createButtonPseudo("submit"),
		"reset": createButtonPseudo("reset"),

		"button": function( elem ) {
			var name = elem.nodeName.toLowerCase();
			return name === "input" && elem.type === "button" || name === "button";
		},

		"input": function( elem ) {
			return rinputs.test( elem.nodeName );
		},

		"focus": function( elem ) {
			var doc = elem.ownerDocument;
			return elem === doc.activeElement && (!doc.hasFocus || doc.hasFocus()) && !!(elem.type || elem.href);
		},

		"active": function( elem ) {
			return elem === elem.ownerDocument.activeElement;
		}
	},

	setFilters: {
		"first": function( elements, argument, not ) {
			return not ? elements.slice( 1 ) : [ elements[0] ];
		},

		"last": function( elements, argument, not ) {
			var elem = elements.pop();
			return not ? elements : [ elem ];
		},

		"even": function( elements, argument, not ) {
			var results = [],
				i = not ? 1 : 0,
				len = elements.length;
			for ( ; i < len; i = i + 2 ) {
				results.push( elements[i] );
			}
			return results;
		},

		"odd": function( elements, argument, not ) {
			var results = [],
				i = not ? 0 : 1,
				len = elements.length;
			for ( ; i < len; i = i + 2 ) {
				results.push( elements[i] );
			}
			return results;
		},

		"lt": function( elements, argument, not ) {
			return not ? elements.slice( +argument ) : elements.slice( 0, +argument );
		},

		"gt": function( elements, argument, not ) {
			return not ? elements.slice( 0, +argument + 1 ) : elements.slice( +argument + 1 );
		},

		"eq": function( elements, argument, not ) {
			var elem = elements.splice( +argument, 1 );
			return not ? elements : elem;
		}
	}
};

function siblingCheck( a, b, ret ) {
	if ( a === b ) {
		return ret;
	}

	var cur = a.nextSibling;

	while ( cur ) {
		if ( cur === b ) {
			return -1;
		}

		cur = cur.nextSibling;
	}

	return 1;
}

sortOrder = docElem.compareDocumentPosition ?
	function( a, b ) {
		if ( a === b ) {
			hasDuplicate = true;
			return 0;
		}

		return ( !a.compareDocumentPosition || !b.compareDocumentPosition ?
			a.compareDocumentPosition :
			a.compareDocumentPosition(b) & 4
		) ? -1 : 1;
	} :
	function( a, b ) {
		// The nodes are identical, we can exit early
		if ( a === b ) {
			hasDuplicate = true;
			return 0;

		// Fallback to using sourceIndex (in IE) if it's available on both nodes
		} else if ( a.sourceIndex && b.sourceIndex ) {
			return a.sourceIndex - b.sourceIndex;
		}

		var al, bl,
			ap = [],
			bp = [],
			aup = a.parentNode,
			bup = b.parentNode,
			cur = aup;

		// If the nodes are siblings (or identical) we can do a quick check
		if ( aup === bup ) {
			return siblingCheck( a, b );

		// If no parents were found then the nodes are disconnected
		} else if ( !aup ) {
			return -1;

		} else if ( !bup ) {
			return 1;
		}

		// Otherwise they're somewhere else in the tree so we need
		// to build up a full list of the parentNodes for comparison
		while ( cur ) {
			ap.unshift( cur );
			cur = cur.parentNode;
		}

		cur = bup;

		while ( cur ) {
			bp.unshift( cur );
			cur = cur.parentNode;
		}

		al = ap.length;
		bl = bp.length;

		// Start walking down the tree looking for a discrepancy
		for ( var i = 0; i < al && i < bl; i++ ) {
			if ( ap[i] !== bp[i] ) {
				return siblingCheck( ap[i], bp[i] );
			}
		}

		// We ended someplace up the tree so do a sibling check
		return i === al ?
			siblingCheck( a, bp[i], -1 ) :
			siblingCheck( ap[i], b, 1 );
	};

// Always assume the presence of duplicates if sort doesn't
// pass them to our comparison function (as in Google Chrome).
[0, 0].sort( sortOrder );
baseHasDuplicate = !hasDuplicate;

// Document sorting and removing duplicates
Sizzle.uniqueSort = function( results ) {
	var elem,
		i = 1;

	hasDuplicate = baseHasDuplicate;
	results.sort( sortOrder );

	if ( hasDuplicate ) {
		for ( ; (elem = results[i]); i++ ) {
			if ( elem === results[ i - 1 ] ) {
				results.splice( i--, 1 );
			}
		}
	}

	return results;
};

Sizzle.error = function( msg ) {
	throw new Error( "Syntax error, unrecognized expression: " + msg );
};

function tokenize( selector, context, xml, parseOnly ) {
	var matched, match, tokens, type,
		soFar, groups, group, i,
		preFilters, filters,
		checkContext = !xml && context !== document,
		// Token cache should maintain spaces
		key = ( checkContext ? "<s>" : "" ) + selector.replace( rtrim, "$1<s>" ),
		cached = tokenCache[ expando ][ key ];

	if ( cached ) {
		return parseOnly ? 0 : slice.call( cached, 0 );
	}

	soFar = selector;
	groups = [];
	i = 0;
	preFilters = Expr.preFilter;
	filters = Expr.filter;

	while ( soFar ) {

		// Comma and first run
		if ( !matched || (match = rcomma.exec( soFar )) ) {
			if ( match ) {
				soFar = soFar.slice( match[0].length );
				tokens.selector = group;
			}
			groups.push( tokens = [] );
			group = "";

			// Need to make sure we're within a narrower context if necessary
			// Adding a descendant combinator will generate what is needed
			if ( checkContext ) {
				soFar = " " + soFar;
			}
		}

		matched = false;

		// Combinators
		if ( (match = rcombinators.exec( soFar )) ) {
			group += match[0];
			soFar = soFar.slice( match[0].length );

			// Cast descendant combinators to space
			matched = tokens.push({
				part: match.pop().replace( rtrim, " " ),
				string: match[0],
				captures: match
			});
		}

		// Filters
		for ( type in filters ) {
			if ( (match = matchExpr[ type ].exec( soFar )) && (!preFilters[ type ] ||
				( match = preFilters[ type ](match, context, xml) )) ) {

				group += match[0];
				soFar = soFar.slice( match[0].length );
				matched = tokens.push({
					part: type,
					string: match.shift(),
					captures: match
				});
			}
		}

		if ( !matched ) {
			break;
		}
	}

	// Attach the full group as a selector
	if ( group ) {
		tokens.selector = group;
	}

	// Return the length of the invalid excess
	// if we're just parsing
	// Otherwise, throw an error or return tokens
	return parseOnly ?
		soFar.length :
		soFar ?
			Sizzle.error( selector ) :
			// Cache the tokens
			slice.call( tokenCache(key, groups), 0 );
}

function addCombinator( matcher, combinator, context, xml ) {
	var dir = combinator.dir,
		doneName = done++;

	if ( !matcher ) {
		// If there is no matcher to check, check against the context
		matcher = function( elem ) {
			return elem === context;
		};
	}
	return combinator.first ?
		function( elem ) {
			while ( (elem = elem[ dir ]) ) {
				if ( elem.nodeType === 1 ) {
					return matcher( elem ) && elem;
				}
			}
		} :
		xml ?
			function( elem ) {
				while ( (elem = elem[ dir ]) ) {
					if ( elem.nodeType === 1 ) {
						if ( matcher( elem ) ) {
							return elem;
						}
					}
				}
			} :
			function( elem ) {
				var cache,
					dirkey = doneName + "." + dirruns,
					cachedkey = dirkey + "." + cachedruns;
				while ( (elem = elem[ dir ]) ) {
					if ( elem.nodeType === 1 ) {
						if ( (cache = elem[ expando ]) === cachedkey ) {
							return elem.sizset;
						} else if ( typeof cache === "string" && cache.indexOf(dirkey) === 0 ) {
							if ( elem.sizset ) {
								return elem;
							}
						} else {
							elem[ expando ] = cachedkey;
							if ( matcher( elem ) ) {
								elem.sizset = true;
								return elem;
							}
							elem.sizset = false;
						}
					}
				}
			};
}

function addMatcher( higher, deeper ) {
	return higher ?
		function( elem ) {
			var result = deeper( elem );
			return result && higher( result === true ? elem : result );
		} :
		deeper;
}

// ["TAG", ">", "ID", " ", "CLASS"]
function matcherFromTokens( tokens, context, xml ) {
	var token, matcher,
		i = 0;

	for ( ; (token = tokens[i]); i++ ) {
		if ( Expr.relative[ token.part ] ) {
			matcher = addCombinator( matcher, Expr.relative[ token.part ], context, xml );
		} else {
			matcher = addMatcher( matcher, Expr.filter[ token.part ].apply(null, token.captures.concat( context, xml )) );
		}
	}

	return matcher;
}

function matcherFromGroupMatchers( matchers ) {
	return function( elem ) {
		var matcher,
			j = 0;
		for ( ; (matcher = matchers[j]); j++ ) {
			if ( matcher(elem) ) {
				return true;
			}
		}
		return false;
	};
}

compile = Sizzle.compile = function( selector, context, xml ) {
	var group, i, len,
		cached = compilerCache[ expando ][ selector ];

	// Return a cached group function if already generated (context dependent)
	if ( cached && cached.context === context ) {
		return cached;
	}

	// Generate a function of recursive functions that can be used to check each element
	group = tokenize( selector, context, xml );
	for ( i = 0, len = group.length; i < len; i++ ) {
		group[i] = matcherFromTokens(group[i], context, xml);
	}

	// Cache the compiled function
	cached = compilerCache( selector, matcherFromGroupMatchers(group) );
	cached.context = context;
	cached.runs = cached.dirruns = 0;
	return cached;
};

function multipleContexts( selector, contexts, results, seed ) {
	var i = 0,
		len = contexts.length;
	for ( ; i < len; i++ ) {
		Sizzle( selector, contexts[i], results, seed );
	}
}

function handlePOSGroup( selector, posfilter, argument, contexts, seed, not ) {
	var results,
		fn = Expr.setFilters[ posfilter.toLowerCase() ];

	if ( !fn ) {
		Sizzle.error( posfilter );
	}

	if ( selector || !(results = seed) ) {
		multipleContexts( selector || "*", contexts, (results = []), seed );
	}

	return results.length > 0 ? fn( results, argument, not ) : [];
}

function handlePOS( groups, context, results, seed ) {
	var group, part, j, groupLen, token, selector,
		anchor, elements, match, matched,
		lastIndex, currentContexts, not,
		i = 0,
		len = groups.length,
		rpos = matchExpr["POS"],
		// This is generated here in case matchExpr["POS"] is extended
		rposgroups = new RegExp( "^" + rpos.source + "(?!" + whitespace + ")", "i" ),
		// This is for making sure non-participating
		// matching groups are represented cross-browser (IE6-8)
		setUndefined = function() {
			var i = 1,
				len = arguments.length - 2;
			for ( ; i < len; i++ ) {
				if ( arguments[i] === undefined ) {
					match[i] = undefined;
				}
			}
		};

	for ( ; i < len; i++ ) {
		group = groups[i];
		part = "";
		elements = seed;
		for ( j = 0, groupLen = group.length; j < groupLen; j++ ) {
			token = group[j];
			selector = token.string;
			if ( token.part === "PSEUDO" ) {
				// Reset regex index to 0
				rpos.exec("");
				anchor = 0;
				while ( (match = rpos.exec( selector )) ) {
					matched = true;
					lastIndex = rpos.lastIndex = match.index + match[0].length;
					if ( lastIndex > anchor ) {
						part += selector.slice( anchor, match.index );
						anchor = lastIndex;
						currentContexts = [ context ];

						if ( rcombinators.test(part) ) {
							if ( elements ) {
								currentContexts = elements;
							}
							elements = seed;
						}

						if ( (not = rendsWithNot.test( part )) ) {
							part = part.slice( 0, -5 ).replace( rcombinators, "$&*" );
							anchor++;
						}

						if ( match.length > 1 ) {
							match[0].replace( rposgroups, setUndefined );
						}
						elements = handlePOSGroup( part, match[1], match[2], currentContexts, elements, not );
					}
					part = "";
				}

			}

			if ( !matched ) {
				part += selector;
			}
			matched = false;
		}

		if ( part ) {
			if ( rcombinators.test(part) ) {
				multipleContexts( part, elements || [ context ], results, seed );
			} else {
				Sizzle( part, context, results, seed ? seed.concat(elements) : elements );
			}
		} else {
			push.apply( results, elements );
		}
	}

	// Do not sort if this is a single filter
	return len === 1 ? results : Sizzle.uniqueSort( results );
}

function select( selector, context, results, seed, xml ) {
	// Remove excessive whitespace
	selector = selector.replace( rtrim, "$1" );
	var elements, matcher, cached, elem,
		i, tokens, token, lastToken, findContext, type,
		match = tokenize( selector, context, xml ),
		contextNodeType = context.nodeType;

	// POS handling
	if ( matchExpr["POS"].test(selector) ) {
		return handlePOS( match, context, results, seed );
	}

	if ( seed ) {
		elements = slice.call( seed, 0 );

	// To maintain document order, only narrow the
	// set if there is one group
	} else if ( match.length === 1 ) {

		// Take a shortcut and set the context if the root selector is an ID
		if ( (tokens = slice.call( match[0], 0 )).length > 2 &&
				(token = tokens[0]).part === "ID" &&
				contextNodeType === 9 && !xml &&
				Expr.relative[ tokens[1].part ] ) {

			context = Expr.find["ID"]( token.captures[0].replace( rbackslash, "" ), context, xml )[0];
			if ( !context ) {
				return results;
			}

			selector = selector.slice( tokens.shift().string.length );
		}

		findContext = ( (match = rsibling.exec( tokens[0].string )) && !match.index && context.parentNode ) || context;

		// Reduce the set if possible
		lastToken = "";
		for ( i = tokens.length - 1; i >= 0; i-- ) {
			token = tokens[i];
			type = token.part;
			lastToken = token.string + lastToken;
			if ( Expr.relative[ type ] ) {
				break;
			}
			if ( Expr.order.test(type) ) {
				elements = Expr.find[ type ]( token.captures[0].replace( rbackslash, "" ), findContext, xml );
				if ( elements == null ) {
					continue;
				} else {
					selector = selector.slice( 0, selector.length - lastToken.length ) +
						lastToken.replace( matchExpr[ type ], "" );

					if ( !selector ) {
						push.apply( results, slice.call(elements, 0) );
					}

					break;
				}
			}
		}
	}

	// Only loop over the given elements once
	if ( selector ) {
		matcher = compile( selector, context, xml );
		dirruns = matcher.dirruns++;
		if ( elements == null ) {
			elements = Expr.find["TAG"]( "*", (rsibling.test( selector ) && context.parentNode) || context );
		}

		for ( i = 0; (elem = elements[i]); i++ ) {
			cachedruns = matcher.runs++;
			if ( matcher(elem) ) {
				results.push( elem );
			}
		}
	}

	return results;
}

if ( document.querySelectorAll ) {
	(function() {
		var disconnectedMatch,
			oldSelect = select,
			rescape = /'|\\/g,
			rattributeQuotes = /\=[\x20\t\r\n\f]*([^'"\]]*)[\x20\t\r\n\f]*\]/g,
			rbuggyQSA = [],
			// matchesSelector(:active) reports false when true (IE9/Opera 11.5)
			// A support test would require too much code (would include document ready)
			// just skip matchesSelector for :active
			rbuggyMatches = [":active"],
			matches = docElem.matchesSelector ||
				docElem.mozMatchesSelector ||
				docElem.webkitMatchesSelector ||
				docElem.oMatchesSelector ||
				docElem.msMatchesSelector;

		// Build QSA regex
		// Regex strategy adopted from Diego Perini
		assert(function( div ) {
			// Select is set to empty string on purpose
			// This is to test IE's treatment of not explictly
			// setting a boolean content attribute,
			// since its presence should be enough
			// http://bugs.jquery.com/ticket/12359
			div.innerHTML = "<select><option selected=''></option></select>";

			// IE8 - Some boolean attributes are not treated correctly
			if ( !div.querySelectorAll("[selected]").length ) {
				rbuggyQSA.push( "\\[" + whitespace + "*(?:checked|disabled|ismap|multiple|readonly|selected|value)" );
			}

			// Webkit/Opera - :checked should return selected option elements
			// http://www.w3.org/TR/2011/REC-css3-selectors-20110929/#checked
			// IE8 throws error here (do not put tests after this one)
			if ( !div.querySelectorAll(":checked").length ) {
				rbuggyQSA.push(":checked");
			}
		});

		assert(function( div ) {

			// Opera 10-12/IE9 - ^= $= *= and empty values
			// Should not select anything
			div.innerHTML = "<p test=''></p>";
			if ( div.querySelectorAll("[test^='']").length ) {
				rbuggyQSA.push( "[*^$]=" + whitespace + "*(?:\"\"|'')" );
			}

			// FF 3.5 - :enabled/:disabled and hidden elements (hidden elements are still enabled)
			// IE8 throws error here (do not put tests after this one)
			div.innerHTML = "<input type='hidden'/>";
			if ( !div.querySelectorAll(":enabled").length ) {
				rbuggyQSA.push(":enabled", ":disabled");
			}
		});

		rbuggyQSA = rbuggyQSA.length && new RegExp( rbuggyQSA.join("|") );

		select = function( selector, context, results, seed, xml ) {
			// Only use querySelectorAll when not filtering,
			// when this is not xml,
			// and when no QSA bugs apply
			if ( !seed && !xml && (!rbuggyQSA || !rbuggyQSA.test( selector )) ) {
				if ( context.nodeType === 9 ) {
					try {
						push.apply( results, slice.call(context.querySelectorAll( selector ), 0) );
						return results;
					} catch(qsaError) {}
				// qSA works strangely on Element-rooted queries
				// We can work around this by specifying an extra ID on the root
				// and working up from there (Thanks to Andrew Dupont for the technique)
				// IE 8 doesn't work on object elements
				} else if ( context.nodeType === 1 && context.nodeName.toLowerCase() !== "object" ) {
					var groups, i, len,
						old = context.getAttribute("id"),
						nid = old || expando,
						newContext = rsibling.test( selector ) && context.parentNode || context;

					if ( old ) {
						nid = nid.replace( rescape, "\\$&" );
					} else {
						context.setAttribute( "id", nid );
					}

					groups = tokenize(selector, context, xml);
					// Trailing space is unnecessary
					// There is always a context check
					nid = "[id='" + nid + "']";
					for ( i = 0, len = groups.length; i < len; i++ ) {
						groups[i] = nid + groups[i].selector;
					}
					try {
						push.apply( results, slice.call( newContext.querySelectorAll(
							groups.join(",")
						), 0 ) );
						return results;
					} catch(qsaError) {
					} finally {
						if ( !old ) {
							context.removeAttribute("id");
						}
					}
				}
			}

			return oldSelect( selector, context, results, seed, xml );
		};

		if ( matches ) {
			assert(function( div ) {
				// Check to see if it's possible to do matchesSelector
				// on a disconnected node (IE 9)
				disconnectedMatch = matches.call( div, "div" );

				// This should fail with an exception
				// Gecko does not error, returns false instead
				try {
					matches.call( div, "[test!='']:sizzle" );
					rbuggyMatches.push( matchExpr["PSEUDO"].source, matchExpr["POS"].source, "!=" );
				} catch ( e ) {}
			});

			// rbuggyMatches always contains :active, so no need for a length check
			rbuggyMatches = /* rbuggyMatches.length && */ new RegExp( rbuggyMatches.join("|") );

			Sizzle.matchesSelector = function( elem, expr ) {
				// Make sure that attribute selectors are quoted
				expr = expr.replace( rattributeQuotes, "='$1']" );

				// rbuggyMatches always contains :active, so no need for an existence check
				if ( !isXML( elem ) && !rbuggyMatches.test( expr ) && (!rbuggyQSA || !rbuggyQSA.test( expr )) ) {
					try {
						var ret = matches.call( elem, expr );

						// IE 9's matchesSelector returns false on disconnected nodes
						if ( ret || disconnectedMatch ||
								// As well, disconnected nodes are said to be in a document
								// fragment in IE 9
								elem.document && elem.document.nodeType !== 11 ) {
							return ret;
						}
					} catch(e) {}
				}

				return Sizzle( expr, null, null, [ elem ] ).length > 0;
			};
		}
	})();
}

// Deprecated
Expr.setFilters["nth"] = Expr.setFilters["eq"];

// Back-compat
Expr.filters = Expr.pseudos;

// Override sizzle attribute retrieval
Sizzle.attr = jQuery.attr;
jQuery.find = Sizzle;
jQuery.expr = Sizzle.selectors;
jQuery.expr[":"] = jQuery.expr.pseudos;
jQuery.unique = Sizzle.uniqueSort;
jQuery.text = Sizzle.getText;
jQuery.isXMLDoc = Sizzle.isXML;
jQuery.contains = Sizzle.contains;


})( window );
var runtil = /Until$/,
	rparentsprev = /^(?:parents|prev(?:Until|All))/,
	isSimple = /^.[^:#\[\.,]*$/,
	rneedsContext = jQuery.expr.match.needsContext,
	// methods guaranteed to produce a unique set when starting from a unique set
	guaranteedUnique = {
		children: true,
		contents: true,
		next: true,
		prev: true
	};

jQuery.fn.extend({
	find: function( selector ) {
		var i, l, length, n, r, ret,
			self = this;

		if ( typeof selector !== "string" ) {
			return jQuery( selector ).filter(function() {
				for ( i = 0, l = self.length; i < l; i++ ) {
					if ( jQuery.contains( self[ i ], this ) ) {
						return true;
					}
				}
			});
		}

		ret = this.pushStack( "", "find", selector );

		for ( i = 0, l = this.length; i < l; i++ ) {
			length = ret.length;
			jQuery.find( selector, this[i], ret );

			if ( i > 0 ) {
				// Make sure that the results are unique
				for ( n = length; n < ret.length; n++ ) {
					for ( r = 0; r < length; r++ ) {
						if ( ret[r] === ret[n] ) {
							ret.splice(n--, 1);
							break;
						}
					}
				}
			}
		}

		return ret;
	},

	has: function( target ) {
		var i,
			targets = jQuery( target, this ),
			len = targets.length;

		return this.filter(function() {
			for ( i = 0; i < len; i++ ) {
				if ( jQuery.contains( this, targets[i] ) ) {
					return true;
				}
			}
		});
	},

	not: function( selector ) {
		return this.pushStack( winnow(this, selector, false), "not", selector);
	},

	filter: function( selector ) {
		return this.pushStack( winnow(this, selector, true), "filter", selector );
	},

	is: function( selector ) {
		return !!selector && (
			typeof selector === "string" ?
				// If this is a positional/relative selector, check membership in the returned set
				// so $("p:first").is("p:last") won't return true for a doc with two "p".
				rneedsContext.test( selector ) ?
					jQuery( selector, this.context ).index( this[0] ) >= 0 :
					jQuery.filter( selector, this ).length > 0 :
				this.filter( selector ).length > 0 );
	},

	closest: function( selectors, context ) {
		var cur,
			i = 0,
			l = this.length,
			ret = [],
			pos = rneedsContext.test( selectors ) || typeof selectors !== "string" ?
				jQuery( selectors, context || this.context ) :
				0;

		for ( ; i < l; i++ ) {
			cur = this[i];

			while ( cur && cur.ownerDocument && cur !== context && cur.nodeType !== 11 ) {
				if ( pos ? pos.index(cur) > -1 : jQuery.find.matchesSelector(cur, selectors) ) {
					ret.push( cur );
					break;
				}
				cur = cur.parentNode;
			}
		}

		ret = ret.length > 1 ? jQuery.unique( ret ) : ret;

		return this.pushStack( ret, "closest", selectors );
	},

	// Determine the position of an element within
	// the matched set of elements
	index: function( elem ) {

		// No argument, return index in parent
		if ( !elem ) {
			return ( this[0] && this[0].parentNode ) ? this.prevAll().length : -1;
		}

		// index in selector
		if ( typeof elem === "string" ) {
			return jQuery.inArray( this[0], jQuery( elem ) );
		}

		// Locate the position of the desired element
		return jQuery.inArray(
			// If it receives a jQuery object, the first element is used
			elem.jquery ? elem[0] : elem, this );
	},

	add: function( selector, context ) {
		var set = typeof selector === "string" ?
				jQuery( selector, context ) :
				jQuery.makeArray( selector && selector.nodeType ? [ selector ] : selector ),
			all = jQuery.merge( this.get(), set );

		return this.pushStack( isDisconnected( set[0] ) || isDisconnected( all[0] ) ?
			all :
			jQuery.unique( all ) );
	},

	addBack: function( selector ) {
		return this.add( selector == null ?
			this.prevObject : this.prevObject.filter(selector)
		);
	}
});

jQuery.fn.andSelf = jQuery.fn.addBack;

// A painfully simple check to see if an element is disconnected
// from a document (should be improved, where feasible).
function isDisconnected( node ) {
	return !node || !node.parentNode || node.parentNode.nodeType === 11;
}

function sibling( cur, dir ) {
	do {
		cur = cur[ dir ];
	} while ( cur && cur.nodeType !== 1 );

	return cur;
}

jQuery.each({
	parent: function( elem ) {
		var parent = elem.parentNode;
		return parent && parent.nodeType !== 11 ? parent : null;
	},
	parents: function( elem ) {
		return jQuery.dir( elem, "parentNode" );
	},
	parentsUntil: function( elem, i, until ) {
		return jQuery.dir( elem, "parentNode", until );
	},
	next: function( elem ) {
		return sibling( elem, "nextSibling" );
	},
	prev: function( elem ) {
		return sibling( elem, "previousSibling" );
	},
	nextAll: function( elem ) {
		return jQuery.dir( elem, "nextSibling" );
	},
	prevAll: function( elem ) {
		return jQuery.dir( elem, "previousSibling" );
	},
	nextUntil: function( elem, i, until ) {
		return jQuery.dir( elem, "nextSibling", until );
	},
	prevUntil: function( elem, i, until ) {
		return jQuery.dir( elem, "previousSibling", until );
	},
	siblings: function( elem ) {
		return jQuery.sibling( ( elem.parentNode || {} ).firstChild, elem );
	},
	children: function( elem ) {
		return jQuery.sibling( elem.firstChild );
	},
	contents: function( elem ) {
		return jQuery.nodeName( elem, "iframe" ) ?
			elem.contentDocument || elem.contentWindow.document :
			jQuery.merge( [], elem.childNodes );
	}
}, function( name, fn ) {
	jQuery.fn[ name ] = function( until, selector ) {
		var ret = jQuery.map( this, fn, until );

		if ( !runtil.test( name ) ) {
			selector = until;
		}

		if ( selector && typeof selector === "string" ) {
			ret = jQuery.filter( selector, ret );
		}

		ret = this.length > 1 && !guaranteedUnique[ name ] ? jQuery.unique( ret ) : ret;

		if ( this.length > 1 && rparentsprev.test( name ) ) {
			ret = ret.reverse();
		}

		return this.pushStack( ret, name, core_slice.call( arguments ).join(",") );
	};
});

jQuery.extend({
	filter: function( expr, elems, not ) {
		if ( not ) {
			expr = ":not(" + expr + ")";
		}

		return elems.length === 1 ?
			jQuery.find.matchesSelector(elems[0], expr) ? [ elems[0] ] : [] :
			jQuery.find.matches(expr, elems);
	},

	dir: function( elem, dir, until ) {
		var matched = [],
			cur = elem[ dir ];

		while ( cur && cur.nodeType !== 9 && (until === undefined || cur.nodeType !== 1 || !jQuery( cur ).is( until )) ) {
			if ( cur.nodeType === 1 ) {
				matched.push( cur );
			}
			cur = cur[dir];
		}
		return matched;
	},

	sibling: function( n, elem ) {
		var r = [];

		for ( ; n; n = n.nextSibling ) {
			if ( n.nodeType === 1 && n !== elem ) {
				r.push( n );
			}
		}

		return r;
	}
});

// Implement the identical functionality for filter and not
function winnow( elements, qualifier, keep ) {

	// Can't pass null or undefined to indexOf in Firefox 4
	// Set to 0 to skip string check
	qualifier = qualifier || 0;

	if ( jQuery.isFunction( qualifier ) ) {
		return jQuery.grep(elements, function( elem, i ) {
			var retVal = !!qualifier.call( elem, i, elem );
			return retVal === keep;
		});

	} else if ( qualifier.nodeType ) {
		return jQuery.grep(elements, function( elem, i ) {
			return ( elem === qualifier ) === keep;
		});

	} else if ( typeof qualifier === "string" ) {
		var filtered = jQuery.grep(elements, function( elem ) {
			return elem.nodeType === 1;
		});

		if ( isSimple.test( qualifier ) ) {
			return jQuery.filter(qualifier, filtered, !keep);
		} else {
			qualifier = jQuery.filter( qualifier, filtered );
		}
	}

	return jQuery.grep(elements, function( elem, i ) {
		return ( jQuery.inArray( elem, qualifier ) >= 0 ) === keep;
	});
}
function createSafeFragment( document ) {
	var list = nodeNames.split( "|" ),
	safeFrag = document.createDocumentFragment();

	if ( safeFrag.createElement ) {
		while ( list.length ) {
			safeFrag.createElement(
				list.pop()
			);
		}
	}
	return safeFrag;
}

var nodeNames = "abbr|article|aside|audio|bdi|canvas|data|datalist|details|figcaption|figure|footer|" +
		"header|hgroup|mark|meter|nav|output|progress|section|summary|time|video",
	rinlinejQuery = / jQuery\d+="(?:null|\d+)"/g,
	rleadingWhitespace = /^\s+/,
	rxhtmlTag = /<(?!area|br|col|embed|hr|img|input|link|meta|param)(([\w:]+)[^>]*)\/>/gi,
	rtagName = /<([\w:]+)/,
	rtbody = /<tbody/i,
	rhtml = /<|&#?\w+;/,
	rnoInnerhtml = /<(?:script|style|link)/i,
	rnocache = /<(?:script|object|embed|option|style)/i,
	rnoshimcache = new RegExp("<(?:" + nodeNames + ")[\\s/>]", "i"),
	rcheckableType = /^(?:checkbox|radio)$/,
	// checked="checked" or checked
	rchecked = /checked\s*(?:[^=]|=\s*.checked.)/i,
	rscriptType = /\/(java|ecma)script/i,
	rcleanScript = /^\s*<!(?:\[CDATA\[|\-\-)|[\]\-]{2}>\s*$/g,
	wrapMap = {
		option: [ 1, "<select multiple='multiple'>", "</select>" ],
		legend: [ 1, "<fieldset>", "</fieldset>" ],
		thead: [ 1, "<table>", "</table>" ],
		tr: [ 2, "<table><tbody>", "</tbody></table>" ],
		td: [ 3, "<table><tbody><tr>", "</tr></tbody></table>" ],
		col: [ 2, "<table><tbody></tbody><colgroup>", "</colgroup></table>" ],
		area: [ 1, "<map>", "</map>" ],
		_default: [ 0, "", "" ]
	},
	safeFragment = createSafeFragment( document ),
	fragmentDiv = safeFragment.appendChild( document.createElement("div") );

wrapMap.optgroup = wrapMap.option;
wrapMap.tbody = wrapMap.tfoot = wrapMap.colgroup = wrapMap.caption = wrapMap.thead;
wrapMap.th = wrapMap.td;

// IE6-8 can't serialize link, script, style, or any html5 (NoScope) tags,
// unless wrapped in a div with non-breaking characters in front of it.
if ( !jQuery.support.htmlSerialize ) {
	wrapMap._default = [ 1, "X<div>", "</div>" ];
}

jQuery.fn.extend({
	text: function( value ) {
		return jQuery.access( this, function( value ) {
			return value === undefined ?
				jQuery.text( this ) :
				this.empty().append( ( this[0] && this[0].ownerDocument || document ).createTextNode( value ) );
		}, null, value, arguments.length );
	},

	wrapAll: function( html ) {
		if ( jQuery.isFunction( html ) ) {
			return this.each(function(i) {
				jQuery(this).wrapAll( html.call(this, i) );
			});
		}

		if ( this[0] ) {
			// The elements to wrap the target around
			var wrap = jQuery( html, this[0].ownerDocument ).eq(0).clone(true);

			if ( this[0].parentNode ) {
				wrap.insertBefore( this[0] );
			}

			wrap.map(function() {
				var elem = this;

				while ( elem.firstChild && elem.firstChild.nodeType === 1 ) {
					elem = elem.firstChild;
				}

				return elem;
			}).append( this );
		}

		return this;
	},

	wrapInner: function( html ) {
		if ( jQuery.isFunction( html ) ) {
			return this.each(function(i) {
				jQuery(this).wrapInner( html.call(this, i) );
			});
		}

		return this.each(function() {
			var self = jQuery( this ),
				contents = self.contents();

			if ( contents.length ) {
				contents.wrapAll( html );

			} else {
				self.append( html );
			}
		});
	},

	wrap: function( html ) {
		var isFunction = jQuery.isFunction( html );

		return this.each(function(i) {
			jQuery( this ).wrapAll( isFunction ? html.call(this, i) : html );
		});
	},

	unwrap: function() {
		return this.parent().each(function() {
			if ( !jQuery.nodeName( this, "body" ) ) {
				jQuery( this ).replaceWith( this.childNodes );
			}
		}).end();
	},

	append: function() {
		return this.domManip(arguments, true, function( elem ) {
			if ( this.nodeType === 1 || this.nodeType === 11 ) {
				this.appendChild( elem );
			}
		});
	},

	prepend: function() {
		return this.domManip(arguments, true, function( elem ) {
			if ( this.nodeType === 1 || this.nodeType === 11 ) {
				this.insertBefore( elem, this.firstChild );
			}
		});
	},

	before: function() {
		if ( !isDisconnected( this[0] ) ) {
			return this.domManip(arguments, false, function( elem ) {
				this.parentNode.insertBefore( elem, this );
			});
		}

		if ( arguments.length ) {
			var set = jQuery.clean( arguments );
			return this.pushStack( jQuery.merge( set, this ), "before", this.selector );
		}
	},

	after: function() {
		if ( !isDisconnected( this[0] ) ) {
			return this.domManip(arguments, false, function( elem ) {
				this.parentNode.insertBefore( elem, this.nextSibling );
			});
		}

		if ( arguments.length ) {
			var set = jQuery.clean( arguments );
			return this.pushStack( jQuery.merge( this, set ), "after", this.selector );
		}
	},

	// keepData is for internal use only--do not document
	remove: function( selector, keepData ) {
		var elem,
			i = 0;

		for ( ; (elem = this[i]) != null; i++ ) {
			if ( !selector || jQuery.filter( selector, [ elem ] ).length ) {
				if ( !keepData && elem.nodeType === 1 ) {
					jQuery.cleanData( elem.getElementsByTagName("*") );
					jQuery.cleanData( [ elem ] );
				}

				if ( elem.parentNode ) {
					elem.parentNode.removeChild( elem );
				}
			}
		}

		return this;
	},

	empty: function() {
		var elem,
			i = 0;

		for ( ; (elem = this[i]) != null; i++ ) {
			// Remove element nodes and prevent memory leaks
			if ( elem.nodeType === 1 ) {
				jQuery.cleanData( elem.getElementsByTagName("*") );
			}

			// Remove any remaining nodes
			while ( elem.firstChild ) {
				elem.removeChild( elem.firstChild );
			}
		}

		return this;
	},

	clone: function( dataAndEvents, deepDataAndEvents ) {
		dataAndEvents = dataAndEvents == null ? false : dataAndEvents;
		deepDataAndEvents = deepDataAndEvents == null ? dataAndEvents : deepDataAndEvents;

		return this.map( function () {
			return jQuery.clone( this, dataAndEvents, deepDataAndEvents );
		});
	},

	html: function( value ) {
		return jQuery.access( this, function( value ) {
			var elem = this[0] || {},
				i = 0,
				l = this.length;

			if ( value === undefined ) {
				return elem.nodeType === 1 ?
					elem.innerHTML.replace( rinlinejQuery, "" ) :
					undefined;
			}

			// See if we can take a shortcut and just use innerHTML
			if ( typeof value === "string" && !rnoInnerhtml.test( value ) &&
				( jQuery.support.htmlSerialize || !rnoshimcache.test( value )  ) &&
				( jQuery.support.leadingWhitespace || !rleadingWhitespace.test( value ) ) &&
				!wrapMap[ ( rtagName.exec( value ) || ["", ""] )[1].toLowerCase() ] ) {

				value = value.replace( rxhtmlTag, "<$1></$2>" );

				try {
					for (; i < l; i++ ) {
						// Remove element nodes and prevent memory leaks
						elem = this[i] || {};
						if ( elem.nodeType === 1 ) {
							jQuery.cleanData( elem.getElementsByTagName( "*" ) );
							elem.innerHTML = value;
						}
					}

					elem = 0;

				// If using innerHTML throws an exception, use the fallback method
				} catch(e) {}
			}

			if ( elem ) {
				this.empty().append( value );
			}
		}, null, value, arguments.length );
	},

	replaceWith: function( value ) {
		if ( !isDisconnected( this[0] ) ) {
			// Make sure that the elements are removed from the DOM before they are inserted
			// this can help fix replacing a parent with child elements
			if ( jQuery.isFunction( value ) ) {
				return this.each(function(i) {
					var self = jQuery(this), old = self.html();
					self.replaceWith( value.call( this, i, old ) );
				});
			}

			if ( typeof value !== "string" ) {
				value = jQuery( value ).detach();
			}

			return this.each(function() {
				var next = this.nextSibling,
					parent = this.parentNode;

				jQuery( this ).remove();

				if ( next ) {
					jQuery(next).before( value );
				} else {
					jQuery(parent).append( value );
				}
			});
		}

		return this.length ?
			this.pushStack( jQuery(jQuery.isFunction(value) ? value() : value), "replaceWith", value ) :
			this;
	},

	detach: function( selector ) {
		return this.remove( selector, true );
	},

	domManip: function( args, table, callback ) {

		// Flatten any nested arrays
		args = [].concat.apply( [], args );

		var results, first, fragment, iNoClone,
			i = 0,
			value = args[0],
			scripts = [],
			l = this.length;

		// We can't cloneNode fragments that contain checked, in WebKit
		if ( !jQuery.support.checkClone && l > 1 && typeof value === "string" && rchecked.test( value ) ) {
			return this.each(function() {
				jQuery(this).domManip( args, table, callback );
			});
		}

		if ( jQuery.isFunction(value) ) {
			return this.each(function(i) {
				var self = jQuery(this);
				args[0] = value.call( this, i, table ? self.html() : undefined );
				self.domManip( args, table, callback );
			});
		}

		if ( this[0] ) {
			results = jQuery.buildFragment( args, this, scripts );
			fragment = results.fragment;
			first = fragment.firstChild;

			if ( fragment.childNodes.length === 1 ) {
				fragment = first;
			}

			if ( first ) {
				table = table && jQuery.nodeName( first, "tr" );

				// Use the original fragment for the last item instead of the first because it can end up
				// being emptied incorrectly in certain situations (#8070).
				// Fragments from the fragment cache must always be cloned and never used in place.
				for ( iNoClone = results.cacheable || l - 1; i < l; i++ ) {
					callback.call(
						table && jQuery.nodeName( this[i], "table" ) ?
							findOrAppend( this[i], "tbody" ) :
							this[i],
						i === iNoClone ?
							fragment :
							jQuery.clone( fragment, true, true )
					);
				}
			}

			// Fix #11809: Avoid leaking memory
			fragment = first = null;

			if ( scripts.length ) {
				jQuery.each( scripts, function( i, elem ) {
					if ( elem.src ) {
						if ( jQuery.ajax ) {
							jQuery.ajax({
								url: elem.src,
								type: "GET",
								dataType: "script",
								async: false,
								global: false,
								"throws": true
							});
						} else {
							jQuery.error("no ajax");
						}
					} else {
						jQuery.globalEval( ( elem.text || elem.textContent || elem.innerHTML || "" ).replace( rcleanScript, "" ) );
					}

					if ( elem.parentNode ) {
						elem.parentNode.removeChild( elem );
					}
				});
			}
		}

		return this;
	}
});

function findOrAppend( elem, tag ) {
	return elem.getElementsByTagName( tag )[0] || elem.appendChild( elem.ownerDocument.createElement( tag ) );
}

function cloneCopyEvent( src, dest ) {

	if ( dest.nodeType !== 1 || !jQuery.hasData( src ) ) {
		return;
	}

	var type, i, l,
		oldData = jQuery._data( src ),
		curData = jQuery._data( dest, oldData ),
		events = oldData.events;

	if ( events ) {
		delete curData.handle;
		curData.events = {};

		for ( type in events ) {
			for ( i = 0, l = events[ type ].length; i < l; i++ ) {
				jQuery.event.add( dest, type, events[ type ][ i ] );
			}
		}
	}

	// make the cloned public data object a copy from the original
	if ( curData.data ) {
		curData.data = jQuery.extend( {}, curData.data );
	}
}

function cloneFixAttributes( src, dest ) {
	var nodeName;

	// We do not need to do anything for non-Elements
	if ( dest.nodeType !== 1 ) {
		return;
	}

	// clearAttributes removes the attributes, which we don't want,
	// but also removes the attachEvent events, which we *do* want
	if ( dest.clearAttributes ) {
		dest.clearAttributes();
	}

	// mergeAttributes, in contrast, only merges back on the
	// original attributes, not the events
	if ( dest.mergeAttributes ) {
		dest.mergeAttributes( src );
	}

	nodeName = dest.nodeName.toLowerCase();

	if ( nodeName === "object" ) {
		// IE6-10 improperly clones children of object elements using classid.
		// IE10 throws NoModificationAllowedError if parent is null, #12132.
		if ( dest.parentNode ) {
			dest.outerHTML = src.outerHTML;
		}

		// This path appears unavoidable for IE9. When cloning an object
		// element in IE9, the outerHTML strategy above is not sufficient.
		// If the src has innerHTML and the destination does not,
		// copy the src.innerHTML into the dest.innerHTML. #10324
		if ( jQuery.support.html5Clone && (src.innerHTML && !jQuery.trim(dest.innerHTML)) ) {
			dest.innerHTML = src.innerHTML;
		}

	} else if ( nodeName === "input" && rcheckableType.test( src.type ) ) {
		// IE6-8 fails to persist the checked state of a cloned checkbox
		// or radio button. Worse, IE6-7 fail to give the cloned element
		// a checked appearance if the defaultChecked value isn't also set

		dest.defaultChecked = dest.checked = src.checked;

		// IE6-7 get confused and end up setting the value of a cloned
		// checkbox/radio button to an empty string instead of "on"
		if ( dest.value !== src.value ) {
			dest.value = src.value;
		}

	// IE6-8 fails to return the selected option to the default selected
	// state when cloning options
	} else if ( nodeName === "option" ) {
		dest.selected = src.defaultSelected;

	// IE6-8 fails to set the defaultValue to the correct value when
	// cloning other types of input fields
	} else if ( nodeName === "input" || nodeName === "textarea" ) {
		dest.defaultValue = src.defaultValue;

	// IE blanks contents when cloning scripts
	} else if ( nodeName === "script" && dest.text !== src.text ) {
		dest.text = src.text;
	}

	// Event data gets referenced instead of copied if the expando
	// gets copied too
	dest.removeAttribute( jQuery.expando );
}

jQuery.buildFragment = function( args, context, scripts ) {
	var fragment, cacheable, cachehit,
		first = args[ 0 ];

	// Set context from what may come in as undefined or a jQuery collection or a node
	// Updated to fix #12266 where accessing context[0] could throw an exception in IE9/10 &
	// also doubles as fix for #8950 where plain objects caused createDocumentFragment exception
	context = context || document;
	context = !context.nodeType && context[0] || context;
	context = context.ownerDocument || context;

	// Only cache "small" (1/2 KB) HTML strings that are associated with the main document
	// Cloning options loses the selected state, so don't cache them
	// IE 6 doesn't like it when you put <object> or <embed> elements in a fragment
	// Also, WebKit does not clone 'checked' attributes on cloneNode, so don't cache
	// Lastly, IE6,7,8 will not correctly reuse cached fragments that were created from unknown elems #10501
	if ( args.length === 1 && typeof first === "string" && first.length < 512 && context === document &&
		first.charAt(0) === "<" && !rnocache.test( first ) &&
		(jQuery.support.checkClone || !rchecked.test( first )) &&
		(jQuery.support.html5Clone || !rnoshimcache.test( first )) ) {

		// Mark cacheable and look for a hit
		cacheable = true;
		fragment = jQuery.fragments[ first ];
		cachehit = fragment !== undefined;
	}

	if ( !fragment ) {
		fragment = context.createDocumentFragment();
		jQuery.clean( args, context, fragment, scripts );

		// Update the cache, but only store false
		// unless this is a second parsing of the same content
		if ( cacheable ) {
			jQuery.fragments[ first ] = cachehit && fragment;
		}
	}

	return { fragment: fragment, cacheable: cacheable };
};

jQuery.fragments = {};

jQuery.each({
	appendTo: "append",
	prependTo: "prepend",
	insertBefore: "before",
	insertAfter: "after",
	replaceAll: "replaceWith"
}, function( name, original ) {
	jQuery.fn[ name ] = function( selector ) {
		var elems,
			i = 0,
			ret = [],
			insert = jQuery( selector ),
			l = insert.length,
			parent = this.length === 1 && this[0].parentNode;

		if ( (parent == null || parent && parent.nodeType === 11 && parent.childNodes.length === 1) && l === 1 ) {
			insert[ original ]( this[0] );
			return this;
		} else {
			for ( ; i < l; i++ ) {
				elems = ( i > 0 ? this.clone(true) : this ).get();
				jQuery( insert[i] )[ original ]( elems );
				ret = ret.concat( elems );
			}

			return this.pushStack( ret, name, insert.selector );
		}
	};
});

function getAll( elem ) {
	if ( typeof elem.getElementsByTagName !== "undefined" ) {
		return elem.getElementsByTagName( "*" );

	} else if ( typeof elem.querySelectorAll !== "undefined" ) {
		return elem.querySelectorAll( "*" );

	} else {
		return [];
	}
}

// Used in clean, fixes the defaultChecked property
function fixDefaultChecked( elem ) {
	if ( rcheckableType.test( elem.type ) ) {
		elem.defaultChecked = elem.checked;
	}
}

jQuery.extend({
	clone: function( elem, dataAndEvents, deepDataAndEvents ) {
		var srcElements,
			destElements,
			i,
			clone;

		if ( jQuery.support.html5Clone || jQuery.isXMLDoc(elem) || !rnoshimcache.test( "<" + elem.nodeName + ">" ) ) {
			clone = elem.cloneNode( true );

		// IE<=8 does not properly clone detached, unknown element nodes
		} else {
			fragmentDiv.innerHTML = elem.outerHTML;
			fragmentDiv.removeChild( clone = fragmentDiv.firstChild );
		}

		if ( (!jQuery.support.noCloneEvent || !jQuery.support.noCloneChecked) &&
				(elem.nodeType === 1 || elem.nodeType === 11) && !jQuery.isXMLDoc(elem) ) {
			// IE copies events bound via attachEvent when using cloneNode.
			// Calling detachEvent on the clone will also remove the events
			// from the original. In order to get around this, we use some
			// proprietary methods to clear the events. Thanks to MooTools
			// guys for this hotness.

			cloneFixAttributes( elem, clone );

			// Using Sizzle here is crazy slow, so we use getElementsByTagName instead
			srcElements = getAll( elem );
			destElements = getAll( clone );

			// Weird iteration because IE will replace the length property
			// with an element if you are cloning the body and one of the
			// elements on the page has a name or id of "length"
			for ( i = 0; srcElements[i]; ++i ) {
				// Ensure that the destination node is not null; Fixes #9587
				if ( destElements[i] ) {
					cloneFixAttributes( srcElements[i], destElements[i] );
				}
			}
		}

		// Copy the events from the original to the clone
		if ( dataAndEvents ) {
			cloneCopyEvent( elem, clone );

			if ( deepDataAndEvents ) {
				srcElements = getAll( elem );
				destElements = getAll( clone );

				for ( i = 0; srcElements[i]; ++i ) {
					cloneCopyEvent( srcElements[i], destElements[i] );
				}
			}
		}

		srcElements = destElements = null;

		// Return the cloned set
		return clone;
	},

	clean: function( elems, context, fragment, scripts ) {
		var i, j, elem, tag, wrap, depth, div, hasBody, tbody, len, handleScript, jsTags,
			safe = context === document && safeFragment,
			ret = [];

		// Ensure that context is a document
		if ( !context || typeof context.createDocumentFragment === "undefined" ) {
			context = document;
		}

		// Use the already-created safe fragment if context permits
		for ( i = 0; (elem = elems[i]) != null; i++ ) {
			if ( typeof elem === "number" ) {
				elem += "";
			}

			if ( !elem ) {
				continue;
			}

			// Convert html string into DOM nodes
			if ( typeof elem === "string" ) {
				if ( !rhtml.test( elem ) ) {
					elem = context.createTextNode( elem );
				} else {
					// Ensure a safe container in which to render the html
					safe = safe || createSafeFragment( context );
					div = context.createElement("div");
					safe.appendChild( div );

					// Fix "XHTML"-style tags in all browsers
					elem = elem.replace(rxhtmlTag, "<$1></$2>");

					// Go to html and back, then peel off extra wrappers
					tag = ( rtagName.exec( elem ) || ["", ""] )[1].toLowerCase();
					wrap = wrapMap[ tag ] || wrapMap._default;
					depth = wrap[0];
					div.innerHTML = wrap[1] + elem + wrap[2];

					// Move to the right depth
					while ( depth-- ) {
						div = div.lastChild;
					}

					// Remove IE's autoinserted <tbody> from table fragments
					if ( !jQuery.support.tbody ) {

						// String was a <table>, *may* have spurious <tbody>
						hasBody = rtbody.test(elem);
							tbody = tag === "table" && !hasBody ?
								div.firstChild && div.firstChild.childNodes :

								// String was a bare <thead> or <tfoot>
								wrap[1] === "<table>" && !hasBody ?
									div.childNodes :
									[];

						for ( j = tbody.length - 1; j >= 0 ; --j ) {
							if ( jQuery.nodeName( tbody[ j ], "tbody" ) && !tbody[ j ].childNodes.length ) {
								tbody[ j ].parentNode.removeChild( tbody[ j ] );
							}
						}
					}

					// IE completely kills leading whitespace when innerHTML is used
					if ( !jQuery.support.leadingWhitespace && rleadingWhitespace.test( elem ) ) {
						div.insertBefore( context.createTextNode( rleadingWhitespace.exec(elem)[0] ), div.firstChild );
					}

					elem = div.childNodes;

					// Take out of fragment container (we need a fresh div each time)
					div.parentNode.removeChild( div );
				}
			}

			if ( elem.nodeType ) {
				ret.push( elem );
			} else {
				jQuery.merge( ret, elem );
			}
		}

		// Fix #11356: Clear elements from safeFragment
		if ( div ) {
			elem = div = safe = null;
		}

		// Reset defaultChecked for any radios and checkboxes
		// about to be appended to the DOM in IE 6/7 (#8060)
		if ( !jQuery.support.appendChecked ) {
			for ( i = 0; (elem = ret[i]) != null; i++ ) {
				if ( jQuery.nodeName( elem, "input" ) ) {
					fixDefaultChecked( elem );
				} else if ( typeof elem.getElementsByTagName !== "undefined" ) {
					jQuery.grep( elem.getElementsByTagName("input"), fixDefaultChecked );
				}
			}
		}

		// Append elements to a provided document fragment
		if ( fragment ) {
			// Special handling of each script element
			handleScript = function( elem ) {
				// Check if we consider it executable
				if ( !elem.type || rscriptType.test( elem.type ) ) {
					// Detach the script and store it in the scripts array (if provided) or the fragment
					// Return truthy to indicate that it has been handled
					return scripts ?
						scripts.push( elem.parentNode ? elem.parentNode.removeChild( elem ) : elem ) :
						fragment.appendChild( elem );
				}
			};

			for ( i = 0; (elem = ret[i]) != null; i++ ) {
				// Check if we're done after handling an executable script
				if ( !( jQuery.nodeName( elem, "script" ) && handleScript( elem ) ) ) {
					// Append to fragment and handle embedded scripts
					fragment.appendChild( elem );
					if ( typeof elem.getElementsByTagName !== "undefined" ) {
						// handleScript alters the DOM, so use jQuery.merge to ensure snapshot iteration
						jsTags = jQuery.grep( jQuery.merge( [], elem.getElementsByTagName("script") ), handleScript );

						// Splice the scripts into ret after their former ancestor and advance our index beyond them
						ret.splice.apply( ret, [i + 1, 0].concat( jsTags ) );
						i += jsTags.length;
					}
				}
			}
		}

		return ret;
	},

	cleanData: function( elems, /* internal */ acceptData ) {
		var data, id, elem, type,
			i = 0,
			internalKey = jQuery.expando,
			cache = jQuery.cache,
			deleteExpando = jQuery.support.deleteExpando,
			special = jQuery.event.special;

		for ( ; (elem = elems[i]) != null; i++ ) {

			if ( acceptData || jQuery.acceptData( elem ) ) {

				id = elem[ internalKey ];
				data = id && cache[ id ];

				if ( data ) {
					if ( data.events ) {
						for ( type in data.events ) {
							if ( special[ type ] ) {
								jQuery.event.remove( elem, type );

							// This is a shortcut to avoid jQuery.event.remove's overhead
							} else {
								jQuery.removeEvent( elem, type, data.handle );
							}
						}
					}

					// Remove cache only if it was not already removed by jQuery.event.remove
					if ( cache[ id ] ) {

						delete cache[ id ];

						// IE does not allow us to delete expando properties from nodes,
						// nor does it have a removeAttribute function on Document nodes;
						// we must handle all of these cases
						if ( deleteExpando ) {
							delete elem[ internalKey ];

						} else if ( elem.removeAttribute ) {
							elem.removeAttribute( internalKey );

						} else {
							elem[ internalKey ] = null;
						}

						jQuery.deletedIds.push( id );
					}
				}
			}
		}
	}
});
// Limit scope pollution from any deprecated API
(function() {

var matched, browser;

// Use of jQuery.browser is frowned upon.
// More details: http://api.jquery.com/jQuery.browser
// jQuery.uaMatch maintained for back-compat
jQuery.uaMatch = function( ua ) {
	ua = ua.toLowerCase();

	var match = /(chrome)[ \/]([\w.]+)/.exec( ua ) ||
		/(webkit)[ \/]([\w.]+)/.exec( ua ) ||
		/(opera)(?:.*version|)[ \/]([\w.]+)/.exec( ua ) ||
		/(msie) ([\w.]+)/.exec( ua ) ||
		ua.indexOf("compatible") < 0 && /(mozilla)(?:.*? rv:([\w.]+)|)/.exec( ua ) ||
		[];

	return {
		browser: match[ 1 ] || "",
		version: match[ 2 ] || "0"
	};
};

matched = jQuery.uaMatch( navigator.userAgent );
browser = {};

if ( matched.browser ) {
	browser[ matched.browser ] = true;
	browser.version = matched.version;
}

// Chrome is Webkit, but Webkit is also Safari.
if ( browser.chrome ) {
	browser.webkit = true;
} else if ( browser.webkit ) {
	browser.safari = true;
}

jQuery.browser = browser;

jQuery.sub = function() {
	function jQuerySub( selector, context ) {
		return new jQuerySub.fn.init( selector, context );
	}
	jQuery.extend( true, jQuerySub, this );
	jQuerySub.superclass = this;
	jQuerySub.fn = jQuerySub.prototype = this();
	jQuerySub.fn.constructor = jQuerySub;
	jQuerySub.sub = this.sub;
	jQuerySub.fn.init = function init( selector, context ) {
		if ( context && context instanceof jQuery && !(context instanceof jQuerySub) ) {
			context = jQuerySub( context );
		}

		return jQuery.fn.init.call( this, selector, context, rootjQuerySub );
	};
	jQuerySub.fn.init.prototype = jQuerySub.fn;
	var rootjQuerySub = jQuerySub(document);
	return jQuerySub;
};

})();
var curCSS, iframe, iframeDoc,
	ralpha = /alpha\([^)]*\)/i,
	ropacity = /opacity=([^)]*)/,
	rposition = /^(top|right|bottom|left)$/,
	// swappable if display is none or starts with table except "table", "table-cell", or "table-caption"
	// see here for display values: https://developer.mozilla.org/en-US/docs/CSS/display
	rdisplayswap = /^(none|table(?!-c[ea]).+)/,
	rmargin = /^margin/,
	rnumsplit = new RegExp( "^(" + core_pnum + ")(.*)$", "i" ),
	rnumnonpx = new RegExp( "^(" + core_pnum + ")(?!px)[a-z%]+$", "i" ),
	rrelNum = new RegExp( "^([-+])=(" + core_pnum + ")", "i" ),
	elemdisplay = {},

	cssShow = { position: "absolute", visibility: "hidden", display: "block" },
	cssNormalTransform = {
		letterSpacing: 0,
		fontWeight: 400
	},

	cssExpand = [ "Top", "Right", "Bottom", "Left" ],
	cssPrefixes = [ "Webkit", "O", "Moz", "ms" ],

	eventsToggle = jQuery.fn.toggle;

// return a css property mapped to a potentially vendor prefixed property
function vendorPropName( style, name ) {

	// shortcut for names that are not vendor prefixed
	if ( name in style ) {
		return name;
	}

	// check for vendor prefixed names
	var capName = name.charAt(0).toUpperCase() + name.slice(1),
		origName = name,
		i = cssPrefixes.length;

	while ( i-- ) {
		name = cssPrefixes[ i ] + capName;
		if ( name in style ) {
			return name;
		}
	}

	return origName;
}

function isHidden( elem, el ) {
	elem = el || elem;
	return jQuery.css( elem, "display" ) === "none" || !jQuery.contains( elem.ownerDocument, elem );
}

function showHide( elements, show ) {
	var elem, display,
		values = [],
		index = 0,
		length = elements.length;

	for ( ; index < length; index++ ) {
		elem = elements[ index ];
		if ( !elem.style ) {
			continue;
		}
		values[ index ] = jQuery._data( elem, "olddisplay" );
		if ( show ) {
			// Reset the inline display of this element to learn if it is
			// being hidden by cascaded rules or not
			if ( !values[ index ] && elem.style.display === "none" ) {
				elem.style.display = "";
			}

			// Set elements which have been overridden with display: none
			// in a stylesheet to whatever the default browser style is
			// for such an element
			if ( elem.style.display === "" && isHidden( elem ) ) {
				values[ index ] = jQuery._data( elem, "olddisplay", css_defaultDisplay(elem.nodeName) );
			}
		} else {
			display = curCSS( elem, "display" );

			if ( !values[ index ] && display !== "none" ) {
				jQuery._data( elem, "olddisplay", display );
			}
		}
	}

	// Set the display of most of the elements in a second loop
	// to avoid the constant reflow
	for ( index = 0; index < length; index++ ) {
		elem = elements[ index ];
		if ( !elem.style ) {
			continue;
		}
		if ( !show || elem.style.display === "none" || elem.style.display === "" ) {
			elem.style.display = show ? values[ index ] || "" : "none";
		}
	}

	return elements;
}

jQuery.fn.extend({
	css: function( name, value ) {
		return jQuery.access( this, function( elem, name, value ) {
			return value !== undefined ?
				jQuery.style( elem, name, value ) :
				jQuery.css( elem, name );
		}, name, value, arguments.length > 1 );
	},
	show: function() {
		return showHide( this, true );
	},
	hide: function() {
		return showHide( this );
	},
	toggle: function( state, fn2 ) {
		var bool = typeof state === "boolean";

		if ( jQuery.isFunction( state ) && jQuery.isFunction( fn2 ) ) {
			return eventsToggle.apply( this, arguments );
		}

		return this.each(function() {
			if ( bool ? state : isHidden( this ) ) {
				jQuery( this ).show();
			} else {
				jQuery( this ).hide();
			}
		});
	}
});

jQuery.extend({
	// Add in style property hooks for overriding the default
	// behavior of getting and setting a style property
	cssHooks: {
		opacity: {
			get: function( elem, computed ) {
				if ( computed ) {
					// We should always get a number back from opacity
					var ret = curCSS( elem, "opacity" );
					return ret === "" ? "1" : ret;

				}
			}
		}
	},

	// Exclude the following css properties to add px
	cssNumber: {
		"fillOpacity": true,
		"fontWeight": true,
		"lineHeight": true,
		"opacity": true,
		"orphans": true,
		"widows": true,
		"zIndex": true,
		"zoom": true
	},

	// Add in properties whose names you wish to fix before
	// setting or getting the value
	cssProps: {
		// normalize float css property
		"float": jQuery.support.cssFloat ? "cssFloat" : "styleFloat"
	},

	// Get and set the style property on a DOM Node
	style: function( elem, name, value, extra ) {
		// Don't set styles on text and comment nodes
		if ( !elem || elem.nodeType === 3 || elem.nodeType === 8 || !elem.style ) {
			return;
		}

		// Make sure that we're working with the right name
		var ret, type, hooks,
			origName = jQuery.camelCase( name ),
			style = elem.style;

		name = jQuery.cssProps[ origName ] || ( jQuery.cssProps[ origName ] = vendorPropName( style, origName ) );

		// gets hook for the prefixed version
		// followed by the unprefixed version
		hooks = jQuery.cssHooks[ name ] || jQuery.cssHooks[ origName ];

		// Check if we're setting a value
		if ( value !== undefined ) {
			type = typeof value;

			// convert relative number strings (+= or -=) to relative numbers. #7345
			if ( type === "string" && (ret = rrelNum.exec( value )) ) {
				value = ( ret[1] + 1 ) * ret[2] + parseFloat( jQuery.css( elem, name ) );
				// Fixes bug #9237
				type = "number";
			}

			// Make sure that NaN and null values aren't set. See: #7116
			if ( value == null || type === "number" && isNaN( value ) ) {
				return;
			}

			// If a number was passed in, add 'px' to the (except for certain CSS properties)
			if ( type === "number" && !jQuery.cssNumber[ origName ] ) {
				value += "px";
			}

			// If a hook was provided, use that value, otherwise just set the specified value
			if ( !hooks || !("set" in hooks) || (value = hooks.set( elem, value, extra )) !== undefined ) {
				// Wrapped to prevent IE from throwing errors when 'invalid' values are provided
				// Fixes bug #5509
				try {
					style[ name ] = value;
				} catch(e) {}
			}

		} else {
			// If a hook was provided get the non-computed value from there
			if ( hooks && "get" in hooks && (ret = hooks.get( elem, false, extra )) !== undefined ) {
				return ret;
			}

			// Otherwise just get the value from the style object
			return style[ name ];
		}
	},

	css: function( elem, name, numeric, extra ) {
		var val, num, hooks,
			origName = jQuery.camelCase( name );

		// Make sure that we're working with the right name
		name = jQuery.cssProps[ origName ] || ( jQuery.cssProps[ origName ] = vendorPropName( elem.style, origName ) );

		// gets hook for the prefixed version
		// followed by the unprefixed version
		hooks = jQuery.cssHooks[ name ] || jQuery.cssHooks[ origName ];

		// If a hook was provided get the computed value from there
		if ( hooks && "get" in hooks ) {
			val = hooks.get( elem, true, extra );
		}

		// Otherwise, if a way to get the computed value exists, use that
		if ( val === undefined ) {
			val = curCSS( elem, name );
		}

		//convert "normal" to computed value
		if ( val === "normal" && name in cssNormalTransform ) {
			val = cssNormalTransform[ name ];
		}

		// Return, converting to number if forced or a qualifier was provided and val looks numeric
		if ( numeric || extra !== undefined ) {
			num = parseFloat( val );
			return numeric || jQuery.isNumeric( num ) ? num || 0 : val;
		}
		return val;
	},

	// A method for quickly swapping in/out CSS properties to get correct calculations
	swap: function( elem, options, callback ) {
		var ret, name,
			old = {};

		// Remember the old values, and insert the new ones
		for ( name in options ) {
			old[ name ] = elem.style[ name ];
			elem.style[ name ] = options[ name ];
		}

		ret = callback.call( elem );

		// Revert the old values
		for ( name in options ) {
			elem.style[ name ] = old[ name ];
		}

		return ret;
	}
});

// NOTE: To any future maintainer, we've window.getComputedStyle
// because jsdom on node.js will break without it.
if ( window.getComputedStyle ) {
	curCSS = function( elem, name ) {
		var ret, width, minWidth, maxWidth,
			computed = window.getComputedStyle( elem, null ),
			style = elem.style;

		if ( computed ) {

			ret = computed[ name ];
			if ( ret === "" && !jQuery.contains( elem.ownerDocument, elem ) ) {
				ret = jQuery.style( elem, name );
			}

			// A tribute to the "awesome hack by Dean Edwards"
			// Chrome < 17 and Safari 5.0 uses "computed value" instead of "used value" for margin-right
			// Safari 5.1.7 (at least) returns percentage for a larger set of values, but width seems to be reliably pixels
			// this is against the CSSOM draft spec: http://dev.w3.org/csswg/cssom/#resolved-values
			if ( rnumnonpx.test( ret ) && rmargin.test( name ) ) {
				width = style.width;
				minWidth = style.minWidth;
				maxWidth = style.maxWidth;

				style.minWidth = style.maxWidth = style.width = ret;
				ret = computed.width;

				style.width = width;
				style.minWidth = minWidth;
				style.maxWidth = maxWidth;
			}
		}

		return ret;
	};
} else if ( document.documentElement.currentStyle ) {
	curCSS = function( elem, name ) {
		var left, rsLeft,
			ret = elem.currentStyle && elem.currentStyle[ name ],
			style = elem.style;

		// Avoid setting ret to empty string here
		// so we don't default to auto
		if ( ret == null && style && style[ name ] ) {
			ret = style[ name ];
		}

		// From the awesome hack by Dean Edwards
		// http://erik.eae.net/archives/2007/07/27/18.54.15/#comment-102291

		// If we're not dealing with a regular pixel number
		// but a number that has a weird ending, we need to convert it to pixels
		// but not position css attributes, as those are proportional to the parent element instead
		// and we can't measure the parent instead because it might trigger a "stacking dolls" problem
		if ( rnumnonpx.test( ret ) && !rposition.test( name ) ) {

			// Remember the original values
			left = style.left;
			rsLeft = elem.runtimeStyle && elem.runtimeStyle.left;

			// Put in the new values to get a computed value out
			if ( rsLeft ) {
				elem.runtimeStyle.left = elem.currentStyle.left;
			}
			style.left = name === "fontSize" ? "1em" : ret;
			ret = style.pixelLeft + "px";

			// Revert the changed values
			style.left = left;
			if ( rsLeft ) {
				elem.runtimeStyle.left = rsLeft;
			}
		}

		return ret === "" ? "auto" : ret;
	};
}

function setPositiveNumber( elem, value, subtract ) {
	var matches = rnumsplit.exec( value );
	return matches ?
			Math.max( 0, matches[ 1 ] - ( subtract || 0 ) ) + ( matches[ 2 ] || "px" ) :
			value;
}

function augmentWidthOrHeight( elem, name, extra, isBorderBox ) {
	var i = extra === ( isBorderBox ? "border" : "content" ) ?
		// If we already have the right measurement, avoid augmentation
		4 :
		// Otherwise initialize for horizontal or vertical properties
		name === "width" ? 1 : 0,

		val = 0;

	for ( ; i < 4; i += 2 ) {
		// both box models exclude margin, so add it if we want it
		if ( extra === "margin" ) {
			// we use jQuery.css instead of curCSS here
			// because of the reliableMarginRight CSS hook!
			val += jQuery.css( elem, extra + cssExpand[ i ], true );
		}

		// From this point on we use curCSS for maximum performance (relevant in animations)
		if ( isBorderBox ) {
			// border-box includes padding, so remove it if we want content
			if ( extra === "content" ) {
				val -= parseFloat( curCSS( elem, "padding" + cssExpand[ i ] ) ) || 0;
			}

			// at this point, extra isn't border nor margin, so remove border
			if ( extra !== "margin" ) {
				val -= parseFloat( curCSS( elem, "border" + cssExpand[ i ] + "Width" ) ) || 0;
			}
		} else {
			// at this point, extra isn't content, so add padding
			val += parseFloat( curCSS( elem, "padding" + cssExpand[ i ] ) ) || 0;

			// at this point, extra isn't content nor padding, so add border
			if ( extra !== "padding" ) {
				val += parseFloat( curCSS( elem, "border" + cssExpand[ i ] + "Width" ) ) || 0;
			}
		}
	}

	return val;
}

function getWidthOrHeight( elem, name, extra ) {

	// Start with offset property, which is equivalent to the border-box value
	var val = name === "width" ? elem.offsetWidth : elem.offsetHeight,
		valueIsBorderBox = true,
		isBorderBox = jQuery.support.boxSizing && jQuery.css( elem, "boxSizing" ) === "border-box";

	// some non-html elements return undefined for offsetWidth, so check for null/undefined
	// svg - https://bugzilla.mozilla.org/show_bug.cgi?id=649285
	// MathML - https://bugzilla.mozilla.org/show_bug.cgi?id=491668
	if ( val <= 0 || val == null ) {
		// Fall back to computed then uncomputed css if necessary
		val = curCSS( elem, name );
		if ( val < 0 || val == null ) {
			val = elem.style[ name ];
		}

		// Computed unit is not pixels. Stop here and return.
		if ( rnumnonpx.test(val) ) {
			return val;
		}

		// we need the check for style in case a browser which returns unreliable values
		// for getComputedStyle silently falls back to the reliable elem.style
		valueIsBorderBox = isBorderBox && ( jQuery.support.boxSizingReliable || val === elem.style[ name ] );

		// Normalize "", auto, and prepare for extra
		val = parseFloat( val ) || 0;
	}

	// use the active box-sizing model to add/subtract irrelevant styles
	return ( val +
		augmentWidthOrHeight(
			elem,
			name,
			extra || ( isBorderBox ? "border" : "content" ),
			valueIsBorderBox
		)
	) + "px";
}


// Try to determine the default display value of an element
function css_defaultDisplay( nodeName ) {
	if ( elemdisplay[ nodeName ] ) {
		return elemdisplay[ nodeName ];
	}

	var elem = jQuery( "<" + nodeName + ">" ).appendTo( document.body ),
		display = elem.css("display");
	elem.remove();

	// If the simple way fails,
	// get element's real default display by attaching it to a temp iframe
	if ( display === "none" || display === "" ) {
		// Use the already-created iframe if possible
		iframe = document.body.appendChild(
			iframe || jQuery.extend( document.createElement("iframe"), {
				frameBorder: 0,
				width: 0,
				height: 0
			})
		);

		// Create a cacheable copy of the iframe document on first call.
		// IE and Opera will allow us to reuse the iframeDoc without re-writing the fake HTML
		// document to it; WebKit & Firefox won't allow reusing the iframe document.
		if ( !iframeDoc || !iframe.createElement ) {
			iframeDoc = ( iframe.contentWindow || iframe.contentDocument ).document;
			iframeDoc.write("<!doctype html><html><body>");
			iframeDoc.close();
		}

		elem = iframeDoc.body.appendChild( iframeDoc.createElement(nodeName) );

		display = curCSS( elem, "display" );
		document.body.removeChild( iframe );
	}

	// Store the correct default display
	elemdisplay[ nodeName ] = display;

	return display;
}

jQuery.each([ "height", "width" ], function( i, name ) {
	jQuery.cssHooks[ name ] = {
		get: function( elem, computed, extra ) {
			if ( computed ) {
				// certain elements can have dimension info if we invisibly show them
				// however, it must have a current display style that would benefit from this
				if ( elem.offsetWidth === 0 && rdisplayswap.test( curCSS( elem, "display" ) ) ) {
					return jQuery.swap( elem, cssShow, function() {
						return getWidthOrHeight( elem, name, extra );
					});
				} else {
					return getWidthOrHeight( elem, name, extra );
				}
			}
		},

		set: function( elem, value, extra ) {
			return setPositiveNumber( elem, value, extra ?
				augmentWidthOrHeight(
					elem,
					name,
					extra,
					jQuery.support.boxSizing && jQuery.css( elem, "boxSizing" ) === "border-box"
				) : 0
			);
		}
	};
});

if ( !jQuery.support.opacity ) {
	jQuery.cssHooks.opacity = {
		get: function( elem, computed ) {
			// IE uses filters for opacity
			return ropacity.test( (computed && elem.currentStyle ? elem.currentStyle.filter : elem.style.filter) || "" ) ?
				( 0.01 * parseFloat( RegExp.$1 ) ) + "" :
				computed ? "1" : "";
		},

		set: function( elem, value ) {
			var style = elem.style,
				currentStyle = elem.currentStyle,
				opacity = jQuery.isNumeric( value ) ? "alpha(opacity=" + value * 100 + ")" : "",
				filter = currentStyle && currentStyle.filter || style.filter || "";

			// IE has trouble with opacity if it does not have layout
			// Force it by setting the zoom level
			style.zoom = 1;

			// if setting opacity to 1, and no other filters exist - attempt to remove filter attribute #6652
			if ( value >= 1 && jQuery.trim( filter.replace( ralpha, "" ) ) === "" &&
				style.removeAttribute ) {

				// Setting style.filter to null, "" & " " still leave "filter:" in the cssText
				// if "filter:" is present at all, clearType is disabled, we want to avoid this
				// style.removeAttribute is IE Only, but so apparently is this code path...
				style.removeAttribute( "filter" );

				// if there there is no filter style applied in a css rule, we are done
				if ( currentStyle && !currentStyle.filter ) {
					return;
				}
			}

			// otherwise, set new filter values
			style.filter = ralpha.test( filter ) ?
				filter.replace( ralpha, opacity ) :
				filter + " " + opacity;
		}
	};
}

// These hooks cannot be added until DOM ready because the support test
// for it is not run until after DOM ready
jQuery(function() {
	if ( !jQuery.support.reliableMarginRight ) {
		jQuery.cssHooks.marginRight = {
			get: function( elem, computed ) {
				// WebKit Bug 13343 - getComputedStyle returns wrong value for margin-right
				// Work around by temporarily setting element display to inline-block
				return jQuery.swap( elem, { "display": "inline-block" }, function() {
					if ( computed ) {
						return curCSS( elem, "marginRight" );
					}
				});
			}
		};
	}

	// Webkit bug: https://bugs.webkit.org/show_bug.cgi?id=29084
	// getComputedStyle returns percent when specified for top/left/bottom/right
	// rather than make the css module depend on the offset module, we just check for it here
	if ( !jQuery.support.pixelPosition && jQuery.fn.position ) {
		jQuery.each( [ "top", "left" ], function( i, prop ) {
			jQuery.cssHooks[ prop ] = {
				get: function( elem, computed ) {
					if ( computed ) {
						var ret = curCSS( elem, prop );
						// if curCSS returns percentage, fallback to offset
						return rnumnonpx.test( ret ) ? jQuery( elem ).position()[ prop ] + "px" : ret;
					}
				}
			};
		});
	}

});

if ( jQuery.expr && jQuery.expr.filters ) {
	jQuery.expr.filters.hidden = function( elem ) {
		return ( elem.offsetWidth === 0 && elem.offsetHeight === 0 ) || (!jQuery.support.reliableHiddenOffsets && ((elem.style && elem.style.display) || curCSS( elem, "display" )) === "none");
	};

	jQuery.expr.filters.visible = function( elem ) {
		return !jQuery.expr.filters.hidden( elem );
	};
}

// These hooks are used by animate to expand properties
jQuery.each({
	margin: "",
	padding: "",
	border: "Width"
}, function( prefix, suffix ) {
	jQuery.cssHooks[ prefix + suffix ] = {
		expand: function( value ) {
			var i,

				// assumes a single number if not a string
				parts = typeof value === "string" ? value.split(" ") : [ value ],
				expanded = {};

			for ( i = 0; i < 4; i++ ) {
				expanded[ prefix + cssExpand[ i ] + suffix ] =
					parts[ i ] || parts[ i - 2 ] || parts[ 0 ];
			}

			return expanded;
		}
	};

	if ( !rmargin.test( prefix ) ) {
		jQuery.cssHooks[ prefix + suffix ].set = setPositiveNumber;
	}
});
var r20 = /%20/g,
	rbracket = /\[\]$/,
	rCRLF = /\r?\n/g,
	rinput = /^(?:color|date|datetime|datetime-local|email|hidden|month|number|password|range|search|tel|text|time|url|week)$/i,
	rselectTextarea = /^(?:select|textarea)/i;

jQuery.fn.extend({
	serialize: function() {
		return jQuery.param( this.serializeArray() );
	},
	serializeArray: function() {
		return this.map(function(){
			return this.elements ? jQuery.makeArray( this.elements ) : this;
		})
		.filter(function(){
			return this.name && !this.disabled &&
				( this.checked || rselectTextarea.test( this.nodeName ) ||
					rinput.test( this.type ) );
		})
		.map(function( i, elem ){
			var val = jQuery( this ).val();

			return val == null ?
				null :
				jQuery.isArray( val ) ?
					jQuery.map( val, function( val, i ){
						return { name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
					}) :
					{ name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
		}).get();
	}
});

//Serialize an array of form elements or a set of
//key/values into a query string
jQuery.param = function( a, traditional ) {
	var prefix,
		s = [],
		add = function( key, value ) {
			// If value is a function, invoke it and return its value
			value = jQuery.isFunction( value ) ? value() : ( value == null ? "" : value );
			s[ s.length ] = encodeURIComponent( key ) + "=" + encodeURIComponent( value );
		};

	// Set traditional to true for jQuery <= 1.3.2 behavior.
	if ( traditional === undefined ) {
		traditional = jQuery.ajaxSettings && jQuery.ajaxSettings.traditional;
	}

	// If an array was passed in, assume that it is an array of form elements.
	if ( jQuery.isArray( a ) || ( a.jquery && !jQuery.isPlainObject( a ) ) ) {
		// Serialize the form elements
		jQuery.each( a, function() {
			add( this.name, this.value );
		});

	} else {
		// If traditional, encode the "old" way (the way 1.3.2 or older
		// did it), otherwise encode params recursively.
		for ( prefix in a ) {
			buildParams( prefix, a[ prefix ], traditional, add );
		}
	}

	// Return the resulting serialization
	return s.join( "&" ).replace( r20, "+" );
};

function buildParams( prefix, obj, traditional, add ) {
	var name;

	if ( jQuery.isArray( obj ) ) {
		// Serialize array item.
		jQuery.each( obj, function( i, v ) {
			if ( traditional || rbracket.test( prefix ) ) {
				// Treat each array item as a scalar.
				add( prefix, v );

			} else {
				// If array item is non-scalar (array or object), encode its
				// numeric index to resolve deserialization ambiguity issues.
				// Note that rack (as of 1.0.0) can't currently deserialize
				// nested arrays properly, and attempting to do so may cause
				// a server error. Possible fixes are to modify rack's
				// deserialization algorithm or to provide an option or flag
				// to force array serialization to be shallow.
				buildParams( prefix + "[" + ( typeof v === "object" ? i : "" ) + "]", v, traditional, add );
			}
		});

	} else if ( !traditional && jQuery.type( obj ) === "object" ) {
		// Serialize object item.
		for ( name in obj ) {
			buildParams( prefix + "[" + name + "]", obj[ name ], traditional, add );
		}

	} else {
		// Serialize scalar item.
		add( prefix, obj );
	}
}
var // Document location
	ajaxLocation,
	// Document location segments
	ajaxLocParts,

	rhash = /#.*$/,
	rheaders = /^(.*?):[ \t]*([^\r\n]*)\r?$/mg, // IE leaves an \r character at EOL
	// #7653, #8125, #8152: local protocol detection
	rlocalProtocol = /^(?:about|app|app\-storage|.+\-extension|file|res|widget):$/,
	rnoContent = /^(?:GET|HEAD)$/,
	rprotocol = /^\/\//,
	rquery = /\?/,
	rscript = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
	rts = /([?&])_=[^&]*/,
	rurl = /^([\w\+\.\-]+:)(?:\/\/([^\/?#:]*)(?::(\d+)|)|)/,

	// Keep a copy of the old load method
	_load = jQuery.fn.load,

	/* Prefilters
	 * 1) They are useful to introduce custom dataTypes (see ajax/jsonp.js for an example)
	 * 2) These are called:
	 *    - BEFORE asking for a transport
	 *    - AFTER param serialization (s.data is a string if s.processData is true)
	 * 3) key is the dataType
	 * 4) the catchall symbol "*" can be used
	 * 5) execution will start with transport dataType and THEN continue down to "*" if needed
	 */
	prefilters = {},

	/* Transports bindings
	 * 1) key is the dataType
	 * 2) the catchall symbol "*" can be used
	 * 3) selection will start with transport dataType and THEN go to "*" if needed
	 */
	transports = {},

	// Avoid comment-prolog char sequence (#10098); must appease lint and evade compression
	allTypes = ["*/"] + ["*"];

// #8138, IE may throw an exception when accessing
// a field from window.location if document.domain has been set
try {
	ajaxLocation = location.href;
} catch( e ) {
	// Use the href attribute of an A element
	// since IE will modify it given document.location
	ajaxLocation = document.createElement( "a" );
	ajaxLocation.href = "";
	ajaxLocation = ajaxLocation.href;
}

// Segment location into parts
ajaxLocParts = rurl.exec( ajaxLocation.toLowerCase() ) || [];

// Base "constructor" for jQuery.ajaxPrefilter and jQuery.ajaxTransport
function addToPrefiltersOrTransports( structure ) {

	// dataTypeExpression is optional and defaults to "*"
	return function( dataTypeExpression, func ) {

		if ( typeof dataTypeExpression !== "string" ) {
			func = dataTypeExpression;
			dataTypeExpression = "*";
		}

		var dataType, list, placeBefore,
			dataTypes = dataTypeExpression.toLowerCase().split( core_rspace ),
			i = 0,
			length = dataTypes.length;

		if ( jQuery.isFunction( func ) ) {
			// For each dataType in the dataTypeExpression
			for ( ; i < length; i++ ) {
				dataType = dataTypes[ i ];
				// We control if we're asked to add before
				// any existing element
				placeBefore = /^\+/.test( dataType );
				if ( placeBefore ) {
					dataType = dataType.substr( 1 ) || "*";
				}
				list = structure[ dataType ] = structure[ dataType ] || [];
				// then we add to the structure accordingly
				list[ placeBefore ? "unshift" : "push" ]( func );
			}
		}
	};
}

// Base inspection function for prefilters and transports
function inspectPrefiltersOrTransports( structure, options, originalOptions, jqXHR,
		dataType /* internal */, inspected /* internal */ ) {

	dataType = dataType || options.dataTypes[ 0 ];
	inspected = inspected || {};

	inspected[ dataType ] = true;

	var selection,
		list = structure[ dataType ],
		i = 0,
		length = list ? list.length : 0,
		executeOnly = ( structure === prefilters );

	for ( ; i < length && ( executeOnly || !selection ); i++ ) {
		selection = list[ i ]( options, originalOptions, jqXHR );
		// If we got redirected to another dataType
		// we try there if executing only and not done already
		if ( typeof selection === "string" ) {
			if ( !executeOnly || inspected[ selection ] ) {
				selection = undefined;
			} else {
				options.dataTypes.unshift( selection );
				selection = inspectPrefiltersOrTransports(
						structure, options, originalOptions, jqXHR, selection, inspected );
			}
		}
	}
	// If we're only executing or nothing was selected
	// we try the catchall dataType if not done already
	if ( ( executeOnly || !selection ) && !inspected[ "*" ] ) {
		selection = inspectPrefiltersOrTransports(
				structure, options, originalOptions, jqXHR, "*", inspected );
	}
	// unnecessary when only executing (prefilters)
	// but it'll be ignored by the caller in that case
	return selection;
}

// A special extend for ajax options
// that takes "flat" options (not to be deep extended)
// Fixes #9887
function ajaxExtend( target, src ) {
	var key, deep,
		flatOptions = jQuery.ajaxSettings.flatOptions || {};
	for ( key in src ) {
		if ( src[ key ] !== undefined ) {
			( flatOptions[ key ] ? target : ( deep || ( deep = {} ) ) )[ key ] = src[ key ];
		}
	}
	if ( deep ) {
		jQuery.extend( true, target, deep );
	}
}

jQuery.fn.load = function( url, params, callback ) {
	if ( typeof url !== "string" && _load ) {
		return _load.apply( this, arguments );
	}

	// Don't do a request if no elements are being requested
	if ( !this.length ) {
		return this;
	}

	var selector, type, response,
		self = this,
		off = url.indexOf(" ");

	if ( off >= 0 ) {
		selector = url.slice( off, url.length );
		url = url.slice( 0, off );
	}

	// If it's a function
	if ( jQuery.isFunction( params ) ) {

		// We assume that it's the callback
		callback = params;
		params = undefined;

	// Otherwise, build a param string
	} else if ( params && typeof params === "object" ) {
		type = "POST";
	}

	// Request the remote document
	jQuery.ajax({
		url: url,

		// if "type" variable is undefined, then "GET" method will be used
		type: type,
		dataType: "html",
		data: params,
		complete: function( jqXHR, status ) {
			if ( callback ) {
				self.each( callback, response || [ jqXHR.responseText, status, jqXHR ] );
			}
		}
	}).done(function( responseText ) {

		// Save response for use in complete callback
		response = arguments;

		// See if a selector was specified
		self.html( selector ?

			// Create a dummy div to hold the results
			jQuery("<div>")

				// inject the contents of the document in, removing the scripts
				// to avoid any 'Permission Denied' errors in IE
				.append( responseText.replace( rscript, "" ) )

				// Locate the specified elements
				.find( selector ) :

			// If not, just inject the full result
			responseText );

	});

	return this;
};

// Attach a bunch of functions for handling common AJAX events
jQuery.each( "ajaxStart ajaxStop ajaxComplete ajaxError ajaxSuccess ajaxSend".split( " " ), function( i, o ){
	jQuery.fn[ o ] = function( f ){
		return this.on( o, f );
	};
});

jQuery.each( [ "get", "post" ], function( i, method ) {
	jQuery[ method ] = function( url, data, callback, type ) {
		// shift arguments if data argument was omitted
		if ( jQuery.isFunction( data ) ) {
			type = type || callback;
			callback = data;
			data = undefined;
		}

		return jQuery.ajax({
			type: method,
			url: url,
			data: data,
			success: callback,
			dataType: type
		});
	};
});

jQuery.extend({

	getScript: function( url, callback ) {
		return jQuery.get( url, undefined, callback, "script" );
	},

	getJSON: function( url, data, callback ) {
		return jQuery.get( url, data, callback, "json" );
	},

	// Creates a full fledged settings object into target
	// with both ajaxSettings and settings fields.
	// If target is omitted, writes into ajaxSettings.
	ajaxSetup: function( target, settings ) {
		if ( settings ) {
			// Building a settings object
			ajaxExtend( target, jQuery.ajaxSettings );
		} else {
			// Extending ajaxSettings
			settings = target;
			target = jQuery.ajaxSettings;
		}
		ajaxExtend( target, settings );
		return target;
	},

	ajaxSettings: {
		url: ajaxLocation,
		isLocal: rlocalProtocol.test( ajaxLocParts[ 1 ] ),
		global: true,
		type: "GET",
		contentType: "application/x-www-form-urlencoded; charset=UTF-8",
		processData: true,
		async: true,
		/*
		timeout: 0,
		data: null,
		dataType: null,
		username: null,
		password: null,
		cache: null,
		throws: false,
		traditional: false,
		headers: {},
		*/

		accepts: {
			xml: "application/xml, text/xml",
			html: "text/html",
			text: "text/plain",
			json: "application/json, text/javascript",
			"*": allTypes
		},

		contents: {
			xml: /xml/,
			html: /html/,
			json: /json/
		},

		responseFields: {
			xml: "responseXML",
			text: "responseText"
		},

		// List of data converters
		// 1) key format is "source_type destination_type" (a single space in-between)
		// 2) the catchall symbol "*" can be used for source_type
		converters: {

			// Convert anything to text
			"* text": window.String,

			// Text to html (true = no transformation)
			"text html": true,

			// Evaluate text as a json expression
			"text json": jQuery.parseJSON,

			// Parse text as xml
			"text xml": jQuery.parseXML
		},

		// For options that shouldn't be deep extended:
		// you can add your own custom options here if
		// and when you create one that shouldn't be
		// deep extended (see ajaxExtend)
		flatOptions: {
			context: true,
			url: true
		}
	},

	ajaxPrefilter: addToPrefiltersOrTransports( prefilters ),
	ajaxTransport: addToPrefiltersOrTransports( transports ),

	// Main method
	ajax: function( url, options ) {

		// If url is an object, simulate pre-1.5 signature
		if ( typeof url === "object" ) {
			options = url;
			url = undefined;
		}

		// Force options to be an object
		options = options || {};

		var // ifModified key
			ifModifiedKey,
			// Response headers
			responseHeadersString,
			responseHeaders,
			// transport
			transport,
			// timeout handle
			timeoutTimer,
			// Cross-domain detection vars
			parts,
			// To know if global events are to be dispatched
			fireGlobals,
			// Loop variable
			i,
			// Create the final options object
			s = jQuery.ajaxSetup( {}, options ),
			// Callbacks context
			callbackContext = s.context || s,
			// Context for global events
			// It's the callbackContext if one was provided in the options
			// and if it's a DOM node or a jQuery collection
			globalEventContext = callbackContext !== s &&
				( callbackContext.nodeType || callbackContext instanceof jQuery ) ?
						jQuery( callbackContext ) : jQuery.event,
			// Deferreds
			deferred = jQuery.Deferred(),
			completeDeferred = jQuery.Callbacks( "once memory" ),
			// Status-dependent callbacks
			statusCode = s.statusCode || {},
			// Headers (they are sent all at once)
			requestHeaders = {},
			requestHeadersNames = {},
			// The jqXHR state
			state = 0,
			// Default abort message
			strAbort = "canceled",
			// Fake xhr
			jqXHR = {

				readyState: 0,

				// Caches the header
				setRequestHeader: function( name, value ) {
					if ( !state ) {
						var lname = name.toLowerCase();
						name = requestHeadersNames[ lname ] = requestHeadersNames[ lname ] || name;
						requestHeaders[ name ] = value;
					}
					return this;
				},

				// Raw string
				getAllResponseHeaders: function() {
					return state === 2 ? responseHeadersString : null;
				},

				// Builds headers hashtable if needed
				getResponseHeader: function( key ) {
					var match;
					if ( state === 2 ) {
						if ( !responseHeaders ) {
							responseHeaders = {};
							while( ( match = rheaders.exec( responseHeadersString ) ) ) {
								responseHeaders[ match[1].toLowerCase() ] = match[ 2 ];
							}
						}
						match = responseHeaders[ key.toLowerCase() ];
					}
					return match === undefined ? null : match;
				},

				// Overrides response content-type header
				overrideMimeType: function( type ) {
					if ( !state ) {
						s.mimeType = type;
					}
					return this;
				},

				// Cancel the request
				abort: function( statusText ) {
					statusText = statusText || strAbort;
					if ( transport ) {
						transport.abort( statusText );
					}
					done( 0, statusText );
					return this;
				}
			};

		// Callback for when everything is done
		// It is defined here because jslint complains if it is declared
		// at the end of the function (which would be more logical and readable)
		function done( status, nativeStatusText, responses, headers ) {
			var isSuccess, success, error, response, modified,
				statusText = nativeStatusText;

			// Called once
			if ( state === 2 ) {
				return;
			}

			// State is "done" now
			state = 2;

			// Clear timeout if it exists
			if ( timeoutTimer ) {
				clearTimeout( timeoutTimer );
			}

			// Dereference transport for early garbage collection
			// (no matter how long the jqXHR object will be used)
			transport = undefined;

			// Cache response headers
			responseHeadersString = headers || "";

			// Set readyState
			jqXHR.readyState = status > 0 ? 4 : 0;

			// Get response data
			if ( responses ) {
				response = ajaxHandleResponses( s, jqXHR, responses );
			}

			// If successful, handle type chaining
			if ( status >= 200 && status < 300 || status === 304 ) {

				// Set the If-Modified-Since and/or If-None-Match header, if in ifModified mode.
				if ( s.ifModified ) {

					modified = jqXHR.getResponseHeader("Last-Modified");
					if ( modified ) {
						jQuery.lastModified[ ifModifiedKey ] = modified;
					}
					modified = jqXHR.getResponseHeader("Etag");
					if ( modified ) {
						jQuery.etag[ ifModifiedKey ] = modified;
					}
				}

				// If not modified
				if ( status === 304 ) {

					statusText = "notmodified";
					isSuccess = true;

				// If we have data
				} else {

					isSuccess = ajaxConvert( s, response );
					statusText = isSuccess.state;
					success = isSuccess.data;
					error = isSuccess.error;
					isSuccess = !error;
				}
			} else {
				// We extract error from statusText
				// then normalize statusText and status for non-aborts
				error = statusText;
				if ( !statusText || status ) {
					statusText = "error";
					if ( status < 0 ) {
						status = 0;
					}
				}
			}

			// Set data for the fake xhr object
			jqXHR.status = status;
			jqXHR.statusText = "" + ( nativeStatusText || statusText );

			// Success/Error
			if ( isSuccess ) {
				deferred.resolveWith( callbackContext, [ success, statusText, jqXHR ] );
			} else {
				deferred.rejectWith( callbackContext, [ jqXHR, statusText, error ] );
			}

			// Status-dependent callbacks
			jqXHR.statusCode( statusCode );
			statusCode = undefined;

			if ( fireGlobals ) {
				globalEventContext.trigger( "ajax" + ( isSuccess ? "Success" : "Error" ),
						[ jqXHR, s, isSuccess ? success : error ] );
			}

			// Complete
			completeDeferred.fireWith( callbackContext, [ jqXHR, statusText ] );

			if ( fireGlobals ) {
				globalEventContext.trigger( "ajaxComplete", [ jqXHR, s ] );
				// Handle the global AJAX counter
				if ( !( --jQuery.active ) ) {
					jQuery.event.trigger( "ajaxStop" );
				}
			}
		}

		// Attach deferreds
		deferred.promise( jqXHR );
		jqXHR.success = jqXHR.done;
		jqXHR.error = jqXHR.fail;
		jqXHR.complete = completeDeferred.add;

		// Status-dependent callbacks
		jqXHR.statusCode = function( map ) {
			if ( map ) {
				var tmp;
				if ( state < 2 ) {
					for ( tmp in map ) {
						statusCode[ tmp ] = [ statusCode[tmp], map[tmp] ];
					}
				} else {
					tmp = map[ jqXHR.status ];
					jqXHR.always( tmp );
				}
			}
			return this;
		};

		// Remove hash character (#7531: and string promotion)
		// Add protocol if not provided (#5866: IE7 issue with protocol-less urls)
		// We also use the url parameter if available
		s.url = ( ( url || s.url ) + "" ).replace( rhash, "" ).replace( rprotocol, ajaxLocParts[ 1 ] + "//" );

		// Extract dataTypes list
		s.dataTypes = jQuery.trim( s.dataType || "*" ).toLowerCase().split( core_rspace );

		// Determine if a cross-domain request is in order
		if ( s.crossDomain == null ) {
			parts = rurl.exec( s.url.toLowerCase() );
			s.crossDomain = !!( parts &&
				( parts[ 1 ] != ajaxLocParts[ 1 ] || parts[ 2 ] != ajaxLocParts[ 2 ] ||
					( parts[ 3 ] || ( parts[ 1 ] === "http:" ? 80 : 443 ) ) !=
						( ajaxLocParts[ 3 ] || ( ajaxLocParts[ 1 ] === "http:" ? 80 : 443 ) ) )
			);
		}

		// Convert data if not already a string
		if ( s.data && s.processData && typeof s.data !== "string" ) {
			s.data = jQuery.param( s.data, s.traditional );
		}

		// Apply prefilters
		inspectPrefiltersOrTransports( prefilters, s, options, jqXHR );

		// If request was aborted inside a prefilter, stop there
		if ( state === 2 ) {
			return jqXHR;
		}

		// We can fire global events as of now if asked to
		fireGlobals = s.global;

		// Uppercase the type
		s.type = s.type.toUpperCase();

		// Determine if request has content
		s.hasContent = !rnoContent.test( s.type );

		// Watch for a new set of requests
		if ( fireGlobals && jQuery.active++ === 0 ) {
			jQuery.event.trigger( "ajaxStart" );
		}

		// More options handling for requests with no content
		if ( !s.hasContent ) {

			// If data is available, append data to url
			if ( s.data ) {
				s.url += ( rquery.test( s.url ) ? "&" : "?" ) + s.data;
				// #9682: remove data so that it's not used in an eventual retry
				delete s.data;
			}

			// Get ifModifiedKey before adding the anti-cache parameter
			ifModifiedKey = s.url;

			// Add anti-cache in url if needed
			if ( s.cache === false ) {

				var ts = jQuery.now(),
					// try replacing _= if it is there
					ret = s.url.replace( rts, "$1_=" + ts );

				// if nothing was replaced, add timestamp to the end
				s.url = ret + ( ( ret === s.url ) ? ( rquery.test( s.url ) ? "&" : "?" ) + "_=" + ts : "" );
			}
		}

		// Set the correct header, if data is being sent
		if ( s.data && s.hasContent && s.contentType !== false || options.contentType ) {
			jqXHR.setRequestHeader( "Content-Type", s.contentType );
		}

		// Set the If-Modified-Since and/or If-None-Match header, if in ifModified mode.
		if ( s.ifModified ) {
			ifModifiedKey = ifModifiedKey || s.url;
			if ( jQuery.lastModified[ ifModifiedKey ] ) {
				jqXHR.setRequestHeader( "If-Modified-Since", jQuery.lastModified[ ifModifiedKey ] );
			}
			if ( jQuery.etag[ ifModifiedKey ] ) {
				jqXHR.setRequestHeader( "If-None-Match", jQuery.etag[ ifModifiedKey ] );
			}
		}

		// Set the Accepts header for the server, depending on the dataType
		jqXHR.setRequestHeader(
			"Accept",
			s.dataTypes[ 0 ] && s.accepts[ s.dataTypes[0] ] ?
				s.accepts[ s.dataTypes[0] ] + ( s.dataTypes[ 0 ] !== "*" ? ", " + allTypes + "; q=0.01" : "" ) :
				s.accepts[ "*" ]
		);

		// Check for headers option
		for ( i in s.headers ) {
			jqXHR.setRequestHeader( i, s.headers[ i ] );
		}

		// Allow custom headers/mimetypes and early abort
		if ( s.beforeSend && ( s.beforeSend.call( callbackContext, jqXHR, s ) === false || state === 2 ) ) {
				// Abort if not done already and return
				return jqXHR.abort();

		}

		// aborting is no longer a cancellation
		strAbort = "abort";

		// Install callbacks on deferreds
		for ( i in { success: 1, error: 1, complete: 1 } ) {
			jqXHR[ i ]( s[ i ] );
		}

		// Get transport
		transport = inspectPrefiltersOrTransports( transports, s, options, jqXHR );

		// If no transport, we auto-abort
		if ( !transport ) {
			done( -1, "No Transport" );
		} else {
			jqXHR.readyState = 1;
			// Send global event
			if ( fireGlobals ) {
				globalEventContext.trigger( "ajaxSend", [ jqXHR, s ] );
			}
			// Timeout
			if ( s.async && s.timeout > 0 ) {
				timeoutTimer = setTimeout( function(){
					jqXHR.abort( "timeout" );
				}, s.timeout );
			}

			try {
				state = 1;
				transport.send( requestHeaders, done );
			} catch (e) {
				// Propagate exception as error if not done
				if ( state < 2 ) {
					done( -1, e );
				// Simply rethrow otherwise
				} else {
					throw e;
				}
			}
		}

		return jqXHR;
	},

	// Counter for holding the number of active queries
	active: 0,

	// Last-Modified header cache for next request
	lastModified: {},
	etag: {}

});

/* Handles responses to an ajax request:
 * - sets all responseXXX fields accordingly
 * - finds the right dataType (mediates between content-type and expected dataType)
 * - returns the corresponding response
 */
function ajaxHandleResponses( s, jqXHR, responses ) {

	var ct, type, finalDataType, firstDataType,
		contents = s.contents,
		dataTypes = s.dataTypes,
		responseFields = s.responseFields;

	// Fill responseXXX fields
	for ( type in responseFields ) {
		if ( type in responses ) {
			jqXHR[ responseFields[type] ] = responses[ type ];
		}
	}

	// Remove auto dataType and get content-type in the process
	while( dataTypes[ 0 ] === "*" ) {
		dataTypes.shift();
		if ( ct === undefined ) {
			ct = s.mimeType || jqXHR.getResponseHeader( "content-type" );
		}
	}

	// Check if we're dealing with a known content-type
	if ( ct ) {
		for ( type in contents ) {
			if ( contents[ type ] && contents[ type ].test( ct ) ) {
				dataTypes.unshift( type );
				break;
			}
		}
	}

	// Check to see if we have a response for the expected dataType
	if ( dataTypes[ 0 ] in responses ) {
		finalDataType = dataTypes[ 0 ];
	} else {
		// Try convertible dataTypes
		for ( type in responses ) {
			if ( !dataTypes[ 0 ] || s.converters[ type + " " + dataTypes[0] ] ) {
				finalDataType = type;
				break;
			}
			if ( !firstDataType ) {
				firstDataType = type;
			}
		}
		// Or just use first one
		finalDataType = finalDataType || firstDataType;
	}

	// If we found a dataType
	// We add the dataType to the list if needed
	// and return the corresponding response
	if ( finalDataType ) {
		if ( finalDataType !== dataTypes[ 0 ] ) {
			dataTypes.unshift( finalDataType );
		}
		return responses[ finalDataType ];
	}
}

// Chain conversions given the request and the original response
function ajaxConvert( s, response ) {

	var conv, conv2, current, tmp,
		// Work with a copy of dataTypes in case we need to modify it for conversion
		dataTypes = s.dataTypes.slice(),
		prev = dataTypes[ 0 ],
		converters = {},
		i = 0;

	// Apply the dataFilter if provided
	if ( s.dataFilter ) {
		response = s.dataFilter( response, s.dataType );
	}

	// Create converters map with lowercased keys
	if ( dataTypes[ 1 ] ) {
		for ( conv in s.converters ) {
			converters[ conv.toLowerCase() ] = s.converters[ conv ];
		}
	}

	// Convert to each sequential dataType, tolerating list modification
	for ( ; (current = dataTypes[++i]); ) {

		// There's only work to do if current dataType is non-auto
		if ( current !== "*" ) {

			// Convert response if prev dataType is non-auto and differs from current
			if ( prev !== "*" && prev !== current ) {

				// Seek a direct converter
				conv = converters[ prev + " " + current ] || converters[ "* " + current ];

				// If none found, seek a pair
				if ( !conv ) {
					for ( conv2 in converters ) {

						// If conv2 outputs current
						tmp = conv2.split(" ");
						if ( tmp[ 1 ] === current ) {

							// If prev can be converted to accepted input
							conv = converters[ prev + " " + tmp[ 0 ] ] ||
								converters[ "* " + tmp[ 0 ] ];
							if ( conv ) {
								// Condense equivalence converters
								if ( conv === true ) {
									conv = converters[ conv2 ];

								// Otherwise, insert the intermediate dataType
								} else if ( converters[ conv2 ] !== true ) {
									current = tmp[ 0 ];
									dataTypes.splice( i--, 0, current );
								}

								break;
							}
						}
					}
				}

				// Apply converter (if not an equivalence)
				if ( conv !== true ) {

					// Unless errors are allowed to bubble, catch and return them
					if ( conv && s["throws"] ) {
						response = conv( response );
					} else {
						try {
							response = conv( response );
						} catch ( e ) {
							return { state: "parsererror", error: conv ? e : "No conversion from " + prev + " to " + current };
						}
					}
				}
			}

			// Update prev for next iteration
			prev = current;
		}
	}

	return { state: "success", data: response };
}
var oldCallbacks = [],
	rquestion = /\?/,
	rjsonp = /(=)\?(?=&|$)|\?\?/,
	nonce = jQuery.now();

// Default jsonp settings
jQuery.ajaxSetup({
	jsonp: "callback",
	jsonpCallback: function() {
		var callback = oldCallbacks.pop() || ( jQuery.expando + "_" + ( nonce++ ) );
		this[ callback ] = true;
		return callback;
	}
});

// Detect, normalize options and install callbacks for jsonp requests
jQuery.ajaxPrefilter( "json jsonp", function( s, originalSettings, jqXHR ) {

	var callbackName, overwritten, responseContainer,
		data = s.data,
		url = s.url,
		hasCallback = s.jsonp !== false,
		replaceInUrl = hasCallback && rjsonp.test( url ),
		replaceInData = hasCallback && !replaceInUrl && typeof data === "string" &&
			!( s.contentType || "" ).indexOf("application/x-www-form-urlencoded") &&
			rjsonp.test( data );

	// Handle iff the expected data type is "jsonp" or we have a parameter to set
	if ( s.dataTypes[ 0 ] === "jsonp" || replaceInUrl || replaceInData ) {

		// Get callback name, remembering preexisting value associated with it
		callbackName = s.jsonpCallback = jQuery.isFunction( s.jsonpCallback ) ?
			s.jsonpCallback() :
			s.jsonpCallback;
		overwritten = window[ callbackName ];

		// Insert callback into url or form data
		if ( replaceInUrl ) {
			s.url = url.replace( rjsonp, "$1" + callbackName );
		} else if ( replaceInData ) {
			s.data = data.replace( rjsonp, "$1" + callbackName );
		} else if ( hasCallback ) {
			s.url += ( rquestion.test( url ) ? "&" : "?" ) + s.jsonp + "=" + callbackName;
		}

		// Use data converter to retrieve json after script execution
		s.converters["script json"] = function() {
			if ( !responseContainer ) {
				jQuery.error( callbackName + " was not called" );
			}
			return responseContainer[ 0 ];
		};

		// force json dataType
		s.dataTypes[ 0 ] = "json";

		// Install callback
		window[ callbackName ] = function() {
			responseContainer = arguments;
		};

		// Clean-up function (fires after converters)
		jqXHR.always(function() {
			// Restore preexisting value
			window[ callbackName ] = overwritten;

			// Save back as free
			if ( s[ callbackName ] ) {
				// make sure that re-using the options doesn't screw things around
				s.jsonpCallback = originalSettings.jsonpCallback;

				// save the callback name for future use
				oldCallbacks.push( callbackName );
			}

			// Call if it was a function and we have a response
			if ( responseContainer && jQuery.isFunction( overwritten ) ) {
				overwritten( responseContainer[ 0 ] );
			}

			responseContainer = overwritten = undefined;
		});

		// Delegate to script
		return "script";
	}
});
// Install script dataType
jQuery.ajaxSetup({
	accepts: {
		script: "text/javascript, application/javascript, application/ecmascript, application/x-ecmascript"
	},
	contents: {
		script: /javascript|ecmascript/
	},
	converters: {
		"text script": function( text ) {
			jQuery.globalEval( text );
			return text;
		}
	}
});

// Handle cache's special case and global
jQuery.ajaxPrefilter( "script", function( s ) {
	if ( s.cache === undefined ) {
		s.cache = false;
	}
	if ( s.crossDomain ) {
		s.type = "GET";
		s.global = false;
	}
});

// Bind script tag hack transport
jQuery.ajaxTransport( "script", function(s) {

	// This transport only deals with cross domain requests
	if ( s.crossDomain ) {

		var script,
			head = document.head || document.getElementsByTagName( "head" )[0] || document.documentElement;

		return {

			send: function( _, callback ) {

				script = document.createElement( "script" );

				script.async = "async";

				if ( s.scriptCharset ) {
					script.charset = s.scriptCharset;
				}

				script.src = s.url;

				// Attach handlers for all browsers
				script.onload = script.onreadystatechange = function( _, isAbort ) {

					if ( isAbort || !script.readyState || /loaded|complete/.test( script.readyState ) ) {

						// Handle memory leak in IE
						script.onload = script.onreadystatechange = null;

						// Remove the script
						if ( head && script.parentNode ) {
							head.removeChild( script );
						}

						// Dereference the script
						script = undefined;

						// Callback if not abort
						if ( !isAbort ) {
							callback( 200, "success" );
						}
					}
				};
				// Use insertBefore instead of appendChild  to circumvent an IE6 bug.
				// This arises when a base node is used (#2709 and #4378).
				head.insertBefore( script, head.firstChild );
			},

			abort: function() {
				if ( script ) {
					script.onload( 0, 1 );
				}
			}
		};
	}
});
var xhrCallbacks,
	// #5280: Internet Explorer will keep connections alive if we don't abort on unload
	xhrOnUnloadAbort = window.ActiveXObject ? function() {
		// Abort all pending requests
		for ( var key in xhrCallbacks ) {
			xhrCallbacks[ key ]( 0, 1 );
		}
	} : false,
	xhrId = 0;

// Functions to create xhrs
function createStandardXHR() {
	try {
		return new window.XMLHttpRequest();
	} catch( e ) {}
}

function createActiveXHR() {
	try {
		return new window.ActiveXObject( "Microsoft.XMLHTTP" );
	} catch( e ) {}
}

// Create the request object
// (This is still attached to ajaxSettings for backward compatibility)
jQuery.ajaxSettings.xhr = window.ActiveXObject ?
	/* Microsoft failed to properly
	 * implement the XMLHttpRequest in IE7 (can't request local files),
	 * so we use the ActiveXObject when it is available
	 * Additionally XMLHttpRequest can be disabled in IE7/IE8 so
	 * we need a fallback.
	 */
	function() {
		return !this.isLocal && createStandardXHR() || createActiveXHR();
	} :
	// For all other browsers, use the standard XMLHttpRequest object
	createStandardXHR;

// Determine support properties
(function( xhr ) {
	jQuery.extend( jQuery.support, {
		ajax: !!xhr,
		cors: !!xhr && ( "withCredentials" in xhr )
	});
})( jQuery.ajaxSettings.xhr() );

// Create transport if the browser can provide an xhr
if ( jQuery.support.ajax ) {

	jQuery.ajaxTransport(function( s ) {
		// Cross domain only allowed if supported through XMLHttpRequest
		if ( !s.crossDomain || jQuery.support.cors ) {

			var callback;

			return {
				send: function( headers, complete ) {

					// Get a new xhr
					var handle, i,
						xhr = s.xhr();

					// Open the socket
					// Passing null username, generates a login popup on Opera (#2865)
					if ( s.username ) {
						xhr.open( s.type, s.url, s.async, s.username, s.password );
					} else {
						xhr.open( s.type, s.url, s.async );
					}

					// Apply custom fields if provided
					if ( s.xhrFields ) {
						for ( i in s.xhrFields ) {
							xhr[ i ] = s.xhrFields[ i ];
						}
					}

					// Override mime type if needed
					if ( s.mimeType && xhr.overrideMimeType ) {
						xhr.overrideMimeType( s.mimeType );
					}

					// X-Requested-With header
					// For cross-domain requests, seeing as conditions for a preflight are
					// akin to a jigsaw puzzle, we simply never set it to be sure.
					// (it can always be set on a per-request basis or even using ajaxSetup)
					// For same-domain requests, won't change header if already provided.
					if ( !s.crossDomain && !headers["X-Requested-With"] ) {
						headers[ "X-Requested-With" ] = "XMLHttpRequest";
					}

					// Need an extra try/catch for cross domain requests in Firefox 3
					try {
						for ( i in headers ) {
							xhr.setRequestHeader( i, headers[ i ] );
						}
					} catch( _ ) {}

					// Do send the request
					// This may raise an exception which is actually
					// handled in jQuery.ajax (so no try/catch here)
					xhr.send( ( s.hasContent && s.data ) || null );

					// Listener
					callback = function( _, isAbort ) {

						var status,
							statusText,
							responseHeaders,
							responses,
							xml;

						// Firefox throws exceptions when accessing properties
						// of an xhr when a network error occurred
						// http://helpful.knobs-dials.com/index.php/Component_returned_failure_code:_0x80040111_(NS_ERROR_NOT_AVAILABLE)
						try {

							// Was never called and is aborted or complete
							if ( callback && ( isAbort || xhr.readyState === 4 ) ) {

								// Only called once
								callback = undefined;

								// Do not keep as active anymore
								if ( handle ) {
									xhr.onreadystatechange = jQuery.noop;
									if ( xhrOnUnloadAbort ) {
										delete xhrCallbacks[ handle ];
									}
								}

								// If it's an abort
								if ( isAbort ) {
									// Abort it manually if needed
									if ( xhr.readyState !== 4 ) {
										xhr.abort();
									}
								} else {
									status = xhr.status;
									responseHeaders = xhr.getAllResponseHeaders();
									responses = {};
									xml = xhr.responseXML;

									// Construct response list
									if ( xml && xml.documentElement /* #4958 */ ) {
										responses.xml = xml;
									}

									// When requesting binary data, IE6-9 will throw an exception
									// on any attempt to access responseText (#11426)
									try {
										responses.text = xhr.responseText;
									} catch( _ ) {
									}

									// Firefox throws an exception when accessing
									// statusText for faulty cross-domain requests
									try {
										statusText = xhr.statusText;
									} catch( e ) {
										// We normalize with Webkit giving an empty statusText
										statusText = "";
									}

									// Filter status for non standard behaviors

									// If the request is local and we have data: assume a success
									// (success with no data won't get notified, that's the best we
									// can do given current implementations)
									if ( !status && s.isLocal && !s.crossDomain ) {
										status = responses.text ? 200 : 404;
									// IE - #1450: sometimes returns 1223 when it should be 204
									} else if ( status === 1223 ) {
										status = 204;
									}
								}
							}
						} catch( firefoxAccessException ) {
							if ( !isAbort ) {
								complete( -1, firefoxAccessException );
							}
						}

						// Call complete if needed
						if ( responses ) {
							complete( status, statusText, responses, responseHeaders );
						}
					};

					if ( !s.async ) {
						// if we're in sync mode we fire the callback
						callback();
					} else if ( xhr.readyState === 4 ) {
						// (IE6 & IE7) if it's in cache and has been
						// retrieved directly we need to fire the callback
						setTimeout( callback, 0 );
					} else {
						handle = ++xhrId;
						if ( xhrOnUnloadAbort ) {
							// Create the active xhrs callbacks list if needed
							// and attach the unload handler
							if ( !xhrCallbacks ) {
								xhrCallbacks = {};
								jQuery( window ).unload( xhrOnUnloadAbort );
							}
							// Add to list of active xhrs callbacks
							xhrCallbacks[ handle ] = callback;
						}
						xhr.onreadystatechange = callback;
					}
				},

				abort: function() {
					if ( callback ) {
						callback(0,1);
					}
				}
			};
		}
	});
}
var fxNow, timerId,
	rfxtypes = /^(?:toggle|show|hide)$/,
	rfxnum = new RegExp( "^(?:([-+])=|)(" + core_pnum + ")([a-z%]*)$", "i" ),
	rrun = /queueHooks$/,
	animationPrefilters = [ defaultPrefilter ],
	tweeners = {
		"*": [function( prop, value ) {
			var end, unit, prevScale,
				tween = this.createTween( prop, value ),
				parts = rfxnum.exec( value ),
				target = tween.cur(),
				start = +target || 0,
				scale = 1;

			if ( parts ) {
				end = +parts[2];
				unit = parts[3] || ( jQuery.cssNumber[ prop ] ? "" : "px" );

				// We need to compute starting value
				if ( unit !== "px" && start ) {
					// Iteratively approximate from a nonzero starting point
					// Prefer the current property, because this process will be trivial if it uses the same units
					// Fallback to end or a simple constant
					start = jQuery.css( tween.elem, prop, true ) || end || 1;

					do {
						// If previous iteration zeroed out, double until we get *something*
						// Use a string for doubling factor so we don't accidentally see scale as unchanged below
						prevScale = scale = scale || ".5";

						// Adjust and apply
						start = start / scale;
						jQuery.style( tween.elem, prop, start + unit );

						// Update scale, tolerating zeroes from tween.cur()
						scale = tween.cur() / target;

					// Stop looping if we've hit the mark or scale is unchanged
					} while ( scale !== 1 && scale !== prevScale );
				}

				tween.unit = unit;
				tween.start = start;
				// If a +=/-= token was provided, we're doing a relative animation
				tween.end = parts[1] ? start + ( parts[1] + 1 ) * end : end;
			}
			return tween;
		}]
	};

// Animations created synchronously will run synchronously
function createFxNow() {
	setTimeout(function() {
		fxNow = undefined;
	}, 0 );
	return ( fxNow = jQuery.now() );
}

function createTweens( animation, props ) {
	jQuery.each( props, function( prop, value ) {
		var collection = ( tweeners[ prop ] || [] ).concat( tweeners[ "*" ] ),
			index = 0,
			length = collection.length;
		for ( ; index < length; index++ ) {
			if ( collection[ index ].call( animation, prop, value ) ) {

				// we're done with this property
				return;
			}
		}
	});
}

function Animation( elem, properties, options ) {
	var result,
		index = 0,
		tweenerIndex = 0,
		length = animationPrefilters.length,
		deferred = jQuery.Deferred().always( function() {
			// don't match elem in the :animated selector
			delete tick.elem;
		}),
		tick = function() {
			var currentTime = fxNow || createFxNow(),
				remaining = Math.max( 0, animation.startTime + animation.duration - currentTime ),
				percent = 1 - ( remaining / animation.duration || 0 ),
				index = 0,
				length = animation.tweens.length;

			for ( ; index < length ; index++ ) {
				animation.tweens[ index ].run( percent );
			}

			deferred.notifyWith( elem, [ animation, percent, remaining ]);

			if ( percent < 1 && length ) {
				return remaining;
			} else {
				deferred.resolveWith( elem, [ animation ] );
				return false;
			}
		},
		animation = deferred.promise({
			elem: elem,
			props: jQuery.extend( {}, properties ),
			opts: jQuery.extend( true, { specialEasing: {} }, options ),
			originalProperties: properties,
			originalOptions: options,
			startTime: fxNow || createFxNow(),
			duration: options.duration,
			tweens: [],
			createTween: function( prop, end, easing ) {
				var tween = jQuery.Tween( elem, animation.opts, prop, end,
						animation.opts.specialEasing[ prop ] || animation.opts.easing );
				animation.tweens.push( tween );
				return tween;
			},
			stop: function( gotoEnd ) {
				var index = 0,
					// if we are going to the end, we want to run all the tweens
					// otherwise we skip this part
					length = gotoEnd ? animation.tweens.length : 0;

				for ( ; index < length ; index++ ) {
					animation.tweens[ index ].run( 1 );
				}

				// resolve when we played the last frame
				// otherwise, reject
				if ( gotoEnd ) {
					deferred.resolveWith( elem, [ animation, gotoEnd ] );
				} else {
					deferred.rejectWith( elem, [ animation, gotoEnd ] );
				}
				return this;
			}
		}),
		props = animation.props;

	propFilter( props, animation.opts.specialEasing );

	for ( ; index < length ; index++ ) {
		result = animationPrefilters[ index ].call( animation, elem, props, animation.opts );
		if ( result ) {
			return result;
		}
	}

	createTweens( animation, props );

	if ( jQuery.isFunction( animation.opts.start ) ) {
		animation.opts.start.call( elem, animation );
	}

	jQuery.fx.timer(
		jQuery.extend( tick, {
			anim: animation,
			queue: animation.opts.queue,
			elem: elem
		})
	);

	// attach callbacks from options
	return animation.progress( animation.opts.progress )
		.done( animation.opts.done, animation.opts.complete )
		.fail( animation.opts.fail )
		.always( animation.opts.always );
}

function propFilter( props, specialEasing ) {
	var index, name, easing, value, hooks;

	// camelCase, specialEasing and expand cssHook pass
	for ( index in props ) {
		name = jQuery.camelCase( index );
		easing = specialEasing[ name ];
		value = props[ index ];
		if ( jQuery.isArray( value ) ) {
			easing = value[ 1 ];
			value = props[ index ] = value[ 0 ];
		}

		if ( index !== name ) {
			props[ name ] = value;
			delete props[ index ];
		}

		hooks = jQuery.cssHooks[ name ];
		if ( hooks && "expand" in hooks ) {
			value = hooks.expand( value );
			delete props[ name ];

			// not quite $.extend, this wont overwrite keys already present.
			// also - reusing 'index' from above because we have the correct "name"
			for ( index in value ) {
				if ( !( index in props ) ) {
					props[ index ] = value[ index ];
					specialEasing[ index ] = easing;
				}
			}
		} else {
			specialEasing[ name ] = easing;
		}
	}
}

jQuery.Animation = jQuery.extend( Animation, {

	tweener: function( props, callback ) {
		if ( jQuery.isFunction( props ) ) {
			callback = props;
			props = [ "*" ];
		} else {
			props = props.split(" ");
		}

		var prop,
			index = 0,
			length = props.length;

		for ( ; index < length ; index++ ) {
			prop = props[ index ];
			tweeners[ prop ] = tweeners[ prop ] || [];
			tweeners[ prop ].unshift( callback );
		}
	},

	prefilter: function( callback, prepend ) {
		if ( prepend ) {
			animationPrefilters.unshift( callback );
		} else {
			animationPrefilters.push( callback );
		}
	}
});

function defaultPrefilter( elem, props, opts ) {
	var index, prop, value, length, dataShow, tween, hooks, oldfire,
		anim = this,
		style = elem.style,
		orig = {},
		handled = [],
		hidden = elem.nodeType && isHidden( elem );

	// handle queue: false promises
	if ( !opts.queue ) {
		hooks = jQuery._queueHooks( elem, "fx" );
		if ( hooks.unqueued == null ) {
			hooks.unqueued = 0;
			oldfire = hooks.empty.fire;
			hooks.empty.fire = function() {
				if ( !hooks.unqueued ) {
					oldfire();
				}
			};
		}
		hooks.unqueued++;

		anim.always(function() {
			// doing this makes sure that the complete handler will be called
			// before this completes
			anim.always(function() {
				hooks.unqueued--;
				if ( !jQuery.queue( elem, "fx" ).length ) {
					hooks.empty.fire();
				}
			});
		});
	}

	// height/width overflow pass
	if ( elem.nodeType === 1 && ( "height" in props || "width" in props ) ) {
		// Make sure that nothing sneaks out
		// Record all 3 overflow attributes because IE does not
		// change the overflow attribute when overflowX and
		// overflowY are set to the same value
		opts.overflow = [ style.overflow, style.overflowX, style.overflowY ];

		// Set display property to inline-block for height/width
		// animations on inline elements that are having width/height animated
		if ( jQuery.css( elem, "display" ) === "inline" &&
				jQuery.css( elem, "float" ) === "none" ) {

			// inline-level elements accept inline-block;
			// block-level elements need to be inline with layout
			if ( !jQuery.support.inlineBlockNeedsLayout || css_defaultDisplay( elem.nodeName ) === "inline" ) {
				style.display = "inline-block";

			} else {
				style.zoom = 1;
			}
		}
	}

	if ( opts.overflow ) {
		style.overflow = "hidden";
		if ( !jQuery.support.shrinkWrapBlocks ) {
			anim.done(function() {
				style.overflow = opts.overflow[ 0 ];
				style.overflowX = opts.overflow[ 1 ];
				style.overflowY = opts.overflow[ 2 ];
			});
		}
	}


	// show/hide pass
	for ( index in props ) {
		value = props[ index ];
		if ( rfxtypes.exec( value ) ) {
			delete props[ index ];
			if ( value === ( hidden ? "hide" : "show" ) ) {
				continue;
			}
			handled.push( index );
		}
	}

	length = handled.length;
	if ( length ) {
		dataShow = jQuery._data( elem, "fxshow" ) || jQuery._data( elem, "fxshow", {} );
		if ( hidden ) {
			jQuery( elem ).show();
		} else {
			anim.done(function() {
				jQuery( elem ).hide();
			});
		}
		anim.done(function() {
			var prop;
			jQuery.removeData( elem, "fxshow", true );
			for ( prop in orig ) {
				jQuery.style( elem, prop, orig[ prop ] );
			}
		});
		for ( index = 0 ; index < length ; index++ ) {
			prop = handled[ index ];
			tween = anim.createTween( prop, hidden ? dataShow[ prop ] : 0 );
			orig[ prop ] = dataShow[ prop ] || jQuery.style( elem, prop );

			if ( !( prop in dataShow ) ) {
				dataShow[ prop ] = tween.start;
				if ( hidden ) {
					tween.end = tween.start;
					tween.start = prop === "width" || prop === "height" ? 1 : 0;
				}
			}
		}
	}
}

function Tween( elem, options, prop, end, easing ) {
	return new Tween.prototype.init( elem, options, prop, end, easing );
}
jQuery.Tween = Tween;

Tween.prototype = {
	constructor: Tween,
	init: function( elem, options, prop, end, easing, unit ) {
		this.elem = elem;
		this.prop = prop;
		this.easing = easing || "swing";
		this.options = options;
		this.start = this.now = this.cur();
		this.end = end;
		this.unit = unit || ( jQuery.cssNumber[ prop ] ? "" : "px" );
	},
	cur: function() {
		var hooks = Tween.propHooks[ this.prop ];

		return hooks && hooks.get ?
			hooks.get( this ) :
			Tween.propHooks._default.get( this );
	},
	run: function( percent ) {
		var eased,
			hooks = Tween.propHooks[ this.prop ];

		if ( this.options.duration ) {
			this.pos = eased = jQuery.easing[ this.easing ](
				percent, this.options.duration * percent, 0, 1, this.options.duration
			);
		} else {
			this.pos = eased = percent;
		}
		this.now = ( this.end - this.start ) * eased + this.start;

		if ( this.options.step ) {
			this.options.step.call( this.elem, this.now, this );
		}

		if ( hooks && hooks.set ) {
			hooks.set( this );
		} else {
			Tween.propHooks._default.set( this );
		}
		return this;
	}
};

Tween.prototype.init.prototype = Tween.prototype;

Tween.propHooks = {
	_default: {
		get: function( tween ) {
			var result;

			if ( tween.elem[ tween.prop ] != null &&
				(!tween.elem.style || tween.elem.style[ tween.prop ] == null) ) {
				return tween.elem[ tween.prop ];
			}

			// passing any value as a 4th parameter to .css will automatically
			// attempt a parseFloat and fallback to a string if the parse fails
			// so, simple values such as "10px" are parsed to Float.
			// complex values such as "rotate(1rad)" are returned as is.
			result = jQuery.css( tween.elem, tween.prop, false, "" );
			// Empty strings, null, undefined and "auto" are converted to 0.
			return !result || result === "auto" ? 0 : result;
		},
		set: function( tween ) {
			// use step hook for back compat - use cssHook if its there - use .style if its
			// available and use plain properties where available
			if ( jQuery.fx.step[ tween.prop ] ) {
				jQuery.fx.step[ tween.prop ]( tween );
			} else if ( tween.elem.style && ( tween.elem.style[ jQuery.cssProps[ tween.prop ] ] != null || jQuery.cssHooks[ tween.prop ] ) ) {
				jQuery.style( tween.elem, tween.prop, tween.now + tween.unit );
			} else {
				tween.elem[ tween.prop ] = tween.now;
			}
		}
	}
};

// Remove in 2.0 - this supports IE8's panic based approach
// to setting things on disconnected nodes

Tween.propHooks.scrollTop = Tween.propHooks.scrollLeft = {
	set: function( tween ) {
		if ( tween.elem.nodeType && tween.elem.parentNode ) {
			tween.elem[ tween.prop ] = tween.now;
		}
	}
};

jQuery.each([ "toggle", "show", "hide" ], function( i, name ) {
	var cssFn = jQuery.fn[ name ];
	jQuery.fn[ name ] = function( speed, easing, callback ) {
		return speed == null || typeof speed === "boolean" ||
			// special check for .toggle( handler, handler, ... )
			( !i && jQuery.isFunction( speed ) && jQuery.isFunction( easing ) ) ?
			cssFn.apply( this, arguments ) :
			this.animate( genFx( name, true ), speed, easing, callback );
	};
});

jQuery.fn.extend({
	fadeTo: function( speed, to, easing, callback ) {

		// show any hidden elements after setting opacity to 0
		return this.filter( isHidden ).css( "opacity", 0 ).show()

			// animate to the value specified
			.end().animate({ opacity: to }, speed, easing, callback );
	},
	animate: function( prop, speed, easing, callback ) {
		var empty = jQuery.isEmptyObject( prop ),
			optall = jQuery.speed( speed, easing, callback ),
			doAnimation = function() {
				// Operate on a copy of prop so per-property easing won't be lost
				var anim = Animation( this, jQuery.extend( {}, prop ), optall );

				// Empty animations resolve immediately
				if ( empty ) {
					anim.stop( true );
				}
			};

		return empty || optall.queue === false ?
			this.each( doAnimation ) :
			this.queue( optall.queue, doAnimation );
	},
	stop: function( type, clearQueue, gotoEnd ) {
		var stopQueue = function( hooks ) {
			var stop = hooks.stop;
			delete hooks.stop;
			stop( gotoEnd );
		};

		if ( typeof type !== "string" ) {
			gotoEnd = clearQueue;
			clearQueue = type;
			type = undefined;
		}
		if ( clearQueue && type !== false ) {
			this.queue( type || "fx", [] );
		}

		return this.each(function() {
			var dequeue = true,
				index = type != null && type + "queueHooks",
				timers = jQuery.timers,
				data = jQuery._data( this );

			if ( index ) {
				if ( data[ index ] && data[ index ].stop ) {
					stopQueue( data[ index ] );
				}
			} else {
				for ( index in data ) {
					if ( data[ index ] && data[ index ].stop && rrun.test( index ) ) {
						stopQueue( data[ index ] );
					}
				}
			}

			for ( index = timers.length; index--; ) {
				if ( timers[ index ].elem === this && (type == null || timers[ index ].queue === type) ) {
					timers[ index ].anim.stop( gotoEnd );
					dequeue = false;
					timers.splice( index, 1 );
				}
			}

			// start the next in the queue if the last step wasn't forced
			// timers currently will call their complete callbacks, which will dequeue
			// but only if they were gotoEnd
			if ( dequeue || !gotoEnd ) {
				jQuery.dequeue( this, type );
			}
		});
	}
});

// Generate parameters to create a standard animation
function genFx( type, includeWidth ) {
	var which,
		attrs = { height: type },
		i = 0;

	// if we include width, step value is 1 to do all cssExpand values,
	// if we don't include width, step value is 2 to skip over Left and Right
	includeWidth = includeWidth? 1 : 0;
	for( ; i < 4 ; i += 2 - includeWidth ) {
		which = cssExpand[ i ];
		attrs[ "margin" + which ] = attrs[ "padding" + which ] = type;
	}

	if ( includeWidth ) {
		attrs.opacity = attrs.width = type;
	}

	return attrs;
}

// Generate shortcuts for custom animations
jQuery.each({
	slideDown: genFx("show"),
	slideUp: genFx("hide"),
	slideToggle: genFx("toggle"),
	fadeIn: { opacity: "show" },
	fadeOut: { opacity: "hide" },
	fadeToggle: { opacity: "toggle" }
}, function( name, props ) {
	jQuery.fn[ name ] = function( speed, easing, callback ) {
		return this.animate( props, speed, easing, callback );
	};
});

jQuery.speed = function( speed, easing, fn ) {
	var opt = speed && typeof speed === "object" ? jQuery.extend( {}, speed ) : {
		complete: fn || !fn && easing ||
			jQuery.isFunction( speed ) && speed,
		duration: speed,
		easing: fn && easing || easing && !jQuery.isFunction( easing ) && easing
	};

	opt.duration = jQuery.fx.off ? 0 : typeof opt.duration === "number" ? opt.duration :
		opt.duration in jQuery.fx.speeds ? jQuery.fx.speeds[ opt.duration ] : jQuery.fx.speeds._default;

	// normalize opt.queue - true/undefined/null -> "fx"
	if ( opt.queue == null || opt.queue === true ) {
		opt.queue = "fx";
	}

	// Queueing
	opt.old = opt.complete;

	opt.complete = function() {
		if ( jQuery.isFunction( opt.old ) ) {
			opt.old.call( this );
		}

		if ( opt.queue ) {
			jQuery.dequeue( this, opt.queue );
		}
	};

	return opt;
};

jQuery.easing = {
	linear: function( p ) {
		return p;
	},
	swing: function( p ) {
		return 0.5 - Math.cos( p*Math.PI ) / 2;
	}
};

jQuery.timers = [];
jQuery.fx = Tween.prototype.init;
jQuery.fx.tick = function() {
	var timer,
		timers = jQuery.timers,
		i = 0;

	for ( ; i < timers.length; i++ ) {
		timer = timers[ i ];
		// Checks the timer has not already been removed
		if ( !timer() && timers[ i ] === timer ) {
			timers.splice( i--, 1 );
		}
	}

	if ( !timers.length ) {
		jQuery.fx.stop();
	}
};

jQuery.fx.timer = function( timer ) {
	if ( timer() && jQuery.timers.push( timer ) && !timerId ) {
		timerId = setInterval( jQuery.fx.tick, jQuery.fx.interval );
	}
};

jQuery.fx.interval = 13;

jQuery.fx.stop = function() {
	clearInterval( timerId );
	timerId = null;
};

jQuery.fx.speeds = {
	slow: 600,
	fast: 200,
	// Default speed
	_default: 400
};

// Back Compat <1.8 extension point
jQuery.fx.step = {};

if ( jQuery.expr && jQuery.expr.filters ) {
	jQuery.expr.filters.animated = function( elem ) {
		return jQuery.grep(jQuery.timers, function( fn ) {
			return elem === fn.elem;
		}).length;
	};
}
var rroot = /^(?:body|html)$/i;

jQuery.fn.offset = function( options ) {
	if ( arguments.length ) {
		return options === undefined ?
			this :
			this.each(function( i ) {
				jQuery.offset.setOffset( this, options, i );
			});
	}

	var box, docElem, body, win, clientTop, clientLeft, scrollTop, scrollLeft, top, left,
		elem = this[ 0 ],
		doc = elem && elem.ownerDocument;

	if ( !doc ) {
		return;
	}

	if ( (body = doc.body) === elem ) {
		return jQuery.offset.bodyOffset( elem );
	}

	docElem = doc.documentElement;

	// Make sure we're not dealing with a disconnected DOM node
	if ( !jQuery.contains( docElem, elem ) ) {
		return { top: 0, left: 0 };
	}

	box = elem.getBoundingClientRect();
	win = getWindow( doc );
	clientTop  = docElem.clientTop  || body.clientTop  || 0;
	clientLeft = docElem.clientLeft || body.clientLeft || 0;
	scrollTop  = win.pageYOffset || docElem.scrollTop;
	scrollLeft = win.pageXOffset || docElem.scrollLeft;
	top  = box.top  + scrollTop  - clientTop;
	left = box.left + scrollLeft - clientLeft;

	return { top: top, left: left };
};

jQuery.offset = {

	bodyOffset: function( body ) {
		var top = body.offsetTop,
			left = body.offsetLeft;

		if ( jQuery.support.doesNotIncludeMarginInBodyOffset ) {
			top  += parseFloat( jQuery.css(body, "marginTop") ) || 0;
			left += parseFloat( jQuery.css(body, "marginLeft") ) || 0;
		}

		return { top: top, left: left };
	},

	setOffset: function( elem, options, i ) {
		var position = jQuery.css( elem, "position" );

		// set position first, in-case top/left are set even on static elem
		if ( position === "static" ) {
			elem.style.position = "relative";
		}

		var curElem = jQuery( elem ),
			curOffset = curElem.offset(),
			curCSSTop = jQuery.css( elem, "top" ),
			curCSSLeft = jQuery.css( elem, "left" ),
			calculatePosition = ( position === "absolute" || position === "fixed" ) && jQuery.inArray("auto", [curCSSTop, curCSSLeft]) > -1,
			props = {}, curPosition = {}, curTop, curLeft;

		// need to be able to calculate position if either top or left is auto and position is either absolute or fixed
		if ( calculatePosition ) {
			curPosition = curElem.position();
			curTop = curPosition.top;
			curLeft = curPosition.left;
		} else {
			curTop = parseFloat( curCSSTop ) || 0;
			curLeft = parseFloat( curCSSLeft ) || 0;
		}

		if ( jQuery.isFunction( options ) ) {
			options = options.call( elem, i, curOffset );
		}

		if ( options.top != null ) {
			props.top = ( options.top - curOffset.top ) + curTop;
		}
		if ( options.left != null ) {
			props.left = ( options.left - curOffset.left ) + curLeft;
		}

		if ( "using" in options ) {
			options.using.call( elem, props );
		} else {
			curElem.css( props );
		}
	}
};


jQuery.fn.extend({

	position: function() {
		if ( !this[0] ) {
			return;
		}

		var elem = this[0],

		// Get *real* offsetParent
		offsetParent = this.offsetParent(),

		// Get correct offsets
		offset       = this.offset(),
		parentOffset = rroot.test(offsetParent[0].nodeName) ? { top: 0, left: 0 } : offsetParent.offset();

		// Subtract element margins
		// note: when an element has margin: auto the offsetLeft and marginLeft
		// are the same in Safari causing offset.left to incorrectly be 0
		offset.top  -= parseFloat( jQuery.css(elem, "marginTop") ) || 0;
		offset.left -= parseFloat( jQuery.css(elem, "marginLeft") ) || 0;

		// Add offsetParent borders
		parentOffset.top  += parseFloat( jQuery.css(offsetParent[0], "borderTopWidth") ) || 0;
		parentOffset.left += parseFloat( jQuery.css(offsetParent[0], "borderLeftWidth") ) || 0;

		// Subtract the two offsets
		return {
			top:  offset.top  - parentOffset.top,
			left: offset.left - parentOffset.left
		};
	},

	offsetParent: function() {
		return this.map(function() {
			var offsetParent = this.offsetParent || document.body;
			while ( offsetParent && (!rroot.test(offsetParent.nodeName) && jQuery.css(offsetParent, "position") === "static") ) {
				offsetParent = offsetParent.offsetParent;
			}
			return offsetParent || document.body;
		});
	}
});


// Create scrollLeft and scrollTop methods
jQuery.each( {scrollLeft: "pageXOffset", scrollTop: "pageYOffset"}, function( method, prop ) {
	var top = /Y/.test( prop );

	jQuery.fn[ method ] = function( val ) {
		return jQuery.access( this, function( elem, method, val ) {
			var win = getWindow( elem );

			if ( val === undefined ) {
				return win ? (prop in win) ? win[ prop ] :
					win.document.documentElement[ method ] :
					elem[ method ];
			}

			if ( win ) {
				win.scrollTo(
					!top ? val : jQuery( win ).scrollLeft(),
					 top ? val : jQuery( win ).scrollTop()
				);

			} else {
				elem[ method ] = val;
			}
		}, method, val, arguments.length, null );
	};
});

function getWindow( elem ) {
	return jQuery.isWindow( elem ) ?
		elem :
		elem.nodeType === 9 ?
			elem.defaultView || elem.parentWindow :
			false;
}
// Create innerHeight, innerWidth, height, width, outerHeight and outerWidth methods
jQuery.each( { Height: "height", Width: "width" }, function( name, type ) {
	jQuery.each( { padding: "inner" + name, content: type, "": "outer" + name }, function( defaultExtra, funcName ) {
		// margin is only for outerHeight, outerWidth
		jQuery.fn[ funcName ] = function( margin, value ) {
			var chainable = arguments.length && ( defaultExtra || typeof margin !== "boolean" ),
				extra = defaultExtra || ( margin === true || value === true ? "margin" : "border" );

			return jQuery.access( this, function( elem, type, value ) {
				var doc;

				if ( jQuery.isWindow( elem ) ) {
					// As of 5/8/2012 this will yield incorrect results for Mobile Safari, but there
					// isn't a whole lot we can do. See pull request at this URL for discussion:
					// https://github.com/jquery/jquery/pull/764
					return elem.document.documentElement[ "client" + name ];
				}

				// Get document width or height
				if ( elem.nodeType === 9 ) {
					doc = elem.documentElement;

					// Either scroll[Width/Height] or offset[Width/Height] or client[Width/Height], whichever is greatest
					// unfortunately, this causes bug #3838 in IE6/8 only, but there is currently no good, small way to fix it.
					return Math.max(
						elem.body[ "scroll" + name ], doc[ "scroll" + name ],
						elem.body[ "offset" + name ], doc[ "offset" + name ],
						doc[ "client" + name ]
					);
				}

				return value === undefined ?
					// Get width or height on the element, requesting but not forcing parseFloat
					jQuery.css( elem, type, value, extra ) :

					// Set width or height on the element
					jQuery.style( elem, type, value, extra );
			}, type, chainable ? margin : undefined, chainable, null );
		};
	});
});
// Expose jQuery to the global object
window.jQuery = window.$ = jQuery;

// Expose jQuery as an AMD module, but only for AMD loaders that
// understand the issues with loading multiple versions of jQuery
// in a page that all might call define(). The loader will indicate
// they have special allowances for multiple jQuery versions by
// specifying define.amd.jQuery = true. Register as a named module,
// since jQuery can be concatenated with other files that may use define,
// but not use a proper concatenation script that understands anonymous
// AMD modules. A named AMD is safest and most robust way to register.
// Lowercase jquery is used because AMD module names are derived from
// file names, and jQuery is normally delivered in a lowercase file name.
// Do this after creating the global so that if an AMD module wants to call
// noConflict to hide this version of jQuery, it will work.
if ( typeof define === "function" && define.amd && define.amd.jQuery ) {
	define( "jquery", [], function () { return jQuery; } );
}

return jQuery;

})( window ); }));

},{}],"jquery-browserify":[function(require,module,exports){
module.exports=require('UErKnN');
},{}],15:[function(require,module,exports){
(function (process,global,Buffer){
var inherits          = require('inherits')
  , AbstractLevelDOWN = require('abstract-leveldown').AbstractLevelDOWN
  , AbstractIterator  = require('abstract-leveldown').AbstractIterator
  , ltgt              = require('ltgt')
  , noop              = function () {}
  , setImmediate      = global.setImmediate || process.nextTick

function toKey (key) {
  return typeof key == 'string' ? '$' + key : JSON.stringify(key)
}

function sortedIndexOf (arr, item) {
  var low = 0, high = arr.length, mid
  while (low < high) {
    mid = (low + high) >>> 1
    arr[mid] < item ? low = mid + 1 : high = mid
  }
  return low
}

function MemIterator (db, options) {
  AbstractIterator.call(this, db)
  this._limit   = options.limit
  this._reverse   = options.reverse
  this._keys    = []
  this._options = options

  this._pos = 0

  this._keys = this.db._keys.filter(ltgt.filter(options))

  if (this._reverse)
    this._keys.reverse()

  if (options.limit > 0)
    this._keys = this._keys.slice(0, options.limit)

}

inherits(MemIterator, AbstractIterator)

MemIterator.prototype._next = function (callback) {
  var self  = this
    , key
    , value

  if (self._pos >= self._keys.length)
    return setImmediate(callback)

  key = self._keys[self._pos]

  value = self.db._store[toKey(key)]

  this._pos++

  setImmediate(function () { callback(null, key, value) })
}

function MemDOWN (location) {
  if (!(this instanceof MemDOWN))
    return new MemDOWN(location)

  AbstractLevelDOWN.call(this, typeof location == 'string' ? location : '')
  this._store = {}
  this._keys  = []
  this._len = 0;
}

inherits(MemDOWN, AbstractLevelDOWN)

MemDOWN.prototype._open = function (options, callback) {
  var self = this
  setImmediate(function () { callback(null, self) })
}

MemDOWN.prototype._put = function (key, value, options, callback) {
  var ix = sortedIndexOf(this._keys, key)
  if (ix >= this._len || this._keys[ix] != key) {
    this._keys.splice(ix, 0, key)
    this._len++;
  }
  key = toKey(key) // safety, to avoid key='__proto__'-type skullduggery 
  this._store[key] = value
  setImmediate(callback)
}

MemDOWN.prototype._get = function (key, options, callback) {
  var value = this._store[toKey(key)]
  if (value === undefined) {
    // 'NotFound' error, consistent with LevelDOWN API
    return setImmediate(function () { callback(new Error('NotFound')) })
  }
  if (options.asBuffer !== false && !Buffer.isBuffer(value))
    value = new Buffer(String(value))
  setImmediate(function () {
    callback(null, value)
  })
}

MemDOWN.prototype._del = function (key, options, callback) {
  var ix = sortedIndexOf(this._keys, key)
  if (this._keys[ix] == key) {
    this._keys.splice(ix, 1)
    this._len--;
  }
  delete this._store[toKey(key)]
  setImmediate(callback)
}

MemDOWN.prototype._batch = function (array, options, callback) {
  var err
    , i = -1
    , key
    , value
    , len = array.length

  while (++i < len) {
    if (array[i]) {
      key = Buffer.isBuffer(array[i].key) ? array[i].key : String(array[i].key)
      err = this._checkKeyValue(key, 'key')
      if (err) return setImmediate(function () { callback(err) })
      if (array[i].type === 'del') {
        this._del(array[i].key, options, noop)
      } else if (array[i].type === 'put') {
        value = Buffer.isBuffer(array[i].value) ? array[i].value : String(array[i].value)
        err = this._checkKeyValue(value, 'value')
        if (err) return setImmediate(function () { callback(err) })
        this._put(key, value, options, noop)
      }
    }
  }
  
  setImmediate(callback)
}

MemDOWN.prototype._iterator = function (options) {
  return new MemIterator(this, options)
}

MemDOWN.prototype._isBuffer = function (obj) {
  return Buffer.isBuffer(obj)
}

module.exports = MemDOWN

}).call(this,require("JkpR2F"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer)
},{"JkpR2F":10,"abstract-leveldown":18,"buffer":5,"inherits":20,"ltgt":21}],16:[function(require,module,exports){
(function (process){
/* Copyright (c) 2013 Rod Vagg, MIT License */

function AbstractChainedBatch (db) {
  this._db         = db
  this._operations = []
  this._written    = false
}

AbstractChainedBatch.prototype._checkWritten = function () {
  if (this._written)
    throw new Error('write() already called on this batch')
}

AbstractChainedBatch.prototype.put = function (key, value) {
  this._checkWritten()

  var err = this._db._checkKeyValue(key, 'key', this._db._isBuffer)
  if (err) throw err
  err = this._db._checkKeyValue(value, 'value', this._db._isBuffer)
  if (err) throw err

  if (!this._db._isBuffer(key)) key = String(key)
  if (!this._db._isBuffer(value)) value = String(value)

  if (typeof this._put == 'function' )
    this._put(key, value)
  else
    this._operations.push({ type: 'put', key: key, value: value })

  return this
}

AbstractChainedBatch.prototype.del = function (key) {
  this._checkWritten()

  var err = this._db._checkKeyValue(key, 'key', this._db._isBuffer)
  if (err) throw err

  if (!this._db._isBuffer(key)) key = String(key)

  if (typeof this._del == 'function' )
    this._del(key)
  else
    this._operations.push({ type: 'del', key: key })

  return this
}

AbstractChainedBatch.prototype.clear = function () {
  this._checkWritten()

  this._operations = []

  if (typeof this._clear == 'function' )
    this._clear()

  return this
}

AbstractChainedBatch.prototype.write = function (options, callback) {
  this._checkWritten()

  if (typeof options == 'function')
    callback = options
  if (typeof callback != 'function')
    throw new Error('write() requires a callback argument')
  if (typeof options != 'object')
    options = {}

  this._written = true

  if (typeof this._write == 'function' )
    return this._write(callback)

  if (typeof this._db._batch == 'function')
    return this._db._batch(this._operations, options, callback)

  process.nextTick(callback)
}

module.exports = AbstractChainedBatch
}).call(this,require("JkpR2F"))
},{"JkpR2F":10}],17:[function(require,module,exports){
(function (process){
/* Copyright (c) 2013 Rod Vagg, MIT License */

function AbstractIterator (db) {
  this.db = db
  this._ended = false
  this._nexting = false
}

AbstractIterator.prototype.next = function (callback) {
  var self = this

  if (typeof callback != 'function')
    throw new Error('next() requires a callback argument')

  if (self._ended)
    return callback(new Error('cannot call next() after end()'))
  if (self._nexting)
    return callback(new Error('cannot call next() before previous next() has completed'))

  self._nexting = true
  if (typeof self._next == 'function') {
    return self._next(function () {
      self._nexting = false
      callback.apply(null, arguments)
    })
  }

  process.nextTick(function () {
    self._nexting = false
    callback()
  })
}

AbstractIterator.prototype.end = function (callback) {
  if (typeof callback != 'function')
    throw new Error('end() requires a callback argument')

  if (this._ended)
    return callback(new Error('end() already called on iterator'))

  this._ended = true

  if (typeof this._end == 'function')
    return this._end(callback)

  process.nextTick(callback)
}

module.exports = AbstractIterator

}).call(this,require("JkpR2F"))
},{"JkpR2F":10}],18:[function(require,module,exports){
(function (process,Buffer){
/* Copyright (c) 2013 Rod Vagg, MIT License */

var xtend                = require('xtend')
  , AbstractIterator     = require('./abstract-iterator')
  , AbstractChainedBatch = require('./abstract-chained-batch')

function AbstractLevelDOWN (location) {
  if (!arguments.length || location === undefined)
    throw new Error('constructor requires at least a location argument')

  if (typeof location != 'string')
    throw new Error('constructor requires a location string argument')

  this.location = location
}

AbstractLevelDOWN.prototype.open = function (options, callback) {
  if (typeof options == 'function')
    callback = options

  if (typeof callback != 'function')
    throw new Error('open() requires a callback argument')

  if (typeof options != 'object')
    options = {}

  if (typeof this._open == 'function')
    return this._open(options, callback)

  process.nextTick(callback)
}

AbstractLevelDOWN.prototype.close = function (callback) {
  if (typeof callback != 'function')
    throw new Error('close() requires a callback argument')

  if (typeof this._close == 'function')
    return this._close(callback)

  process.nextTick(callback)
}

AbstractLevelDOWN.prototype.get = function (key, options, callback) {
  var err

  if (typeof options == 'function')
    callback = options

  if (typeof callback != 'function')
    throw new Error('get() requires a callback argument')

  if (err = this._checkKeyValue(key, 'key', this._isBuffer))
    return callback(err)

  if (!this._isBuffer(key))
    key = String(key)

  if (typeof options != 'object')
    options = {}

  if (typeof this._get == 'function')
    return this._get(key, options, callback)

  process.nextTick(function () { callback(new Error('NotFound')) })
}

AbstractLevelDOWN.prototype.put = function (key, value, options, callback) {
  var err

  if (typeof options == 'function')
    callback = options

  if (typeof callback != 'function')
    throw new Error('put() requires a callback argument')

  if (err = this._checkKeyValue(key, 'key', this._isBuffer))
    return callback(err)

  if (err = this._checkKeyValue(value, 'value', this._isBuffer))
    return callback(err)

  if (!this._isBuffer(key))
    key = String(key)

  // coerce value to string in node, don't touch it in browser
  // (indexeddb can store any JS type)
  if (!this._isBuffer(value) && !process.browser)
    value = String(value)

  if (typeof options != 'object')
    options = {}

  if (typeof this._put == 'function')
    return this._put(key, value, options, callback)

  process.nextTick(callback)
}

AbstractLevelDOWN.prototype.del = function (key, options, callback) {
  var err

  if (typeof options == 'function')
    callback = options

  if (typeof callback != 'function')
    throw new Error('del() requires a callback argument')

  if (err = this._checkKeyValue(key, 'key', this._isBuffer))
    return callback(err)

  if (!this._isBuffer(key))
    key = String(key)

  if (typeof options != 'object')
    options = {}

  if (typeof this._del == 'function')
    return this._del(key, options, callback)

  process.nextTick(callback)
}

AbstractLevelDOWN.prototype.batch = function (array, options, callback) {
  if (!arguments.length)
    return this._chainedBatch()

  if (typeof options == 'function')
    callback = options

  if (typeof callback != 'function')
    throw new Error('batch(array) requires a callback argument')

  if (!Array.isArray(array))
    return callback(new Error('batch(array) requires an array argument'))

  if (typeof options != 'object')
    options = {}

  var i = 0
    , l = array.length
    , e
    , err

  for (; i < l; i++) {
    e = array[i]
    if (typeof e != 'object')
      continue

    if (err = this._checkKeyValue(e.type, 'type', this._isBuffer))
      return callback(err)

    if (err = this._checkKeyValue(e.key, 'key', this._isBuffer))
      return callback(err)

    if (e.type == 'put') {
      if (err = this._checkKeyValue(e.value, 'value', this._isBuffer))
        return callback(err)
    }
  }

  if (typeof this._batch == 'function')
    return this._batch(array, options, callback)

  process.nextTick(callback)
}

//TODO: remove from here, not a necessary primitive
AbstractLevelDOWN.prototype.approximateSize = function (start, end, callback) {
  if (   start == null
      || end == null
      || typeof start == 'function'
      || typeof end == 'function') {
    throw new Error('approximateSize() requires valid `start`, `end` and `callback` arguments')
  }

  if (typeof callback != 'function')
    throw new Error('approximateSize() requires a callback argument')

  if (!this._isBuffer(start))
    start = String(start)

  if (!this._isBuffer(end))
    end = String(end)

  if (typeof this._approximateSize == 'function')
    return this._approximateSize(start, end, callback)

  process.nextTick(function () {
    callback(null, 0)
  })
}

AbstractLevelDOWN.prototype._setupIteratorOptions = function (options) {
  var self = this

  options = xtend(options)

  ;[ 'start', 'end', 'gt', 'gte', 'lt', 'lte' ].forEach(function (o) {
    if (options[o] && self._isBuffer(options[o]) && options[o].length === 0)
      delete options[o]
  })

  options.reverse = !!options.reverse

  // fix `start` so it takes into account gt, gte, lt, lte as appropriate
  if (options.reverse && options.lt)
    options.start = options.lt
  if (options.reverse && options.lte)
    options.start = options.lte
  if (!options.reverse && options.gt)
    options.start = options.gt
  if (!options.reverse && options.gte)
    options.start = options.gte

  if ((options.reverse && options.lt && !options.lte)
    || (!options.reverse && options.gt && !options.gte))
    options.exclusiveStart = true // start should *not* include matching key

  return options
}

AbstractLevelDOWN.prototype.iterator = function (options) {
  if (typeof options != 'object')
    options = {}

  options = this._setupIteratorOptions(options)

  if (typeof this._iterator == 'function')
    return this._iterator(options)

  return new AbstractIterator(this)
}

AbstractLevelDOWN.prototype._chainedBatch = function () {
  return new AbstractChainedBatch(this)
}

AbstractLevelDOWN.prototype._isBuffer = function (obj) {
  return Buffer.isBuffer(obj)
}

AbstractLevelDOWN.prototype._checkKeyValue = function (obj, type) {
  if (obj === null || obj === undefined)
    return new Error(type + ' cannot be `null` or `undefined`')

  if (obj === null || obj === undefined)
    return new Error(type + ' cannot be `null` or `undefined`')

  if (this._isBuffer(obj)) {
    if (obj.length === 0)
      return new Error(type + ' cannot be an empty Buffer')
  } else if (String(obj) === '')
    return new Error(type + ' cannot be an empty String')
}

module.exports.AbstractLevelDOWN    = AbstractLevelDOWN
module.exports.AbstractIterator     = AbstractIterator
module.exports.AbstractChainedBatch = AbstractChainedBatch

}).call(this,require("JkpR2F"),require("buffer").Buffer)
},{"./abstract-chained-batch":16,"./abstract-iterator":17,"JkpR2F":10,"buffer":5,"xtend":19}],19:[function(require,module,exports){
module.exports = extend

function extend() {
    var target = {}

    for (var i = 0; i < arguments.length; i++) {
        var source = arguments[i]

        for (var key in source) {
            if (source.hasOwnProperty(key)) {
                target[key] = source[key]
            }
        }
    }

    return target
}

},{}],20:[function(require,module,exports){
module.exports=require(9)
},{}],21:[function(require,module,exports){
(function (Buffer){

exports.compare = function (a, b) {

  if(Buffer.isBuffer(a)) {
    var l = Math.min(a.length, b.length)
    for(var i = 0; i < l; i++) {
      var cmp = a[i] - b[i]
      if(cmp) return cmp
    }
    return a.length - b.length
  }

  return a < b ? -1 : a > b ? 1 : 0
}

function has(obj, key) {
  return Object.hasOwnProperty.call(obj, key)
}

// to be compatible with the current abstract-leveldown tests
// nullish or empty strings.
// I could use !!val but I want to permit numbers and booleans,
// if possible.

function isDef (val) {
  return val != null && val !== ''
}

var lowerBound = exports.lowerBound = function (range) {
  return (
      isDef(range.gt)                      ? range.gt
    : isDef(range.gte)                     ? range.gte
    : isDef(range.min)                     ? range.min
    : isDef(range.start) && !range.reverse ? range.start
    : isDef(range.end) && range.reverse    ? range.end
    :                                        undefined
  )
}

exports.lowerBoundInclusive = function (range) {
  return isDef(range.gt) ? false : true
}

exports.upperBoundInclusive =
  function (range) {
    return isDef(range.lt) ? false : true
  }

var lowerBoundExclusive = exports.lowerBoundExclusive =
  function (range) {
    return isDef(range.gt) ? true : false
  }

var upperBoundExclusive = exports.upperBoundExclusive =
  function (range) {
    return isDef(range.lt) ? true : false
  }

var upperBound = exports.upperBound = function (range) {
  return (
      isDef(range.lt)                     ? range.lt
    : isDef(range.lte)                    ? range.lte
    : isDef(range.max)                    ? range.max
    : isDef(range.start) && range.reverse ? range.start
    : isDef(range.end) && !range.reverse  ? range.end
    :                                       undefined
  )
}


exports.contains = function (range, key, compare) {
  compare = compare || exports.compare

  var lb = lowerBound(range)
  if(isDef(lb)) {
    var cmp = compare(key, lb)
    if(cmp < 0 || (cmp === 0 && lowerBoundExclusive(range)))
      return false
  }

  var ub = upperBound(range)
  if(isDef(ub)) {
    var cmp = compare(key, ub)
    if(cmp > 0 || (cmp === 0) && upperBoundExclusive(range))
      return false
  }

  return true
}

exports.filter = function (range, compare) {
  return function (key) {
    return exports.contains(range, key, compare)
  }
}

}).call(this,require("buffer").Buffer)
},{"buffer":5}],22:[function(require,module,exports){
"use strict";

var utils = require('./utils');
var merge = require('./merge');
var errors = require('./deps/errors');
var EventEmitter = require('events').EventEmitter;
var upsert = require('./deps/upsert');
var Changes = require('./changes');
var Promise = utils.Promise;

/*
 * A generic pouch adapter
 */

// returns first element of arr satisfying callback predicate
function arrayFirst(arr, callback) {
  for (var i = 0; i < arr.length; i++) {
    if (callback(arr[i], i) === true) {
      return arr[i];
    }
  }
  return false;
}

// Wrapper for functions that call the bulkdocs api with a single doc,
// if the first result is an error, return an error
function yankError(callback) {
  return function (err, results) {
    if (err || results[0].error) {
      callback(err || results[0]);
    } else {
      callback(null, results[0]);
    }
  };
}

// for every node in a revision tree computes its distance from the closest
// leaf
function computeHeight(revs) {
  var height = {};
  var edges = [];
  merge.traverseRevTree(revs, function (isLeaf, pos, id, prnt) {
    var rev = pos + "-" + id;
    if (isLeaf) {
      height[rev] = 0;
    }
    if (prnt !== undefined) {
      edges.push({from: prnt, to: rev});
    }
    return rev;
  });

  edges.reverse();
  edges.forEach(function (edge) {
    if (height[edge.from] === undefined) {
      height[edge.from] = 1 + height[edge.to];
    } else {
      height[edge.from] = Math.min(height[edge.from], 1 + height[edge.to]);
    }
  });
  return height;
}

function allDocsKeysQuery(api, opts, callback) {
  var keys =  ('limit' in opts) ?
      opts.keys.slice(opts.skip, opts.limit + opts.skip) :
      (opts.skip > 0) ? opts.keys.slice(opts.skip) : opts.keys;
  if (opts.descending) {
    keys.reverse();
  }
  if (!keys.length) {
    return api._allDocs({limit: 0}, callback);
  }
  var finalResults = {
    offset: opts.skip
  };
  return Promise.all(keys.map(function (key, i) {
    var subOpts = utils.extend(true, {key: key, deleted: 'ok'}, opts);
    ['limit', 'skip', 'keys'].forEach(function (optKey) {
      delete subOpts[optKey];
    });
    return new Promise(function (resolve, reject) {
      api._allDocs(subOpts, function (err, res) {
        if (err) {
          return reject(err);
        }
        finalResults.total_rows = res.total_rows;
        resolve(res.rows[0] || {key: key, error: 'not_found'});
      });
    });
  })).then(function (results) {
    finalResults.rows = results;
    return finalResults;
  });
}

utils.inherits(AbstractPouchDB, EventEmitter);
module.exports = AbstractPouchDB;

function AbstractPouchDB() {
  var self = this;
  EventEmitter.call(this);
  self.autoCompact = function (callback) {
    if (!self.auto_compaction) {
      return callback;
    }
    return function (err, res) {
      if (err) {
        callback(err);
      } else {
        var count = res.length;
        var decCount = function () {
          count--;
          if (!count) {
            callback(null, res);
          }
        };
        res.forEach(function (doc) {
          if (doc.ok) {
            // TODO: we need better error handling
            self.compactDocument(doc.id, 1, decCount);
          } else {
            decCount();
          }
        });
      }
    };
  };

  var listeners = 0, changes;
  var eventNames = ['change', 'delete', 'create', 'update'];
  this.on('newListener', function (eventName) {
    if (~eventNames.indexOf(eventName)) {
      if (listeners) {
        listeners++;
        return;
      } else {
        listeners++;
      }
    } else {
      return;
    }
    var lastChange = 0;
    changes = this.changes({
      conflicts: true,
      include_docs: true,
      continuous: true,
      since: 'now',
      onChange: function (change) {
        if (change.seq <= lastChange) {
          return;
        }
        lastChange = change.seq;
        self.emit('change', change);
        if (change.doc._deleted) {
          self.emit('delete', change);
        } else if (change.doc._rev.split('-')[0] === '1') {
          self.emit('create', change);
        } else {
          self.emit('update', change);
        }
      }
    });
  });
  this.on('removeListener', function (eventName) {
    if (~eventNames.indexOf(eventName)) {
      listeners--;
      if (listeners) {
        return;
      }
    } else {
      return;
    }
    changes.cancel();
  });
}

AbstractPouchDB.prototype.post =
  utils.adapterFun('post', function (doc, opts, callback) {
  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  }
  if (typeof doc !== 'object' || Array.isArray(doc)) {
    return callback(errors.NOT_AN_OBJECT);
  }
  this.bulkDocs({docs: [doc]}, opts,
      this.autoCompact(yankError(callback)));
});

AbstractPouchDB.prototype.put =
  utils.adapterFun('put', utils.getArguments(function (args) {
  var temp, temptype, opts, callback;
  var doc = args.shift();
  var id = '_id' in doc;
  if (typeof doc !== 'object' || Array.isArray(doc)) {
    callback = args.pop();
    return callback(errors.NOT_AN_OBJECT);
  }
  doc = utils.clone(doc);
  while (true) {
    temp = args.shift();
    temptype = typeof temp;
    if (temptype === "string" && !id) {
      doc._id = temp;
      id = true;
    } else if (temptype === "string" && id && !('_rev' in doc)) {
      doc._rev = temp;
    } else if (temptype === "object") {
      opts = temp;
    } else if (temptype === "function") {
      callback = temp;
    }
    if (!args.length) {
      break;
    }
  }
  opts = opts || {};
  var error = utils.invalidIdError(doc._id);
  if (error) {
    return callback(error);
  }
  this.bulkDocs({docs: [doc]}, opts,
      this.autoCompact(yankError(callback)));
}));

AbstractPouchDB.prototype.putAttachment =
  utils.adapterFun('putAttachment', function (docId, attachmentId, rev,
                                              blob, type, callback) {
  var api = this;
  if (typeof type === 'function') {
    callback = type;
    type = blob;
    blob = rev;
    rev = null;
  }
  if (typeof type === 'undefined') {
    type = blob;
    blob = rev;
    rev = null;
  }

  function createAttachment(doc) {
    doc._attachments = doc._attachments || {};
    doc._attachments[attachmentId] = {
      content_type: type,
      data: blob
    };
    return api.put(doc);
  }

  return api.get(docId).then(function (doc) {
    if (doc._rev !== rev) {
      throw errors.REV_CONFLICT;
    }

    return createAttachment(doc);
  }, function (err) {
     // create new doc
    if (err.error === errors.MISSING_DOC.error) {
      return createAttachment({_id: docId});
    } else {
      throw err;
    }
  });
});

AbstractPouchDB.prototype.removeAttachment =
  utils.adapterFun('removeAttachment', function (docId, attachmentId, rev,
                                                 callback) {
  var self = this;
  self.get(docId, function (err, obj) {
    if (err) {
      callback(err);
      return;
    }
    if (obj._rev !== rev) {
      callback(errors.REV_CONFLICT);
      return;
    }
    if (!obj._attachments) {
      return callback();
    }
    delete obj._attachments[attachmentId];
    if (Object.keys(obj._attachments).length === 0) {
      delete obj._attachments;
    }
    self.put(obj, callback);
  });
});

AbstractPouchDB.prototype.remove =
  utils.adapterFun('remove', function (doc, opts, callback) {
  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  } else if (typeof opts === 'string') {
    doc = {
      _id: doc,
      _rev: opts
    };
  } else if (opts === undefined) {
    opts = {};
  }
  opts = utils.clone(opts);
  opts.was_delete = true;
  var newDoc = {_id: doc._id, _rev: doc._rev};
  newDoc._deleted = true;
  this.bulkDocs({docs: [newDoc]}, opts, yankError(callback));
});

AbstractPouchDB.prototype.revsDiff =
  utils.adapterFun('revsDiff', function (req, opts, callback) {
  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  }
  opts = utils.clone(opts);
  var ids = Object.keys(req);
  var count = 0;
  var missing = {};

  function addToMissing(id, revId) {
    if (!missing[id]) {
      missing[id] = {missing: []};
    }
    missing[id].missing.push(revId);
  }

  function processDoc(id, rev_tree) {
    // Is this fast enough? Maybe we should switch to a set simulated by a map
    var missingForId = req[id].slice(0);
    merge.traverseRevTree(rev_tree, function (isLeaf, pos, revHash, ctx,
      opts) {
        var rev = pos + '-' + revHash;
        var idx = missingForId.indexOf(rev);
        if (idx === -1) {
          return;
        }

        missingForId.splice(idx, 1);
        if (opts.status !== 'available') {
          addToMissing(id, rev);
        }
      });

    // Traversing the tree is synchronous, so now `missingForId` contains
    // revisions that were not found in the tree
    missingForId.forEach(function (rev) {
      addToMissing(id, rev);
    });
  }

  ids.map(function (id) {
    this._getRevisionTree(id, function (err, rev_tree) {
      if (err && err.name === 'not_found' && err.message === 'missing') {
        missing[id] = {missing: req[id]};
      } else if (err) {
        return callback(err);
      } else {
        processDoc(id, rev_tree);
      }

      if (++count === ids.length) {
        return callback(null, missing);
      }
    });
  }, this);
});

// compact one document and fire callback
// by compacting we mean removing all revisions which
// are further from the leaf in revision tree than max_height
AbstractPouchDB.prototype.compactDocument =
  function (docId, max_height, callback) {
  var self = this;
  this._getRevisionTree(docId, function (err, rev_tree) {
    if (err) {
      return callback(err);
    }
    var height = computeHeight(rev_tree);
    var candidates = [];
    var revs = [];
    Object.keys(height).forEach(function (rev) {
      if (height[rev] > max_height) {
        candidates.push(rev);
      }
    });

    merge.traverseRevTree(rev_tree, function (isLeaf, pos, revHash, ctx, opts) {
      var rev = pos + '-' + revHash;
      if (opts.status === 'available' && candidates.indexOf(rev) !== -1) {
        opts.status = 'missing';
        revs.push(rev);
      }
    });
    self._doCompaction(docId, rev_tree, revs, callback);
  });
};

// compact the whole database using single document
// compaction
AbstractPouchDB.prototype.compact =
  utils.adapterFun('compact', function (opts, callback) {
  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  }
  var self = this;
  this.changes({complete: function (err, res) {
    if (err) {
      callback(); // TODO: silently fail
      return;
    }
    var count = res.results.length;
    if (!count) {
      callback();
      return;
    }
    res.results.forEach(function (row) {
      self.compactDocument(row.id, 0, function () {
        count--;
        if (!count) {
          callback();
        }
      });
    });
  }});
});

/* Begin api wrappers. Specific functionality to storage belongs in the 
   _[method] */
AbstractPouchDB.prototype.get =
  utils.adapterFun('get', function (id, opts, callback) {
  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  }
  if (typeof id !== 'string') {
    return callback(errors.INVALID_ID);
  }
  var leaves = [], self = this;
  function finishOpenRevs() {
    var result = [];
    var count = leaves.length;
    if (!count) {
      return callback(null, result);
    }
    // order with open_revs is unspecified
    leaves.forEach(function (leaf) {
      self.get(id,
               {rev: leaf, revs: opts.revs, attachments: opts.attachments},
               function (err, doc) {
        if (!err) {
          result.push({ok: doc});
        } else {
          result.push({missing: leaf});
        }
        count--;
        if (!count) {
          callback(null, result);
        }
      });
    });
  }

  if (opts.open_revs) {
    if (opts.open_revs === "all") {
      this._getRevisionTree(id, function (err, rev_tree) {
        if (err) {
          // if there's no such document we should treat this
          // situation the same way as if revision tree was empty
          rev_tree = [];
        }
        leaves = merge.collectLeaves(rev_tree).map(function (leaf) {
          return leaf.rev;
        });
        finishOpenRevs();
      });
    } else {
      if (Array.isArray(opts.open_revs)) {
        leaves = opts.open_revs;
        for (var i = 0; i < leaves.length; i++) {
          var l = leaves[i];
          // looks like it's the only thing couchdb checks
          if (!(typeof(l) === "string" && /^\d+-/.test(l))) {
            return callback(errors.error(errors.BAD_REQUEST,
              "Invalid rev format"));
          }
        }
        finishOpenRevs();
      } else {
        return callback(errors.error(errors.UNKNOWN_ERROR,
          'function_clause'));
      }
    }
    return; // open_revs does not like other options
  }

  return this._get(id, opts, function (err, result) {
    opts = utils.clone(opts);
    if (err) {
      return callback(err);
    }

    var doc = result.doc;
    if (!doc) {
      // a smoke test for something being very wrong
      return callback(new Error('no doc!'));
    }
    var metadata = result.metadata;
    var ctx = result.ctx;

    if (opts.conflicts) {
      var conflicts = merge.collectConflicts(metadata);
      if (conflicts.length) {
        doc._conflicts = conflicts;
      }
    }

    if (opts.revs || opts.revs_info) {
      var paths = merge.rootToLeaf(metadata.rev_tree);
      var path = arrayFirst(paths, function (arr) {
        return arr.ids.map(function (x) { return x.id; })
          .indexOf(doc._rev.split('-')[1]) !== -1;
      });

      var indexOfRev = path.ids.map(function (x) {return x.id; })
        .indexOf(doc._rev.split('-')[1]) + 1;
      var howMany = path.ids.length - indexOfRev;
      path.ids.splice(indexOfRev, howMany);
      path.ids.reverse();

      if (opts.revs) {
        doc._revisions = {
          start: (path.pos + path.ids.length) - 1,
          ids: path.ids.map(function (rev) {
            return rev.id;
          })
        };
      }
      if (opts.revs_info) {
        var pos =  path.pos + path.ids.length;
        doc._revs_info = path.ids.map(function (rev) {
          pos--;
          return {
            rev: pos + '-' + rev.id,
            status: rev.opts.status
          };
        });
      }
    }

    if (opts.local_seq) {
      doc._local_seq = result.metadata.seq;
    }

    if (opts.attachments && doc._attachments) {
      var attachments = doc._attachments;
      var count = Object.keys(attachments).length;
      if (count === 0) {
        return callback(null, doc);
      }
      Object.keys(attachments).forEach(function (key) {
        this._getAttachment(attachments[key],
                            {encode: true, ctx: ctx}, function (err, data) {
          doc._attachments[key].data = data;
          if (!--count) {
            callback(null, doc);
          }
        });
      }, self);
    } else {
      if (doc._attachments) {
        for (var key in doc._attachments) {
          if (doc._attachments.hasOwnProperty(key)) {
            doc._attachments[key].stub = true;
          }
        }
      }
      callback(null, doc);
    }
  });
});

AbstractPouchDB.prototype.getAttachment =
  utils.adapterFun('getAttachment', function (docId, attachmentId, opts,
                                              callback) {
  var self = this;
  if (opts instanceof Function) {
    callback = opts;
    opts = {};
  }
  opts = utils.clone(opts);
  this._get(docId, opts, function (err, res) {
    if (err) {
      return callback(err);
    }
    if (res.doc._attachments && res.doc._attachments[attachmentId]) {
      opts.ctx = res.ctx;
      self._getAttachment(res.doc._attachments[attachmentId], opts, callback);
    } else {
      return callback(errors.MISSING_DOC);
    }
  });
});

AbstractPouchDB.prototype.allDocs =
  utils.adapterFun('allDocs', function (opts, callback) {
  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  }
  opts = utils.clone(opts);
  opts.skip = typeof opts.skip !== 'undefined' ? opts.skip : 0;
  if ('keys' in opts) {
    if (!Array.isArray(opts.keys)) {
      return callback(new TypeError('options.keys must be an array'));
    }
    var incompatibleOpt =
      ['startkey', 'endkey', 'key'].filter(function (incompatibleOpt) {
      return incompatibleOpt in opts;
    })[0];
    if (incompatibleOpt) {
      callback(errors.error(errors.QUERY_PARSE_ERROR,
        'Query parameter `' + incompatibleOpt +
        '` is not compatible with multi-get'
      ));
      return;
    }
    if (this.type() !== 'http') {
      return allDocsKeysQuery(this, opts, callback);
    }
  }

  return this._allDocs(opts, callback);
});

AbstractPouchDB.prototype.changes = function (opts, callback) {
  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  }
  return new Changes(this, opts, callback);
};

AbstractPouchDB.prototype.close =
  utils.adapterFun('close', function (callback) {
  this._closed = true;
  return this._close(callback);
});

AbstractPouchDB.prototype.info = utils.adapterFun('info', function (callback) {
  var self = this;
  this._info(function (err, info) {
    if (err) {
      return callback(err);
    }
    var len = self.prefix.length;
    if (info.db_name.length > len &&
        info.db_name.slice(0, len) === self.prefix) {
      info.db_name = info.db_name.slice(len);
    }
    callback(null, info);
  });
});

AbstractPouchDB.prototype.id = utils.adapterFun('id', function (callback) {
  return this._id(callback);
});

AbstractPouchDB.prototype.type = function () {
  return (typeof this._type === 'function') ? this._type() : this.adapter;
};

AbstractPouchDB.prototype.bulkDocs =
  utils.adapterFun('bulkDocs', function (req, opts, callback) {
  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  }

  opts = utils.clone(opts);

  if (Array.isArray(req)) {
    req = {
      docs: req
    };
  }

  if (!req || !req.docs || !Array.isArray(req.docs)) {
    return callback(errors.MISSING_BULK_DOCS);
  }

  for (var i = 0; i < req.docs.length; ++i) {
    if (typeof req.docs[i] !== 'object' || Array.isArray(req.docs[i])) {
      return callback(errors.NOT_AN_OBJECT);
    }
  }

  req = utils.clone(req);
  if (!('new_edits' in opts)) {
    if ('new_edits' in req) {
      opts.new_edits = req.new_edits;
    } else {
      opts.new_edits = true;
    }
  }

  return this._bulkDocs(req, opts, this.autoCompact(callback));
});

AbstractPouchDB.prototype.registerDependentDatabase =
  utils.adapterFun('registerDependentDatabase', function (dependentDb,
                                                          callback) {
  var depDB = new this.constructor(dependentDb, {adapter: this._adapter});
  function diffFun(doc) {
    doc.dependentDbs = doc.dependentDbs || {};
    if (doc.dependentDbs[dependentDb]) {
      return false; // no update required
    }
    doc.dependentDbs[dependentDb] = true;
    return doc;
  }
  upsert(this, '_local/_pouch_dependentDbs', diffFun, function (err) {
    if (err) {
      return callback(err);
    }
    return callback(null, {db: depDB});
  });
});

},{"./changes":27,"./deps/errors":31,"./deps/upsert":32,"./merge":37,"./utils":42,"events":8}],23:[function(require,module,exports){
"use strict";

var utils = require('../utils');
var errors = require('../deps/errors');
// parseUri 1.2.2
// (c) Steven Levithan <stevenlevithan.com>
// MIT License
function parseUri(str) {
  var o = parseUri.options;
  var m = o.parser[o.strictMode ? "strict" : "loose"].exec(str);
  var uri = {};
  var i = 14;

  while (i--) {
    uri[o.key[i]] = m[i] || "";
  }

  uri[o.q.name] = {};
  uri[o.key[12]].replace(o.q.parser, function ($0, $1, $2) {
    if ($1) {
      uri[o.q.name][$1] = $2;
    }
  });

  return uri;
}

function encodeDocId(id) {
  if (/^_(design|local)/.test(id)) {
    return id;
  }
  return encodeURIComponent(id);
}

parseUri.options = {
  strictMode: false,
  key: ["source", "protocol", "authority", "userInfo", "user", "password",
        "host", "port", "relative", "path", "directory", "file", "query",
        "anchor"],
  q:   {
    name:   "queryKey",
    parser: /(?:^|&)([^&=]*)=?([^&]*)/g
  },
  parser: {
    /* jshint maxlen: false */
    strict: /^(?:([^:\/?#]+):)?(?:\/\/((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?))?((((?:[^?#\/]*\/)*)([^?#]*))(?:\?([^#]*))?(?:#(.*))?)/,
    loose:  /^(?:(?![^:@]+:[^:@\/]*@)([^:\/?#.]+):)?(?:\/\/)?((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/
  }
};

// Get all the information you possibly can about the URI given by name and
// return it as a suitable object.
function getHost(name, opts) {
  // If the given name contains "http:"
  if (/http(s?):/.test(name)) {
    // Prase the URI into all its little bits
    var uri = parseUri(name);

    // Store the fact that it is a remote URI
    uri.remote = true;

    // Store the user and password as a separate auth object
    if (uri.user || uri.password) {
      uri.auth = {username: uri.user, password: uri.password};
    }

    // Split the path part of the URI into parts using '/' as the delimiter
    // after removing any leading '/' and any trailing '/'
    var parts = uri.path.replace(/(^\/|\/$)/g, '').split('/');

    // Store the first part as the database name and remove it from the parts
    // array
    uri.db = parts.pop();

    // Restore the path by joining all the remaining parts (all the parts
    // except for the database name) with '/'s
    uri.path = parts.join('/');
    opts = opts || {};
    opts = utils.clone(opts);
    uri.headers = opts.headers || {};

    if (opts.auth || uri.auth) {
      var nAuth = opts.auth || uri.auth;
      var token = utils.btoa(nAuth.username + ':' + nAuth.password);
      uri.headers.Authorization = 'Basic ' + token;
    }

    if (opts.headers) {
      uri.headers = opts.headers;
    }

    return uri;
  }

  // If the given name does not contain 'http:' then return a very basic object
  // with no host, the current path, the given name as the database name and no
  // username/password
  return {host: '', path: '/', db: name, auth: false};
}

// Generate a URL with the host data given by opts and the given path
function genDBUrl(opts, path) {
  return genUrl(opts, opts.db + '/' + path);
}

// Generate a URL with the host data given by opts and the given path
function genUrl(opts, path) {
  if (opts.remote) {
    // If the host already has a path, then we need to have a path delimiter
    // Otherwise, the path delimiter is the empty string
    var pathDel = !opts.path ? '' : '/';

    // If the host already has a path, then we need to have a path delimiter
    // Otherwise, the path delimiter is the empty string
    return opts.protocol + '://' + opts.host + ':' + opts.port + '/' +
           opts.path + pathDel + path;
  }

  return '/' + path;
}
// Implements the PouchDB API for dealing with CouchDB instances over HTTP
function HttpPouch(opts, callback) {
  // The functions that will be publicly available for HttpPouch
  var api = this;
  api.getHost = opts.getHost ? opts.getHost : getHost;

  // Parse the URI given by opts.name into an easy-to-use object
  var host = api.getHost(opts.name, opts);

  // Generate the database URL based on the host
  var dbUrl = genDBUrl(host, '');

  api.getUrl = function () {return dbUrl; };

  var ajaxOpts = opts.ajax || {};
  opts = utils.clone(opts);
  function ajax(options, callback) {
    return utils.ajax(utils.extend({}, ajaxOpts, options), callback);
  }

  // Create a new CouchDB database based on the given opts
  var createDB = function () {
    ajax({headers: host.headers, method: 'PUT', url: dbUrl},
         function (err, ret) {
      // If we get an "Unauthorized" error
      if (err && err.status === 401) {
        // Test if the database already exists
        ajax({headers: host.headers, method: 'HEAD', url: dbUrl},
             function (err, ret) {
          // If there is still an error
          if (err) {
            // Give the error to the callback to deal with
            callback(err);
          } else {
            // Continue as if there had been no errors
            callback(null, api);
          }
        });
        // If there were no errros or if the only error is "Precondition Failed"
        // (note: "Precondition Failed" occurs when we try to create a database
        // that already exists)
      } else if (!err || err.status === 412) {
        // Continue as if there had been no errors
        callback(null, api);
      } else {
        callback(err);
      }
    });
  };
  if (!opts.skipSetup) {
    ajax({headers: host.headers, method: 'GET', url: dbUrl},
         function (err, ret) {
      //check if the db exists
      if (err) {
        if (err.status === 404) {
          //if it doesn't, create it
          createDB();
        } else {
          callback(err);
        }
      } else {
        //go do stuff with the db
        callback(null, api);
      }
    });
  }

  api.type = function () {
    return 'http';
  };

  api.id = utils.adapterFun('id', function (callback) {
    ajax({
      headers: host.headers,
      method: 'GET',
      url: genUrl(host, '')
    }, function (err, result) {
      var uuid = (result && result.uuid) ?
        result.uuid + host.db : genDBUrl(host, '');
      callback(null, uuid);
    });
  });

  api.request = utils.adapterFun('request', function (options, callback) {
    options.headers = host.headers;
    options.url = genDBUrl(host, options.url);
    ajax(options, callback);
  });

  // Sends a POST request to the host calling the couchdb _compact function
  //    version: The version of CouchDB it is running
  api.compact = utils.adapterFun('compact', function (opts, callback) {
    if (typeof opts === 'function') {
      callback = opts;
      opts = {};
    }
    opts = utils.clone(opts);
    ajax({
      headers: host.headers,
      url: genDBUrl(host, '_compact'),
      method: 'POST'
    }, function () {
      function ping() {
        api.info(function (err, res) {
          if (!res.compact_running) {
            callback();
          } else {
            setTimeout(ping, opts.interval || 200);
          }
        });
      }
      // Ping the http if it's finished compaction
      if (typeof callback === "function") {
        ping();
      }
    });
  });

  // Calls GET on the host, which gets back a JSON string containing
  //    couchdb: A welcome string
  //    version: The version of CouchDB it is running
  api._info = function (callback) {
    ajax({
      headers: host.headers,
      method: 'GET',
      url: genDBUrl(host, '')
    }, function (err, res) {
      if (err) {
        callback(err);
      } else {
        res.host = genDBUrl(host, '');
        callback(null, res);
      }
    });
  };

  // Get the document with the given id from the database given by host.
  // The id could be solely the _id in the database, or it may be a
  // _design/ID or _local/ID path
  api.get = utils.adapterFun('get', function (id, opts, callback) {
    // If no options were given, set the callback to the second parameter
    if (typeof opts === 'function') {
      callback = opts;
      opts = {};
    }
    opts = utils.clone(opts);
    if (opts.auto_encode === undefined) {
      opts.auto_encode = true;
    }

    // List of parameters to add to the GET request
    var params = [];

    // If it exists, add the opts.revs value to the list of parameters.
    // If revs=true then the resulting JSON will include a field
    // _revisions containing an array of the revision IDs.
    if (opts.revs) {
      params.push('revs=true');
    }

    // If it exists, add the opts.revs_info value to the list of parameters.
    // If revs_info=true then the resulting JSON will include the field
    // _revs_info containing an array of objects in which each object
    // representing an available revision.
    if (opts.revs_info) {
      params.push('revs_info=true');
    }

    if (opts.local_seq) {
      params.push('local_seq=true');
    }
    // If it exists, add the opts.open_revs value to the list of parameters.
    // If open_revs=all then the resulting JSON will include all the leaf
    // revisions. If open_revs=["rev1", "rev2",...] then the resulting JSON
    // will contain an array of objects containing data of all revisions
    if (opts.open_revs) {
      if (opts.open_revs !== "all") {
        opts.open_revs = JSON.stringify(opts.open_revs);
      }
      params.push('open_revs=' + opts.open_revs);
    }

    // If it exists, add the opts.attachments value to the list of parameters.
    // If attachments=true the resulting JSON will include the base64-encoded
    // contents in the "data" property of each attachment.
    if (opts.attachments) {
      params.push('attachments=true');
    }

    // If it exists, add the opts.rev value to the list of parameters.
    // If rev is given a revision number then get the specified revision.
    if (opts.rev) {
      params.push('rev=' + opts.rev);
    }

    // If it exists, add the opts.conflicts value to the list of parameters.
    // If conflicts=true then the resulting JSON will include the field
    // _conflicts containing all the conflicting revisions.
    if (opts.conflicts) {
      params.push('conflicts=' + opts.conflicts);
    }

    // Format the list of parameters into a valid URI query string
    params = params.join('&');
    params = params === '' ? '' : '?' + params;

    if (opts.auto_encode) {
      id = encodeDocId(id);
    }

    // Set the options for the ajax call
    var options = {
      headers: host.headers,
      method: 'GET',
      url: genDBUrl(host, id + params)
    };

    // If the given id contains at least one '/' and the part before the '/'
    // is NOT "_design" and is NOT "_local"
    // OR
    // If the given id contains at least two '/' and the part before the first
    // '/' is "_design".
    // TODO This second condition seems strange since if parts[0] === '_design'
    // then we already know that parts[0] !== '_local'.
    var parts = id.split('/');
    if ((parts.length > 1 && parts[0] !== '_design' && parts[0] !== '_local') ||
        (parts.length > 2 && parts[0] === '_design' && parts[0] !== '_local')) {
      // Binary is expected back from the server
      options.binary = true;
    }

    // Get the document
    ajax(options, function (err, doc, xhr) {
      // If the document does not exist, send an error to the callback
      if (err) {
        return callback(err);
      }

      // Send the document to the callback
      callback(null, doc, xhr);
    });
  });

  // Delete the document given by doc from the database given by host.
  api.remove = utils.adapterFun('remove', function (doc, opts, callback) {
    // If no options were given, set the callback to be the second parameter
    if (typeof opts === 'function') {
      callback = opts;
      opts = {};
    }  else if (typeof opts === 'string') {
      doc = {
        _id: doc,
        _rev: opts
      };
    } else if (opts === undefined) {
      opts = {};
    }
    // Delete the document
    ajax({
      headers: host.headers,
      method: 'DELETE',
      url: genDBUrl(host, encodeDocId(doc._id)) + '?rev=' + doc._rev
    }, callback);
  });

  // Get the attachment
  api.getAttachment =
    utils.adapterFun('getAttachment', function (docId, attachmentId, opts,
                                                callback) {
    if (typeof opts === 'function') {
      callback = opts;
      opts = {};
    }
    opts = utils.clone(opts);
    if (opts.auto_encode === undefined) {
      opts.auto_encode = true;
    }
    if (opts.auto_encode) {
      docId = encodeDocId(docId);
    }
    opts.auto_encode = false;
    api.get(docId + '/' + attachmentId, opts, callback);
  });

  // Remove the attachment given by the id and rev
  api.removeAttachment =
    utils.adapterFun('removeAttachment', function (docId, attachmentId, rev,
                                                   callback) {
    ajax({
      headers: host.headers,
      method: 'DELETE',
      url: genDBUrl(host, encodeDocId(docId) + '/' + attachmentId) + '?rev=' +
           rev
    }, callback);
  });

  // Add the attachment given by blob and its contentType property
  // to the document with the given id, the revision given by rev, and
  // add it to the database given by host.
  api.putAttachment =
    utils.adapterFun('putAttachment', function (docId, attachmentId, rev, blob,
                                                type, callback) {
    if (typeof type === 'function') {
      callback = type;
      type = blob;
      blob = rev;
      rev = null;
    }
    if (typeof type === 'undefined') {
      type = blob;
      blob = rev;
      rev = null;
    }
    var id = encodeDocId(docId) + '/' + attachmentId;
    var url = genDBUrl(host, id);
    if (rev) {
      url += '?rev=' + rev;
    }

    var opts = {
      headers: host.headers,
      method: 'PUT',
      url: url,
      processData: false,
      body: blob,
      timeout: 60000
    };
    opts.headers['Content-Type'] = type;
    // Add the attachment
    ajax(opts, callback);
  });

  // Add the document given by doc (in JSON string format) to the database
  // given by host. This fails if the doc has no _id field.
  api.put = utils.adapterFun('put', utils.getArguments(function (args) {
    var temp, temptype, opts, callback;
    var doc = args.shift();
    var id = '_id' in doc;
    if (typeof doc !== 'object' || Array.isArray(doc)) {
      callback = args.pop();
      return callback(errors.NOT_AN_OBJECT);
    }
    doc = utils.clone(doc);
    while (true) {
      temp = args.shift();
      temptype = typeof temp;
      if (temptype === "string" && !id) {
        doc._id = temp;
        id = true;
      } else if (temptype === "string" && id && !('_rev' in doc)) {
        doc._rev = temp;
      } else if (temptype === "object") {
        opts = utils.clone(temp);
      } else if (temptype === "function") {
        callback = temp;
      }
      if (!args.length) {
        break;
      }
    }
    opts = opts || {};
    var error = utils.invalidIdError(doc._id);
    if (error) {
      return callback(error);
    }

    // List of parameter to add to the PUT request
    var params = [];

    // If it exists, add the opts.new_edits value to the list of parameters.
    // If new_edits = false then the database will NOT assign this document a
    // new revision number
    if (opts && typeof opts.new_edits !== 'undefined') {
      params.push('new_edits=' + opts.new_edits);
    }

    // Format the list of parameters into a valid URI query string
    params = params.join('&');
    if (params !== '') {
      params = '?' + params;
    }

    // Add the document
    ajax({
      headers: host.headers,
      method: 'PUT',
      url: genDBUrl(host, encodeDocId(doc._id)) + params,
      body: doc
    }, callback);
  }));

  // Add the document given by doc (in JSON string format) to the database
  // given by host. This does not assume that doc is a new document 
  // (i.e. does not have a _id or a _rev field.)
  api.post = utils.adapterFun('post', function (doc, opts, callback) {
    // If no options were given, set the callback to be the second parameter
    if (typeof opts === 'function') {
      callback = opts;
      opts = {};
    }
    opts = utils.clone(opts);
    if (typeof doc !== 'object') {
      return callback(errors.NOT_AN_OBJECT);
    }
    if (! ("_id" in doc)) {
      doc._id = utils.uuid();
    }
    api.put(doc, opts, callback);
    
  });

  // Update/create multiple documents given by req in the database
  // given by host.
  api._bulkDocs = function (req, opts, callback) {
    // If opts.new_edits exists add it to the document data to be
    // send to the database.
    // If new_edits=false then it prevents the database from creating
    // new revision numbers for the documents. Instead it just uses
    // the old ones. This is used in database replication.
    if (typeof opts.new_edits !== 'undefined') {
      req.new_edits = opts.new_edits;
    }

    // Update/create the documents
    ajax({
      headers: host.headers,
      method: 'POST',
      url: genDBUrl(host, '_bulk_docs'),
      body: req
    }, callback);
  };

  // Get a listing of the documents in the database given
  // by host and ordered by increasing id.
  api.allDocs = utils.adapterFun('allDocs', function (opts, callback) {
    if (typeof opts === 'function') {
      callback = opts;
      opts = {};
    }
    opts = utils.clone(opts);
    // List of parameters to add to the GET request
    var params = [];
    var body;
    var method = 'GET';

    // TODO I don't see conflicts as a valid parameter for a
    // _all_docs request 
    // (see http://wiki.apache.org/couchdb/HTTP_Document_API#all_docs)
    if (opts.conflicts) {
      params.push('conflicts=true');
    }

    // If opts.descending is truthy add it to params
    if (opts.descending) {
      params.push('descending=true');
    }

    // If opts.include_docs exists, add the include_docs value to the
    // list of parameters.
    // If include_docs=true then include the associated document with each
    // result.
    if (opts.include_docs) {
      params.push('include_docs=true');
    }

    if (opts.key) {
      params.push('key=' + encodeURIComponent(JSON.stringify(opts.key)));
    }

    // If opts.startkey exists, add the startkey value to the list of
    // parameters.
    // If startkey is given then the returned list of documents will
    // start with the document whose id is startkey.
    if (opts.startkey) {
      params.push('startkey=' +
        encodeURIComponent(JSON.stringify(opts.startkey)));
    }

    // If opts.endkey exists, add the endkey value to the list of parameters.
    // If endkey is given then the returned list of docuemnts will
    // end with the document whose id is endkey.
    if (opts.endkey) {
      params.push('endkey=' + encodeURIComponent(JSON.stringify(opts.endkey)));
    }

    if (typeof opts.inclusive_end !== 'undefined') {
      params.push('inclusive_end=' + !!opts.inclusive_end);
    }

    // If opts.limit exists, add the limit value to the parameter list.
    if (typeof opts.limit !== 'undefined') {
      params.push('limit=' + opts.limit);
    }

    if (typeof opts.skip !== 'undefined') {
      params.push('skip=' + opts.skip);
    }

    // Format the list of parameters into a valid URI query string
    params = params.join('&');
    if (params !== '') {
      params = '?' + params;
    }

    if (typeof opts.keys !== 'undefined') {

      var MAX_URL_LENGTH = 2000;
      // according to http://stackoverflow.com/a/417184/680742,
      // the de factor URL length limit is 2000 characters

      var keysAsString =
        'keys=' + encodeURIComponent(JSON.stringify(opts.keys));
      if (keysAsString.length + params.length + 1 <= MAX_URL_LENGTH) {
        // If the keys are short enough, do a GET. we do this to work around
        // Safari not understanding 304s on POSTs (see issue #1239)
        params += (params.indexOf('?') !== -1 ? '&' : '?') + keysAsString;
      } else {
        // If keys are too long, issue a POST request to circumvent GET
        // query string limits
        // see http://wiki.apache.org/couchdb/HTTP_view_API#Querying_Options
        method = 'POST';
        body = JSON.stringify({keys: opts.keys});
      }
    }

    // Get the document listing
    ajax({
      headers: host.headers,
      method: method,
      url: genDBUrl(host, '_all_docs' + params),
      body: body
    }, callback);
  });

  // Get a list of changes made to documents in the database given by host.
  // TODO According to the README, there should be two other methods here,
  // api.changes.addListener and api.changes.removeListener.
  api._changes = function (opts) {
    // We internally page the results of a changes request, this means
    // if there is a large set of changes to be returned we can start
    // processing them quicker instead of waiting on the entire
    // set of changes to return and attempting to process them at once
    var CHANGES_LIMIT = 25;

    opts = utils.clone(opts);
    opts.timeout = opts.timeout || 30 * 1000;

    // We give a 5 second buffer for CouchDB changes to respond with
    // an ok timeout
    var params = { timeout: opts.timeout - (5 * 1000) };
    var limit = (typeof opts.limit !== 'undefined') ? opts.limit : false;
    if (limit === 0) {
      limit = 1;
    }
    var returnDocs;
    if ('returnDocs' in opts) {
      returnDocs = opts.returnDocs;
    } else {
      returnDocs = true;
    }
    //
    var leftToFetch = limit;

    if (opts.style) {
      params.style = opts.style;
    }

    if (opts.include_docs || opts.filter && typeof opts.filter === 'function') {
      params.include_docs = true;
    }

    if (opts.continuous) {
      params.feed = 'longpoll';
    }

    if (opts.conflicts) {
      params.conflicts = true;
    }

    if (opts.descending) {
      params.descending = true;
    }

    if (opts.filter && typeof opts.filter === 'string') {
      params.filter = opts.filter;
      if (opts.filter === '_view' &&
          opts.view &&
          typeof opts.view === 'string') {
        params.view = opts.view;
      }
    }

    // If opts.query_params exists, pass it through to the changes request.
    // These parameters may be used by the filter on the source database.
    if (opts.query_params && typeof opts.query_params === 'object') {
      for (var param_name in opts.query_params) {
        if (opts.query_params.hasOwnProperty(param_name)) {
          params[param_name] = opts.query_params[param_name];
        }
      }
    }

    var xhr;
    var lastFetchedSeq;

    // Get all the changes starting wtih the one immediately after the
    // sequence number given by since.
    var fetch = function (since, callback) {
      if (opts.aborted) {
        return;
      }
      params.since = since;
      if (opts.descending) {
        if (limit) {
          params.limit = leftToFetch;
        }
      } else {
        params.limit = (!limit || leftToFetch > CHANGES_LIMIT) ?
          CHANGES_LIMIT : leftToFetch;
      }

      var paramStr = '?' + Object.keys(params).map(function (k) {
        return k + '=' + params[k];
      }).join('&');

      // Set the options for the ajax call
      var xhrOpts = {
        headers: host.headers,
        method: 'GET',
        url: genDBUrl(host, '_changes' + paramStr),
        // _changes can take a long time to generate, especially when filtered
        timeout: opts.timeout
      };
      lastFetchedSeq = since;

      if (opts.aborted) {
        return;
      }

      // Get the changes
      xhr = ajax(xhrOpts, callback);
    };

    // If opts.since exists, get all the changes from the sequence
    // number given by opts.since. Otherwise, get all the changes
    // from the sequence number 0.
    var fetchTimeout = 10;
    var fetchRetryCount = 0;

    var results = {results: []};

    var fetched = function (err, res) {
      if (opts.aborted) {
        return;
      }
      var raw_results_length = 0;
      // If the result of the ajax call (res) contains changes (res.results)
      if (res && res.results) {
        raw_results_length = res.results.length;
        results.last_seq = res.last_seq;
        // For each change
        var req = {};
        req.query = opts.query_params;
        res.results = res.results.filter(function (c) {
          leftToFetch--;
          var ret = utils.filterChange(opts)(c);
          if (ret) {
            if (returnDocs) {
              results.results.push(c);
            }
            utils.call(opts.onChange, c);
          }
          return ret;
        });
      } else if (err) {
        // In case of an error, stop listening for changes and call
        // opts.complete
        opts.aborted = true;
        utils.call(opts.complete, err);
        return;
      }

      // The changes feed may have timed out with no results
      // if so reuse last update sequence
      if (res && res.last_seq) {
        lastFetchedSeq = res.last_seq;
      }

      var finished = (limit && leftToFetch <= 0) ||
        (res && raw_results_length < CHANGES_LIMIT) ||
        (opts.descending);

      if ((opts.continuous && !(limit && leftToFetch <= 0)) || !finished) {
        // Increase retry delay exponentially as long as errors persist
        if (err) {
          fetchRetryCount += 1;
        } else {
          fetchRetryCount = 0;
        }
        var timeoutMultiplier = 1 << fetchRetryCount;
        var retryWait = fetchTimeout * timeoutMultiplier;
        var maximumWait = opts.maximumWait || 30000;

        if (retryWait > maximumWait) {
          utils.call(opts.complete, err || errors.UNKNOWN_ERROR);
          return;
        }

        // Queue a call to fetch again with the newest sequence number
        setTimeout(function () { fetch(lastFetchedSeq, fetched); }, retryWait);
      } else {
        // We're done, call the callback
        utils.call(opts.complete, null, results);
      }
    };

    fetch(opts.since || 0, fetched);

    // Return a method to cancel this method from processing any more
    return {
      cancel: function () {
        opts.aborted = true;
        if (xhr) {
          xhr.abort();
        }
      }
    };
  };

  // Given a set of document/revision IDs (given by req), tets the subset of
  // those that do NOT correspond to revisions stored in the database.
  // See http://wiki.apache.org/couchdb/HttpPostRevsDiff
  api.revsDiff = utils.adapterFun('revsDif', function (req, opts, callback) {
    // If no options were given, set the callback to be the second parameter
    if (typeof opts === 'function') {
      callback = opts;
      opts = {};
    }

    // Get the missing document/revision IDs
    ajax({
      headers: host.headers,
      method: 'POST',
      url: genDBUrl(host, '_revs_diff'),
      body: req
    }, function (err, res) {
      callback(err, res);
    });
  });

  api._close = function (callback) {
    callback();
  };

  function replicateOnServer(target, opts, promise, targetHostUrl) {
    opts = utils.clone(opts);
    var targetHost = api.getHost(targetHostUrl);
    var params = {
      source: host.db,
      target: targetHost.protocol === host.protocol &&
        targetHost.authority ===
          host.authority ? targetHost.db : targetHost.source
    };

    if (opts.continuous) {
      params.continuous = true;
    }

    if (opts.create_target) {
      params.create_target = true;
    }

    if (opts.doc_ids) {
      params.doc_ids = opts.doc_ids;
    }

    if (opts.filter && typeof opts.filter === 'string') {
      params.filter = opts.filter;
    }

    if (opts.query_params) {
      params.query_params = opts.query_params;
    }

    var result = {};
    var repOpts = {
      headers: host.headers,
      method: 'POST',
      url: genUrl(host, '_replicate'),
      body: params
    };

    var xhr;
    promise.cancel = function () {
      this.cancelled = true;
      if (xhr && !result.ok) {
        xhr.abort();
      }
      if (result._local_id) {
        repOpts.body = {
          replication_id: result._local_id
        };
      }
      repOpts.body.cancel = true;
      ajax(repOpts, function (err, resp, xhr) {
        // If the replication cancel request fails, send an error to the
        // callback
        if (err) {
          return callback(err);
        }
        // Send the replication cancel result to the complete callback
        utils.call(opts.complete, null, result, xhr);
      });
    };

    if (promise.cancelled) {
      return;
    }

    xhr = ajax(repOpts, function (err, resp, xhr) {
      // If the replication fails, send an error to the callback
      if (err) {
        return callback(err);
      }

      result.ok = true;

      // Provided by CouchDB from 1.2.0 onward to cancel replication
      if (resp._local_id) {
        result._local_id = resp._local_id;
      }

      // Send the replication result to the complete callback
      utils.call(opts.complete, null, resp, xhr);
    });
  }

  api.replicateOnServer = function (target, opts, promise) {
    if (!api.taskqueue.isReady) {
      api.taskqueue.addTask('replicateOnServer', [target, opts, promise]);
      return promise;
    }
    target.info(function (err, info) {
      replicateOnServer(target, opts, promise, info.host);
    });
  };
  api.destroy = utils.adapterFun('destroy', function (callback) {
    ajax({
      url: genDBUrl(host, ''),
      method: 'DELETE',
      headers: host.headers
    }, function (err, resp) {
      if (err) {
        api.emit('error', err);
        callback(err);
      } else {
        api.emit('destroyed');
        callback(null, resp);
      }
    });
  });
}

// Delete the HttpPouch specified by the given name.
HttpPouch.destroy = utils.toPromise(function (name, opts, callback) {
  var host = getHost(name, opts);
  opts = opts || {};
  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  }
  opts = utils.clone(opts);
  opts.headers = host.headers;
  opts.method = 'DELETE';
  opts.url = genDBUrl(host, '');
  var ajaxOpts = opts.ajax || {};
  opts = utils.extend({}, opts, ajaxOpts);
  utils.ajax(opts, callback);
});

// HttpPouch is a valid adapter.
HttpPouch.valid = function () {
  return true;
};

module.exports = HttpPouch;

},{"../deps/errors":31,"../utils":42}],24:[function(require,module,exports){
(function (process,global){
'use strict';

var utils = require('../utils');
var merge = require('../merge');
var errors = require('../deps/errors');

var cachedDBs = {};
var taskQueue = {
  running: false,
  queue: []
};

function tryCode(fun, that, args) {
  try {
    fun.apply(that, args);
  } catch (err) { // shouldn't happen
    if (window.PouchDB) {
      window.PouchDB.emit('error', err);
    }
  }
}

function applyNext() {
  if (taskQueue.running || !taskQueue.queue.length) {
    return;
  }
  taskQueue.running = true;
  var item = taskQueue.queue.shift();
  item.action(function (err, res) {
    tryCode(item.callback, this, [err, res]);
    taskQueue.running = false;
    process.nextTick(applyNext);
  });
}

function idbError(callback) {
  return function (event) {
    var message = (event.target && event.target.error &&
      event.target.error.name) || event.target;
    callback(errors.error(errors.IDB_ERROR, message, event.type));
  };
}

function isModernIdb() {
  // check for outdated implementations of IDB
  // that rely on the setVersion method instead of onupgradeneeded (issue #1207)

  // cache based on appVersion, in case the browser is updated
  var cacheKey = "_pouch__checkModernIdb_" +
    (global.navigator && global.navigator.appVersion);
  var cached = utils.hasLocalStorage() && global.localStorage[cacheKey];
  if (cached) {
    return JSON.parse(cached);
  }

  var dbName = '_pouch__checkModernIdb';
  var result = global.indexedDB.open(dbName, 1).onupgradeneeded === null;

  if (global.indexedDB.deleteDatabase) {
    global.indexedDB.deleteDatabase(dbName); // db no longer needed
  }
  if (utils.hasLocalStorage()) {
    global.localStorage[cacheKey] = JSON.stringify(result); // cache
  }
  return result;
}

function IdbPouch(opts, callback) {
  var api = this;

  taskQueue.queue.push({
    action: function (thisCallback) {
      init(api, opts, thisCallback);
    },
    callback: callback
  });
  applyNext();
}

function init(api, opts, callback) {

  // IndexedDB requires a versioned database structure, so we use the
  // version here to manage migrations.
  var ADAPTER_VERSION = 2;

  // The object stores created for each database
  // DOC_STORE stores the document meta data, its revision history and state
  // Keyed by document id
  var DOC_STORE = 'document-store';
  // BY_SEQ_STORE stores a particular version of a document, keyed by its
  // sequence id
  var BY_SEQ_STORE = 'by-sequence';
  // Where we store attachments
  var ATTACH_STORE = 'attach-store';
  // Where we store database-wide meta data in a single record
  // keyed by id: META_STORE
  var META_STORE = 'meta-store';
  // Where we detect blob support
  var DETECT_BLOB_SUPPORT_STORE = 'detect-blob-support';

  var name = opts.name;

  var blobSupport = null;
  var instanceId = null;
  var idStored = false;
  var idb = null;
  var docCount = -1;

  function createSchema(db) {
    db.createObjectStore(DOC_STORE, {keyPath : 'id'})
      .createIndex('seq', 'seq', {unique: true});
    db.createObjectStore(BY_SEQ_STORE, {autoIncrement: true})
      .createIndex('_doc_id_rev', '_doc_id_rev', {unique: true});
    db.createObjectStore(ATTACH_STORE, {keyPath: 'digest'});
    db.createObjectStore(META_STORE, {keyPath: 'id', autoIncrement: false});
    db.createObjectStore(DETECT_BLOB_SUPPORT_STORE);
  }

  function addDeletedOrLocalIndex(e) {
    var docStore = e.currentTarget.transaction.objectStore(DOC_STORE);

    docStore.openCursor().onsuccess = function (event) {
      var cursor = event.target.result;
      if (cursor) {
        var metadata = cursor.value;
        var deleted = utils.isDeleted(metadata);
        var local = utils.isLocalId(metadata.id);
        metadata.deletedOrLocal = (deleted || local) ? "1" : "0";
        docStore.put(metadata);
        cursor["continue"]();
      } else {
        docStore.createIndex('deletedOrLocal',
                             'deletedOrLocal', {unique : false});
      }
    };
  }

  api.type = function () {
    return 'idb';
  };

  api._id = utils.toPromise(function (callback) {
    callback(null, instanceId);
  });

  api._bulkDocs = function idb_bulkDocs(req, opts, callback) {
    var newEdits = opts.new_edits;
    var userDocs = req.docs;
    // Parse the docs, give them a sequence number for the result
    var docInfos = userDocs.map(function (doc, i) {
      var newDoc = utils.parseDoc(doc, newEdits);
      newDoc._bulk_seq = i;
      return newDoc;
    });

    var docInfoErrors = docInfos.filter(function (docInfo) {
      return docInfo.error;
    });
    if (docInfoErrors.length) {
      return callback(docInfoErrors[0]);
    }

    var results = [];
    var fetchedDocs = {};
    var docsWritten = 0;

    function writeMetaData(e) {
      var meta = e.target.result;
      meta.updateSeq = (meta.updateSeq || 0) + docsWritten;
      txn.objectStore(META_STORE).put(meta);
    }

    function processDocs() {
      if (!docInfos.length) {
        txn.objectStore(META_STORE).get(META_STORE).onsuccess = writeMetaData;
        return;
      }
      var currentDoc = docInfos.shift();
      var id = currentDoc.metadata.id;

      if (id in fetchedDocs) {
        // if newEdits=false, can re-use the same id from this batch
        return updateDoc(fetchedDocs[id], currentDoc);
      }

      var req = txn.objectStore(DOC_STORE).get(id);
      req.onsuccess = function process_docRead(event) {
        var oldDoc = event.target.result;
        if (!oldDoc) {
          insertDoc(currentDoc);
        } else {
          updateDoc(oldDoc, currentDoc);
        }
      };
    }

    function complete(event) {
      var aresults = [];
      results.sort(sortByBulkSeq);
      results.forEach(function (result) {
        delete result._bulk_seq;
        if (result.error) {
          aresults.push(result);
          return;
        }
        var metadata = result.metadata;
        var rev = merge.winningRev(metadata);

        aresults.push({
          ok: true,
          id: metadata.id,
          rev: rev
        });

        if (utils.isLocalId(metadata.id)) {
          return;
        }
      });
      IdbPouch.Changes.notify(name);
      docCount = -1; // invalidate
      callback(null, aresults);
    }

    function preprocessAttachment(att, finish) {
      if (att.stub) {
        return finish();
      }
      if (typeof att.data === 'string') {
        var data;
        try {
          data = atob(att.data);
        } catch (e) {
          var err = errors.error(errors.BAD_ARG,
                                "Attachments need to be base64 encoded");
          return callback(err);
        }
        att.digest = 'md5-' + utils.MD5(data);
        if (blobSupport) {
          var type = att.content_type;
          data = utils.fixBinary(data);
          att.data = utils.createBlob([data], {type: type});
        }
        return finish();
      }
      var reader = new FileReader();
      reader.onloadend = function (e) {
        var binary = utils.arrayBufferToBinaryString(this.result);
        att.digest = 'md5-' + utils.MD5(binary);
        if (!blobSupport) {
          att.data = btoa(binary);
        }
        finish();
      };
      reader.readAsArrayBuffer(att.data);
    }

    function preprocessAttachments(callback) {
      if (!docInfos.length) {
        return callback();
      }

      var docv = 0;
      docInfos.forEach(function (docInfo) {
        var attachments = docInfo.data && docInfo.data._attachments ?
          Object.keys(docInfo.data._attachments) : [];

        if (!attachments.length) {
          return done();
        }

        var recv = 0;
        function attachmentProcessed() {
          recv++;
          if (recv === attachments.length) {
            done();
          }
        }

        for (var key in docInfo.data._attachments) {
          if (docInfo.data._attachments.hasOwnProperty(key)) {
            preprocessAttachment(docInfo.data._attachments[key],
                                 attachmentProcessed);
          }
        }
      });

      function done() {
        docv++;
        if (docInfos.length === docv) {
          callback();
        }
      }
    }

    function writeDoc(docInfo, winningRev, deleted, callback) {
      var err = null;
      var recv = 0;
      docInfo.data._id = docInfo.metadata.id;
      docInfo.data._rev = docInfo.metadata.rev;

      docsWritten++;

      if (deleted) {
        docInfo.data._deleted = true;
      }

      var attachments = docInfo.data._attachments ?
        Object.keys(docInfo.data._attachments) : [];

      function collectResults(attachmentErr) {
        if (!err) {
          if (attachmentErr) {
            err = attachmentErr;
            callback(err);
          } else if (recv === attachments.length) {
            finish();
          }
        }
      }

      function attachmentSaved(err) {
        recv++;
        collectResults(err);
      }

      for (var key in docInfo.data._attachments) {
        if (!docInfo.data._attachments[key].stub) {
          var data = docInfo.data._attachments[key].data;
          delete docInfo.data._attachments[key].data;
          var digest = docInfo.data._attachments[key].digest;
          saveAttachment(docInfo, digest, data, attachmentSaved);
        } else {
          recv++;
          collectResults();
        }
      }

      function finish() {

        docInfo.data._doc_id_rev = docInfo.data._id + "::" + docInfo.data._rev;
        var index = txn.objectStore(BY_SEQ_STORE).index('_doc_id_rev');

        index.getKey(docInfo.data._doc_id_rev).onsuccess = function (e) {

          var dataReq = e.target.result ?
            txn.objectStore(BY_SEQ_STORE).put(docInfo.data, e.target.result) :
            txn.objectStore(BY_SEQ_STORE).put(docInfo.data);

          dataReq.onsuccess = function (e) {
            var metadata = docInfo.metadata;
            metadata.seq = e.target.result;
            // Current _rev is calculated from _rev_tree on read
            delete metadata.rev;
            var local = utils.isLocalId(metadata.id);
            metadata.deletedOrLocal = (deleted || local) ? "1" : "0";
            metadata.winningRev = winningRev;
            var metaDataReq = txn.objectStore(DOC_STORE).put(metadata);
            metaDataReq.onsuccess = function () {
              delete metadata.deletedOrLocal;
              delete metadata.winningRev;
              results.push(docInfo);
              fetchedDocs[docInfo.metadata.id] = docInfo.metadata;
              utils.call(callback);
            };
          };
        };
      }

      if (!attachments.length) {
        finish();
      }
    }

    function updateDoc(oldDoc, docInfo) {
      var merged =
        merge.merge(oldDoc.rev_tree, docInfo.metadata.rev_tree[0], 1000);
      var wasPreviouslyDeleted = utils.isDeleted(oldDoc);
      var deleted = utils.isDeleted(docInfo.metadata);
      var inConflict = (wasPreviouslyDeleted && deleted && newEdits) ||
        (!wasPreviouslyDeleted && newEdits && merged.conflicts !== 'new_leaf');

      if (inConflict) {
        results.push(makeErr(errors.REV_CONFLICT, docInfo._bulk_seq));
        return processDocs();
      }

      docInfo.metadata.rev_tree = merged.tree;

      // recalculate
      var winningRev = merge.winningRev(docInfo.metadata);
      deleted = utils.isDeleted(docInfo.metadata, winningRev);

      writeDoc(docInfo, winningRev, deleted, processDocs);
    }

    function insertDoc(docInfo) {
      var winningRev = merge.winningRev(docInfo.metadata);
      var deleted = utils.isDeleted(docInfo.metadata, winningRev);
      // Cant insert new deleted documents
      if ('was_delete' in opts && deleted) {
        results.push(errors.MISSING_DOC);
        return processDocs();
      }

      writeDoc(docInfo, winningRev, deleted, processDocs);
    }

    // Insert sequence number into the error so we can sort later
    function makeErr(err, seq) {
      err._bulk_seq = seq;
      return err;
    }

    function saveAttachment(docInfo, digest, data, callback) {
      var objectStore = txn.objectStore(ATTACH_STORE);
      objectStore.get(digest).onsuccess = function (e) {
        var originalRefs = e.target.result && e.target.result.refs || {};
        var ref = [docInfo.metadata.id, docInfo.metadata.rev].join('@');
        var newAtt = {
          digest: digest,
          body: data,
          refs: originalRefs
        };
        newAtt.refs[ref] = true;
        objectStore.put(newAtt).onsuccess = function (e) {
          utils.call(callback);
        };
      };
    }

    var txn;
    preprocessAttachments(function () {
      txn = idb.transaction([DOC_STORE, BY_SEQ_STORE, ATTACH_STORE, META_STORE],
                            'readwrite');
      txn.onerror = idbError(callback);
      txn.ontimeout = idbError(callback);
      txn.oncomplete = complete;

      processDocs();
    });
  };

  function sortByBulkSeq(a, b) {
    return a._bulk_seq - b._bulk_seq;
  }

  // First we look up the metadata in the ids database, then we fetch the
  // current revision(s) from the by sequence store
  api._get = function idb_get(id, opts, callback) {
    var doc;
    var metadata;
    var err;
    var txn;
    opts = utils.clone(opts);
    if (opts.ctx) {
      txn = opts.ctx;
    } else {
      txn =
        idb.transaction([DOC_STORE, BY_SEQ_STORE, ATTACH_STORE], 'readonly');
    }

    function finish() {
      callback(err, {doc: doc, metadata: metadata, ctx: txn});
    }

    txn.objectStore(DOC_STORE).get(id).onsuccess = function (e) {
      metadata = e.target.result;
      // we can determine the result here if:
      // 1. there is no such document
      // 2. the document is deleted and we don't ask about specific rev
      // When we ask with opts.rev we expect the answer to be either
      // doc (possibly with _deleted=true) or missing error
      if (!metadata) {
        err = errors.MISSING_DOC;
        return finish();
      }
      if (utils.isDeleted(metadata) && !opts.rev) {
        err = errors.error(errors.MISSING_DOC, "deleted");
        return finish();
      }
      var objectStore = txn.objectStore(BY_SEQ_STORE);

      // metadata.winningRev was added later, so older DBs might not have it
      var rev = opts.rev || metadata.winningRev || merge.winningRev(metadata);
      var key = metadata.id + '::' + rev;

      objectStore.index('_doc_id_rev').get(key).onsuccess = function (e) {
        doc = e.target.result;
        if (doc && doc._doc_id_rev) {
          delete(doc._doc_id_rev);
        }
        if (!doc) {
          err = errors.MISSING_DOC;
          return finish();
        }
        finish();
      };
    };
  };

  api._getAttachment = function (attachment, opts, callback) {
    var result;
    var txn;
    opts = utils.clone(opts);
    if (opts.ctx) {
      txn = opts.ctx;
    } else {
      txn =
        idb.transaction([DOC_STORE, BY_SEQ_STORE, ATTACH_STORE], 'readonly');
    }
    var digest = attachment.digest;
    var type = attachment.content_type;

    txn.objectStore(ATTACH_STORE).get(digest).onsuccess = function (e) {
      var data = e.target.result.body;
      if (opts.encode) {
        if (blobSupport) {
          var reader = new FileReader();
          reader.onloadend = function (e) {
            var binary = utils.arrayBufferToBinaryString(this.result);
            result = btoa(binary);
            callback(null, result);
          };
          reader.readAsArrayBuffer(data);
        } else {
          result = data;
          callback(null, result);
        }
      } else {
        if (blobSupport) {
          result = data;
        } else {
          data = utils.fixBinary(atob(data));
          result = utils.createBlob([data], {type: type});
        }
        callback(null, result);
      }
    };
  };

  function allDocsQuery(totalRows, opts, callback) {
    var start = 'startkey' in opts ? opts.startkey : false;
    var end = 'endkey' in opts ? opts.endkey : false;
    var key = 'key' in opts ? opts.key : false;
    var skip = opts.skip || 0;
    var limit = typeof opts.limit === 'number' ? opts.limit : -1;
    var inclusiveEnd = opts.inclusive_end !== false;
    var descending = 'descending' in opts && opts.descending ? 'prev' : null;

    var manualDescEnd = false;
    if (descending && start && end) {
      // unfortunately IDB has a quirk where IDBKeyRange.bound is invalid if the
      // start is less than the end, even in descending mode.  Best bet
      // is just to handle it manually in that case.
      manualDescEnd = end;
      end = false;
    }

    var keyRange = null;
    try {
      if (start && end) {
        keyRange = global.IDBKeyRange.bound(start, end, false, !inclusiveEnd);
      } else if (start) {
        if (descending) {
          keyRange = global.IDBKeyRange.upperBound(start);
        } else {
          keyRange = global.IDBKeyRange.lowerBound(start);
        }
      } else if (end) {
        if (descending) {
          keyRange = global.IDBKeyRange.lowerBound(end, !inclusiveEnd);
        } else {
          keyRange = global.IDBKeyRange.upperBound(end, !inclusiveEnd);
        }
      } else if (key) {
        keyRange = global.IDBKeyRange.only(key);
      }
    } catch (e) {
      if (e.name === "DataError" && e.code === 0) {
        // data error, start is less than end
        return callback(null, {
          total_rows : totalRows,
          offset : opts.skip,
          rows : []
        });
      } else {
        return callback(errors.error(errors.IDB_ERROR, e.name, e.message));
      }
    }

    var transaction = idb.transaction([DOC_STORE, BY_SEQ_STORE], 'readonly');
    transaction.oncomplete = function () {
      callback(null, {
        total_rows: totalRows,
        offset: opts.skip,
        rows: results
      });
    };

    var oStore = transaction.objectStore(DOC_STORE);
    var oCursor = descending ? oStore.openCursor(keyRange, descending)
      : oStore.openCursor(keyRange);
    var results = [];
    oCursor.onsuccess = function (e) {
      if (!e.target.result) {
        return;
      }
      var cursor = e.target.result;
      var metadata = cursor.value;
      // metadata.winningRev added later, some dbs might be missing it
      var winningRev = metadata.winningRev || merge.winningRev(metadata);

      function allDocsInner(metadata, data) {
        if (utils.isLocalId(metadata.id)) {
          return cursor["continue"]();
        }
        var doc = {
          id: metadata.id,
          key: metadata.id,
          value: {
            rev: winningRev
          }
        };
        if (opts.include_docs) {
          doc.doc = data;
          doc.doc._rev = winningRev;
          if (doc.doc._doc_id_rev) {
            delete(doc.doc._doc_id_rev);
          }
          if (opts.conflicts) {
            doc.doc._conflicts = merge.collectConflicts(metadata);
          }
          for (var att in doc.doc._attachments) {
            if (doc.doc._attachments.hasOwnProperty(att)) {
              doc.doc._attachments[att].stub = true;
            }
          }
        }
        var deleted = utils.isDeleted(metadata, winningRev);
        if (opts.deleted === 'ok') {
          // deleted docs are okay with keys_requests
          if (deleted) {
            doc.value.deleted = true;
            doc.doc = null;
          }
          results.push(doc);
        } else if (!deleted && skip-- <= 0) {
          if (manualDescEnd) {
            if (inclusiveEnd && doc.key < manualDescEnd) {
              return;
            } else if (!inclusiveEnd && doc.key <= manualDescEnd) {
              return;
            }
          }
          results.push(doc);
          if (--limit === 0) {
            return;
          }
        }
        cursor["continue"]();
      }

      if (!opts.include_docs) {
        allDocsInner(metadata);
      } else {
        var index = transaction.objectStore(BY_SEQ_STORE).index('_doc_id_rev');
        var key = metadata.id + "::" + winningRev;
        index.get(key).onsuccess = function (event) {
          allDocsInner(cursor.value, event.target.result);
        };
      }
    };
  }

  function countDocs(callback) {
    if (docCount !== -1) {
      return callback(null, docCount);
    }

    var count;
    var txn = idb.transaction([DOC_STORE], 'readonly');
    var index = txn.objectStore(DOC_STORE).index('deletedOrLocal');
    index.count(global.IDBKeyRange.only("0")).onsuccess = function (e) {
      count = e.target.result;
    };
    txn.onerror = idbError(callback);
    txn.oncomplete = function () {
      docCount = count;
      callback(null, docCount);
    };
  }

  api._allDocs = function idb_allDocs(opts, callback) {

    // first count the total_rows
    countDocs(function (err, totalRows) {
      if (err) {
        return callback(err);
      }
      if (opts.limit === 0) {
        return callback(null, {
          total_rows : totalRows,
          offset : opts.skip,
          rows : []
        });
      }
      allDocsQuery(totalRows, opts, callback);
    });
  };

  api._info = function idb_info(callback) {

    countDocs(function (err, count) {
      if (err) {
        return callback(err);
      }
      if (idb === null) {
        var error = new Error('db isn\'t open');
        error.id = 'idbNull';
        return callback(error);
      }
      var updateSeq = 0;
      var txn = idb.transaction([META_STORE], 'readonly');

      txn.objectStore(META_STORE).get(META_STORE).onsuccess = function (e) {
        updateSeq = e.target.result && e.target.result.updateSeq || 0;
      };

      txn.oncomplete = function () {
        callback(null, {
          db_name: name,
          doc_count: count,
          update_seq: updateSeq
        });
      };
    });
  };

  api._changes = function (opts) {
    opts = utils.clone(opts);

    if (opts.continuous) {
      var id = name + ':' + utils.uuid();
      IdbPouch.Changes.addListener(name, id, api, opts);
      IdbPouch.Changes.notify(name);
      return {
        cancel: function () {
          IdbPouch.Changes.removeListener(name, id);
        }
      };
    }

    var descending = opts.descending ? 'prev' : null;
    var lastSeq = 0;

    // Ignore the `since` parameter when `descending` is true
    opts.since = opts.since && !descending ? opts.since : 0;

    var limit = 'limit' in opts ? opts.limit : -1;
    if (limit === 0) {
      limit = 1; // per CouchDB _changes spec
    }
    var returnDocs;
    if ('returnDocs' in opts) {
      returnDocs = opts.returnDocs;
    } else {
      returnDocs = true;
    }

    var results = [];
    var numResults = 0;
    var filter = utils.filterChange(opts);

    var txn;

    function fetchChanges() {
      txn = idb.transaction([DOC_STORE, BY_SEQ_STORE]);
      txn.oncomplete = onTxnComplete;

      var req;

      if (descending) {
        req = txn.objectStore(BY_SEQ_STORE)
            .openCursor(global.IDBKeyRange.lowerBound(opts.since, true),
                        descending);
      } else {
        req = txn.objectStore(BY_SEQ_STORE)
            .openCursor(global.IDBKeyRange.lowerBound(opts.since, true));
      }

      req.onsuccess = onsuccess;
      req.onerror = onerror;
    }

    fetchChanges();

    function onsuccess(event) {
      var cursor = event.target.result;

      if (!cursor) {
        return;
      }

      var doc = cursor.value;

      if (utils.isLocalId(doc._id) ||
          (opts.doc_ids && opts.doc_ids.indexOf(doc._id) === -1)) {
        return cursor["continue"]();
      }

      var index = txn.objectStore(DOC_STORE);
      index.get(doc._id).onsuccess = function (event) {
        var metadata = event.target.result;

        if (lastSeq < metadata.seq) {
          lastSeq = metadata.seq;
        }
        // metadata.winningRev was only added later
        var winningRev = metadata.winningRev || merge.winningRev(metadata);
        if (doc._rev !== winningRev) {
          return cursor["continue"]();
        }

        delete doc['_doc_id_rev'];

        var change = opts.processChange(doc, metadata, opts);
        change.seq = cursor.key;
        if (filter(change)) {
          numResults++;
          if (returnDocs) {
            results.push(change);
          }
          opts.onChange(change);
        }
        if (numResults !== limit) {
          cursor["continue"]();
        }
      };
    }

    function onTxnComplete() {
      if (!opts.continuous) {
        opts.complete(null, {
          results: results,
          last_seq: lastSeq
        });
      }
    }
  };

  api._close = function (callback) {
    if (idb === null) {
      return callback(errors.NOT_OPEN);
    }

    // https://developer.mozilla.org/en-US/docs/IndexedDB/IDBDatabase#close
    // "Returns immediately and closes the connection in a separate thread..."
    idb.close();
    delete cachedDBs[name];
    idb = null;
    callback();
  };

  api._getRevisionTree = function (docId, callback) {
    var txn = idb.transaction([DOC_STORE], 'readonly');
    var req = txn.objectStore(DOC_STORE).get(docId);
    req.onsuccess = function (event) {
      var doc = event.target.result;
      if (!doc) {
        callback(errors.MISSING_DOC);
      } else {
        callback(null, doc.rev_tree);
      }
    };
  };

  // This function removes revisions of document docId
  // which are listed in revs and sets this document
  // revision to to rev_tree
  api._doCompaction = function (docId, rev_tree, revs, callback) {
    var txn = idb.transaction([DOC_STORE, BY_SEQ_STORE], 'readwrite');

    var index = txn.objectStore(DOC_STORE);
    index.get(docId).onsuccess = function (event) {
      var metadata = event.target.result;
      metadata.rev_tree = rev_tree;

      var count = revs.length;
      revs.forEach(function (rev) {
        var index = txn.objectStore(BY_SEQ_STORE).index('_doc_id_rev');
        var key = docId + "::" + rev;
        index.getKey(key).onsuccess = function (e) {
          var seq = e.target.result;
          if (!seq) {
            return;
          }
          txn.objectStore(BY_SEQ_STORE)['delete'](seq);

          count--;
          if (!count) {
            txn.objectStore(DOC_STORE).put(metadata);
          }
        };
      });
    };
    txn.oncomplete = function () {
      utils.call(callback);
    };
  };

  var cached = cachedDBs[name];

  if (cached) {
    idb = cached.idb;
    blobSupport = cached.blobSupport;
    instanceId = cached.instanceId;
    idStored = cached.idStored;
    process.nextTick(function () {
      callback(null, api);
    });
    return;
  }

  var req = global.indexedDB.open(name, ADAPTER_VERSION);

  if (!('openReqList' in IdbPouch)) {
    IdbPouch.openReqList = {};
  }
  IdbPouch.openReqList[name] = req;

  req.onupgradeneeded = function (e) {
    var db = e.target.result;
    if (e.oldVersion < 1) {
      // initial schema
      createSchema(db);
    }
    if (e.oldVersion < 2) {
      // version 2 adds the deletedOrLocal index
      addDeletedOrLocalIndex(e);
    }
  };

  req.onsuccess = function (e) {

    idb = e.target.result;

    idb.onversionchange = function () {
      idb.close();
      delete cachedDBs[name];
    };
    idb.onabort = function () {
      idb.close();
      delete cachedDBs[name];
    };

    var txn = idb.transaction([META_STORE, DETECT_BLOB_SUPPORT_STORE],
      'readwrite');

    var req = txn.objectStore(META_STORE).get(META_STORE);

    req.onsuccess = function (e) {

      var checkSetupComplete = function () {
        if (blobSupport === null || !idStored) {
          return;
        } else {
          cachedDBs[name] = {
            idb: idb,
            blobSupport: blobSupport,
            instanceId: instanceId,
            idStored: idStored,
            loaded: true
          };
          callback(null, api);
        }
      };

      var meta = e.target.result || {id: META_STORE};
      if (name  + '_id' in meta) {
        instanceId = meta[name + '_id'];
        idStored = true;
        checkSetupComplete();
      } else {
        instanceId = utils.uuid();
        meta[name + '_id'] = instanceId;
        txn.objectStore(META_STORE).put(meta).onsuccess = function () {
          idStored = true;
          checkSetupComplete();
        };
      }

      // detect blob support
      try {
        txn.objectStore(DETECT_BLOB_SUPPORT_STORE).put(utils.createBlob(),
          "key");
        blobSupport = true;
      } catch (err) {
        blobSupport = false;
      } finally {
        checkSetupComplete();
      }
    };
  };

  req.onerror = idbError(callback);

}

IdbPouch.valid = function () {
  return global.indexedDB && isModernIdb();
};

function destroy(name, opts, callback) {
  if (!('openReqList' in IdbPouch)) {
    IdbPouch.openReqList = {};
  }
  IdbPouch.Changes.removeAllListeners(name);

  //Close open request for "name" database to fix ie delay.
  if (IdbPouch.openReqList[name] && IdbPouch.openReqList[name].result) {
    IdbPouch.openReqList[name].result.close();
  }
  var req = global.indexedDB.deleteDatabase(name);

  req.onsuccess = function () {
    //Remove open request from the list.
    if (IdbPouch.openReqList[name]) {
      IdbPouch.openReqList[name] = null;
    }
    if (utils.hasLocalStorage()) {
      delete global.localStorage[name];
    }
    delete cachedDBs[name];
    callback(null, { 'ok': true });
  };

  req.onerror = idbError(callback);
}

IdbPouch.destroy = utils.toPromise(function (name, opts, callback) {
  taskQueue.queue.push({
    action: function (thisCallback) {
      destroy(name, opts, thisCallback);
    },
    callback: callback
  });
  applyNext();
});

IdbPouch.Changes = new utils.Changes();

module.exports = IdbPouch;

}).call(this,require("JkpR2F"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../deps/errors":31,"../merge":37,"../utils":42,"JkpR2F":10}],25:[function(require,module,exports){
module.exports = ['idb', 'websql'];
},{}],26:[function(require,module,exports){
(function (global){
'use strict';

var utils = require('../utils');
var merge = require('../merge');
var errors = require('../deps/errors');
function quote(str) {
  return "'" + str + "'";
}

var cachedDatabases = {};

var openDB = utils.getArguments(function (args) {
  if (typeof global !== 'undefined') {
    if (global.navigator && global.navigator.sqlitePlugin &&
        global.navigator.sqlitePlugin.openDatabase) {
      return navigator.sqlitePlugin.openDatabase
        .apply(navigator.sqlitePlugin, args);
    } else if (global.sqlitePlugin && global.sqlitePlugin.openDatabase) {
      return global.sqlitePlugin.openDatabase
        .apply(global.sqlitePlugin, args);
    } else {
      var db = cachedDatabases[args[0]];
      if (!db) {
        db = cachedDatabases[args[0]] =
          global.openDatabase.apply(global, args);
      }
      return db;
    }
  }
});

var POUCH_VERSION = 1;
var POUCH_SIZE = 0; // doesn't matter as long as it's <= 5000000
var ADAPTER_VERSION = 2; // used to manage migrations

// The object stores created for each database
// DOC_STORE stores the document meta data, its revision history and state
var DOC_STORE = quote('document-store');
// BY_SEQ_STORE stores a particular version of a document, keyed by its
// sequence id
var BY_SEQ_STORE = quote('by-sequence');
// Where we store attachments
var ATTACH_STORE = quote('attach-store');
var META_STORE = quote('metadata-store');

// these indexes cover the ground for most allDocs queries
var BY_SEQ_STORE_DELETED_INDEX_SQL =
  'CREATE INDEX IF NOT EXISTS \'by-seq-deleted-idx\' ON ' +
  BY_SEQ_STORE + ' (seq, deleted)';
var DOC_STORE_LOCAL_INDEX_SQL =
  'CREATE INDEX IF NOT EXISTS \'doc-store-local-idx\' ON ' +
  DOC_STORE + ' (local, id)';
var DOC_STORE_WINNINGSEQ_INDEX_SQL =
  'CREATE INDEX IF NOT EXISTS \'doc-winningseq-idx\' ON ' +
  DOC_STORE + ' (winningseq)';

var DOC_STORE_AND_BY_SEQ_JOINER = BY_SEQ_STORE +
  '.seq = ' + DOC_STORE + '.winningseq';

var SELECT_DOCS = BY_SEQ_STORE + '.seq AS seq, ' +
  BY_SEQ_STORE + '.deleted AS deleted, ' +
  BY_SEQ_STORE + '.json AS data, ' +
  DOC_STORE + '.json AS metadata';

function select(selector, table, joiner, where, orderBy) {
  return 'SELECT ' + selector + ' FROM ' +
    (typeof table === 'string' ? table : table.join(' JOIN ')) +
    (joiner ? (' ON ' + joiner) : '') +
    (where ? (' WHERE ' +
      (typeof where === 'string' ? where : where.join(' AND '))) : '') +
    (orderBy ? (' ORDER BY ' + orderBy) : '');
}

function unknownError(callback) {
  return function (event) {
    // event may actually be a SQLError object, so report is as such
    var errorNameMatch = event && event.constructor.toString()
      .match(/function ([^\(]+)/);
    var errorName = (errorNameMatch && errorNameMatch[1]) || event.type;
    var errorReason = event.target || event.message;
    callback(errors.error(errors.WSQ_ERROR, errorReason, errorName));
  };
}
function decodeUtf8(str) {
  return decodeURIComponent(window.escape(str));
}
function parseHexString(str, encoding) {
  var result = '';
  var charWidth = encoding === 'UTF-8' ? 2 : 4;
  for (var i = 0, len = str.length; i < len; i += charWidth) {
    var substring = str.substring(i, i + charWidth);
    if (charWidth === 4) { // UTF-16, twiddle the bits
      substring = substring.substring(2, 4) + substring.substring(0, 2);
    }
    result += String.fromCharCode(parseInt(substring, 16));
  }
  result = encoding === 'UTF-8' ? decodeUtf8(result) : result;
  return result;
}

function WebSqlPouch(opts, callback) {
  var api = this;
  var instanceId = null;
  var name = opts.name;
  var idRequests = [];
  var docCount = -1; // cache sqlite count(*) for performance
  var encoding;

  var db = openDB(name, POUCH_VERSION, name, POUCH_SIZE);
  if (!db) {
    return callback(errors.UNKNOWN_ERROR);
  } else if (typeof db.readTransaction !== 'function') {
    // doesn't exist in sqlite plugin
    db.readTransaction = db.transaction;
  }

  function dbCreated() {
    // note the db name in case the browser upgrades to idb
    if (utils.hasLocalStorage()) {
      global.localStorage['_pouch__websqldb_' + name] = true;
    }
    callback(null, api);
  }

  // In this migration, we added the 'deleted' and 'local' columns to the
  // by-seq and doc store tables.
  // To preserve existing user data, we re-process all the existing JSON
  // and add these values.
  // Called migration2 because it corresponds to adapter version (db_version) #2
  function runMigration2(tx) {
    // index used for the join in the allDocs query
    tx.executeSql(DOC_STORE_WINNINGSEQ_INDEX_SQL);

    tx.executeSql('ALTER TABLE ' + BY_SEQ_STORE +
      ' ADD COLUMN deleted TINYINT(1) DEFAULT 0', [], function () {
      tx.executeSql(BY_SEQ_STORE_DELETED_INDEX_SQL);
      tx.executeSql('ALTER TABLE ' + DOC_STORE +
        ' ADD COLUMN local TINYINT(1) DEFAULT 0', [], function () {
        tx.executeSql(DOC_STORE_LOCAL_INDEX_SQL);

        var sql = 'SELECT ' + DOC_STORE + '.winningseq AS seq, ' + DOC_STORE +
          '.json AS metadata FROM ' + BY_SEQ_STORE + ' JOIN ' + DOC_STORE +
          ' ON ' + BY_SEQ_STORE + '.seq = ' + DOC_STORE + '.winningseq';

        tx.executeSql(sql, [], function (tx, result) {

          var deleted = [];
          var local = [];

          for (var i = 0; i < result.rows.length; i++) {
            var item = result.rows.item(i);
            var seq = item.seq;
            var metadata = JSON.parse(item.metadata);
            if (utils.isDeleted(metadata)) {
              deleted.push(seq);
            }
            if (utils.isLocalId(metadata.id)) {
              local.push(metadata.id);
            }
          }

          tx.executeSql('UPDATE ' + DOC_STORE + 'SET local = 1 WHERE id IN (' +
            local.map(function () {
            return '?';
          }).join(',') + ')', local);
          tx.executeSql('UPDATE ' + BY_SEQ_STORE +
            ' SET deleted = 1 WHERE seq IN (' + deleted.map(function () {
            return '?';
          }).join(',') + ')', deleted);
        });
      });
    });
  }

  function onGetInstanceId(tx) {
    while (idRequests.length > 0) {
      var idCallback = idRequests.pop();
      idCallback(null, instanceId);
    }
    checkDbEncoding(tx);
  }

  function checkDbEncoding(tx) {
    // check db encoding - utf-8 (chrome, opera) or utf-16 (safari)?
    tx.executeSql('SELECT dbid, hex(dbid) AS hexId FROM ' + META_STORE, [],
      function (err, result) {
        var id = result.rows.item(0).dbid;
        var hexId = result.rows.item(0).hexId;
        encoding = (hexId.length === id.length * 2) ? 'UTF-8' : 'UTF-16';
      }
    );
  }

  function onGetVersion(tx, dbVersion) {
    if (dbVersion === 0) {
      // initial schema

      var meta = 'CREATE TABLE IF NOT EXISTS ' + META_STORE +
        ' (update_seq, dbid, db_version INTEGER)';
      var attach = 'CREATE TABLE IF NOT EXISTS ' + ATTACH_STORE +
        ' (digest, json, body BLOB)';
      var doc = 'CREATE TABLE IF NOT EXISTS ' + DOC_STORE +
        ' (id unique, json, winningseq, local TINYINT(1))';
      var seq = 'CREATE TABLE IF NOT EXISTS ' + BY_SEQ_STORE +
        ' (seq INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, ' +
        'doc_id_rev UNIQUE, json, deleted TINYINT(1))';

      // creates
      tx.executeSql(attach);
      tx.executeSql(doc, [], function () {
        tx.executeSql(DOC_STORE_WINNINGSEQ_INDEX_SQL);
        tx.executeSql(DOC_STORE_LOCAL_INDEX_SQL);
      });
      tx.executeSql(seq, [], function () {
        tx.executeSql(BY_SEQ_STORE_DELETED_INDEX_SQL);
      });
      tx.executeSql(meta, [], function () {
        // mark the update_seq, db version, and new dbid
        var initSeq = 'INSERT INTO ' + META_STORE +
          ' (update_seq, db_version, dbid) VALUES (?, ?, ?)';
        instanceId = utils.uuid();
        tx.executeSql(initSeq, [0, ADAPTER_VERSION, instanceId]);
        onGetInstanceId(tx);
      });
    } else { // version > 0

      if (dbVersion === 1) {
        runMigration2(tx);
        // mark the db version within this transaction
        tx.executeSql('UPDATE ' + META_STORE + ' SET db_version = ' +
                      ADAPTER_VERSION);
      } // in the future, add more migrations here

      // notify db.id() callers
      tx.executeSql('SELECT dbid FROM ' + META_STORE, [],
                    function (tx, result) {
        instanceId = result.rows.item(0).dbid;
        onGetInstanceId(tx);
      });
    }
  }

  function setup() {

    db.transaction(function (tx) {
      // first get the version
      tx.executeSql('SELECT sql FROM sqlite_master WHERE tbl_name = ' +
                    META_STORE, [], function (tx, result) {
        if (!result.rows.length) {
          // database hasn't even been created yet (version 0)
          onGetVersion(tx, 0);
        } else if (!/db_version/.test(result.rows.item(0).sql)) {
          // table was created, but without the new db_version column,
          // so add it.
          tx.executeSql('ALTER TABLE ' + META_STORE +
            ' ADD COLUMN db_version INTEGER', [], function () {
            // before version 2, this column didn't even exist
            onGetVersion(tx, 1);
          });
        } else { // column exists, we can safely get it
          tx.executeSql('SELECT db_version FROM ' + META_STORE, [],
            function (tx, result) {
            var dbVersion = result.rows.item(0).db_version;
            onGetVersion(tx, dbVersion);
          });
        }
      });
    }, unknownError(callback), dbCreated);
  }

  if (utils.isCordova() && typeof global !== 'undefined') {
    //to wait until custom api is made in pouch.adapters before doing setup
    global.addEventListener(name + '_pouch', function cordova_init() {
      global.removeEventListener(name + '_pouch', cordova_init, false);
      setup();
    }, false);
  } else {
    setup();
  }

  api.type = function () {
    return 'websql';
  };

  api._id = utils.toPromise(function (callback) {
    callback(null, instanceId);
  });

  api._info = function (callback) {
    db.readTransaction(function (tx) {
      countDocs(tx, function (docCount) {
        var sql = 'SELECT update_seq FROM ' + META_STORE;
        tx.executeSql(sql, [], function (tx, result) {
          var updateSeq = result.rows.item(0).update_seq;
          callback(null, {
            db_name: name,
            doc_count: docCount,
            update_seq: updateSeq
          });
        });
      });
    }, unknownError(callback));
  };

  api._bulkDocs = function (req, opts, callback) {

    var newEdits = opts.new_edits;
    var userDocs = req.docs;
    var docsWritten = 0;

    // Parse the docs, give them a sequence number for the result
    var docInfos = userDocs.map(function (doc, i) {
      var newDoc = utils.parseDoc(doc, newEdits);
      newDoc._bulk_seq = i;
      return newDoc;
    });

    var docInfoErrors = docInfos.filter(function (docInfo) {
      return docInfo.error;
    });
    if (docInfoErrors.length) {
      return callback(docInfoErrors[0]);
    }

    var tx;
    var results = [];
    var fetchedDocs = {};

    function sortByBulkSeq(a, b) {
      return a._bulk_seq - b._bulk_seq;
    }

    function complete(event) {
      var aresults = [];
      results.sort(sortByBulkSeq);
      results.forEach(function (result) {
        delete result._bulk_seq;
        if (result.error) {
          aresults.push(result);
          return;
        }
        var metadata = result.metadata;
        var rev = merge.winningRev(metadata);

        aresults.push({
          ok: true,
          id: metadata.id,
          rev: rev
        });

        if (utils.isLocalId(metadata.id)) {
          return;
        }

        docsWritten++;

      });
      WebSqlPouch.Changes.notify(name);

      var updateseq = 'SELECT update_seq FROM ' + META_STORE;
      tx.executeSql(updateseq, [], function (tx, result) {
        var update_seq = result.rows.item(0).update_seq + docsWritten;
        var sql = 'UPDATE ' + META_STORE + ' SET update_seq=?';
        tx.executeSql(sql, [update_seq], function () {
          callback(null, aresults);
        });
      });
    }

    function preprocessAttachment(att, finish) {
      if (att.stub) {
        return finish();
      }
      if (typeof att.data === 'string') {
        try {
          att.data = atob(att.data);
        } catch (e) {
          var err = errors.error(errors.BAD_ARG,
                                "Attachments need to be base64 encoded");
          return callback(err);
        }
        var data = utils.fixBinary(att.data);
        att.data = utils.createBlob([data], {type: att.content_type});
      }
      var reader = new FileReader();
      reader.onloadend = function (e) {
        var binary = utils.arrayBufferToBinaryString(this.result);
        att.data = binary;
        att.digest = 'md5-' + utils.MD5(binary);
        finish();
      };
      reader.readAsArrayBuffer(att.data);
    }

    function preprocessAttachments(callback) {
      if (!docInfos.length) {
        return callback();
      }

      var docv = 0;

      docInfos.forEach(function (docInfo) {
        var attachments = docInfo.data && docInfo.data._attachments ?
          Object.keys(docInfo.data._attachments) : [];
        var recv = 0;

        if (!attachments.length) {
          return done();
        }

        function processedAttachment() {
          recv++;
          if (recv === attachments.length) {
            done();
          }
        }

        for (var key in docInfo.data._attachments) {
          if (docInfo.data._attachments.hasOwnProperty(key)) {
            preprocessAttachment(docInfo.data._attachments[key],
                                 processedAttachment);
          }
        }
      });

      function done() {
        docv++;
        if (docInfos.length === docv) {
          callback();
        }
      }
    }

    function writeDoc(docInfo, winningRev, deleted, callback, isUpdate) {

      function finish() {
        var data = docInfo.data;
        var doc_id_rev = data._id + "::" + data._rev;
        var deletedInt = deleted ? 1 : 0;
        var fetchSql = select('seq', BY_SEQ_STORE, null, 'doc_id_rev=?');

        tx.executeSql(fetchSql, [doc_id_rev], function (err, res) {
          var sql, sqlArgs;
          if (res.rows.length) {
            sql = 'UPDATE ' + BY_SEQ_STORE +
              ' SET json=?, deleted=? WHERE doc_id_rev=?;';
            sqlArgs = [JSON.stringify(data), deletedInt, doc_id_rev];
            tx.executeSql(sql, sqlArgs, function (tx) {
              dataWritten(tx, res.rows.item(0).seq);
            });
          } else {
            sql = 'INSERT INTO ' + BY_SEQ_STORE +
              ' (doc_id_rev, json, deleted) VALUES (?, ?, ?);';
            sqlArgs = [doc_id_rev, JSON.stringify(data), deletedInt];
            tx.executeSql(sql, sqlArgs, function (tx, result) {
              dataWritten(tx, result.insertId);
            });
          }
        });
      }

      function collectResults(attachmentErr) {
        if (!err) {
          if (attachmentErr) {
            err = attachmentErr;
            callback(err);
          } else if (recv === attachments.length) {
            finish();
          }
        }
      }

      var err = null;
      var recv = 0;

      docInfo.data._id = docInfo.metadata.id;
      docInfo.data._rev = docInfo.metadata.rev;

      if (deleted) {
        docInfo.data._deleted = true;
      }

      var attachments = docInfo.data._attachments ?
        Object.keys(docInfo.data._attachments) : [];

      function attachmentSaved(err) {
        recv++;
        collectResults(err);
      }

      for (var key in docInfo.data._attachments) {
        if (!docInfo.data._attachments[key].stub) {
          var data = docInfo.data._attachments[key].data;
          delete docInfo.data._attachments[key].data;
          var digest = docInfo.data._attachments[key].digest;
          saveAttachment(docInfo, digest, data, attachmentSaved);
        } else {
          recv++;
          collectResults();
        }
      }

      if (!attachments.length) {
        finish();
      }

      function dataWritten(tx, seq) {
        docInfo.metadata.seq = seq;
        delete docInfo.metadata.rev;

        var sql = isUpdate ?
          'UPDATE ' + DOC_STORE +
          ' SET json=?, winningseq=(SELECT seq FROM ' + BY_SEQ_STORE +
          ' WHERE doc_id_rev=?) WHERE id=?'
          : 'INSERT INTO ' + DOC_STORE +
          ' (id, winningseq, json, local) VALUES (?, ?, ?, ?);';
        var metadataStr = JSON.stringify(docInfo.metadata);
        var key = docInfo.metadata.id + "::" + winningRev;
        var local = utils.isLocalId(docInfo.metadata.id) ? 1 : 0;
        var params = isUpdate ?
          [metadataStr, key, docInfo.metadata.id] :
          [docInfo.metadata.id, seq, metadataStr, local];
        tx.executeSql(sql, params, function () {
          results.push(docInfo);
          fetchedDocs[docInfo.metadata.id] = docInfo.metadata;
          callback();
        });
      }
    }

    function updateDoc(oldDoc, docInfo) {
      var merged =
        merge.merge(oldDoc.rev_tree, docInfo.metadata.rev_tree[0], 1000);
      var deleted = utils.isDeleted(docInfo.metadata);
      var oldDocDeleted = utils.isDeleted(oldDoc);
      var inConflict = (oldDocDeleted && deleted && newEdits) ||
        (!oldDocDeleted && newEdits && merged.conflicts !== 'new_leaf');
      if (inConflict) {
        results.push(makeErr(errors.REV_CONFLICT, docInfo._bulk_seq));
        return processDocs();
      }

      docInfo.metadata.rev_tree = merged.tree;

      // recalculate
      var winningRev = merge.winningRev(docInfo.metadata);
      deleted = utils.isDeleted(docInfo.metadata, winningRev);

      writeDoc(docInfo, winningRev, deleted, processDocs, true);
    }

    function insertDoc(docInfo) {
      // Cant insert new deleted documents
      var winningRev = merge.winningRev(docInfo.metadata);
      var deleted = utils.isDeleted(docInfo.metadata, winningRev);
      if ('was_delete' in opts && deleted) {
        results.push(errors.MISSING_DOC);
        return processDocs();
      }
      writeDoc(docInfo, winningRev, deleted, processDocs, false);
    }

    function processDocs() {
      if (!docInfos.length) {
        return complete();
      }
      var currentDoc = docInfos.shift();
      var id = currentDoc.metadata.id;

      if (id in fetchedDocs) {
        // if newEdits=false, can re-use the same id from this batch
        return updateDoc(fetchedDocs[id], currentDoc);
      }

      tx.executeSql('SELECT json FROM ' + DOC_STORE +
        ' WHERE id = ?', [id], function (tx, result) {

        if (result.rows.length) {
          var metadata = JSON.parse(result.rows.item(0).json);
          updateDoc(metadata, currentDoc);
        } else {
          insertDoc(currentDoc);
        }
      });
    }

    // Insert sequence number into the error so we can sort later
    function makeErr(err, seq) {
      err._bulk_seq = seq;
      return err;
    }

    function saveAttachment(docInfo, digest, data, callback) {
      var ref = [docInfo.metadata.id, docInfo.metadata.rev].join('@');
      var newAtt = {digest: digest};
      var sql = 'SELECT digest, json FROM ' + ATTACH_STORE + ' WHERE digest=?';
      tx.executeSql(sql, [digest], function (tx, result) {
        if (!result.rows.length) {
          newAtt.refs = {};
          newAtt.refs[ref] = true;
          sql = 'INSERT INTO ' + ATTACH_STORE +
                '(digest, json, body) VALUES (?, ?, ?)';
          tx.executeSql(sql, [digest, JSON.stringify(newAtt), data],
            function () {
            callback();
          });
        } else {
          newAtt.refs = JSON.parse(result.rows.item(0).json).refs;
          sql = 'UPDATE ' + ATTACH_STORE + ' SET json=?, body=? WHERE digest=?';
          tx.executeSql(sql, [JSON.stringify(newAtt), data, digest],
            function () {
            callback();
          });
        }
      });
    }

    preprocessAttachments(function () {
      db.transaction(function (txn) {
        tx = txn;
        processDocs();
      }, unknownError(callback), function () {
        docCount = -1;
      });
    });
  };

  api._get = function (id, opts, callback) {
    opts = utils.clone(opts);
    var doc;
    var metadata;
    var err;
    if (!opts.ctx) {
      db.readTransaction(function (txn) {
        opts.ctx = txn;
        api._get(id, opts, callback);
      });
      return;
    }
    var tx = opts.ctx;

    function finish() {
      callback(err, {doc: doc, metadata: metadata, ctx: tx});
    }

    var sql;
    var sqlArgs;
    if (opts.rev) {
      sql = select(
        SELECT_DOCS,
        [DOC_STORE, BY_SEQ_STORE],
        null,
        [BY_SEQ_STORE + '.doc_id_rev=?', DOC_STORE + '.id=?']);
      sqlArgs = [id + '::' + opts.rev, id];
    } else {
      sql = select(
        SELECT_DOCS,
        [DOC_STORE, BY_SEQ_STORE],
        DOC_STORE_AND_BY_SEQ_JOINER,
        DOC_STORE + '.id=?');
      sqlArgs = [id];
    }
    tx.executeSql(sql, sqlArgs, function (a, results) {
      if (!results.rows.length) {
        err = errors.MISSING_DOC;
        return finish();
      }
      var item = results.rows.item(0);
      metadata = JSON.parse(item.metadata);
      if (item.deleted && !opts.rev) {
        err = errors.error(errors.MISSING_DOC, 'deleted');
        return finish();
      }
      doc = JSON.parse(item.data);
      finish();
    });
  };

  function countDocs(tx, callback) {

    if (docCount !== -1) {
      return callback(docCount);
    }

    // count the total rows
    var sql = select(
      'COUNT(' + DOC_STORE + '.id) AS \'num\'',
      [DOC_STORE, BY_SEQ_STORE],
      DOC_STORE_AND_BY_SEQ_JOINER,
      [BY_SEQ_STORE + '.deleted=0', DOC_STORE + '.local=0']);

    tx.executeSql(sql, [], function (tx, result) {
      docCount = result.rows.item(0).num;
      callback(docCount);
    });
  }

  api._allDocs = function (opts, callback) {
    var results = [];
    var totalRows;

    var start = 'startkey' in opts ? opts.startkey : false;
    var end = 'endkey' in opts ? opts.endkey : false;
    var key = 'key' in opts ? opts.key : false;
    var descending = 'descending' in opts ? opts.descending : false;
    var limit = 'limit' in opts ? opts.limit : -1;
    var offset = 'skip' in opts ? opts.skip : 0;
    var inclusiveEnd = opts.inclusive_end !== false;

    var sqlArgs = [];
    var criteria = [DOC_STORE + '.local = 0'];

    if (key !== false) {
      criteria.push(DOC_STORE + '.id = ?');
      sqlArgs.push(key);
    } else if (start !== false || end !== false) {
      if (start !== false) {
        criteria.push(DOC_STORE + '.id ' + (descending ? '<=' : '>=') + ' ?');
        sqlArgs.push(start);
      }
      if (end !== false) {
        var comparator = descending ? '>' : '<';
        if (inclusiveEnd) {
          comparator += '=';
        }
        criteria.push(DOC_STORE + '.id ' + comparator + ' ?');
        sqlArgs.push(end);
      }
      if (key !== false) {
        criteria.push(DOC_STORE + '.id = ?');
        sqlArgs.push(key);
      }
    }

    if (opts.deleted !== 'ok') {
      // report deleted if keys are specified
      criteria.push(BY_SEQ_STORE + '.deleted = 0');
    }

    db.readTransaction(function (tx) {

      // first count up the total rows
      countDocs(tx, function (count) {
        totalRows = count;

        if (limit === 0) {
          return;
        }

        // then actually fetch the documents
        var sql = select(
          SELECT_DOCS,
          [DOC_STORE, BY_SEQ_STORE],
          DOC_STORE_AND_BY_SEQ_JOINER,
          criteria,
          DOC_STORE + '.id ' + (descending ? 'DESC' : 'ASC')
          );
        sql += ' LIMIT ' + limit + ' OFFSET ' + offset;

        tx.executeSql(sql, sqlArgs, function (tx, result) {
          for (var i = 0, l = result.rows.length; i < l; i++) {
            var item = result.rows.item(i);
            var metadata = JSON.parse(item.metadata);
            var data = JSON.parse(item.data);
            var winningRev = data._rev;
            var doc = {
              id: metadata.id,
              key: metadata.id,
              value: {rev: winningRev}
            };
            if (opts.include_docs) {
              doc.doc = data;
              doc.doc._rev = winningRev;
              if (opts.conflicts) {
                doc.doc._conflicts = merge.collectConflicts(metadata);
              }
              for (var att in doc.doc._attachments) {
                if (doc.doc._attachments.hasOwnProperty(att)) {
                  doc.doc._attachments[att].stub = true;
                }
              }
            }
            if (item.deleted) {
              if (opts.deleted === 'ok') {
                doc.value.deleted = true;
                doc.doc = null;
              } else {
                continue;
              }
            }
            results.push(doc);
          }
        });
      });
    }, unknownError(callback), function () {
      callback(null, {
        total_rows: totalRows,
        offset: opts.skip,
        rows: results
      });
    });
  };

  api._changes = function (opts) {
    opts = utils.clone(opts);

    if (opts.continuous) {
      var id = name + ':' + utils.uuid();
      WebSqlPouch.Changes.addListener(name, id, api, opts);
      WebSqlPouch.Changes.notify(name);
      return {
        cancel: function () {
          WebSqlPouch.Changes.removeListener(name, id);
        }
      };
    }

    var descending = opts.descending;

    // Ignore the `since` parameter when `descending` is true
    opts.since = opts.since && !descending ? opts.since : 0;

    var limit = 'limit' in opts ? opts.limit : -1;
    if (limit === 0) {
      limit = 1; // per CouchDB _changes spec
    }

    var returnDocs;
    if ('returnDocs' in opts) {
      returnDocs = opts.returnDocs;
    } else {
      returnDocs = true;
    }
    var results = [];
    var numResults = 0;
    function fetchChanges() {

      var criteria = [
        DOC_STORE + '.winningseq > ' + opts.since,
        DOC_STORE + '.local = 0'
      ];
      var sqlArgs = [];
      if (opts.doc_ids) {
        criteria.push(DOC_STORE + '.id IN (' + opts.doc_ids.map(function () {
          return '?';
        }).join(',') + ')');
        sqlArgs = opts.doc_ids;
      }

      var sql = select(SELECT_DOCS, [DOC_STORE, BY_SEQ_STORE],
        DOC_STORE_AND_BY_SEQ_JOINER, criteria,
        DOC_STORE + '.winningseq ' + (descending ? 'DESC' : 'ASC'));

      var filter = utils.filterChange(opts);
      if (!opts.view && !opts.filter) {
        // we can just limit in the query
        sql += ' LIMIT ' + limit;
      }

      db.readTransaction(function (tx) {
        tx.executeSql(sql, sqlArgs, function (tx, result) {
          var lastSeq = 0;
          for (var i = 0, l = result.rows.length; i < l; i++) {
            var res = result.rows.item(i);
            var metadata = JSON.parse(res.metadata);
            if (lastSeq < res.seq) {
              lastSeq = res.seq;
            }
            var doc = JSON.parse(res.data);
            var change = opts.processChange(doc, metadata, opts);
            change.seq = res.seq;
            if (filter(change)) {
              numResults++;
              if (returnDocs) {
                results.push(change);
              }
              opts.onChange(change);
            }
            if (numResults === limit) {
              break;
            }
          }
          if (!opts.continuous) {
            opts.complete(null, {
              results: results,
              last_seq: lastSeq
            });
          }
        });
      });
    }

    fetchChanges();
  };

  api._close = function (callback) {
    //WebSQL databases do not need to be closed
    callback();
  };

  api._getAttachment = function (attachment, opts, callback) {
    var res;
    var tx = opts.ctx;
    var digest = attachment.digest;
    var type = attachment.content_type;
    var sql = 'SELECT hex(body) as body FROM ' + ATTACH_STORE +
              ' WHERE digest=?';
    tx.executeSql(sql, [digest], function (tx, result) {
      // sqlite normally stores data as utf8, so even the hex() function
      // "encodes" the binary data in utf8/16 before returning it. yet hex()
      // is the only way to get the full data, so we do this.
      var data = parseHexString(result.rows.item(0).body, encoding);
      if (opts.encode) {
        res = btoa(data);
      } else {
        data = utils.fixBinary(data);
        res = utils.createBlob([data], {type: type});
      }
      callback(null, res);
    });
  };

  api._getRevisionTree = function (docId, callback) {
    db.readTransaction(function (tx) {
      var sql = 'SELECT json AS metadata FROM ' + DOC_STORE + ' WHERE id = ?';
      tx.executeSql(sql, [docId], function (tx, result) {
        if (!result.rows.length) {
          callback(errors.MISSING_DOC);
        } else {
          var data = JSON.parse(result.rows.item(0).metadata);
          callback(null, data.rev_tree);
        }
      });
    });
  };

  api._doCompaction = function (docId, rev_tree, revs, callback) {
    if (!revs.length) {
      return callback();
    }
    db.transaction(function (tx) {
      var sql = 'SELECT json AS metadata FROM ' + DOC_STORE + ' WHERE id = ?';
      tx.executeSql(sql, [docId], function (tx, result) {
        if (!result.rows.length) {
          return utils.call(callback);
        }
        var metadata = JSON.parse(result.rows.item(0).metadata);
        metadata.rev_tree = rev_tree;

        // websql never calls callback if we do WHERE doc_id_rev IN (...)
        var numDone = 0;
        revs.forEach(function (rev) {
          var docIdRev = docId + '::' + rev;
          var sql = 'DELETE FROM ' + BY_SEQ_STORE + ' WHERE doc_id_rev = ?';
          tx.executeSql(sql, [docIdRev], function (tx) {
            if (++numDone === revs.length) {
              var sql = 'UPDATE ' + DOC_STORE + ' SET json = ? WHERE id = ?';
              tx.executeSql(sql, [JSON.stringify(metadata), docId],
                function () {
                callback();
              });
            }
          });
        });
      });
    });
  };
}

WebSqlPouch.valid = function () {
  if (typeof global !== 'undefined') {
    if (global.navigator &&
        global.navigator.sqlitePlugin &&
        global.navigator.sqlitePlugin.openDatabase) {
      return true;
    } else if (global.sqlitePlugin && global.sqlitePlugin.openDatabase) {
      return true;
    } else if (global.openDatabase) {
      return true;
    }
  }
  return false;
};

WebSqlPouch.destroy = utils.toPromise(function (name, opts, callback) {
  WebSqlPouch.Changes.removeAllListeners(name);
  var db = openDB(name, POUCH_VERSION, name, POUCH_SIZE);
  db.transaction(function (tx) {
    var stores = [DOC_STORE, BY_SEQ_STORE, ATTACH_STORE, META_STORE];
    stores.forEach(function (store) {
      tx.executeSql('DROP TABLE IF EXISTS ' + store, []);
    });
  }, unknownError(callback), function () {
    if (utils.hasLocalStorage()) {
      delete global.localStorage['_pouch__websqldb_' + name];
      delete global.localStorage[name];
    }
    callback(null, {'ok': true});
  });
});

WebSqlPouch.Changes = new utils.Changes();

module.exports = WebSqlPouch;

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../deps/errors":31,"../merge":37,"../utils":42}],27:[function(require,module,exports){
'use strict';
var utils = require('./utils');
var merge = require('./merge');
var errors = require('./deps/errors');
var EE = require('events').EventEmitter;
var evalFilter = require('./evalFilter');
var evalView = require('./evalView');
module.exports = Changes;
utils.inherits(Changes, EE);

function Changes(db, opts, callback) {
  EE.call(this);
  var self = this;
  this.db = db;
  opts = opts ? utils.clone(opts) : {};
  var oldComplete = callback || opts.complete || function () {};
  var complete = opts.complete = utils.once(function (err, resp) {
    if (err) {
      self.emit('error', err);
    } else {
      self.emit('complete', resp);
    }
    self.removeAllListeners();
    db.removeListener('destroyed', onDestroy);
  });
  if (oldComplete) {
    self.on('complete', function (resp) {
      oldComplete(null, resp);
    });
    self.on('error', function (err) {
      oldComplete(err);
    });
  }
  var oldOnChange = opts.onChange;
  if (oldOnChange) {
    self.on('change', oldOnChange);
  }
  function onDestroy() {
    self.cancel();
  }
  db.once('destroyed', onDestroy);

  opts.onChange = function (change) {
    if (opts.isCancelled) {
      return;
    }
    self.emit('change', change);
    if (self.startSeq && self.startSeq <= change.seq) {
      self.emit('uptodate');
      self.startSeq = false;
    }
    if (change.deleted) {
      self.emit('delete', change);
    } else if (change.changes.length === 1 &&
      change.changes[0].rev.slice(0, 2) === '1-') {
      self.emit('create', change);
    } else {
      self.emit('update', change);
    }
  };

  var promise = new utils.Promise(function (fulfill, reject) {
    opts.complete = function (err, res) {
      if (err) {
        reject(err);
      } else {
        fulfill(res);
      }
    };
  });
  self.once('cancel', function () {
    if (oldOnChange) {
      self.removeListener('change', oldOnChange);
    }
    opts.complete(null, {status: 'cancelled'});
  });
  this.then = promise.then.bind(promise);
  this['catch'] = promise['catch'].bind(promise);
  this.then(function (result) {
    complete(null, result);
  }, complete);



  if (!db.taskqueue.isReady) {
    db.taskqueue.addTask(function () {
      if (self.isCancelled) {
        self.emit('cancel');
      } else {
        self.doChanges(opts);
      }
    });
  } else {
    self.doChanges(opts);
  }
}
Changes.prototype.cancel = function () {
  this.isCancelled = true;
  if (this.db.taskqueue.isReady) {
    this.emit('cancel');
  }
};
function processChange(doc, metadata, opts) {
  var changeList = [{rev: doc._rev}];
  if (opts.style === 'all_docs') {
    changeList = merge.collectLeaves(metadata.rev_tree)
    .map(function (x) { return {rev: x.rev}; });
  }
  var change = {
    id: metadata.id,
    changes: changeList,
    doc: doc
  };

  if (utils.isDeleted(metadata, doc._rev)) {
    change.deleted = true;
  }
  if (opts.conflicts) {
    change.doc._conflicts = merge.collectConflicts(metadata);
    if (!change.doc._conflicts.length) {
      delete change.doc._conflicts;
    }
  }
  return change;
}

Changes.prototype.doChanges = function (opts) {
  var self = this;
  var callback = opts.complete;

  opts = utils.clone(opts);
  if ('live' in opts && !('continuous' in opts)) {
    opts.continuous = opts.live;
  }
  opts.processChange = processChange;

  if (opts.since === 'latest') {
    opts.since = 'now';
  }
  if (!opts.since) {
    opts.since = 0;
  }
  if (opts.since === 'now') {
    this.db.info().then(function (info) {
      if (self.isCancelled) {
        callback(null, {status: 'cancelled'});
        return;
      }
      opts.since = info.update_seq  - 1;
      self.doChanges(opts);
    }, callback);
    return;
  }

  if (opts.continuous && opts.since !== 'now') {
    this.db.info().then(function (info) {
      self.startSeq = info.update_seq - 1;
    }, function (err) {
      if (err.id === 'idbNull') {
        //db closed before this returned
        //thats ok
        return;
      }
      throw err;
    });
  }

  if (this.db.type() !== 'http' &&
    opts.filter && typeof opts.filter === 'string') {
    return this.filterChanges(opts);
  }

  if (!('descending' in opts)) {
    opts.descending = false;
  }

  // 0 and 1 should return 1 document
  opts.limit = opts.limit === 0 ? 1 : opts.limit;
  opts.complete = callback;
  var newPromise = this.db._changes(opts);
  if (newPromise && typeof newPromise.cancel === 'function') {
    var cancel = self.cancel;
    self.cancel = utils.getArguments(function (args) {
      newPromise.cancel();
      cancel.apply(this, args);
    });
  }
};

Changes.prototype.filterChanges = function (opts) {
  var self = this;
  var callback = opts.complete;
  if (opts.filter === '_view') {
    if (!opts.view || typeof opts.view !== 'string') {
      var err = new  Error('`view` filter parameter is not provided.');
      err.status = errors.BAD_REQUEST.status;
      err.name = errors.BAD_REQUEST.name;
      err.error = true;
      callback(err);
      return;
    }
    // fetch a view from a design doc, make it behave like a filter
    var viewName = opts.view.split('/');
    this.db.get('_design/' + viewName[0], function (err, ddoc) {
      if (self.isCancelled) {
        callback(null, {status: 'cancelled'});
        return;
      }
      if (err) {
        callback(err);
        return;
      }
      if (ddoc && ddoc.views && ddoc.views[viewName[1]]) {
        
        var filter = evalView(ddoc.views[viewName[1]].map);
        opts.filter = filter;
        self.doChanges(opts);
        return;
      }
      var msg = ddoc.views ? 'missing json key: ' + viewName[1] :
        'missing json key: views';
      if (!err) {
        err = new  Error(msg);
        err.status = errors.MISSING_DOC.status;
        err.name = errors.MISSING_DOC.name;
        err.error = true;
      }
      callback(err);
      return;
    });
  } else {
    // fetch a filter from a design doc
    var filterName = opts.filter.split('/');
    this.db.get('_design/' + filterName[0], function (err, ddoc) {
      if (self.isCancelled) {
        callback(null, {status: 'cancelled'});
        return;
      }
      if (err) {
        callback(err);
        return;
      }
      if (ddoc && ddoc.filters && ddoc.filters[filterName[1]]) {
        var filter = evalFilter(ddoc.filters[filterName[1]]);
        opts.filter = filter;
        self.doChanges(opts);
        return;
      } else {
        var msg = (ddoc && ddoc.filters) ? 'missing json key: ' + filterName[1]
          : 'missing json key: filters';
        if (!err) {
          err = new  Error(msg);
          err.status = errors.MISSING_DOC.status;
          err.name = errors.MISSING_DOC.name;
          err.error = true;
        }
        callback(err);
        return;
      }
    });
  }
};
},{"./deps/errors":31,"./evalFilter":34,"./evalView":35,"./merge":37,"./utils":42,"events":8}],28:[function(require,module,exports){
(function (global){
/*globals cordova */
"use strict";

var Adapter = require('./adapter');
var utils = require('./utils');
var TaskQueue = require('./taskqueue');
var Promise = utils.Promise;

function defaultCallback(err) {
  if (err && global.debug) {
    console.error(err);
  }
}

utils.inherits(PouchDB, Adapter);
function PouchDB(name, opts, callback) {

  if (!(this instanceof PouchDB)) {
    return new PouchDB(name, opts, callback);
  }
  var self = this;
  if (typeof opts === 'function' || typeof opts === 'undefined') {
    callback = opts;
    opts = {};
  }

  if (typeof name === 'object') {
    opts = name;
    name = undefined;
  }
  if (typeof callback === 'undefined') {
    callback = defaultCallback;
  }
  opts = opts || {};
  var oldCB = callback;
  self.auto_compaction = opts.auto_compaction;
  self.prefix = PouchDB.prefix;
  Adapter.call(self);
  self.taskqueue = new TaskQueue();
  var promise = new Promise(function (fulfill, reject) {
    callback = function (err, resp) {
      if (err) {
        return reject(err);
      }
      delete resp.then;
      fulfill(resp);
    };
  
    opts = utils.clone(opts);
    var originalName = opts.name || name;
    var backend, error;
    (function () {
      try {

        if (typeof originalName !== 'string') {
          error = new Error('Missing/invalid DB name');
          error.code = 400;
          throw error;
        }

        backend = PouchDB.parseAdapter(originalName, opts);
        
        opts.originalName = originalName;
        opts.name = backend.name;
        opts.adapter = opts.adapter || backend.adapter;
        self._adapter = opts.adapter;
        if (!PouchDB.adapters[opts.adapter]) {
          error = new Error('Adapter is missing');
          error.code = 404;
          throw error;
        }

        if (!PouchDB.adapters[opts.adapter].valid()) {
          error = new Error('Invalid Adapter');
          error.code = 404;
          throw error;
        }
      } catch (err) {
        self.taskqueue.fail(err);
        self.changes = utils.toPromise(function (opts) {
          if (opts.complete) {
            opts.complete(err);
          }
        });
      }
    }());
    if (error) {
      return reject(error); // constructor error, see above
    }
    self.adapter = opts.adapter;

    // needs access to PouchDB;
    self.replicate = {};

    self.replicate.from = function (url, opts, callback) {
      return PouchDB.replicate(url, self, opts, callback);
    };

    self.replicate.to = function (url, opts, callback) {
      return PouchDB.replicate(self, url, opts, callback);
    };

    self.sync = function (dbName, opts, callback) {
      return PouchDB.sync(self, dbName, opts, callback);
    };

    self.replicate.sync = self.sync;

    self.destroy = utils.adapterFun('destroy', function (callback) {
      var self = this;
      self.info(function (err, info) {
        if (err) {
          return callback(err);
        }
        PouchDB.destroy(info.db_name, callback);
      });
    });

    PouchDB.adapters[opts.adapter].call(self, opts, function (err, db) {
      if (err) {
        if (callback) {
          self.taskqueue.fail(err);
          callback(err);
        }
        return;
      }
      function destructionListener(event) {
        if (event === 'destroyed') {
          self.emit('destroyed');
          PouchDB.removeListener(opts.name, destructionListener);
        }
      }
      PouchDB.on(opts.name, destructionListener);
      self.emit('created', self);
      PouchDB.emit('created', opts.originalName);
      self.taskqueue.ready(self);
      callback(null, self);
      
    });
    if (opts.skipSetup) {
      self.taskqueue.ready(self);
    }

    if (utils.isCordova()) {
      //to inform websql adapter that we can use api
      cordova.fireWindowEvent(opts.name + "_pouch", {});
    }
  });
  promise.then(function (resp) {
    oldCB(null, resp);
  }, oldCB);
  self.then = promise.then.bind(promise);
  self["catch"] = promise["catch"].bind(promise);

}

module.exports = PouchDB;

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./adapter":22,"./taskqueue":41,"./utils":42}],29:[function(require,module,exports){
"use strict";

var createBlob = require('./blob.js');
var errors = require('./errors');
var utils = require("../utils");
var hasUpload;

function ajax(options, adapterCallback) {

  var requestCompleted = false;
  var callback = utils.getArguments(function (args) {
    if (requestCompleted) {
      return;
    }
    adapterCallback.apply(this, args);
    requestCompleted = true;
  });

  if (typeof options === "function") {
    callback = options;
    options = {};
  }

  options = utils.clone(options);

  var defaultOptions = {
    method : "GET",
    headers: {},
    json: true,
    processData: true,
    timeout: 10000,
    cache: false
  };

  options = utils.extend(true, defaultOptions, options);

  // cache-buster, specifically designed to work around IE's aggressive caching
  // see http://www.dashbay.com/2011/05/internet-explorer-caches-ajax/
  if (options.method === 'GET' && !options.cache) {
    var hasArgs = options.url.indexOf('?') !== -1;
    options.url += (hasArgs ? '&' : '?') + '_nonce=' + utils.uuid(16);
  }

  function onSuccess(obj, resp, cb) {
    if (!options.binary && !options.json && options.processData &&
      typeof obj !== 'string') {
      obj = JSON.stringify(obj);
    } else if (!options.binary && options.json && typeof obj === 'string') {
      try {
        obj = JSON.parse(obj);
      } catch (e) {
        // Probably a malformed JSON from server
        return cb(e);
      }
    }
    if (Array.isArray(obj)) {
      obj = obj.map(function (v) {
        var obj;
        if (v.ok) {
          return v;
        } else if (v.error && v.error === 'conflict') {
          obj = errors.REV_CONFLICT;
          obj.id = v.id;
          return obj;
        } else if (v.error && v.error === 'forbidden') {
          obj = errors.FORBIDDEN;
          obj.id = v.id;
          obj.reason = v.reason;
          return obj;
        } else if (v.missing) {
          obj = errors.MISSING_DOC;
          obj.missing = v.missing;
          return obj;
        } else {
          return v;
        }
      });
    }
    cb(null, obj, resp);
  }

  function onError(err, cb) {
    var errParsed, errObj, errType, key;
    try {
      errParsed = JSON.parse(err.responseText);
      //would prefer not to have a try/catch clause
      for (key in errors) {
        if (errors.hasOwnProperty(key) &&
            errors[key].name === errParsed.error) {
          errType = errors[key];
          break;
        }
      }
      if (!errType) {
        errType = errors.UNKNOWN_ERROR;
        if (err.status) {
          errType.status = err.status;
        }
        if (err.statusText) {
          err.name = err.statusText;
        }
      }
      errObj = errors.error(errType, errParsed.reason);
    } catch (e) {
      for (var key in errors) {
        if (errors.hasOwnProperty(key) && errors[key].status === err.status) {
          errType = errors[key];
          break;
        }
      }
      if (!errType) {
        errType = errors.UNKNOWN_ERROR;
        if (err.status) {
          errType.status = err.status;
        }
        if (err.statusText) {
          err.name = err.statusText;
        }
      }
      errObj = errors.error(errType);
    }
    cb(errObj);
  }

  var timer;
  var xhr;
  if (options.xhr) {
    xhr = new options.xhr();
  } else {
    xhr = new XMLHttpRequest();
  }
  xhr.open(options.method, options.url);
  xhr.withCredentials = true;

  if (options.json) {
    options.headers.Accept = 'application/json';
    options.headers['Content-Type'] = options.headers['Content-Type'] ||
      'application/json';
    if (options.body &&
        options.processData &&
        typeof options.body !== "string") {
      options.body = JSON.stringify(options.body);
    }
  }

  if (options.binary) {
    xhr.responseType = 'arraybuffer';
  }

  var createCookie = function (name, value, days) {
    var expires = "";
    if (days) {
      var date = new Date();
      date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
      expires = "; expires=" + date.toGMTString();
    }
    document.cookie = name + "=" + value + expires + "; path=/";
  };

  for (var key in options.headers) {
    if (key === 'Cookie') {
      var cookie = options.headers[key].split('=');
      createCookie(cookie[0], cookie[1], 10);
    } else {
      xhr.setRequestHeader(key, options.headers[key]);
    }
  }

  if (!("body" in options)) {
    options.body = null;
  }

  var abortReq = function () {
    if (requestCompleted) {
      return;
    }
    xhr.abort();
    onError(xhr, callback);
  };

  xhr.onreadystatechange = function () {
    if (xhr.readyState !== 4 || requestCompleted) {
      return;
    }
    clearTimeout(timer);
    if (xhr.status >= 200 && xhr.status < 300) {
      var data;
      if (options.binary) {
        data = createBlob([xhr.response || ''], {
          type: xhr.getResponseHeader('Content-Type')
        });
      } else {
        data = xhr.responseText;
      }
      onSuccess(data, xhr, callback);
    } else {
      onError(xhr, callback);
    }
  };

  if (options.timeout > 0) {
    timer = setTimeout(abortReq, options.timeout);
    xhr.onprogress = function () {
      clearTimeout(timer);
      timer = setTimeout(abortReq, options.timeout);
    };
    if (typeof hasUpload === 'undefined') {
      // IE throws an error if you try to access it directly
      hasUpload = Object.keys(xhr).indexOf('upload') !== -1;
    }
    if (hasUpload) { // does not exist in ie9
      xhr.upload.onprogress = xhr.onprogress;
    }
  }
  if (options.body && (options.body instanceof Blob)) {
    var reader = new FileReader();
    reader.onloadend = function (e) {

      var binary = "";
      var bytes = new Uint8Array(this.result);
      var length = bytes.byteLength;

      for (var i = 0; i < length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }

      binary = utils.fixBinary(binary);
      xhr.send(binary);
    };
    reader.readAsArrayBuffer(options.body);
  } else {
    xhr.send(options.body);
  }
  return {abort: abortReq};
}

module.exports = ajax;

},{"../utils":42,"./blob.js":30,"./errors":31}],30:[function(require,module,exports){
(function (global){
"use strict";

//Abstracts constructing a Blob object, so it also works in older
//browsers that don't support the native Blob constructor. (i.e.
//old QtWebKit versions, at least).
function createBlob(parts, properties) {
  parts = parts || [];
  properties = properties || {};
  try {
    return new Blob(parts, properties);
  } catch (e) {
    if (e.name !== "TypeError") {
      throw e;
    }
    var BlobBuilder = global.BlobBuilder ||
                      global.MSBlobBuilder ||
                      global.MozBlobBuilder ||
                      global.WebKitBlobBuilder;
    var builder = new BlobBuilder();
    for (var i = 0; i < parts.length; i += 1) {
      builder.append(parts[i]);
    }
    return builder.getBlob(properties.type);
  }
}

module.exports = createBlob;


}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],31:[function(require,module,exports){
"use strict";

function PouchError(opts) {
  this.status = opts.status;
  this.name = opts.error;
  this.message = opts.reason;
  this.error = true;
}

PouchError.prototype__proto__ = Error.prototype;

PouchError.prototype.toString = function () {
  return JSON.stringify({
    status: this.status,
    name: this.name,
    message: this.message
  });
};

exports.UNAUTHORIZED = new PouchError({
  status: 401,
  error: 'unauthorized',
  reason: "Name or password is incorrect."
});
exports.MISSING_BULK_DOCS = new PouchError({
  status: 400,
  error: 'bad_request',
  reason: "Missing JSON list of 'docs'"
});
exports.MISSING_DOC = new PouchError({
  status: 404,
  error: 'not_found',
  reason: 'missing'
});
exports.REV_CONFLICT = new PouchError({
  status: 409,
  error: 'conflict',
  reason: 'Document update conflict'
});
exports.INVALID_ID = new PouchError({
  status: 400,
  error: 'invalid_id',
  reason: '_id field must contain a string'
});
exports.MISSING_ID = new PouchError({
  status: 412,
  error: 'missing_id',
  reason: '_id is required for puts'
});
exports.RESERVED_ID = new PouchError({
  status: 400,
  error: 'bad_request',
  reason: 'Only reserved document ids may start with underscore.'
});
exports.NOT_OPEN = new PouchError({
  status: 412,
  error: 'precondition_failed',
  reason: 'Database not open'
});
exports.UNKNOWN_ERROR = new PouchError({
  status: 500,
  error: 'unknown_error',
  reason: 'Database encountered an unknown error'
});
exports.BAD_ARG = new PouchError({
  status: 500,
  error: 'badarg',
  reason: 'Some query argument is invalid'
});
exports.INVALID_REQUEST = new PouchError({
  status: 400,
  error: 'invalid_request',
  reason: 'Request was invalid'
});
exports.QUERY_PARSE_ERROR = new PouchError({
  status: 400,
  error: 'query_parse_error',
  reason: 'Some query parameter is invalid'
});
exports.DOC_VALIDATION = new PouchError({
  status: 500,
  error: 'doc_validation',
  reason: 'Bad special document member'
});
exports.BAD_REQUEST = new PouchError({
  status: 400,
  error: 'bad_request',
  reason: 'Something wrong with the request'
});
exports.NOT_AN_OBJECT = new PouchError({
  status: 400,
  error: 'bad_request',
  reason: 'Document must be a JSON object'
});
exports.DB_MISSING = new PouchError({
  status: 404,
  error: 'not_found',
  reason: 'Database not found'
});
exports.IDB_ERROR = new PouchError({
  status: 500,
  error: 'indexed_db_went_bad',
  reason: 'unknown'
});
exports.WSQ_ERROR = new PouchError({
  status: 500,
  error: 'web_sql_went_bad',
  reason: 'unknown'
});
exports.LDB_ERROR = new PouchError({
  status: 500,
  error: 'levelDB_went_went_bad',
  reason: 'unknown'
});
exports.FORBIDDEN = new PouchError({
  status: 403,
  error: 'forbidden',
  reason: 'Forbidden by design doc validate_doc_update function'
});
exports.error = function (error, reason, name) {
  function CustomPouchError(msg) {
    this.message = reason;
    if (name) {
      this.name = name;
    }
  }
  CustomPouchError.prototype = error;
  return new CustomPouchError(reason);
};

},{}],32:[function(require,module,exports){
'use strict';
var Promise = require('../utils').Promise;

// this is essentially the "update sugar" function from daleharvey/pouchdb#1388
// the diffFun tells us what delta to apply to the doc.  it either returns
// the doc, or false if it doesn't need to do an update after all
function upsert(db, docId, diffFun) {
  return new Promise(function (fulfill, reject) {
    if (docId && typeof docId === 'object') {
      docId = docId._id;
    }
    if (typeof docId !== 'string') {
      return reject(new Error('doc id is required'));
    }

    db.get(docId, function (err, doc) {
      if (err) {
        if (err.name !== 'not_found') {
          return reject(err);
        }
        return fulfill(tryAndPut(db, diffFun({_id : docId}), diffFun));
      }
      var newDoc = diffFun(doc);
      if (!newDoc) {
        return fulfill(doc);
      }
      fulfill(tryAndPut(db, newDoc, diffFun));
    });
  });
}

function tryAndPut(db, doc, diffFun) {
  return db.put(doc)["catch"](function (err) {
    if (err.name !== 'conflict') {
      throw err;
    }
    return upsert(db, doc, diffFun);
  });
}

module.exports = function (db, docId, diffFun, cb) {
  if (typeof cb === 'function') {
    upsert(db, docId, diffFun).then(function (resp) {
      cb(null, resp);
    }, cb);
  } else {
    return upsert(db, docId, diffFun);
  }
};

},{"../utils":42}],33:[function(require,module,exports){
"use strict";

// BEGIN Math.uuid.js

/*!
Math.uuid.js (v1.4)
http://www.broofa.com
mailto:robert@broofa.com

Copyright (c) 2010 Robert Kieffer
Dual licensed under the MIT and GPL licenses.
*/

/*
 * Generate a random uuid.
 *
 * USAGE: Math.uuid(length, radix)
 *   length - the desired number of characters
 *   radix  - the number of allowable values for each character.
 *
 * EXAMPLES:
 *   // No arguments  - returns RFC4122, version 4 ID
 *   >>> Math.uuid()
 *   "92329D39-6F5C-4520-ABFC-AAB64544E172"
 *
 *   // One argument - returns ID of the specified length
 *   >>> Math.uuid(15)     // 15 character ID (default base=62)
 *   "VcydxgltxrVZSTV"
 *
 *   // Two arguments - returns ID of the specified length, and radix. 
 *   // (Radix must be <= 62)
 *   >>> Math.uuid(8, 2)  // 8 character ID (base=2)
 *   "01001010"
 *   >>> Math.uuid(8, 10) // 8 character ID (base=10)
 *   "47473046"
 *   >>> Math.uuid(8, 16) // 8 character ID (base=16)
 *   "098F4D35"
 */
var chars = (
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
  'abcdefghijklmnopqrstuvwxyz'
).split('');
function getValue(radix) {
  return 0 | Math.random() * radix;
}
function uuid(len, radix) {
  radix = radix || chars.length;
  var out = '';
  var i = -1;

  if (len) {
    // Compact form
    while (++i < len) {
      out += chars[getValue(radix)];
    }
    return out;
  }
    // rfc4122, version 4 form
    // Fill in random data.  At i==19 set the high bits of clock sequence as
    // per rfc4122, sec. 4.1.5
  while (++i < 36) {
    switch (i) {
      case 8:
      case 13:
      case 18:
      case 23:
        out += '-';
        break;
      case 19:
        out += chars[(getValue(16) & 0x3) | 0x8];
        break;
      default:
        out += chars[getValue(16)];
    }
  }

  return out;
}



module.exports = uuid;


},{}],34:[function(require,module,exports){
'use strict';

module.exports = evalFilter;
function evalFilter(input) {
  /*jshint evil: true */
  return eval([
    '(function () { return ',
    input,
    ' })()'
  ].join(''));
}
},{}],35:[function(require,module,exports){
'use strict';

module.exports = evalView;
function evalView(input) {
  /*jshint evil: true */
  return eval([
    '(function () {',
    '  return function (doc) {',
    '    var emitted = false;',
    '    var emit = function (a, b) {',
    '      emitted = true;',
    '    };',
    '    var view = ' + input + ';',
    '    view(doc);',
    '    if (emitted) {',
    '      return true;',
    '    }',
    '  }',
    '})()'
  ].join('\n'));
}
},{}],36:[function(require,module,exports){
(function (process){
"use strict";

var PouchDB = require('./setup');

module.exports = PouchDB;

PouchDB.ajax = require('./deps/ajax');
PouchDB.extend = require('pouchdb-extend');
PouchDB.utils = require('./utils');
PouchDB.Errors = require('./deps/errors');
PouchDB.replicate = require('./replicate').replicate;
PouchDB.sync = require('./sync');
PouchDB.version = require('./version');
var httpAdapter = require('./adapters/http');
PouchDB.adapter('http', httpAdapter);
PouchDB.adapter('https', httpAdapter);

PouchDB.adapter('idb', require('./adapters/idb'));
PouchDB.adapter('websql', require('./adapters/websql'));
PouchDB.plugin(require('pouchdb-mapreduce'));

if (!process.browser) {
  var ldbAdapter = require('./adapters/leveldb');
  PouchDB.adapter('ldb', ldbAdapter);
  PouchDB.adapter('leveldb', ldbAdapter);
}

}).call(this,require("JkpR2F"))
},{"./adapters/http":23,"./adapters/idb":24,"./adapters/leveldb":4,"./adapters/websql":26,"./deps/ajax":29,"./deps/errors":31,"./replicate":38,"./setup":39,"./sync":40,"./utils":42,"./version":43,"JkpR2F":10,"pouchdb-extend":64,"pouchdb-mapreduce":67}],37:[function(require,module,exports){
'use strict';
var extend = require('pouchdb-extend');


// for a better overview of what this is doing, read:
// https://github.com/apache/couchdb/blob/master/src/couchdb/couch_key_tree.erl
//
// But for a quick intro, CouchDB uses a revision tree to store a documents
// history, A -> B -> C, when a document has conflicts, that is a branch in the
// tree, A -> (B1 | B2 -> C), We store these as a nested array in the format
//
// KeyTree = [Path ... ]
// Path = {pos: position_from_root, ids: Tree}
// Tree = [Key, Opts, [Tree, ...]], in particular single node: [Key, []]

// Turn a path as a flat array into a tree with a single branch
function pathToTree(path) {
  var doc = path.shift();
  var root = [doc.id, doc.opts, []];
  var leaf = root;
  var nleaf;

  while (path.length) {
    doc = path.shift();
    nleaf = [doc.id, doc.opts, []];
    leaf[2].push(nleaf);
    leaf = nleaf;
  }
  return root;
}

// Merge two trees together
// The roots of tree1 and tree2 must be the same revision
function mergeTree(in_tree1, in_tree2) {
  var queue = [{tree1: in_tree1, tree2: in_tree2}];
  var conflicts = false;
  while (queue.length > 0) {
    var item = queue.pop();
    var tree1 = item.tree1;
    var tree2 = item.tree2;

    if (tree1[1].status || tree2[1].status) {
      tree1[1].status =
        (tree1[1].status ===  'available' ||
         tree2[1].status === 'available') ? 'available' : 'missing';
    }

    for (var i = 0; i < tree2[2].length; i++) {
      if (!tree1[2][0]) {
        conflicts = 'new_leaf';
        tree1[2][0] = tree2[2][i];
        continue;
      }

      var merged = false;
      for (var j = 0; j < tree1[2].length; j++) {
        if (tree1[2][j][0] === tree2[2][i][0]) {
          queue.push({tree1: tree1[2][j], tree2: tree2[2][i]});
          merged = true;
        }
      }
      if (!merged) {
        conflicts = 'new_branch';
        tree1[2].push(tree2[2][i]);
        tree1[2].sort();
      }
    }
  }
  return {conflicts: conflicts, tree: in_tree1};
}

function doMerge(tree, path, dontExpand) {
  var restree = [];
  var conflicts = false;
  var merged = false;
  var res;

  if (!tree.length) {
    return {tree: [path], conflicts: 'new_leaf'};
  }

  tree.forEach(function (branch) {
    if (branch.pos === path.pos && branch.ids[0] === path.ids[0]) {
      // Paths start at the same position and have the same root, so they need
      // merged
      res = mergeTree(branch.ids, path.ids);
      restree.push({pos: branch.pos, ids: res.tree});
      conflicts = conflicts || res.conflicts;
      merged = true;
    } else if (dontExpand !== true) {
      // The paths start at a different position, take the earliest path and
      // traverse up until it as at the same point from root as the path we
      // want to merge.  If the keys match we return the longer path with the
      // other merged After stemming we dont want to expand the trees

      var t1 = branch.pos < path.pos ? branch : path;
      var t2 = branch.pos < path.pos ? path : branch;
      var diff = t2.pos - t1.pos;

      var candidateParents = [];

      var trees = [];
      trees.push({ids: t1.ids, diff: diff, parent: null, parentIdx: null});
      while (trees.length > 0) {
        var item = trees.pop();
        if (item.diff === 0) {
          if (item.ids[0] === t2.ids[0]) {
            candidateParents.push(item);
          }
          continue;
        }
        if (!item.ids) {
          continue;
        }
        /*jshint loopfunc:true */
        item.ids[2].forEach(function (el, idx) {
          trees.push(
            {ids: el, diff: item.diff - 1, parent: item.ids, parentIdx: idx});
        });
      }

      var el = candidateParents[0];

      if (!el) {
        restree.push(branch);
      } else {
        res = mergeTree(el.ids, t2.ids);
        el.parent[2][el.parentIdx] = res.tree;
        restree.push({pos: t1.pos, ids: t1.ids});
        conflicts = conflicts || res.conflicts;
        merged = true;
      }
    } else {
      restree.push(branch);
    }
  });

  // We didnt find
  if (!merged) {
    restree.push(path);
  }

  restree.sort(function (a, b) {
    return a.pos - b.pos;
  });

  return {
    tree: restree,
    conflicts: conflicts || 'internal_node'
  };
}

// To ensure we dont grow the revision tree infinitely, we stem old revisions
function stem(tree, depth) {
  // First we break out the tree into a complete list of root to leaf paths,
  // we cut off the start of the path and generate a new set of flat trees
  var stemmedPaths = PouchMerge.rootToLeaf(tree).map(function (path) {
    var stemmed = path.ids.slice(-depth);
    return {
      pos: path.pos + (path.ids.length - stemmed.length),
      ids: pathToTree(stemmed)
    };
  });
  // Then we remerge all those flat trees together, ensuring that we dont
  // connect trees that would go beyond the depth limit
  return stemmedPaths.reduce(function (prev, current, i, arr) {
    return doMerge(prev, current, true).tree;
  }, [stemmedPaths.shift()]);
}

var PouchMerge = {};

PouchMerge.merge = function (tree, path, depth) {
  // Ugh, nicer way to not modify arguments in place?
  tree = extend(true, [], tree);
  path = extend(true, {}, path);
  var newTree = doMerge(tree, path);
  return {
    tree: stem(newTree.tree, depth),
    conflicts: newTree.conflicts
  };
};

// We fetch all leafs of the revision tree, and sort them based on tree length
// and whether they were deleted, undeleted documents with the longest revision
// tree (most edits) win
// The final sort algorithm is slightly documented in a sidebar here:
// http://guide.couchdb.org/draft/conflicts.html
PouchMerge.winningRev = function (metadata) {
  var leafs = [];
  PouchMerge.traverseRevTree(metadata.rev_tree,
                              function (isLeaf, pos, id, something, opts) {
    if (isLeaf) {
      leafs.push({pos: pos, id: id, deleted: !!opts.deleted});
    }
  });
  leafs.sort(function (a, b) {
    if (a.deleted !== b.deleted) {
      return a.deleted > b.deleted ? 1 : -1;
    }
    if (a.pos !== b.pos) {
      return b.pos - a.pos;
    }
    return a.id < b.id ? 1 : -1;
  });

  return leafs[0].pos + '-' + leafs[0].id;
};

// Pretty much all below can be combined into a higher order function to
// traverse revisions
// The return value from the callback will be passed as context to all
// children of that node
PouchMerge.traverseRevTree = function (revs, callback) {
  var toVisit = revs.slice();

  var node;
  while ((node = toVisit.pop())) {
    var pos = node.pos;
    var tree = node.ids;
    var branches = tree[2];
    var newCtx =
      callback(branches.length === 0, pos, tree[0], node.ctx, tree[1]);
    for (var i = 0, len = branches.length; i < len; i++) {
      toVisit.push({pos: pos + 1, ids: branches[i], ctx: newCtx});
    }
  }
};

PouchMerge.collectLeaves = function (revs) {
  var leaves = [];
  PouchMerge.traverseRevTree(revs, function (isLeaf, pos, id, acc, opts) {
    if (isLeaf) {
      leaves.unshift({rev: pos + "-" + id, pos: pos, opts: opts});
    }
  });
  leaves.sort(function (a, b) {
    return b.pos - a.pos;
  });
  leaves.map(function (leaf) { delete leaf.pos; });
  return leaves;
};

// returns revs of all conflicts that is leaves such that
// 1. are not deleted and
// 2. are different than winning revision
PouchMerge.collectConflicts = function (metadata) {
  var win = PouchMerge.winningRev(metadata);
  var leaves = PouchMerge.collectLeaves(metadata.rev_tree);
  var conflicts = [];
  leaves.forEach(function (leaf) {
    if (leaf.rev !== win && !leaf.opts.deleted) {
      conflicts.push(leaf.rev);
    }
  });
  return conflicts;
};

PouchMerge.rootToLeaf = function (tree) {
  var paths = [];
  PouchMerge.traverseRevTree(tree, function (isLeaf, pos, id, history, opts) {
    history = history ? history.slice(0) : [];
    history.push({id: id, opts: opts});
    if (isLeaf) {
      var rootPos = pos + 1 - history.length;
      paths.unshift({pos: rootPos, ids: history});
    }
    return history;
  });
  return paths;
};


module.exports = PouchMerge;

},{"pouchdb-extend":64}],38:[function(require,module,exports){
'use strict';

var utils = require('./utils');
var Pouch = require('./index');
var EE = require('events').EventEmitter;

// We create a basic promise so the caller can cancel the replication possibly
// before we have actually started listening to changes etc
utils.inherits(Replication, EE);
function Replication(opts) {
  EE.call(this);
  this.cancelled = false;
  var self = this;
  var promise = new utils.Promise(function (fulfill, reject) {
    self.once('complete', fulfill);
    self.once('error', reject);
  });
  self.then = function (resolve, reject) {
    return promise.then(resolve, reject);
  };
  self["catch"] = function (reject) {
    return promise["catch"](reject);
  };
  // As we allow error handling via "error" event as well,
  // put a stub in here so that rejecting never throws UnhandledError.
  self["catch"](function (err) {});
}

Replication.prototype.cancel = function () {
  this.cancelled = true;
  this.emit('cancel');
};

Replication.prototype.ready = function (src, target) {
  var self = this;
  function onDestroy() {
    self.cancel();
  }
  src.once('destroyed', onDestroy);
  target.once('destroyed', onDestroy);
  function cleanup() {
    self.removeAllListeners();
    src.removeListener('destroyed', onDestroy);
    target.removeListener('destroyed', onDestroy);
  }
  this.then(cleanup, cleanup);
};


// TODO: check CouchDB's replication id generation
// Generate a unique id particular to this replication
function genReplicationId(src, target, opts) {
  var filterFun = opts.filter ? opts.filter.toString() : '';
  return src.id().then(function (src_id) {
    return target.id().then(function (target_id) {
      var queryData = src_id + target_id + filterFun +
        JSON.stringify(opts.query_params) + opts.doc_ids;
      return '_local/' + utils.MD5(queryData);
    });
  });
}


function updateCheckpoint(db, id, checkpoint) {
    return db.get(id)["catch"](function (err) {
      if (err.status === 404) {
        return {_id: id};
      }
      throw err;
    }).then(function (doc) {
      doc.last_seq = checkpoint;
      return db.put(doc);
    });
  }

function Checkpointer(src, target, id) {
  this.src = src;
  this.target = target;
  this.id = id;
}

Checkpointer.prototype.writeCheckpoint = function (checkpoint) {
  var self = this;
  return this.updateTarget(checkpoint).then(function () {
    return self.updateSource(checkpoint);
  });
};
Checkpointer.prototype.updateTarget = function (checkpoint) {
  return updateCheckpoint(this.target, this.id, checkpoint);
};
Checkpointer.prototype.updateSource = function (checkpoint) {
  var self = this;
  if (this.readOnlySource) {
    return utils.Promise.resolve(true);
  }
  return updateCheckpoint(this.src, this.id, checkpoint)["catch"](function (err) {
    if (err.status === 401) {
      self.readOnlySource = true;
      return true;
    }
    throw err;
  });
};
Checkpointer.prototype.getCheckpoint = function () {
  var self = this;
  return self.target.get(self.id).then(function (targetDoc) {
    return self.src.get(self.id).then(function (sourceDoc) {
      if (targetDoc.last_seq === sourceDoc.last_seq) {
        return sourceDoc.last_seq;
      }
      return 0;
    }, function (err) {
      if (err.status === 404 && targetDoc.last_seq) {
        return self.src.put({
          _id: self.id,
          last_seq: 0
        }).then(function () {
          return 0;
        }, function (err) {
          if (err.status === 401) {
            self.readOnlySource = true;
            return targetDoc.last_seq;
          }
          return 0;
        });
      }
      throw err;
    });
  })["catch"](function (err) {
    if (err.status !== 404) {
      throw err;
    }
    return 0;
  });
};
function replicate(repId, src, target, opts, returnValue) {
  var batches = [];               // list of batches to be processed
  var currentBatch;               // the batch currently being processed
  var pendingBatch = {
    seq: 0,
    changes: [],
    docs: []
  }; // next batch, not yet ready to be processed
  var writingCheckpoint = false;  // true while checkpoint is being written
  var changesCompleted = false;   // true when all changes received
  var replicationCompleted = false; // true when replication has completed
  var last_seq = 0;
  var continuous = opts.continuous || opts.live || false;
  var batch_size = opts.batch_size || 100;
  var batches_limit = opts.batches_limit || 10;
  var changesPending = false;     // true while src.changes is running
  var changesCount = 0; // number of changes received since calling src.changes
  var doc_ids = opts.doc_ids;
  var checkpointer = new Checkpointer(src, target, repId);
  var result = {
    ok: true,
    start_time: new Date(),
    docs_read: 0,
    docs_written: 0,
    doc_write_failures: 0,
    errors: []
  };
  var changesOpts = {};
  returnValue.ready(src, target);


  function writeDocs() {
    if (currentBatch.docs.length === 0) {
      return;
    }
    var docs = currentBatch.docs;
    return target.bulkDocs({
      docs: docs
    }, {
      new_edits: false
    }).then(function (res) {
      if (returnValue.cancelled) {
        completeReplication();
        throw new Error('cancelled');
      }
      var errors = [];
      res.forEach(function (res) {
        if (!res.ok) {
          result.doc_write_failures++;
          errors.push(new Error(res.reason || res.message || 'Unknown reason'));
        }
      });
      if (errors.length > 0) {
        var error = new Error('bulkDocs error');
        error.other_errors = errors;
        abortReplication('target.bulkDocs failed to write docs', error);
        throw new Error('bulkWrite partial failure');
      }
    }, function (err) {
      result.doc_write_failures += docs.length;
      throw err;
    });
  }


  function getNextDoc() {
    var diffs = currentBatch.diffs;
    var id = Object.keys(diffs)[0];
    var revs = diffs[id].missing;
    return src.get(id, {revs: true, open_revs: revs, attachments: true})
    .then(function (docs) {
      docs.forEach(function (doc) {
        if (returnValue.cancelled) {
          return completeReplication();
        }
        if (doc.ok) {
          result.docs_read++;
          currentBatch.pendingRevs++;
          currentBatch.docs.push(doc.ok);
          delete diffs[doc.ok._id];
        }
      });
    });
  }


  function getAllDocs() {
    if (Object.keys(currentBatch.diffs).length > 0) {
      return getNextDoc().then(getAllDocs);
    } else {
      return utils.Promise.resolve();
    }
  }


  function getRevisionOneDocs() {
    // filter out the generation 1 docs and get them
    // leaving the non-generation one docs to be got otherwise
    var ids = Object.keys(currentBatch.diffs).filter(function (id) {
      var missing = currentBatch.diffs[id].missing;
      return missing.length === 1 && missing[0].slice(0, 2) === '1-';
    });
    return src.allDocs({
      keys: ids,
      include_docs: true
    }).then(function (res) {
      if (returnValue.cancelled) {
        completeReplication();
        throw (new Error('cancelled'));
      }
      res.rows.forEach(function (row, i) {
        if (row.doc && !row.deleted &&
          row.value.rev.slice(0, 2) === '1-' && (
            !row.doc._attachments ||
            Object.keys(row.doc._attachments).length === 0
          )
        ) {
          result.docs_read++;
          currentBatch.pendingRevs++;
          currentBatch.docs.push(row.doc);
          delete currentBatch.diffs[row.id];
        }
      });
    });
  }


  function getDocs() {
    if (src.type() === 'http') {
      return getRevisionOneDocs().then(getAllDocs);
    } else {
      return getAllDocs();
    }
  }


  function finishBatch() {
    writingCheckpoint = true;
    return checkpointer.writeCheckpoint(
      currentBatch.seq
    ).then(function (res) {
      writingCheckpoint = false;
      if (returnValue.cancelled) {
        completeReplication();
        throw new Error('cancelled');
      }
      result.last_seq = last_seq = currentBatch.seq;
      result.docs_written += currentBatch.docs.length;
      returnValue.emit('change', utils.clone(result));
      currentBatch = undefined;
      getChanges();
    })["catch"](function (err) {
      writingCheckpoint = false;
      abortReplication('writeCheckpoint completed with error', err);
      throw err;
    });
  }


  function getDiffs() {
    var diff = {};
    currentBatch.changes.forEach(function (change) {
      diff[change.id] = change.changes.map(function (x) {
        return x.rev;
      });
    });
    return target.revsDiff(diff).then(function (diffs) {
      if (returnValue.cancelled) {
        completeReplication();
        throw new Error('cancelled');
      }
      // currentBatch.diffs elements are deleted as the documents are written
      currentBatch.diffs = diffs;
      currentBatch.pendingRevs = 0;
    });
  }


  function startNextBatch() {
    if (returnValue.cancelled || currentBatch) {
      return;
    }
    if (batches.length === 0) {
      processPendingBatch(true);
      return;
    }
    currentBatch = batches.shift();
    getDiffs()
    .then(getDocs)
    .then(writeDocs)
    .then(finishBatch)
    .then(startNextBatch)[
    "catch"](function (err) {
      abortReplication('batch processing terminated with error', err);
    });
  }


  function processPendingBatch(immediate) {
    if (pendingBatch.changes.length === 0) {
      if (batches.length === 0 && !currentBatch) {
        if ((continuous && changesOpts.live) || changesCompleted) {
          returnValue.emit('uptodate', utils.clone(result));
        }
        if (changesCompleted) {
          completeReplication();
        }
      }
      return;
    }
    if (
      immediate ||
      changesCompleted ||
      pendingBatch.changes.length >= batch_size
    ) {
      batches.push(pendingBatch);
      pendingBatch = {
        seq: 0,
        changes: [],
        docs: []
      };
      startNextBatch();
    }
  }


  function abortReplication(reason, err) {
    if (replicationCompleted) {
      return;
    }
    result.ok = false;
    result.status = 'aborted';
    err.message = reason;
    result.errors.push(err);
    batches = [];
    pendingBatch = {
      seq: 0,
      changes: [],
      docs: []
    };
    completeReplication();
  }


  function completeReplication() {
    if (replicationCompleted) {
      return;
    }
    if (returnValue.cancelled) {
      result.status = 'cancelled';
      if (writingCheckpoint) {
        return;
      }
    }
    result.status = result.status || 'complete';
    result.end_time = new Date();
    result.last_seq = last_seq;
    replicationCompleted = returnValue.cancelled = true;
    if (result.errors.length > 0) {
      var error = result.errors.pop();
      if (result.errors.length > 0) {
        error.other_errors = result.errors;
      }
      error.result = result;
      returnValue.emit('error', error);
    } else {
      returnValue.emit('complete', result);
    }
  }


  function onChange(change) {
    if (returnValue.cancelled) {
      return completeReplication();
    }
    changesCount++;
    if (
      pendingBatch.changes.length === 0 &&
      batches.length === 0 &&
      !currentBatch
    ) {
      returnValue.emit('outofdate', utils.clone(result));
    }
    pendingBatch.seq = change.seq;
    pendingBatch.changes.push(change);
    processPendingBatch(batches.length === 0);
  }


  function onChangesComplete(changes) {
    changesPending = false;
    if (returnValue.cancelled) {
      return completeReplication();
    }
    if (changesCount > 0) {
      changesOpts.since = changes.last_seq;
      getChanges();
    } else {
      if (continuous) {
        changesOpts.live = true;
        getChanges();
      } else {
        changesCompleted = true;
      }
    }
    processPendingBatch(true);
  }


  function onChangesError(err) {
    changesPending = false;
    if (returnValue.cancelled) {
      return completeReplication();
    }
    abortReplication('changes rejected', err);
  }


  function getChanges() {
    if (
      !changesPending &&
      !changesCompleted &&
      batches.length < batches_limit
    ) {
      changesPending = true;
      changesCount = 0;
      src.changes(changesOpts)
      .on('change', onChange)
      .then(onChangesComplete)[
      "catch"](onChangesError);
    }
  }


  function startChanges() {
    checkpointer.getCheckpoint().then(function (checkpoint) {
      last_seq = checkpoint;
      changesOpts = {
        since: last_seq,
        limit: batch_size,
        style: 'all_docs',
        doc_ids: doc_ids,
        returnDocs: false
      };
      if (opts.filter) {
        changesOpts.filter = opts.filter;
      }
      if (opts.query_params) {
        changesOpts.query_params = opts.query_params;
      }
      getChanges();
    })["catch"](function (err) {
      abortReplication('getCheckpoint rejected with ', err);
    });
  }


  returnValue.once('cancel', completeReplication);

  if (typeof opts.onChange === 'function') {
    returnValue.on('change', opts.onChange);
  }

  if (typeof opts.complete === 'function') {
    returnValue.once('error', opts.complete);
    returnValue.once('complete', function (result) {
      opts.complete(null, result);
    });
  }

  if (typeof opts.since === 'undefined') {
    startChanges();
  } else {
    writingCheckpoint = true;
    checkpointer.writeCheckpoint(opts.since).then(function (res) {
      writingCheckpoint = false;
      if (returnValue.cancelled) {
        completeReplication();
        return;
      }
      last_seq = opts.since;
      startChanges();
    })["catch"](function (err) {
      writingCheckpoint = false;
      abortReplication('writeCheckpoint completed with error', err);
      throw err;
    });
  }
}


function toPouch(db) {
  if (typeof db === 'string') {
    return new Pouch(db);
  } else if (db.then) {
    return db;
  } else {
    return utils.Promise.resolve(db);
  }
}


function replicateWrapper(src, target, opts, callback) {
  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  }
  if (typeof opts === 'undefined') {
    opts = {};
  }
  if (!opts.complete) {
    opts.complete = callback || function () {};
  }
  opts = utils.clone(opts);
  opts.continuous = opts.continuous || opts.live;
  var replicateRet = new Replication(opts);
  toPouch(src).then(function (src) {
    return toPouch(target).then(function (target) {
      if (opts.server) {
        if (typeof src.replicateOnServer !== 'function') {
          throw new TypeError(
            'Server replication not supported for ' + src.type() + ' adapter'
          );
        }
        if (src.type() !== target.type()) {
          throw new TypeError('Server replication' +
              ' for different adapter types (' +
            src.type() + ' and ' + target.type() + ') is not supported'
          );
        }
        src.replicateOnServer(target, opts, replicateRet);
      } else {
        return genReplicationId(src, target, opts).then(function (repId) {
          replicateRet.emit('id', repId);
          replicate(repId, src, target, opts, replicateRet);
        });
      }
    });
  })["catch"](function (err) {
    replicateRet.emit('error', err);
    opts.complete(err);
  });
  return replicateRet;
}

exports.replicate = replicateWrapper;

},{"./index":36,"./utils":42,"events":8}],39:[function(require,module,exports){
(function (global){
"use strict";

var PouchDB = require("./constructor");
var utils = require('./utils');
var Promise = utils.Promise;
var EventEmitter = require('events').EventEmitter;
PouchDB.adapters = {};
PouchDB.preferredAdapters = require('./adapters/preferredAdapters.js');

PouchDB.prefix = '_pouch_';

var eventEmitter = new EventEmitter();

var eventEmitterMethods = [
  'on',
  'addListener',
  'emit',
  'listeners',
  'once',
  'removeAllListeners',
  'removeListener',
  'setMaxListeners'
];

eventEmitterMethods.forEach(function (method) {
  PouchDB[method] = eventEmitter[method].bind(eventEmitter);
});
PouchDB.setMaxListeners(0);
PouchDB.parseAdapter = function (name, opts) {
  var match = name.match(/([a-z\-]*):\/\/(.*)/);
  var adapter, adapterName;
  if (match) {
    // the http adapter expects the fully qualified name
    name = /http(s?)/.test(match[1]) ? match[1] + '://' + match[2] : match[2];
    adapter = match[1];
    if (!PouchDB.adapters[adapter].valid()) {
      throw 'Invalid adapter';
    }
    return {name: name, adapter: match[1]};
  }

  // check for browsers that have been upgraded from websql-only to websql+idb
  var skipIdb = 'idb' in PouchDB.adapters && 'websql' in PouchDB.adapters &&
    utils.hasLocalStorage() &&
    global.localStorage['_pouch__websqldb_' + PouchDB.prefix + name];

  if (typeof opts !== 'undefined' && opts.db) {
    adapterName = 'leveldb';
  } else {
    for (var i = 0; i < PouchDB.preferredAdapters.length; ++i) {
      adapterName = PouchDB.preferredAdapters[i];
      if (adapterName in PouchDB.adapters) {
        if (skipIdb && adapterName === 'idb') {
          continue; // keep using websql to avoid user data loss
        }
        break;
      }
    }
  }

  adapter = PouchDB.adapters[adapterName];
  if (adapterName && adapter) {
    var use_prefix = 'use_prefix' in adapter ? adapter.use_prefix : true;

    return {
      name: use_prefix ? PouchDB.prefix + name : name,
      adapter: adapterName
    };
  }

  throw 'No valid adapter found';
};

PouchDB.destroy = utils.toPromise(function (name, opts, callback) {
  if (typeof opts === 'function' || typeof opts === 'undefined') {
    callback = opts;
    opts = {};
  }

  if (typeof name === 'object') {
    opts = name;
    name = undefined;
  }

  var backend = PouchDB.parseAdapter(opts.name || name, opts);
  var dbName = backend.name;

  var adapter = PouchDB.adapters[backend.adapter];

  function destroyDb() {
    // call destroy method of the particular adaptor
    adapter.destroy(dbName, opts, function (err, resp) {
      if (err) {
        callback(err);
      } else {
        PouchDB.emit('destroyed', dbName);
        //so we don't have to sift through all dbnames
        PouchDB.emit(dbName, 'destroyed');
        callback(null, resp || { 'ok': true });
      }
    });
  }

  var usePrefix = 'use_prefix' in adapter ? adapter.use_prefix : true;

  var trueDbName = usePrefix ?
    dbName.replace(new RegExp('^' + PouchDB.prefix), '') : dbName;
  new PouchDB(trueDbName, {adapter : backend.adapter}, function (err, db) {
    if (err) {
      return callback(err);
    }
    db.get('_local/_pouch_dependentDbs', function (err, localDoc) {
      if (err) {
        if (err.name !== 'not_found') {
          return callback(err);
        } else { // no dependencies
          return destroyDb();
        }
      }
      var dependentDbs = localDoc.dependentDbs;
      var deletedMap = Object.keys(dependentDbs).map(function (name) {
        var trueName = usePrefix ?
          name.replace(new RegExp('^' + PouchDB.prefix), '') : name;
        return PouchDB.destroy(trueName, {adapter: backend.adapter});
      });
      Promise.all(deletedMap).then(destroyDb, function (error) {
        callback(error);
      });
    });
  });
});

PouchDB.allDbs = utils.toPromise(function (callback) {
  var err = new Error('allDbs method removed');
  err.stats = '400';
  callback(err);
});
PouchDB.adapter = function (id, obj) {
  if (obj.valid()) {
    PouchDB.adapters[id] = obj;
  }
};

PouchDB.plugin = function (obj) {
  Object.keys(obj).forEach(function (id) {
    PouchDB.prototype[id] = obj[id];
  });
};

module.exports = PouchDB;

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./adapters/preferredAdapters.js":25,"./constructor":28,"./utils":42,"events":8}],40:[function(require,module,exports){
'use strict';
var utils = require('./utils');
var replicate = require('./replicate').replicate;
var EE = require('events').EventEmitter;

module.exports = Sync;
utils.inherits(Sync, EE);
function Sync(src, target, opts, callback) {
  if (!(this instanceof Sync)) {
    return new Sync(src, target, opts, callback);
  }
  var self = this;
  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  }
  if (typeof opts === 'undefined') {
    opts = {};
  }
  this.canceled = false;
  opts = utils.clone(opts);
  var onChange, complete;
  if ('onChange' in opts) {
    onChange = opts.onChange;
    delete opts.onChange;
  }
  if (typeof callback === 'function' && !opts.complete) {
    complete = callback;
  } else if ('complete' in opts) {
    complete = opts.complete;
    delete opts.complete;
  }
  this.push = replicate(src, target, opts);

  this.pull = replicate(target, src, opts);
  var emittedCancel = false;
  function onCancel(data) {
    if (!emittedCancel) {
      emittedCancel = true;
      self.emit('cancel', data);
    }
  }

  function pullChange(change) {
    self.emit('change', {
      direction: 'pull',
      change: change
    });
  }
  function pushChange(change) {
    self.emit('change', {
      direction: 'push',
      change: change
    });
  }
  var listeners = {};

  function removal(event, func) {
    if (event === 'change' &&
      (func === pullChange ||
      func === pushChange)) {
      self.removeAllListeners('change');
    } else if (event === 'cancel' &&
      func === onCancel) {
      self.removeAllListeners('cancel');
    } else if (event in listeners && func === listeners[event]) {
      self.removeAllListeners(event);
    }
  }

  this.on('newListener', function (event) {
    if (event === 'change') {
      self.pull.on('change', pullChange);
      self.push.on('change', pushChange);
    } else if (event === 'cancel') {
      self.pull.on('cancel', onCancel);
      self.push.on('cancel', onCancel);
    } else if (event !== 'error' &&
      event !== 'complete' && !(event in listeners)) {
      listeners[event] = function (e) {
        self.emit(event, e);
      };
      self.pull.on(event, listeners[event]);
      self.push.on(event, listeners[event]);
    }
  });

  this.on('removeListener', function (event) {
    if (event === 'change') {
      self.pull.removeListener('change', pullChange);
      self.push.removeListener('change', pushChange);
    } else if (event === 'cancel') {
      self.pull.removeListener('cancel', onCancel);
      self.push.removeListener('cancel', onCancel);
    } else if (event in listeners) {
      if (typeof listeners[event] === 'function') {
        self.pull.removeListener(event, listeners[event]);
        self.push.removeListener(event, listeners[event]);
        delete listeners[event];
      }
    }
  });

  this.pull.on('removeListener', removal);
  this.push.on('removeListener', removal);

  var promise = utils.Promise.all([
    this.push,
    this.pull
  ]).then(function (resp) {
    var out = {
      push: resp[0],
      pull: resp[1]
    };
    self.emit('complete', out);
    if (complete) {
      complete(null, out);
    }
    self.removeAllListeners();
    return out;
  }, function (err) {
    self.cancel();
    self.emit('error', err);
    if (complete) {
      complete(err);
    }
    self.removeAllListeners();
    throw err;
  });

  this.then = function (success, err) {
    return promise.then(success, err);
  };

  this["catch"] = function (err) {
    return promise["catch"](err);
  };
}

Sync.prototype.cancel = function () {
  if (!this.canceled) {
    this.canceled = true;
    this.push.cancel();
    this.pull.cancel();
  }
};
},{"./replicate":38,"./utils":42,"events":8}],41:[function(require,module,exports){
'use strict';

module.exports = TaskQueue;

function TaskQueue() {
  this.isReady = false;
  this.failed = false;
  this.queue = [];
}

TaskQueue.prototype.execute = function () {
  var d, func;
  if (this.failed) {
    while ((d = this.queue.shift())) {
      if (typeof d === 'function') {
        d(this.failed);
        continue;
      }
      func = d.parameters[d.parameters.length - 1];
      if (typeof func === 'function') {
        func(this.failed);
      } else if (d.name === 'changes' && typeof func.complete === 'function') {
        func.complete(this.failed);
      }
    }
  } else if (this.isReady) {
    while ((d = this.queue.shift())) {

      if (typeof d === 'function') {
        d();
      } else {
        d.task = this.db[d.name].apply(this.db, d.parameters);
      }
    }
  }
};

TaskQueue.prototype.fail = function (err) {
  this.failed = err;
  this.execute();
};

TaskQueue.prototype.ready = function (db) {
  if (this.failed) {
    return false;
  } else if (arguments.length === 0) {
    return this.isReady;
  }
  this.isReady = db ? true: false;
  this.db = db;
  this.execute();
};

TaskQueue.prototype.addTask = function (name, parameters) {
  if (typeof name === 'function') {
    this.queue.push(name);
    if (this.failed) {
      this.execute();
    }
  } else {
    var task = { name: name, parameters: parameters };
    this.queue.push(task);
    if (this.failed) {
      this.execute();
    }
    return task;
  }
};

},{}],42:[function(require,module,exports){
(function (process,global){
/*jshint strict: false */
/*global chrome */
var crypto = require('crypto');
var md5 = require('md5-jkmyers');
var merge = require('./merge');
exports.extend = require('pouchdb-extend');
exports.ajax = require('./deps/ajax');
exports.createBlob = require('./deps/blob');
exports.uuid = require('./deps/uuid');
exports.getArguments = require('argsarray');
var buffer = require('./deps/buffer');
var errors = require('./deps/errors');
var EventEmitter = require('events').EventEmitter;

if (typeof global.Promise === 'function') {
  exports.Promise = global.Promise;
} else {
  exports.Promise = require('bluebird');
}
var Promise = exports.Promise;

function toObject(array) {
  var obj = {};
  array.forEach(function (item) { obj[item] = true; });
  return obj;
}
// List of top level reserved words for doc
var reservedWords = toObject([
  '_id',
  '_rev',
  '_attachments',
  '_deleted',
  '_revisions',
  '_revs_info',
  '_conflicts',
  '_deleted_conflicts',
  '_local_seq',
  '_rev_tree'
]);
exports.clone = function (obj) {
  return exports.extend(true, {}, obj);
};
exports.inherits = require('inherits');
// Determine id an ID is valid
//   - invalid IDs begin with an underescore that does not begin '_design' or 
//     '_local'
//   - any other string value is a valid id
// Returns the specific error object for each case
exports.invalidIdError = function (id) {
  if (!id) {
    return errors.MISSING_ID;
  } else if (typeof id !== 'string') {
    return errors.INVALID_ID;
  } else if (/^_/.test(id) && !(/^_(design|local)/).test(id)) {
    return errors.RESERVED_ID;
  }
};

function isChromeApp() {
  return (typeof chrome !== "undefined" &&
          typeof chrome.storage !== "undefined" &&
          typeof chrome.storage.local !== "undefined");
}

// Pretty dumb name for a function, just wraps callback calls so we dont
// to if (callback) callback() everywhere
exports.call = exports.getArguments(function (args) {
  if (!args.length) {
    return;
  }
  var fun = args.shift();
  if (typeof fun === 'function') {
    fun.apply(this, args);
  }
});

exports.isLocalId = function (id) {
  return (/^_local/).test(id);
};

// check if a specific revision of a doc has been deleted
//  - metadata: the metadata object from the doc store
//  - rev: (optional) the revision to check. defaults to winning revision
exports.isDeleted = function (metadata, rev) {
  if (!rev) {
    rev = merge.winningRev(metadata);
  }
  var dashIndex = rev.indexOf('-');
  if (dashIndex !== -1) {
    rev = rev.substring(dashIndex + 1);
  }
  var deleted = false;
  merge.traverseRevTree(metadata.rev_tree,
  function (isLeaf, pos, id, acc, opts) {
    if (id === rev) {
      deleted = !!opts.deleted;
    }
  });

  return deleted;
};

exports.filterChange = function (opts) {
  return function (change) {
    var req = {};
    var hasFilter = opts.filter && typeof opts.filter === 'function';

    req.query = opts.query_params;
    if (opts.filter && hasFilter && !opts.filter.call(this, change.doc, req)) {
      return false;
    }
    if (opts.doc_ids && opts.doc_ids.indexOf(change.id) === -1) {
      return false;
    }
    if (!opts.include_docs) {
      delete change.doc;
    } else {
      for (var att in change.doc._attachments) {
        if (change.doc._attachments.hasOwnProperty(att)) {
          change.doc._attachments[att].stub = true;
        }
      }
    }
    return true;
  };
};

// Preprocess documents, parse their revisions, assign an id and a
// revision for new writes that are missing them, etc
exports.parseDoc = function (doc, newEdits) {
  var nRevNum;
  var newRevId;
  var revInfo;
  var opts = {status: 'available'};
  if (doc._deleted) {
    opts.deleted = true;
  }

  if (newEdits) {
    if (!doc._id) {
      doc._id = exports.uuid();
    }
    newRevId = exports.uuid(32, 16).toLowerCase();
    if (doc._rev) {
      revInfo = /^(\d+)-(.+)$/.exec(doc._rev);
      if (!revInfo) {
        throw "invalid value for property '_rev'";
      }
      doc._rev_tree = [{
        pos: parseInt(revInfo[1], 10),
        ids: [revInfo[2], {status: 'missing'}, [[newRevId, opts, []]]]
      }];
      nRevNum = parseInt(revInfo[1], 10) + 1;
    } else {
      doc._rev_tree = [{
        pos: 1,
        ids : [newRevId, opts, []]
      }];
      nRevNum = 1;
    }
  } else {
    if (doc._revisions) {
      doc._rev_tree = [{
        pos: doc._revisions.start - doc._revisions.ids.length + 1,
        ids: doc._revisions.ids.reduce(function (acc, x) {
          if (acc === null) {
            return [x, opts, []];
          } else {
            return [x, {status: 'missing'}, [acc]];
          }
        }, null)
      }];
      nRevNum = doc._revisions.start;
      newRevId = doc._revisions.ids[0];
    }
    if (!doc._rev_tree) {
      revInfo = /^(\d+)-(.+)$/.exec(doc._rev);
      if (!revInfo) {
        return errors.BAD_ARG;
      }
      nRevNum = parseInt(revInfo[1], 10);
      newRevId = revInfo[2];
      doc._rev_tree = [{
        pos: parseInt(revInfo[1], 10),
        ids: [revInfo[2], opts, []]
      }];
    }
  }

  var error = exports.invalidIdError(doc._id);
  if (error) {
    return error;
  }

  doc._id = decodeURIComponent(doc._id);
  doc._rev = [nRevNum, newRevId].join('-');

  var result = {metadata : {}, data : {}};
  for (var key in doc) {
    if (doc.hasOwnProperty(key)) {
      var specialKey = key[0] === '_';
      if (specialKey && !reservedWords[key]) {
        error = errors.error(errors.DOC_VALIDATION);
        error.reason += ': ' + key;
        return error;
      } else if (specialKey && key !== '_attachments') {
        result.metadata[key.slice(1)] = doc[key];
      } else {
        result.data[key] = doc[key];
      }
    }
  }
  return result;
};

exports.isCordova = function () {
  return (typeof cordova !== "undefined" ||
          typeof PhoneGap !== "undefined" ||
          typeof phonegap !== "undefined");
};

exports.hasLocalStorage = function () {
  if (isChromeApp()) {
    return false;
  }
  try {
    return global.localStorage;
  } catch (e) {
    return false;
  }
};
exports.Changes = Changes;
exports.inherits(Changes, EventEmitter);
function Changes() {
  if (!(this instanceof Changes)) {
    return new Changes();
  }
  var self = this;
  EventEmitter.call(this);
  this.isChrome = isChromeApp();
  this.listeners = {};
  this.hasLocal = false;
  if (!this.isChrome) {
    this.hasLocal = exports.hasLocalStorage();
  }
  if (this.isChrome) {
    chrome.storage.onChanged.addListener(function (e) {
      // make sure it's event addressed to us
      if (e.db_name != null) {
        //object only has oldValue, newValue members
        self.emit(e.dbName.newValue);
      }
    });
  } else if (this.hasLocal) {
    if (global.addEventListener) {
      global.addEventListener("storage", function (e) {
        self.emit(e.key);
      });
    } else {
      global.attachEvent("storage", function (e) {
        self.emit(e.key);
      });
    }
  }

}
Changes.prototype.addListener = function (dbName, id, db, opts) {
  if (this.listeners[id]) {
    return;
  }
  function eventFunction() {
    db.changes({
      include_docs: opts.include_docs,
      conflicts: opts.conflicts,
      continuous: false,
      descending: false,
      filter: opts.filter,
      view: opts.view,
      since: opts.since,
      query_params: opts.query_params,
      onChange: function (c) {
        if (c.seq > opts.since && !opts.cancelled) {
          opts.since = c.seq;
          exports.call(opts.onChange, c);
        }
      }
    });
  }
  this.listeners[id] = eventFunction;
  this.on(dbName, eventFunction);
};

Changes.prototype.removeListener = function (dbName, id) {
  if (!(id in this.listeners)) {
    return;
  }
  EventEmitter.prototype.removeListener.call(this, dbName,
    this.listeners[id]);
};


Changes.prototype.notifyLocalWindows = function (dbName) {
  //do a useless change on a storage thing
  //in order to get other windows's listeners to activate
  if (this.isChrome) {
    chrome.storage.local.set({dbName: dbName});
  } else if (this.hasLocal) {
    localStorage[dbName] = (localStorage[dbName] === "a") ? "b" : "a";
  }
};

Changes.prototype.notify = function (dbName) {
  this.emit(dbName);
  this.notifyLocalWindows(dbName);
};

if (!process.browser || !('atob' in global)) {
  exports.atob = function (str) {
    var base64 = new buffer(str, 'base64');
    // Node.js will just skip the characters it can't encode instead of
    // throwing and exception
    if (base64.toString('base64') !== str) {
      throw ("Cannot base64 encode full string");
    }
    return base64.toString('binary');
  };
} else {
  exports.atob = function (str) {
    return atob(str);
  };
}

if (!process.browser || !('btoa' in global)) {
  exports.btoa = function (str) {
    return new buffer(str, 'binary').toString('base64');
  };
} else {
  exports.btoa = function (str) {
    return btoa(str);
  };
}

// From http://stackoverflow.com/questions/14967647/ (continues on next line)
// encode-decode-image-with-base64-breaks-image (2013-04-21)
exports.fixBinary = function (bin) {
  if (!process.browser) {
    // don't need to do this in Node
    return bin;
  }

  var length = bin.length;
  var buf = new ArrayBuffer(length);
  var arr = new Uint8Array(buf);
  for (var i = 0; i < length; i++) {
    arr[i] = bin.charCodeAt(i);
  }
  return buf;
};

exports.once = function (fun) {
  var called = false;
  return exports.getArguments(function (args) {
    if (called) {
      if (typeof console.trace === 'function') {
        console.trace();
      }
      throw new Error('once called  more than once');
    } else {
      called = true;
      fun.apply(this, args);
    }
  });
};

exports.toPromise = function (func) {
  //create the function we will be returning
  return exports.getArguments(function (args) {
    var self = this;
    var tempCB =
      (typeof args[args.length - 1] === 'function') ? args.pop() : false;
    // if the last argument is a function, assume its a callback
    var usedCB;
    if (tempCB) {
      // if it was a callback, create a new callback which calls it,
      // but do so async so we don't trap any errors
      usedCB = function (err, resp) {
        process.nextTick(function () {
          tempCB(err, resp);
        });
      };
    }
    var promise = new Promise(function (fulfill, reject) {
      var resp;
      try {
        var callback = exports.once(function (err, mesg) {
          if (err) {
            reject(err);
          } else {
            fulfill(mesg);
          }
        });
        // create a callback for this invocation
        // apply the function in the orig context
        args.push(callback);
        resp = func.apply(self, args);
        if (resp && typeof resp.then === 'function') {
          fulfill(resp);
        }
      } catch (e) {
        reject(e);
      }
    });
    // if there is a callback, call it back
    if (usedCB) {
      promise.then(function (result) {
        usedCB(null, result);
      }, usedCB);
    }
    promise.cancel = function () {
      return this;
    };
    return promise;
  });
};

exports.adapterFun = function (name, callback) {
  return exports.toPromise(exports.getArguments(function (args) {
    if (this._closed) {
      return Promise.reject(new Error('database is closed'));
    }
    var self = this;
    if (!this.taskqueue.isReady) {
      return new exports.Promise(function (fulfill, reject) {
        self.taskqueue.addTask(function (failed) {
          if (failed) {
            reject(failed);
          } else {
            fulfill(self[name].apply(self, args));
          }
        });
      });
    }
    return callback.apply(this, args);
  }));
};
//Can't find original post, but this is close
//http://stackoverflow.com/questions/6965107/ (continues on next line)
//converting-between-strings-and-arraybuffers
exports.arrayBufferToBinaryString = function (buffer) {
  var binary = "";
  var bytes = new Uint8Array(buffer);
  var length = bytes.byteLength;
  for (var i = 0; i < length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return binary;
};

exports.cancellableFun = function (fun, self, opts) {

  opts = opts ? exports.clone(true, {}, opts) : {};

  var emitter = new EventEmitter();
  var oldComplete = opts.complete || function () { };
  var complete = opts.complete = exports.once(function (err, resp) {
    if (err) {
      oldComplete(err);
    } else {
      emitter.emit('end', resp);
      oldComplete(null, resp);
    }
    emitter.removeAllListeners();
  });
  var oldOnChange = opts.onChange || function () {};
  var lastChange = 0;
  self.on('destroyed', function () {
    emitter.removeAllListeners();
  });
  opts.onChange = function (change) {
    oldOnChange(change);
    if (change.seq <= lastChange) {
      return;
    }
    lastChange = change.seq;
    emitter.emit('change', change);
    if (change.deleted) {
      emitter.emit('delete', change);
    } else if (change.changes.length === 1 &&
      change.changes[0].rev.slice(0, 1) === '1-') {
      emitter.emit('create', change);
    } else {
      emitter.emit('update', change);
    }
  };
  var promise = new Promise(function (fulfill, reject) {
    opts.complete = function (err, res) {
      if (err) {
        reject(err);
      } else {
        fulfill(res);
      }
    };
  });

  promise.then(function (result) {
    complete(null, result);
  }, complete);

  // this needs to be overwridden by caller, dont fire complete until
  // the task is ready
  promise.cancel = function () {
    promise.isCancelled = true;
    if (self.taskqueue.isReady) {
      opts.complete(null, {status: 'cancelled'});
    }
  };

  if (!self.taskqueue.isReady) {
    self.taskqueue.addTask(function () {
      if (promise.isCancelled) {
        opts.complete(null, {status: 'cancelled'});
      } else {
        fun(self, opts, promise);
      }
    });
  } else {
    fun(self, opts, promise);
  }
  promise.on = emitter.on.bind(emitter);
  promise.once = emitter.once.bind(emitter);
  promise.addListener = emitter.addListener.bind(emitter);
  promise.removeListener = emitter.removeListener.bind(emitter);
  promise.removeAllListeners = emitter.removeAllListeners.bind(emitter);
  promise.setMaxListeners = emitter.setMaxListeners.bind(emitter);
  promise.listeners = emitter.listeners.bind(emitter);
  promise.emit = emitter.emit.bind(emitter);
  return promise;
};
exports.Crypto = {};
exports.MD5 = exports.Crypto.MD5 = function (string) {
  if (!process.browser) {
    return crypto.createHash('md5').update(string).digest('hex');
  } else {
    return md5(string);
  }
};

}).call(this,require("JkpR2F"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./deps/ajax":29,"./deps/blob":30,"./deps/buffer":4,"./deps/errors":31,"./deps/uuid":33,"./merge":37,"JkpR2F":10,"argsarray":44,"bluebird":49,"crypto":4,"events":8,"inherits":45,"md5-jkmyers":63,"pouchdb-extend":64}],43:[function(require,module,exports){
module.exports = "2.2.3";

},{}],44:[function(require,module,exports){
'use strict';

module.exports = argsArray;

function argsArray(fun) {
  return function () {
    var len = arguments.length;
    if (len) {
      var args = [];
      var i = -1;
      while (++i < len) {
        args[i] = arguments[i];
      }
      return fun.call(this, args);
    } else {
      return fun.call(this, []);
    }
  };
}
},{}],45:[function(require,module,exports){
module.exports=require(9)
},{}],46:[function(require,module,exports){
'use strict';

module.exports = INTERNAL;

function INTERNAL() {}
},{}],47:[function(require,module,exports){
'use strict';
var Promise = require('./promise');
var reject = require('./reject');
var resolve = require('./resolve');
var INTERNAL = require('./INTERNAL');
var handlers = require('./handlers');
var noArray = reject(new TypeError('must be an array'));
module.exports = function all(iterable) {
  if (Object.prototype.toString.call(iterable) !== '[object Array]') {
    return noArray;
  }

  var len = iterable.length;
  var called = false;
  if (!len) {
    return resolve([]);
  }

  var values = new Array(len);
  var resolved = 0;
  var i = -1;
  var promise = new Promise(INTERNAL);
  
  while (++i < len) {
    allResolver(iterable[i], i);
  }
  return promise;
  function allResolver(value, i) {
    resolve(value).then(resolveFromAll, function (error) {
      if (!called) {
        called = true;
        handlers.reject(promise, error);
      }
    });
    function resolveFromAll(outValue) {
      values[i] = outValue;
      if (++resolved === len & !called) {
        called = true;
        handlers.resolve(promise, values);
      }
    }
  }
};
},{"./INTERNAL":46,"./handlers":48,"./promise":50,"./reject":52,"./resolve":53}],48:[function(require,module,exports){
'use strict';
var tryCatch = require('./tryCatch');
var resolveThenable = require('./resolveThenable');
var states = require('./states');

exports.resolve = function (self, value) {
  var result = tryCatch(getThen, value);
  if (result.status === 'error') {
    return exports.reject(self, result.value);
  }
  var thenable = result.value;

  if (thenable) {
    resolveThenable.safely(self, thenable);
  } else {
    self.state = states.FULFILLED;
    self.outcome = value;
    var i = -1;
    var len = self.queue.length;
    while (++i < len) {
      self.queue[i].callFulfilled(value);
    }
  }
  return self;
};
exports.reject = function (self, error) {
  self.state = states.REJECTED;
  self.outcome = error;
  var i = -1;
  var len = self.queue.length;
  while (++i < len) {
    self.queue[i].callRejected(error);
  }
  return self;
};

function getThen(obj) {
  // Make sure we only access the accessor once as required by the spec
  var then = obj && obj.then;
  if (obj && typeof obj === 'object' && typeof then === 'function') {
    return function appyThen() {
      then.apply(obj, arguments);
    };
  }
}
},{"./resolveThenable":54,"./states":55,"./tryCatch":56}],49:[function(require,module,exports){
module.exports = exports = require('./promise');

exports.resolve = require('./resolve');
exports.reject = require('./reject');
exports.all = require('./all');
},{"./all":47,"./promise":50,"./reject":52,"./resolve":53}],50:[function(require,module,exports){
'use strict';

var unwrap = require('./unwrap');
var INTERNAL = require('./INTERNAL');
var resolveThenable = require('./resolveThenable');
var states = require('./states');
var QueueItem = require('./queueItem');

module.exports = Promise;
function Promise(resolver) {
  if (!(this instanceof Promise)) {
    return new Promise(resolver);
  }
  if (typeof resolver !== 'function') {
    throw new TypeError('reslover must be a function');
  }
  this.state = states.PENDING;
  this.queue = [];
  this.outcome = void 0;
  if (resolver !== INTERNAL) {
    resolveThenable.safely(this, resolver);
  }
}

Promise.prototype['catch'] = function (onRejected) {
  return this.then(null, onRejected);
};
Promise.prototype.then = function (onFulfilled, onRejected) {
  if (typeof onFulfilled !== 'function' && this.state === states.FULFILLED ||
    typeof onRejected !== 'function' && this.state === states.REJECTED) {
    return this;
  }
  var promise = new Promise(INTERNAL);

  
  if (this.state !== states.PENDING) {
    var resolver = this.state === states.FULFILLED ? onFulfilled: onRejected;
    unwrap(promise, resolver, this.outcome);
  } else {
    this.queue.push(new QueueItem(promise, onFulfilled, onRejected));
  }

  return promise;
};

},{"./INTERNAL":46,"./queueItem":51,"./resolveThenable":54,"./states":55,"./unwrap":57}],51:[function(require,module,exports){
'use strict';
var handlers = require('./handlers');
var unwrap = require('./unwrap');

module.exports = QueueItem;
function QueueItem(promise, onFulfilled, onRejected) {
  this.promise = promise;
  if (typeof onFulfilled === 'function') {
    this.onFulfilled = onFulfilled;
    this.callFulfilled = this.otherCallFulfilled;
  }
  if (typeof onRejected === 'function') {
    this.onRejected = onRejected;
    this.callRejected = this.otherCallRejected;
  }
}
QueueItem.prototype.callFulfilled = function (value) {
  handlers.resolve(this.promise, value);
};
QueueItem.prototype.otherCallFulfilled = function (value) {
  unwrap(this.promise, this.onFulfilled, value);
};
QueueItem.prototype.callRejected = function (value) {
  handlers.reject(this.promise, value);
};
QueueItem.prototype.otherCallRejected = function (value) {
  unwrap(this.promise, this.onRejected, value);
};
},{"./handlers":48,"./unwrap":57}],52:[function(require,module,exports){
'use strict';

var Promise = require('./promise');
var INTERNAL = require('./INTERNAL');
var handlers = require('./handlers');
module.exports = reject;

function reject(reason) {
	var promise = new Promise(INTERNAL);
	return handlers.reject(promise, reason);
}
},{"./INTERNAL":46,"./handlers":48,"./promise":50}],53:[function(require,module,exports){
'use strict';

var Promise = require('./promise');
var INTERNAL = require('./INTERNAL');
var handlers = require('./handlers');
module.exports = resolve;

var FALSE = handlers.resolve(new Promise(INTERNAL), false);
var NULL = handlers.resolve(new Promise(INTERNAL), null);
var UNDEFINED = handlers.resolve(new Promise(INTERNAL), void 0);
var ZERO = handlers.resolve(new Promise(INTERNAL), 0);
var EMPTYSTRING = handlers.resolve(new Promise(INTERNAL), '');

function resolve(value) {
  if (value) {
    if (value instanceof Promise) {
      return value;
    }
    return handlers.resolve(new Promise(INTERNAL), value);
  }
  var valueType = typeof value;
  switch (valueType) {
    case 'boolean':
      return FALSE;
    case 'undefined':
      return UNDEFINED;
    case 'object':
      return NULL;
    case 'number':
      return ZERO;
    case 'string':
      return EMPTYSTRING;
  }
}
},{"./INTERNAL":46,"./handlers":48,"./promise":50}],54:[function(require,module,exports){
'use strict';
var handlers = require('./handlers');
var tryCatch = require('./tryCatch');
function safelyResolveThenable(self, thenable) {
  // Either fulfill, reject or reject with error
  var called = false;
  function onError(value) {
    if (called) {
      return;
    }
    called = true;
    handlers.reject(self, value);
  }

  function onSuccess(value) {
    if (called) {
      return;
    }
    called = true;
    handlers.resolve(self, value);
  }

  function tryToUnwrap() {
    thenable(onSuccess, onError);
  }
  
  var result = tryCatch(tryToUnwrap);
  if (result.status === 'error') {
    onError(result.value);
  }
}
exports.safely = safelyResolveThenable;
},{"./handlers":48,"./tryCatch":56}],55:[function(require,module,exports){
// Lazy man's symbols for states

exports.REJECTED = ['REJECTED'];
exports.FULFILLED = ['FULFILLED'];
exports.PENDING = ['PENDING'];
},{}],56:[function(require,module,exports){
'use strict';

module.exports = tryCatch;

function tryCatch(func, value) {
  var out = {};
  try {
    out.value = func(value);
    out.status = 'success';
  } catch (e) {
    out.status = 'error';
    out.value = e;
  }
  return out;
}
},{}],57:[function(require,module,exports){
'use strict';

var immediate = require('immediate');
var handlers = require('./handlers');
module.exports = unwrap;

function unwrap(promise, func, value) {
  immediate(function () {
    var returnValue;
    try {
      returnValue = func(value);
    } catch (e) {
      return handlers.reject(promise, e);
    }
    if (returnValue === promise) {
      handlers.reject(promise, new TypeError('Cannot resolve promise with itself'));
    } else {
      handlers.resolve(promise, returnValue);
    }
  });
}
},{"./handlers":48,"immediate":58}],58:[function(require,module,exports){
'use strict';
var types = [
  require('./nextTick'),
  require('./mutation.js'),
  require('./messageChannel'),
  require('./stateChange'),
  require('./timeout')
];
var draining;
var queue = [];
function drainQueue() {
  draining = true;
  var i, oldQueue;
  var len = queue.length;
  while (len) {
    oldQueue = queue;
    queue = [];
    i = -1;
    while (++i < len) {
      oldQueue[i]();
    }
    len = queue.length;
  }
  draining = false;
}
var scheduleDrain;
var i = -1;
var len = types.length;
while (++ i < len) {
  if (types[i] && types[i].test && types[i].test()) {
    scheduleDrain = types[i].install(drainQueue);
    break;
  }
}
module.exports = immediate;
function immediate(task) {
  if (queue.push(task) === 1 && !draining) {
    scheduleDrain();
  }
}
},{"./messageChannel":59,"./mutation.js":60,"./nextTick":4,"./stateChange":61,"./timeout":62}],59:[function(require,module,exports){
(function (global){
'use strict';

exports.test = function () {
  if (global.setImmediate) {
    // we can only get here in IE10
    // which doesn't handel postMessage well
    return false;
  }
  return typeof global.MessageChannel !== 'undefined';
};

exports.install = function (func) {
  var channel = new global.MessageChannel();
  channel.port1.onmessage = func;
  return function () {
    channel.port2.postMessage(0);
  };
};
}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],60:[function(require,module,exports){
(function (global){
'use strict';
//based off rsvp https://github.com/tildeio/rsvp.js
//license https://github.com/tildeio/rsvp.js/blob/master/LICENSE
//https://github.com/tildeio/rsvp.js/blob/master/lib/rsvp/asap.js

var Mutation = global.MutationObserver || global.WebKitMutationObserver;

exports.test = function () {
  return Mutation;
};

exports.install = function (handle) {
  var called = 0;
  var observer = new Mutation(handle);
  var element = global.document.createTextNode('');
  observer.observe(element, {
    characterData: true
  });
  return function () {
    element.data = (called = ++called % 2);
  };
};
}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],61:[function(require,module,exports){
(function (global){
'use strict';

exports.test = function () {
  return 'document' in global && 'onreadystatechange' in global.document.createElement('script');
};

exports.install = function (handle) {
  return function () {

    // Create a <script> element; its readystatechange event will be fired asynchronously once it is inserted
    // into the document. Do so, thus queuing up the task. Remember to clean up once it's been called.
    var scriptEl = global.document.createElement('script');
    scriptEl.onreadystatechange = function () {
      handle();

      scriptEl.onreadystatechange = null;
      scriptEl.parentNode.removeChild(scriptEl);
      scriptEl = null;
    };
    global.document.documentElement.appendChild(scriptEl);

    return handle;
  };
};
}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],62:[function(require,module,exports){
'use strict';
exports.test = function () {
  return true;
};

exports.install = function (t) {
  return function () {
    setTimeout(t, 0);
  };
};
},{}],63:[function(require,module,exports){
!function(a,b){"function"==typeof define&&define.amd?define(b):"object"==typeof exports?module.exports=b():a.md5=b()}(this,function(){function a(a,b){var g=a[0],h=a[1],i=a[2],j=a[3];g=c(g,h,i,j,b[0],7,-680876936),j=c(j,g,h,i,b[1],12,-389564586),i=c(i,j,g,h,b[2],17,606105819),h=c(h,i,j,g,b[3],22,-1044525330),g=c(g,h,i,j,b[4],7,-176418897),j=c(j,g,h,i,b[5],12,1200080426),i=c(i,j,g,h,b[6],17,-1473231341),h=c(h,i,j,g,b[7],22,-45705983),g=c(g,h,i,j,b[8],7,1770035416),j=c(j,g,h,i,b[9],12,-1958414417),i=c(i,j,g,h,b[10],17,-42063),h=c(h,i,j,g,b[11],22,-1990404162),g=c(g,h,i,j,b[12],7,1804603682),j=c(j,g,h,i,b[13],12,-40341101),i=c(i,j,g,h,b[14],17,-1502002290),h=c(h,i,j,g,b[15],22,1236535329),g=d(g,h,i,j,b[1],5,-165796510),j=d(j,g,h,i,b[6],9,-1069501632),i=d(i,j,g,h,b[11],14,643717713),h=d(h,i,j,g,b[0],20,-373897302),g=d(g,h,i,j,b[5],5,-701558691),j=d(j,g,h,i,b[10],9,38016083),i=d(i,j,g,h,b[15],14,-660478335),h=d(h,i,j,g,b[4],20,-405537848),g=d(g,h,i,j,b[9],5,568446438),j=d(j,g,h,i,b[14],9,-1019803690),i=d(i,j,g,h,b[3],14,-187363961),h=d(h,i,j,g,b[8],20,1163531501),g=d(g,h,i,j,b[13],5,-1444681467),j=d(j,g,h,i,b[2],9,-51403784),i=d(i,j,g,h,b[7],14,1735328473),h=d(h,i,j,g,b[12],20,-1926607734),g=e(g,h,i,j,b[5],4,-378558),j=e(j,g,h,i,b[8],11,-2022574463),i=e(i,j,g,h,b[11],16,1839030562),h=e(h,i,j,g,b[14],23,-35309556),g=e(g,h,i,j,b[1],4,-1530992060),j=e(j,g,h,i,b[4],11,1272893353),i=e(i,j,g,h,b[7],16,-155497632),h=e(h,i,j,g,b[10],23,-1094730640),g=e(g,h,i,j,b[13],4,681279174),j=e(j,g,h,i,b[0],11,-358537222),i=e(i,j,g,h,b[3],16,-722521979),h=e(h,i,j,g,b[6],23,76029189),g=e(g,h,i,j,b[9],4,-640364487),j=e(j,g,h,i,b[12],11,-421815835),i=e(i,j,g,h,b[15],16,530742520),h=e(h,i,j,g,b[2],23,-995338651),g=f(g,h,i,j,b[0],6,-198630844),j=f(j,g,h,i,b[7],10,1126891415),i=f(i,j,g,h,b[14],15,-1416354905),h=f(h,i,j,g,b[5],21,-57434055),g=f(g,h,i,j,b[12],6,1700485571),j=f(j,g,h,i,b[3],10,-1894986606),i=f(i,j,g,h,b[10],15,-1051523),h=f(h,i,j,g,b[1],21,-2054922799),g=f(g,h,i,j,b[8],6,1873313359),j=f(j,g,h,i,b[15],10,-30611744),i=f(i,j,g,h,b[6],15,-1560198380),h=f(h,i,j,g,b[13],21,1309151649),g=f(g,h,i,j,b[4],6,-145523070),j=f(j,g,h,i,b[11],10,-1120210379),i=f(i,j,g,h,b[2],15,718787259),h=f(h,i,j,g,b[9],21,-343485551),a[0]=l(g,a[0]),a[1]=l(h,a[1]),a[2]=l(i,a[2]),a[3]=l(j,a[3])}function b(a,b,c,d,e,f){return b=l(l(b,a),l(d,f)),l(b<<e|b>>>32-e,c)}function c(a,c,d,e,f,g,h){return b(c&d|~c&e,a,c,f,g,h)}function d(a,c,d,e,f,g,h){return b(c&e|d&~e,a,c,f,g,h)}function e(a,c,d,e,f,g,h){return b(c^d^e,a,c,f,g,h)}function f(a,c,d,e,f,g,h){return b(d^(c|~e),a,c,f,g,h)}function g(b){txt="";var c,d=b.length,e=[1732584193,-271733879,-1732584194,271733878];for(c=64;c<=b.length;c+=64)a(e,h(b.substring(c-64,c)));b=b.substring(c-64);var f=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];for(c=0;c<b.length;c++)f[c>>2]|=b.charCodeAt(c)<<(c%4<<3);if(f[c>>2]|=128<<(c%4<<3),c>55)for(a(e,f),c=0;16>c;c++)f[c]=0;return f[14]=8*d,a(e,f),e}function h(a){var b,c=[];for(b=0;64>b;b+=4)c[b>>2]=a.charCodeAt(b)+(a.charCodeAt(b+1)<<8)+(a.charCodeAt(b+2)<<16)+(a.charCodeAt(b+3)<<24);return c}function i(a){for(var b="",c=0;4>c;c++)b+=m[a>>8*c+4&15]+m[a>>8*c&15];return b}function j(a){for(var b=0;b<a.length;b++)a[b]=i(a[b]);return a.join("")}function k(a){return j(g(a))}function l(a,b){return a+b&4294967295}function l(a,b){var c=(65535&a)+(65535&b),d=(a>>16)+(b>>16)+(c>>16);return d<<16|65535&c}var m="0123456789abcdef".split("");return"5d41402abc4b2a76b9719d911017c592"!=k("hello"),k});
},{}],64:[function(require,module,exports){
"use strict";

// Extends method
// (taken from http://code.jquery.com/jquery-1.9.0.js)
// Populate the class2type map
var class2type = {};

var types = [
  "Boolean", "Number", "String", "Function", "Array",
  "Date", "RegExp", "Object", "Error"
];
for (var i = 0; i < types.length; i++) {
  var typename = types[i];
  class2type["[object " + typename + "]"] = typename.toLowerCase();
}

var core_toString = class2type.toString;
var core_hasOwn = class2type.hasOwnProperty;

function type(obj) {
  if (obj === null) {
    return String(obj);
  }
  return typeof obj === "object" || typeof obj === "function" ?
    class2type[core_toString.call(obj)] || "object" :
    typeof obj;
}

function isWindow(obj) {
  return obj !== null && obj === obj.window;
}

function isPlainObject(obj) {
  // Must be an Object.
  // Because of IE, we also have to check the presence of
  // the constructor property.
  // Make sure that DOM nodes and window objects don't pass through, as well
  if (!obj || type(obj) !== "object" || obj.nodeType || isWindow(obj)) {
    return false;
  }

  try {
    // Not own constructor property must be Object
    if (obj.constructor &&
      !core_hasOwn.call(obj, "constructor") &&
      !core_hasOwn.call(obj.constructor.prototype, "isPrototypeOf")) {
      return false;
    }
  } catch ( e ) {
    // IE8,9 Will throw exceptions on certain host objects #9897
    return false;
  }

  // Own properties are enumerated firstly, so to speed up,
  // if last one is own, then all properties are own.
  var key;
  for (key in obj) {}

  return key === undefined || core_hasOwn.call(obj, key);
}


function isFunction(obj) {
  return type(obj) === "function";
}

var isArray = Array.isArray || function (obj) {
  return type(obj) === "array";
};

function extend() {
  var options, name, src, copy, copyIsArray, clone,
    target = arguments[0] || {},
    i = 1,
    length = arguments.length,
    deep = false;

  // Handle a deep copy situation
  if (typeof target === "boolean") {
    deep = target;
    target = arguments[1] || {};
    // skip the boolean and the target
    i = 2;
  }

  // Handle case when target is a string or something (possible in deep copy)
  if (typeof target !== "object" && !isFunction(target)) {
    target = {};
  }

  // extend jQuery itself if only one argument is passed
  if (length === i) {
    /* jshint validthis: true */
    target = this;
    --i;
  }

  for (; i < length; i++) {
    // Only deal with non-null/undefined values
    if ((options = arguments[i]) != null) {
      // Extend the base object
      for (name in options) {
        //if (options.hasOwnProperty(name)) {
        if (!(name in Object.prototype)) {

          src = target[name];
          copy = options[name];

          // Prevent never-ending loop
          if (target === copy) {
            continue;
          }

          // Recurse if we're merging plain objects or arrays
          if (deep && copy && (isPlainObject(copy) ||
              (copyIsArray = isArray(copy)))) {
            if (copyIsArray) {
              copyIsArray = false;
              clone = src && isArray(src) ? src : [];

            } else {
              clone = src && isPlainObject(src) ? src : {};
            }

            // Never move original objects, clone them
            target[name] = extend(deep, clone, copy);

          // Don't bring in undefined values
          } else if (copy !== undefined) {
            if (!(isArray(options) && isFunction(copy))) {
              target[name] = copy;
            }
          }
        }
      }
    }
  }

  // Return the modified object
  return target;
}


module.exports = extend;



},{}],65:[function(require,module,exports){
'use strict';

var upsert = require('./upsert');
var utils = require('./utils');
var Promise = utils.Promise;

module.exports = function (opts) {
  var sourceDB = opts.db;
  var viewName = opts.viewName;
  var mapFun = opts.map;
  var reduceFun = opts.reduce;
  var temporary = opts.temporary;

  // the "undefined" part is for backwards compatibility
  var viewSignature = mapFun.toString() + (reduceFun && reduceFun.toString()) +
    'undefined';

  if (!temporary && sourceDB._cachedViews) {
    var cachedView = sourceDB._cachedViews[viewSignature];
    if (cachedView) {
      return Promise.resolve(cachedView);
    }
  }

  return sourceDB.info().then(function (info) {

    var depDbName = info.db_name + '-mrview-' +
      (temporary ? 'temp' : utils.MD5(viewSignature));

    // save the view name in the source PouchDB so it can be cleaned up if necessary
    // (e.g. when the _design doc is deleted, remove all associated view data)
    function diffFunction(doc) {
      doc.views = doc.views || {};
      var fullViewName = viewName;
      if (fullViewName.indexOf('/') === -1) {
        fullViewName = viewName + '/' + viewName;
      }
      var depDbs = doc.views[fullViewName] = doc.views[fullViewName] || {};
      /* istanbul ignore if */
      if (depDbs[depDbName]) {
        return; // no update necessary
      }
      depDbs[depDbName] = true;
      return doc;
    }
    return upsert(sourceDB, '_local/mrviews', diffFunction).then(function () {
      return sourceDB.registerDependentDatabase(depDbName).then(function (res) {
        var db = res.db;
        db.auto_compaction = true;
        var view = {
          name: depDbName,
          db: db, 
          sourceDB: sourceDB,
          adapter: sourceDB.adapter,
          mapFun: mapFun,
          reduceFun: reduceFun
        };
        return view.db.get('_local/lastSeq')["catch"](function (err) {
          /* istanbul ignore if */
          if (err.name !== 'not_found') {
            throw err;
          }
        }).then(function (lastSeqDoc) {
          view.seq = lastSeqDoc ? lastSeqDoc.seq : 0;
          if (!temporary) {
            sourceDB._cachedViews = sourceDB._cachedViews || {};
            sourceDB._cachedViews[viewSignature] = view;
            view.db.on('destroyed', function () {
              delete sourceDB._cachedViews[viewSignature];
            });
          }
          return view;
        });
      });
    });
  });
};

},{"./upsert":72,"./utils":73}],66:[function(require,module,exports){
'use strict';

module.exports = function (func, emit, sum, log, isArray, toJSON) {
  /*jshint evil:true,unused:false */
  return eval("'use strict'; (" + func + ");");
};

},{}],67:[function(require,module,exports){
'use strict';

var pouchCollate = require('pouchdb-collate');
var TaskQueue = require('./taskqueue');
var collate = pouchCollate.collate;
var toIndexableString = pouchCollate.toIndexableString;
var normalizeKey = pouchCollate.normalizeKey;
var createView = require('./create-view');
var evalFunc = require('./evalfunc');
var log; 
/* istanbul ignore else */
if ((typeof console !== 'undefined') && (typeof console.log === 'function')) {
  log = Function.prototype.bind.call(console.log, console);
} else {
  log = function () {};
}
var utils = require('./utils');
var Promise = utils.Promise;
var mainQueue = new TaskQueue();
var tempViewQueue = new TaskQueue();
var CHANGES_BATCH_SIZE = 50;

function parseViewName(name) {
  // can be either 'ddocname/viewname' or just 'viewname'
  // (where the ddoc name is the same)
  return name.indexOf('/') === -1 ? [name, name] : name.split('/');
}

function tryCode(db, fun, args) {
  // emit an event if there was an error thrown by a map/reduce function.
  // putting try/catches in a single function also avoids deoptimizations.
  try {
    return {
      output : fun.apply(null, args)
    };
  } catch (e) {
    db.emit('error', e);
    return {error : e};
  }
}

function sortByKeyThenValue(x, y) {
  var keyCompare = collate(x.key, y.key);
  return keyCompare !== 0 ? keyCompare : collate(x.value, y.value);
}

function sliceResults(results, limit, skip) {
  skip = skip || 0;
  if (typeof limit === 'number') {
    return results.slice(skip, limit + skip);
  } else if (skip > 0) {
    return results.slice(skip);
  }
  return results;
}

function createBuiltInError(name) {
  var error = new Error('builtin ' + name +
    ' function requires map values to be numbers' +
    ' or number arrays');
  error.name = 'invalid_value';
  error.status = 500;
  return error;
}

function sum(values) {
  var result = 0;
  for (var i = 0, len = values.length; i < len; i++) {
    var num = values[i];
    if (typeof num !== 'number') {
      if (Array.isArray(num)) {
        // lists of numbers are also allowed, sum them separately
        result = typeof result === 'number' ? [result] : result;
        for (var j = 0, jLen = num.length; j < jLen; j++) {
          var jNum = num[j];
          if (typeof jNum !== 'number') {
            throw createBuiltInError('_sum');
          } else if (typeof result[j] === 'undefined') {
            result.push(jNum);
          } else {
            result[j] += jNum;
          }
        }
      } else { // not array/number
        throw createBuiltInError('_sum');
      }
    } else if (typeof result === 'number') {
      result += num;
    } else { // add number to array
      result[0] += num;
    }
  }
  return result;
}

var builtInReduce = {
  _sum: function (keys, values) {
    return sum(values);
  },

  _count: function (keys, values) {
    return values.length;
  },

  _stats: function (keys, values) {
    // no need to implement rereduce=true, because Pouch
    // will never call it
    function sumsqr(values) {
      var _sumsqr = 0;
      for (var i = 0, len = values.length; i < len; i++) {
        var num = values[i];
        _sumsqr += (num * num);
      }
      return _sumsqr;
    }
    return {
      sum     : sum(values),
      min     : Math.min.apply(null, values),
      max     : Math.max.apply(null, values),
      count   : values.length,
      sumsqr : sumsqr(values)
    };
  }
};

function addHttpParam(paramName, opts, params, asJson) {
  // add an http param from opts to params, optionally json-encoded
  var val = opts[paramName];
  if (typeof val !== 'undefined') {
    if (asJson) {
      val = encodeURIComponent(JSON.stringify(val));
    }
    params.push(paramName + '=' + val);
  }
}

function checkQueryParseError(options, fun) {
  var startkeyName = options.descending ? 'endkey' : 'startkey';
  var endkeyName = options.descending ? 'startkey' : 'endkey';

  if (typeof options[startkeyName] !== 'undefined' &&
    typeof options[endkeyName] !== 'undefined' &&
    collate(options[startkeyName], options[endkeyName]) > 0) {
    throw new QueryParseError('No rows can match your key range, reverse your ' +
        'start_key and end_key or set {descending : true}');
  } else if (fun.reduce && options.reduce !== false) {
    if (options.include_docs) {
      throw new QueryParseError('{include_docs:true} is invalid for reduce');
    } else if (options.keys && options.keys.length > 1 &&
        !options.group && !options.group_level) {
      throw new QueryParseError('Multi-key fetches for reduce views must use {group: true}');
    }
  }
  if (options.group_level) {
    if (typeof options.group_level !== 'number') {
      throw new QueryParseError('Invalid value for integer: "' + options.group_level + '"');
    }
    if (options.group_level < 0) {
      throw new QueryParseError('Invalid value for positive integer: ' +
        '"' + options.group_level + '"');
    }
  }
}

function httpQuery(db, fun, opts) {
  // List of parameters to add to the PUT request
  var params = [];
  var body;
  var method = 'GET';

  // If opts.reduce exists and is defined, then add it to the list
  // of parameters.
  // If reduce=false then the results are that of only the map function
  // not the final result of map and reduce.
  addHttpParam('reduce', opts, params);
  addHttpParam('include_docs', opts, params);
  addHttpParam('limit', opts, params);
  addHttpParam('descending', opts, params);
  addHttpParam('group', opts, params);
  addHttpParam('group_level', opts, params);
  addHttpParam('skip', opts, params);
  addHttpParam('startkey', opts, params, true);
  addHttpParam('endkey', opts, params, true);
  addHttpParam('inclusive_end', opts, params);
  addHttpParam('key', opts, params, true);

  // Format the list of parameters into a valid URI query string
  params = params.join('&');
  params = params === '' ? '' : '?' + params;

  // If keys are supplied, issue a POST request to circumvent GET query string limits
  // see http://wiki.apache.org/couchdb/HTTP_view_API#Querying_Options
  if (typeof opts.keys !== 'undefined') {
    var MAX_URL_LENGTH = 2000;
    // according to http://stackoverflow.com/a/417184/680742,
    // the de facto URL length limit is 2000 characters

    var keysAsString =
      'keys=' + encodeURIComponent(JSON.stringify(opts.keys));
    if (keysAsString.length + params.length + 1 <= MAX_URL_LENGTH) {
      // If the keys are short enough, do a GET. we do this to work around
      // Safari not understanding 304s on POSTs (see pouchdb/pouchdb#1239)
      params += (params[0] === '?' ? '&' : '?') + keysAsString;
    } else {
      method = 'POST';
      if (typeof fun === 'string') {
        body = JSON.stringify({keys: opts.keys});
      } else { // fun is {map : mapfun}, so append to this
        fun.keys = opts.keys;
      }
    }
  }

  // We are referencing a query defined in the design doc
  if (typeof fun === 'string') {
    var parts = parseViewName(fun);
    return db.request({
      method: method,
      url: '_design/' + parts[0] + '/_view/' + parts[1] + params,
      body: body
    });
  }

  // We are using a temporary view, terrible for performance but good for testing
  body = body || {};
  Object.keys(fun).forEach(function (key) {
    if (Array.isArray(fun[key])) {
      body[key] = fun[key];
    } else {
      body[key] = fun[key].toString();
    }
  });
  return db.request({
    method: 'POST',
    url: '_temp_view' + params,
    body: body
  });
}

function defaultsTo(value) {
  return function (reason) {
    /* istanbul ignore else */
    if (reason.name === 'not_found') {
      return value;
    } else {
      throw reason;
    }
  };
}

// returns a promise for a list of docs to update, based on the input docId.
// we update the metaDoc first (i.e. the doc that points from the sourceDB
// document Id to the ids of the documents in the mrview database), then
// the key/value docs.  that way, if lightning strikes the user's computer
// in the middle of an update, we don't write any docs that we wouldn't
// be able to find later using the metaDoc.
function getDocsToPersist(docId, view, docIdsToEmits) {
  var metaDocId = '_local/doc_' + docId;
  return view.db.get(metaDocId)[
    "catch"](defaultsTo({_id: metaDocId, keys: []}))
    .then(function (metaDoc) {
      return view.db.allDocs({
        keys: metaDoc.keys,
        include_docs: true
      }).then(function (res) {
          var kvDocs = res.rows.map(function (row) {
            return row.doc;
          }).filter(function (row) {
              return row;
            });

          var indexableKeysToKeyValues = docIdsToEmits[docId];
          var oldKeysMap = {};
          kvDocs.forEach(function (kvDoc) {
            oldKeysMap[kvDoc._id] = true;
            kvDoc._deleted = !indexableKeysToKeyValues[kvDoc._id];
            if (!kvDoc._deleted) {
              kvDoc.value = indexableKeysToKeyValues[kvDoc._id];
            }
          });

          var newKeys = Object.keys(indexableKeysToKeyValues);
          newKeys.forEach(function (key) {
            if (!oldKeysMap[key]) {
              // new doc
              kvDocs.push({
                _id: key,
                value: indexableKeysToKeyValues[key]
              });
            }
          });
          metaDoc.keys = utils.uniq(newKeys.concat(metaDoc.keys));
          kvDocs.splice(0, 0, metaDoc);

          return kvDocs;
        });
    });
}

// updates all emitted key/value docs and metaDocs in the mrview database
// for the given batch of documents from the source database
function saveKeyValues(view, docIdsToEmits, seq) {
  var seqDocId = '_local/lastSeq';
  return view.db.get(seqDocId)[
  "catch"](defaultsTo({_id: seqDocId, seq: 0}))
  .then(function (lastSeqDoc) {
    var docIds = Object.keys(docIdsToEmits);
    return Promise.all(docIds.map(function (docId) {
        return getDocsToPersist(docId, view, docIdsToEmits);
      })).then(function (listOfDocsToPersist) {
        var docsToPersist = [];
        listOfDocsToPersist.forEach(function (docList) {
          docsToPersist = docsToPersist.concat(docList);
        });

        // update the seq doc last, so that if a meteor strikes the user's
        // computer in the middle of an update, we can apply the idempotent
        // batch update operation again
        lastSeqDoc.seq = seq;
        docsToPersist.push(lastSeqDoc);

        return view.db.bulkDocs({docs : docsToPersist});
      });
  });
}

var updateView = utils.sequentialize(mainQueue, function (view) {
  // bind the emit function once
  var mapResults;
  var doc;

  function emit(key, value) {
    mapResults.push({
      id  : doc._id,
      key : normalizeKey(key),
      value : normalizeKey(value)
    });
  }

  var mapFun;
  // for temp_views one can use emit(doc, emit), see #38
  if (typeof view.mapFun === "function" && view.mapFun.length === 2) {
    var origMap = view.mapFun;
    mapFun = function (doc) {
      return origMap(doc, emit);
    };
  } else {
    mapFun = evalFunc(view.mapFun.toString(), emit, sum, log, Array.isArray, JSON.parse);
  }

  var currentSeq = view.seq || 0;

  function processChange(docIdsToEmits, seq) {
    return function () {
      return saveKeyValues(view, docIdsToEmits, seq);
    };
  }
  var queue = new TaskQueue();
  // TODO(neojski): https://github.com/daleharvey/pouchdb/issues/1521

  return new Promise(function (resolve, reject) {

    function complete() {
      queue.finish().then(function () {
        view.seq = currentSeq;
        resolve();
      });
    }

    function processNextBatch() {
      view.sourceDB.changes({
        conflicts: true,
        include_docs: true,
        since : currentSeq,
        limit : CHANGES_BATCH_SIZE
      }).on('complete', function (response) {
        var results = response.results;
        if (!results.length) {
          return complete();
        }
        var docIdsToEmits = {};
        for (var i = 0, l = results.length; i < l; i++) {
          var change = results[i];
          if (change.doc._id[0] !== '_') {
            mapResults = [];
            doc = change.doc;

            if (!doc._deleted) {
              tryCode(view.sourceDB, mapFun, [doc]);
            }
            mapResults.sort(sortByKeyThenValue);

            var indexableKeysToKeyValues = {};
            for (var j = 0, jl = mapResults.length; j < jl; j++) {
              var obj = mapResults[j];
              var indexableKey = toIndexableString([obj.key, obj.id, j]);
              indexableKeysToKeyValues[indexableKey] = obj;
            }
            docIdsToEmits[change.doc._id] = indexableKeysToKeyValues;
          }
          currentSeq = change.seq;
        }
        queue.add(processChange(docIdsToEmits, currentSeq));
        if (results.length < CHANGES_BATCH_SIZE) {
          return complete();
        }
        return processNextBatch();
      }).on('error', onError);
      /* istanbul ignore next */
      function onError(err) {
        reject(err);
      }
    }
    processNextBatch();
  });
});

function reduceView(view, results, options) {
  if (options.group_level === 0) {
    delete options.group_level;
  }

  var shouldGroup = options.group || options.group_level;

  var reduceFun;
  if (builtInReduce[view.reduceFun]) {
    reduceFun = builtInReduce[view.reduceFun];
  } else {
    reduceFun = evalFunc(
      view.reduceFun.toString(), null, sum, log, Array.isArray, JSON.parse);
  }

  var groups = [];
  var lvl = options.group_level;
  results.forEach(function (e) {
    var last = groups[groups.length - 1];
    var key = shouldGroup ? e.key : null;

    // only set group_level for array keys
    if (shouldGroup && Array.isArray(key) && typeof lvl === 'number') {
      key = key.length > lvl ? key.slice(0, lvl) : key;
    }

    if (last && collate(last.key[0][0], key) === 0) {
      last.key.push([key, e.id]);
      last.value.push(e.value);
      return;
    }
    groups.push({key: [
      [key, e.id]
    ], value: [e.value]});
  });
  for (var i = 0, len = groups.length; i < len; i++) {
    var e = groups[i];
    var reduceTry = tryCode(view.sourceDB, reduceFun, [e.key, e.value, false]);
    // CouchDB typically just sets the value to null if reduce errors out
    e.value = reduceTry.error ? null : reduceTry.output;
    e.key = e.key[0][0];
  }
  // no total_rows/offset when reducing
  return {rows: sliceResults(groups, options.limit, options.skip)};
}

var queryView = utils.sequentialize(mainQueue, function (view, opts) {
  var totalRows;
  var shouldReduce = view.reduceFun && opts.reduce !== false;
  var skip = opts.skip || 0;
  if (typeof opts.keys !== 'undefined' && !opts.keys.length) {
    // equivalent query
    opts.limit = 0;
    delete opts.keys;
  }

  function fetchFromView(viewOpts) {
    viewOpts.include_docs = true;
    return view.db.allDocs(viewOpts).then(function (res) {
      totalRows = res.total_rows;
      return res.rows.map(function (result) {
        return result.doc.value;
      });
    });
  }

  function onMapResultsReady(results) {
    var res;
    if (shouldReduce) {
      res = reduceView(view, results, opts);
    } else {
      res = {
        total_rows: totalRows,
        offset: skip,
        rows: results
      };
    }
    if (opts.include_docs) {
      var getDocsPromises = results.map(function (row) {
        var val = row.value;
        var docId = (val && typeof val === 'object' && val._id) || row.id;
        return view.sourceDB.get(docId).then(function (joinedDoc) {
          row.doc = joinedDoc;
        }, function () {
          // document error = don't join
        });
      });
      return Promise.all(getDocsPromises).then(function () {
        return res;
      });
    } else {
      return res;
    }
  }

  var flatten = function (array) {
    return array.reduce(function (prev, cur) {
      return prev.concat(cur);
    });
  };

  if (typeof opts.keys !== 'undefined') {
    var keys = opts.keys;
    var fetchPromises = keys.map(function (key) {
      var viewOpts = {
        startkey : toIndexableString([key]),
        endkey   : toIndexableString([key, {}])
      };
      return fetchFromView(viewOpts);
    });
    return Promise.all(fetchPromises).then(flatten).then(onMapResultsReady);
  } else { // normal query, no 'keys'
    var viewOpts = {
      descending : opts.descending
    };
    if (typeof opts.startkey !== 'undefined') {
      viewOpts.startkey = opts.descending ?
        toIndexableString([opts.startkey, {}]) :
        toIndexableString([opts.startkey]);
    }
    if (typeof opts.endkey !== 'undefined') {
      var inclusiveEnd = opts.inclusive_end !== false;
      if (opts.descending) {
        inclusiveEnd = !inclusiveEnd;
      }

      viewOpts.endkey = toIndexableString(inclusiveEnd ? [opts.endkey, {}] : [opts.endkey]);
    }
    if (typeof opts.key !== 'undefined') {
      var keyStart = toIndexableString([opts.key]);
      var keyEnd = toIndexableString([opts.key, {}]);
      if (viewOpts.descending) {
        viewOpts.endkey = keyStart;
        viewOpts.startkey = keyEnd;
      } else {
        viewOpts.startkey = keyStart;
        viewOpts.endkey = keyEnd;
      }
    }
    if (!shouldReduce) {
      if (typeof opts.limit === 'number') {
        viewOpts.limit = opts.limit;
      }
      viewOpts.skip = skip;
    }
    return fetchFromView(viewOpts).then(onMapResultsReady);
  }
});

function httpViewCleanup(db) {
  return db.request({
    method: 'POST',
    url: '_view_cleanup'
  });
}

var localViewCleanup = utils.sequentialize(mainQueue, function (db) {
  return db.get('_local/mrviews').then(function (metaDoc) {
    var docsToViews = {};
    Object.keys(metaDoc.views).forEach(function (fullViewName) {
      var parts = parseViewName(fullViewName);
      var designDocName = '_design/' + parts[0];
      var viewName = parts[1];
      docsToViews[designDocName] = docsToViews[designDocName] || {};
      docsToViews[designDocName][viewName] = true;
    });
    var opts = {
      keys : Object.keys(docsToViews),
      include_docs : true
    };
    return db.allDocs(opts).then(function (res) {
      var viewsToStatus = {};
      res.rows.forEach(function (row) {
        var ddocName = row.key.substring(8);
        Object.keys(docsToViews[row.key]).forEach(function (viewName) {
          var fullViewName = ddocName + '/' + viewName;
          /* istanbul ignore if */
          if (!metaDoc.views[fullViewName]) {
            // new format, without slashes, to support PouchDB 2.2.0
            // migration test in pouchdb's browser.migration.js verifies this
            fullViewName = viewName;
          }
          var viewDBNames = Object.keys(metaDoc.views[fullViewName]);
          // design doc deleted, or view function nonexistent
          var statusIsGood = row.doc && row.doc.views && row.doc.views[viewName];
          viewDBNames.forEach(function (viewDBName) {
            viewsToStatus[viewDBName] = viewsToStatus[viewDBName] || statusIsGood;
          });
        });
      });
      var dbsToDelete = Object.keys(viewsToStatus).filter(function (viewDBName) {
        return !viewsToStatus[viewDBName];
      });
      var destroyPromises = dbsToDelete.map(function (viewDBName) {
        return db.constructor.destroy(viewDBName, {adapter : db.adapter});
      });
      return Promise.all(destroyPromises).then(function () {
        return {ok: true};
      });
    });
  }, defaultsTo({ok: true}));
});

exports.viewCleanup = utils.callbackify(function () {
  var db = this;
  if (db.type() === 'http') {
    return httpViewCleanup(db);
  }
  return localViewCleanup(db);
});

function queryPromised(db, fun, opts) {
  if (db.type() === 'http') {
    return httpQuery(db, fun, opts);
  }

  if (typeof fun !== 'string') {
    // temp_view
    checkQueryParseError(opts, fun);

    var createViewOpts = {
      db : db,
      viewName : 'temp_view/temp_view',
      map : fun.map,
      reduce : fun.reduce,
      temporary : true
    };
    tempViewQueue.add(function () {
      return createView(createViewOpts).then(function (view) {
        function cleanup() {
          return view.db.destroy();
        }
        return utils.fin(updateView(view).then(function () {
          return queryView(view, opts);
        }), cleanup);
      });
    });
    return tempViewQueue.finish();
  } else {
    // persistent view
    var fullViewName = fun;
    var parts = parseViewName(fullViewName);
    var designDocName = parts[0];
    var viewName = parts[1];
    return db.get('_design/' + designDocName).then(function (doc) {
      var fun = doc.views && doc.views[viewName];

      if (!fun || typeof fun.map !== 'string') {
        var error = new Error('ddoc ' + designDocName + ' has no view named ' +
          viewName);
        error.name = 'not_found';
        error.status = 400;
        throw error;
      }
      checkQueryParseError(opts, fun);

      var createViewOpts = {
        db : db,
        viewName : fullViewName,
        map : fun.map,
        reduce : fun.reduce
      };
      return createView(createViewOpts).then(function (view) {
        if (opts.stale === 'ok' || opts.stale === 'update_after') {
          if (opts.stale === 'update_after') {
            updateView(view);
          }
          return queryView(view, opts);
        } else { // stale not ok
          return updateView(view).then(function () {
            return queryView(view, opts);
          });
        }
      });
    });
  }
}

exports.query = function (fun, opts, callback) {
  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  }
  opts = utils.extend({}, opts);

  if (typeof fun === 'function') {
    fun = {map : fun};
  }

  var db = this;
  var promise = Promise.resolve().then(function () {
    return queryPromised(db, fun, opts);
  });
  utils.promisedCallback(promise, callback);
  return promise;
};

function QueryParseError(message) {
  this.status = 400;
  this.name = 'query_parse_error';
  this.message = message;
  this.error = true;
  try {
    Error.captureStackTrace(this, QueryParseError);
  } catch (e) {}
}

utils.inherits(QueryParseError, Error);

},{"./create-view":65,"./evalfunc":66,"./taskqueue":71,"./utils":73,"pouchdb-collate":69}],68:[function(require,module,exports){
var hasOwn = Object.prototype.hasOwnProperty;
var toString = Object.prototype.toString;
var undefined;

var isPlainObject = function isPlainObject(obj) {
	"use strict";
	if (!obj || toString.call(obj) !== '[object Object]' || obj.nodeType || obj.setInterval) {
		return false;
	}

	var has_own_constructor = hasOwn.call(obj, 'constructor');
	var has_is_property_of_method = obj.constructor && obj.constructor.prototype && hasOwn.call(obj.constructor.prototype, 'isPrototypeOf');
	// Not own constructor property must be Object
	if (obj.constructor && !has_own_constructor && !has_is_property_of_method) {
		return false;
	}

	// Own properties are enumerated firstly, so to speed up,
	// if last one is own, then all properties are own.
	var key;
	for (key in obj) {}

	return key === undefined || hasOwn.call(obj, key);
};

module.exports = function extend() {
	"use strict";
	var options, name, src, copy, copyIsArray, clone,
		target = arguments[0],
		i = 1,
		length = arguments.length,
		deep = false;

	// Handle a deep copy situation
	if (typeof target === "boolean") {
		deep = target;
		target = arguments[1] || {};
		// skip the boolean and the target
		i = 2;
	} else if (typeof target !== "object" && typeof target !== "function" || target == undefined) {
			target = {};
	}

	for (; i < length; ++i) {
		// Only deal with non-null/undefined values
		if ((options = arguments[i]) != null) {
			// Extend the base object
			for (name in options) {
				src = target[name];
				copy = options[name];

				// Prevent never-ending loop
				if (target === copy) {
					continue;
				}

				// Recurse if we're merging plain objects or arrays
				if (deep && copy && (isPlainObject(copy) || (copyIsArray = Array.isArray(copy)))) {
					if (copyIsArray) {
						copyIsArray = false;
						clone = src && Array.isArray(src) ? src : [];
					} else {
						clone = src && isPlainObject(src) ? src : {};
					}

					// Never move original objects, clone them
					target[name] = extend(deep, clone, copy);

				// Don't bring in undefined values
				} else if (copy !== undefined) {
					target[name] = copy;
				}
			}
		}
	}

	// Return the modified object
	return target;
};


},{}],69:[function(require,module,exports){
'use strict';

var MIN_MAGNITUDE = -324; // verified by -Number.MIN_VALUE
var MAGNITUDE_DIGITS = 3; // ditto
var SEP = ''; // set to '_' for easier debugging 

var utils = require('./utils');

exports.collate = function (a, b) {

  if (a === b) {
    return 0;
  }

  a = exports.normalizeKey(a);
  b = exports.normalizeKey(b);

  var ai = collationIndex(a);
  var bi = collationIndex(b);
  if ((ai - bi) !== 0) {
    return ai - bi;
  }
  if (a === null) {
    return 0;
  }
  switch (typeof a) {
    case 'number':
      return a - b;
    case 'boolean':
      return a === b ? 0 : (a < b ? -1 : 1);
    case 'string':
      return stringCollate(a, b);
  }
  return Array.isArray(a) ? arrayCollate(a, b) : objectCollate(a, b);
};

// couch considers null/NaN/Infinity/-Infinity === undefined,
// for the purposes of mapreduce indexes. also, dates get stringified.
exports.normalizeKey = function (key) {
  switch (typeof key) {
    case 'undefined':
      return null;
    case 'number':
      if (key === Infinity || key === -Infinity || isNaN(key)) {
        return null;
      }
      return key;
    case 'object':
      var origKey = key;
      if (Array.isArray(key)) {
        var len = key.length;
        key = new Array(len);
        for (var i = 0; i < len; i++) {
          key[i] = exports.normalizeKey(origKey[i]);
        }
      } else if (key instanceof Date) {
        return key.toJSON();
      } else if (key !== null) { // generic object
        key = {};
        for (var k in origKey) {
          if (origKey.hasOwnProperty(k)) {
            var val = origKey[k];
            if (typeof val !== 'undefined') {
              key[k] = exports.normalizeKey(val);
            }
          }
        }
      }
  }
  return key;
};

function indexify(key) {
  if (key !== null) {
    switch (typeof key) {
      case 'boolean':
        return key ? 1 : 0;
      case 'number':
        return numToIndexableString(key);
      case 'string':
        // We've to be sure that key does not contain \u0000
        // Do order-preserving replacements:
        // 0 -> 1, 1
        // 1 -> 1, 2
        // 2 -> 2, 2
        return key
          .replace(/\u0002/g, '\u0002\u0002')
          .replace(/\u0001/g, '\u0001\u0002')
          .replace(/\u0000/g, '\u0001\u0001');
      case 'object':
        var isArray = Array.isArray(key);
        var arr = isArray ? key : Object.keys(key);
        var i = -1;
        var len = arr.length;
        var result = '';
        if (isArray) {
          while (++i < len) {
            result += exports.toIndexableString(arr[i]);
          }
        } else {
          while (++i < len) {
            var objKey = arr[i];
            result += exports.toIndexableString(objKey) +
                exports.toIndexableString(key[objKey]);
          }
        }
        return result;
    }
  }
  return '';
}

// convert the given key to a string that would be appropriate
// for lexical sorting, e.g. within a database, where the
// sorting is the same given by the collate() function.
exports.toIndexableString = function (key) {
  var zero = '\u0000';
  key = exports.normalizeKey(key);
  return collationIndex(key) + SEP + indexify(key) + zero;
};

function arrayCollate(a, b) {
  var len = Math.min(a.length, b.length);
  for (var i = 0; i < len; i++) {
    var sort = exports.collate(a[i], b[i]);
    if (sort !== 0) {
      return sort;
    }
  }
  return (a.length === b.length) ? 0 :
    (a.length > b.length) ? 1 : -1;
}
function stringCollate(a, b) {
  // See: https://github.com/daleharvey/pouchdb/issues/40
  // This is incompatible with the CouchDB implementation, but its the
  // best we can do for now
  return (a === b) ? 0 : ((a > b) ? 1 : -1);
}
function objectCollate(a, b) {
  var ak = Object.keys(a), bk = Object.keys(b);
  var len = Math.min(ak.length, bk.length);
  for (var i = 0; i < len; i++) {
    // First sort the keys
    var sort = exports.collate(ak[i], bk[i]);
    if (sort !== 0) {
      return sort;
    }
    // if the keys are equal sort the values
    sort = exports.collate(a[ak[i]], b[bk[i]]);
    if (sort !== 0) {
      return sort;
    }

  }
  return (ak.length === bk.length) ? 0 :
    (ak.length > bk.length) ? 1 : -1;
}
// The collation is defined by erlangs ordered terms
// the atoms null, true, false come first, then numbers, strings,
// arrays, then objects
// null/undefined/NaN/Infinity/-Infinity are all considered null
function collationIndex(x) {
  var id = ['boolean', 'number', 'string', 'object'];
  var idx = id.indexOf(typeof x);
  //false if -1 otherwise true, but fast!!!!1
  if (~idx) {
    if (x === null) {
      return 1;
    }
    if (Array.isArray(x)) {
      return 5;
    }
    return idx < 3 ? (idx + 2) : (idx + 3);
  }
  if (Array.isArray(x)) {
    return 5;
  }
}

// conversion:
// x yyy zz...zz
// x = 0 for negative, 1 for 0, 2 for positive
// y = exponent (for negative numbers negated) moved so that it's >= 0
// z = mantisse
function numToIndexableString(num) {

  if (num === 0) {
    return '1';
  }

  // convert number to exponential format for easier and
  // more succinct string sorting
  var expFormat = num.toExponential().split(/e\+?/);
  var magnitude = parseInt(expFormat[1], 10);

  var neg = num < 0;

  var result = neg ? '0' : '2';

  // first sort by magnitude
  // it's easier if all magnitudes are positive
  var magForComparison = ((neg ? -magnitude : magnitude) - MIN_MAGNITUDE);
  var magString = utils.padLeft((magForComparison).toString(), '0', MAGNITUDE_DIGITS);

  result += SEP + magString;

  // then sort by the factor
  var factor = Math.abs(parseFloat(expFormat[0])); // [1..10)
  if (neg) { // for negative reverse ordering
    factor = 10 - factor;
  }

  var factorStr = factor.toFixed(20);

  // strip zeros from the end
  factorStr = factorStr.replace(/\.?0+$/, '');

  result += SEP + factorStr;

  return result;
}

},{"./utils":70}],70:[function(require,module,exports){
'use strict';

function pad(str, padWith, upToLength) {
  var padding = '';
  var targetLength = upToLength - str.length;
  while (padding.length < targetLength) {
    padding += padWith;
  }
  return padding;
}

exports.padLeft = function (str, padWith, upToLength) {
  var padding = pad(str, padWith, upToLength);
  return padding + str;
};

exports.padRight = function (str, padWith, upToLength) {
  var padding = pad(str, padWith, upToLength);
  return str + padding;
};

exports.stringLexCompare = function (a, b) {

  var aLen = a.length;
  var bLen = b.length;

  var i;
  for (i = 0; i < aLen; i++) {
    if (i === bLen) {
      // b is shorter substring of a
      return 1;
    }
    var aChar = a.charAt(i);
    var bChar = b.charAt(i);
    if (aChar !== bChar) {
      return aChar < bChar ? -1 : 1;
    }
  }

  if (aLen < bLen) {
    // a is shorter substring of b
    return -1;
  }

  return 0;
};

/*
 * returns the decimal form for the given integer, i.e. writes
 * out all the digits (in base-10) instead of using scientific notation
 */
exports.intToDecimalForm = function (int) {

  var isNeg = int < 0;
  var result = '';

  do {
    var remainder = isNeg ? -Math.ceil(int % 10) : Math.floor(int % 10);

    result = remainder + result;
    int = isNeg ? Math.ceil(int / 10) : Math.floor(int / 10);
  } while (int);


  if (isNeg && result !== '0') {
    result = '-' + result;
  }

  return result;
};
},{}],71:[function(require,module,exports){
'use strict';
/*
 * Simple task queue to sequentialize actions. Assumes callbacks will eventually fire (once).
 */

var Promise = require('./utils').Promise;

function TaskQueue() {
  this.promise = new Promise(function (fulfill) {fulfill(); });
}
TaskQueue.prototype.add = function (promiseFactory) {
  this.promise = this.promise["catch"](function () {
    // just recover
  }).then(function () {
    return promiseFactory();
  });
  return this.promise;
};
TaskQueue.prototype.finish = function () {
  return this.promise;
};

module.exports = TaskQueue;

},{"./utils":73}],72:[function(require,module,exports){
'use strict';
var Promise = require('./utils').Promise;

// this is essentially the "update sugar" function from daleharvey/pouchdb#1388
// the diffFun tells us what delta to apply to the doc.  it either returns
// the doc, or false if it doesn't need to do an update after all
function upsert(db, docId, diffFun) {
  return new Promise(function (fulfill, reject) {
    if (docId && typeof docId === 'object') {
      docId = docId._id;
    }
    if (typeof docId !== 'string') {
      return reject(new Error('doc id is required'));
    }

    db.get(docId, function (err, doc) {
      if (err) {
        if (err.name !== 'not_found') {
          return reject(err);
        }
        return fulfill(tryAndPut(db, diffFun({_id : docId}), diffFun));
      }
      var newDoc = diffFun(doc);
      if (!newDoc) {
        return fulfill(doc);
      }
      fulfill(tryAndPut(db, newDoc, diffFun));
    });
  });
}

function tryAndPut(db, doc, diffFun) {
  return db.put(doc)["catch"](function (err) {
    if (err.name !== 'conflict') {
      throw err;
    }
    return upsert(db, doc, diffFun);
  });
}

module.exports = upsert;

},{"./utils":73}],73:[function(require,module,exports){
(function (process,global){
'use strict';
/* istanbul ignore if */
if (typeof global.Promise === 'function') {
  exports.Promise = global.Promise;
} else {
  exports.Promise = require('lie');
}
// uniquify a list, similar to underscore's _.uniq
exports.uniq = function (arr) {
  var map = {};
  arr.forEach(function (element) {
    map[element] = true;
  });
  return Object.keys(map);
};

exports.inherits = require('inherits');
exports.extend = require('extend');
var argsarray = require('argsarray');

exports.promisedCallback = function (promise, callback) {
  if (callback) {
    promise.then(function (res) {
      process.nextTick(function () {
        callback(null, res);
      });
    }, function (reason) {
      process.nextTick(function () {
        callback(reason);
      });
    });
  }
  return promise;
};

exports.callbackify = function (fun) {
  return argsarray(function (args) {
    var cb = args.pop();
    var promise = fun.apply(this, args);
    if (typeof cb === 'function') {
      exports.promisedCallback(promise, cb);
    }
    return promise;
  });
};

// Promise finally util similar to Q.finally
exports.fin = function (promise, cb) {
  return promise.then(function (res) {
    var promise2 = cb();
    if (typeof promise2.then === 'function') {
      return promise2.then(function () {
        return res;
      });
    }
    return res;
  }, function (reason) {
    var promise2 = cb();
    if (typeof promise2.then === 'function') {
      return promise2.then(function () {
        throw reason;
      });
    }
    throw reason;
  });
};

exports.sequentialize = function (queue, promiseFactory) {
  return function () {
    var args = arguments;
    var that = this;
    return queue.add(function () {
      return promiseFactory.apply(that, args);
    });
  };
};

var crypto = require('crypto');
var md5 = require('md5-jkmyers');

exports.MD5 = function (string) {
  /* istanbul ignore else */
  if (!process.browser) {
    return crypto.createHash('md5').update(string).digest('hex');
  } else {
    return md5(string);
  }
};
}).call(this,require("JkpR2F"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"JkpR2F":10,"argsarray":44,"crypto":4,"extend":68,"inherits":45,"lie":49,"md5-jkmyers":63}],74:[function(require,module,exports){
"use strict";
var Promise = require("./rsvp/promise")["default"];
var EventTarget = require("./rsvp/events")["default"];
var denodeify = require("./rsvp/node")["default"];
var all = require("./rsvp/all")["default"];
var allSettled = require("./rsvp/all-settled")["default"];
var race = require("./rsvp/race")["default"];
var hash = require("./rsvp/hash")["default"];
var hashSettled = require("./rsvp/hash-settled")["default"];
var rethrow = require("./rsvp/rethrow")["default"];
var defer = require("./rsvp/defer")["default"];
var config = require("./rsvp/config").config;
var configure = require("./rsvp/config").configure;
var map = require("./rsvp/map")["default"];
var resolve = require("./rsvp/resolve")["default"];
var reject = require("./rsvp/reject")["default"];
var filter = require("./rsvp/filter")["default"];
var asap = require("./rsvp/asap")["default"];

config.async = asap; // default async is asap;

function async(callback, arg) {
  config.async(callback, arg);
}

function on() {
  config.on.apply(config, arguments);
}

function off() {
  config.off.apply(config, arguments);
}

// Set up instrumentation through `window.__PROMISE_INTRUMENTATION__`
if (typeof window !== 'undefined' && typeof window.__PROMISE_INSTRUMENTATION__ === 'object') {
  var callbacks = window.__PROMISE_INSTRUMENTATION__;
  configure('instrument', true);
  for (var eventName in callbacks) {
    if (callbacks.hasOwnProperty(eventName)) {
      on(eventName, callbacks[eventName]);
    }
  }
}

exports.Promise = Promise;
exports.EventTarget = EventTarget;
exports.all = all;
exports.allSettled = allSettled;
exports.race = race;
exports.hash = hash;
exports.hashSettled = hashSettled;
exports.rethrow = rethrow;
exports.defer = defer;
exports.denodeify = denodeify;
exports.configure = configure;
exports.on = on;
exports.off = off;
exports.resolve = resolve;
exports.reject = reject;
exports.async = async;
exports.map = map;
exports.filter = filter;
},{"./rsvp/all":77,"./rsvp/all-settled":76,"./rsvp/asap":78,"./rsvp/config":79,"./rsvp/defer":80,"./rsvp/events":82,"./rsvp/filter":83,"./rsvp/hash":85,"./rsvp/hash-settled":84,"./rsvp/map":87,"./rsvp/node":88,"./rsvp/promise":90,"./rsvp/race":96,"./rsvp/reject":97,"./rsvp/resolve":98,"./rsvp/rethrow":99}],75:[function(require,module,exports){
'use strict';
var objectOrFunction = require('./utils').objectOrFunction;
var isFunction = require('./utils').isFunction;
var now = require('./utils').now;
var instrument = require('./instrument')['default'];
var config = require('./config').config;
function noop() {
}
var PENDING = void 0;
var FULFILLED = 1;
var REJECTED = 2;
var GET_THEN_ERROR = new ErrorObject();
function getThen(promise) {
    try {
        return promise.then;
    } catch (error) {
        GET_THEN_ERROR.error = error;
        return GET_THEN_ERROR;
    }
}
function tryThen(then, value, fulfillmentHandler, rejectionHandler) {
    try {
        then.call(value, fulfillmentHandler, rejectionHandler);
    } catch (e) {
        return e;
    }
}
function handleForeignThenable(promise, thenable, then) {
    config.async(function (promise$2) {
        var sealed = false;
        var error = tryThen(then, thenable, function (value) {
                if (sealed) {
                    return;
                }
                sealed = true;
                if (thenable !== value) {
                    resolve(promise$2, value);
                } else {
                    fulfill(promise$2, value);
                }
            }, function (reason) {
                if (sealed) {
                    return;
                }
                sealed = true;
                reject(promise$2, reason);
            }, 'Settle: ' + (promise$2._label || ' unknown promise'));
        if (!sealed && error) {
            sealed = true;
            reject(promise$2, error);
        }
    }, promise);
}
function handleOwnThenable(promise, thenable) {
    promise._onerror = null;
    if (thenable._state === FULFILLED) {
        fulfill(promise, thenable._result);
    } else if (promise._state === REJECTED) {
        reject(promise, thenable._result);
    } else {
        subscribe(thenable, undefined, function (value) {
            if (thenable !== value) {
                resolve(promise, value);
            } else {
                fulfill(promise, value);
            }
        }, function (reason) {
            reject(promise, reason);
        });
    }
}
function handleMaybeThenable(promise, maybeThenable) {
    if (maybeThenable instanceof promise.constructor) {
        handleOwnThenable(promise, maybeThenable);
    } else {
        var then = getThen(maybeThenable);
        if (then === GET_THEN_ERROR) {
            reject(promise, GET_THEN_ERROR.error);
        } else if (then === undefined) {
            fulfill(promise, maybeThenable);
        } else if (isFunction(then)) {
            handleForeignThenable(promise, maybeThenable, then);
        } else {
            fulfill(promise, maybeThenable);
        }
    }
}
function resolve(promise, value) {
    if (promise === value) {
        fulfill(promise, value);
    } else if (objectOrFunction(value)) {
        handleMaybeThenable(promise, value);
    } else {
        fulfill(promise, value);
    }
}
function publishRejection(promise) {
    if (promise._onerror) {
        promise._onerror(promise._result);
    }
    publish(promise);
}
function fulfill(promise, value) {
    if (promise._state !== PENDING) {
        return;
    }
    promise._result = value;
    promise._state = FULFILLED;
    if (promise._subscribers.length === 0) {
        if (config.instrument) {
            instrument('fulfilled', promise);
        }
    } else {
        config.async(publish, promise);
    }
}
function reject(promise, reason) {
    if (promise._state !== PENDING) {
        return;
    }
    promise._state = REJECTED;
    promise._result = reason;
    config.async(publishRejection, promise);
}
function subscribe(parent, child, onFulfillment, onRejection) {
    var subscribers = parent._subscribers;
    var length = subscribers.length;
    parent._onerror = null;
    subscribers[length] = child;
    subscribers[length + FULFILLED] = onFulfillment;
    subscribers[length + REJECTED] = onRejection;
    if (length === 0 && parent._state) {
        config.async(publish, parent);
    }
}
function publish(promise) {
    var subscribers = promise._subscribers;
    var settled = promise._state;
    if (config.instrument) {
        instrument(settled === FULFILLED ? 'fulfilled' : 'rejected', promise);
    }
    if (subscribers.length === 0) {
        return;
    }
    var child, callback, detail = promise._result;
    for (var i = 0; i < subscribers.length; i += 3) {
        child = subscribers[i];
        callback = subscribers[i + settled];
        if (child) {
            invokeCallback(settled, child, callback, detail);
        } else {
            callback(detail);
        }
    }
    promise._subscribers.length = 0;
}
function ErrorObject() {
    this.error = null;
}
var TRY_CATCH_ERROR = new ErrorObject();
function tryCatch(callback, detail) {
    try {
        return callback(detail);
    } catch (e) {
        TRY_CATCH_ERROR.error = e;
        return TRY_CATCH_ERROR;
    }
}
function invokeCallback(settled, promise, callback, detail) {
    var hasCallback = isFunction(callback), value, error, succeeded, failed;
    if (hasCallback) {
        value = tryCatch(callback, detail);
        if (value === TRY_CATCH_ERROR) {
            failed = true;
            error = value.error;
            value = null;
        } else {
            succeeded = true;
        }
        if (promise === value) {
            reject(promise, new TypeError('A promises callback cannot return that same promise.'));
            return;
        }
    } else {
        value = detail;
        succeeded = true;
    }
    if (promise._state !== PENDING) {
    }    // noop
    else if (hasCallback && succeeded) {
        resolve(promise, value);
    } else if (failed) {
        reject(promise, error);
    } else if (settled === FULFILLED) {
        fulfill(promise, value);
    } else if (settled === REJECTED) {
        reject(promise, value);
    }
}
function initializePromise(promise, resolver) {
    try {
        resolver(function resolvePromise(value) {
            resolve(promise, value);
        }, function rejectPromise(reason) {
            reject(promise, reason);
        });
    } catch (e) {
        reject(promise, e);
    }
}
exports.noop = noop;
exports.resolve = resolve;
exports.reject = reject;
exports.fulfill = fulfill;
exports.subscribe = subscribe;
exports.publish = publish;
exports.publishRejection = publishRejection;
exports.initializePromise = initializePromise;
exports.invokeCallback = invokeCallback;
exports.FULFILLED = FULFILLED;
exports.REJECTED = REJECTED;
},{"./config":79,"./instrument":86,"./utils":100}],76:[function(require,module,exports){
'use strict';
var Enumerator = require('./enumerator')['default'];
var makeSettledResult = require('./enumerator').makeSettledResult;
var Promise = require('./promise')['default'];
var o_create = require('./utils').o_create;
function AllSettled(Constructor, entries, label) {
    this._superConstructor(Constructor, entries, false, label);
}
AllSettled.prototype = o_create(Enumerator.prototype);
AllSettled.prototype._superConstructor = Enumerator;
AllSettled.prototype._makeResult = makeSettledResult;
AllSettled.prototype._validationError = function () {
    return new Error('allSettled must be called with an array');
};
/**
  `RSVP.allSettled` is similar to `RSVP.all`, but instead of implementing
  a fail-fast method, it waits until all the promises have returned and
  shows you all the results. This is useful if you want to handle multiple
  promises' failure states together as a set.

  Returns a promise that is fulfilled when all the given promises have been
  settled. The return promise is fulfilled with an array of the states of
  the promises passed into the `promises` array argument.

  Each state object will either indicate fulfillment or rejection, and
  provide the corresponding value or reason. The states will take one of
  the following formats:

  ```javascript
  { state: 'fulfilled', value: value }
    or
  { state: 'rejected', reason: reason }
  ```

  Example:

  ```javascript
  var promise1 = RSVP.Promise.resolve(1);
  var promise2 = RSVP.Promise.reject(new Error('2'));
  var promise3 = RSVP.Promise.reject(new Error('3'));
  var promises = [ promise1, promise2, promise3 ];

  RSVP.allSettled(promises).then(function(array){
    // array == [
    //   { state: 'fulfilled', value: 1 },
    //   { state: 'rejected', reason: Error },
    //   { state: 'rejected', reason: Error }
    // ]
    // Note that for the second item, reason.message will be "2", and for the
    // third item, reason.message will be "3".
  }, function(error) {
    // Not run. (This block would only be called if allSettled had failed,
    // for instance if passed an incorrect argument type.)
  });
  ```

  @method allSettled
  @static
  @for RSVP
  @param {Array} promises
  @param {String} label - optional string that describes the promise.
  Useful for tooling.
  @return {Promise} promise that is fulfilled with an array of the settled
  states of the constituent promises.
*/
exports['default'] = function allSettled(entries, label) {
    return new AllSettled(Promise, entries, label).promise;
};
},{"./enumerator":81,"./promise":90,"./utils":100}],77:[function(require,module,exports){
'use strict';
var Promise = require('./promise')['default'];
/**
  This is a convenient alias for `RSVP.Promise.all`.

  @method all
  @static
  @for RSVP
  @param {Array} array Array of promises.
  @param {String} label An optional label. This is useful
  for tooling.
*/
exports['default'] = function all(array, label) {
    return Promise.all(array, label);
};
},{"./promise":90}],78:[function(require,module,exports){
(function (process){
'use strict';
var length = 0;
exports['default'] = function asap(callback, arg) {
    queue[length] = callback;
    queue[length + 1] = arg;
    length += 2;
    if (length === 2) {
        // If length is 1, that means that we need to schedule an async flush.
        // If additional callbacks are queued before the queue is flushed, they
        // will be processed by this flush that we are scheduling.
        scheduleFlush();
    }
};
var browserGlobal = typeof window !== 'undefined' ? window : {};
var BrowserMutationObserver = browserGlobal.MutationObserver || browserGlobal.WebKitMutationObserver;
// test for web worker but not in IE10
var isWorker = typeof Uint8ClampedArray !== 'undefined' && typeof importScripts !== 'undefined' && typeof MessageChannel !== 'undefined';
// node
function useNextTick() {
    return function () {
        process.nextTick(flush);
    };
}
function useMutationObserver() {
    var iterations = 0;
    var observer = new BrowserMutationObserver(flush);
    var node = document.createTextNode('');
    observer.observe(node, { characterData: true });
    return function () {
        node.data = iterations = ++iterations % 2;
    };
}
// web worker
function useMessageChannel() {
    var channel = new MessageChannel();
    channel.port1.onmessage = flush;
    return function () {
        channel.port2.postMessage(0);
    };
}
function useSetTimeout() {
    return function () {
        setTimeout(flush, 1);
    };
}
var queue = new Array(1000);
function flush() {
    for (var i = 0; i < length; i += 2) {
        var callback = queue[i];
        var arg = queue[i + 1];
        callback(arg);
        queue[i] = undefined;
        queue[i + 1] = undefined;
    }
    length = 0;
}
var scheduleFlush;
// Decide what async method to use to triggering processing of queued callbacks:
if (typeof process !== 'undefined' && {}.toString.call(process) === '[object process]') {
    scheduleFlush = useNextTick();
} else if (BrowserMutationObserver) {
    scheduleFlush = useMutationObserver();
} else if (isWorker) {
    scheduleFlush = useMessageChannel();
} else {
    scheduleFlush = useSetTimeout();
}
}).call(this,require("JkpR2F"))
},{"JkpR2F":10}],79:[function(require,module,exports){
'use strict';
var EventTarget = require('./events')['default'];
var config = { instrument: false };
EventTarget.mixin(config);
function configure(name, value) {
    if (name === 'onerror') {
        // handle for legacy users that expect the actual
        // error to be passed to their function added via
        // `RSVP.configure('onerror', someFunctionHere);`
        config.on('error', value);
        return;
    }
    if (arguments.length === 2) {
        config[name] = value;
    } else {
        return config[name];
    }
}
exports.config = config;
exports.configure = configure;
},{"./events":82}],80:[function(require,module,exports){
'use strict';
var Promise = require('./promise')['default'];
/**
  `RSVP.defer` returns an object similar to jQuery's `$.Deferred`.
  `RSVP.defer` should be used when porting over code reliant on `$.Deferred`'s
  interface. New code should use the `RSVP.Promise` constructor instead.

  The object returned from `RSVP.defer` is a plain object with three properties:

  * promise - an `RSVP.Promise`.
  * reject - a function that causes the `promise` property on this object to
    become rejected
  * resolve - a function that causes the `promise` property on this object to
    become fulfilled.

  Example:

   ```javascript
   var deferred = RSVP.defer();

   deferred.resolve("Success!");

   defered.promise.then(function(value){
     // value here is "Success!"
   });
   ```

  @method defer
  @static
  @for RSVP
  @param {String} label optional string for labeling the promise.
  Useful for tooling.
  @return {Object}
 */
exports['default'] = function defer(label) {
    var deferred = {};
    deferred.promise = new Promise(function (resolve, reject) {
        deferred.resolve = resolve;
        deferred.reject = reject;
    }, label);
    return deferred;
};
},{"./promise":90}],81:[function(require,module,exports){
'use strict';
var isArray = require('./utils').isArray;
var isMaybeThenable = require('./utils').isMaybeThenable;
var noop = require('./-internal').noop;
var reject = require('./-internal').reject;
var fulfill = require('./-internal').fulfill;
var subscribe = require('./-internal').subscribe;
var FULFILLED = require('./-internal').FULFILLED;
var REJECTED = require('./-internal').REJECTED;
var PENDING = require('./-internal').PENDING;
var ABORT_ON_REJECTION = true;
exports.ABORT_ON_REJECTION = ABORT_ON_REJECTION;
function makeSettledResult(state, position, value) {
    if (state === FULFILLED) {
        return {
            state: 'fulfilled',
            value: value
        };
    } else {
        return {
            state: 'rejected',
            reason: value
        };
    }
}
exports.makeSettledResult = makeSettledResult;
function Enumerator(Constructor, input, abortOnReject, label) {
    this._instanceConstructor = Constructor;
    this.promise = new Constructor(noop, label);
    this._abortOnReject = abortOnReject;
    if (this._validateInput(input)) {
        this._input = input;
        this.length = input.length;
        this._remaining = input.length;
        this._init();
        if (this.length === 0) {
            fulfill(this.promise, this._result);
        } else {
            this.length = this.length || 0;
            this._enumerate();
            if (this._remaining === 0) {
                fulfill(this.promise, this._result);
            }
        }
    } else {
        reject(this.promise, this._validationError());
    }
}
Enumerator.prototype._validateInput = function (input) {
    return isArray(input);
};
Enumerator.prototype._validationError = function () {
    return new Error('Array Methods must be provided an Array');
};
Enumerator.prototype._init = function () {
    this._result = new Array(this.length);
};
exports['default'] = Enumerator;
Enumerator.prototype._enumerate = function () {
    var length = this.length;
    var promise = this.promise;
    var input = this._input;
    for (var i = 0; promise._state === PENDING && i < length; i++) {
        this._eachEntry(input[i], i);
    }
};
Enumerator.prototype._eachEntry = function (entry, i) {
    var c = this._instanceConstructor;
    if (isMaybeThenable(entry)) {
        if (entry.constructor === c && entry._state !== PENDING) {
            entry._onerror = null;
            this._settledAt(entry._state, i, entry._result);
        } else {
            this._willSettleAt(c.resolve(entry), i);
        }
    } else {
        this._remaining--;
        this._result[i] = this._makeResult(FULFILLED, i, entry);
    }
};
Enumerator.prototype._settledAt = function (state, i, value) {
    var promise = this.promise;
    if (promise._state === PENDING) {
        this._remaining--;
        if (this._abortOnReject && state === REJECTED) {
            reject(promise, value);
        } else {
            this._result[i] = this._makeResult(state, i, value);
        }
    }
    if (this._remaining === 0) {
        fulfill(promise, this._result);
    }
};
Enumerator.prototype._makeResult = function (state, i, value) {
    return value;
};
Enumerator.prototype._willSettleAt = function (promise, i) {
    var enumerator = this;
    subscribe(promise, undefined, function (value) {
        enumerator._settledAt(FULFILLED, i, value);
    }, function (reason) {
        enumerator._settledAt(REJECTED, i, reason);
    });
};
},{"./-internal":75,"./utils":100}],82:[function(require,module,exports){
'use strict';
function indexOf(callbacks, callback) {
    for (var i = 0, l = callbacks.length; i < l; i++) {
        if (callbacks[i] === callback) {
            return i;
        }
    }
    return -1;
}
function callbacksFor(object) {
    var callbacks = object._promiseCallbacks;
    if (!callbacks) {
        callbacks = object._promiseCallbacks = {};
    }
    return callbacks;
}
/**
  @class RSVP.EventTarget
*/
exports['default'] = {
    mixin: function (object) {
        object.on = this.on;
        object.off = this.off;
        object.trigger = this.trigger;
        object._promiseCallbacks = undefined;
        return object;
    },
    on: function (eventName, callback) {
        var allCallbacks = callbacksFor(this), callbacks;
        callbacks = allCallbacks[eventName];
        if (!callbacks) {
            callbacks = allCallbacks[eventName] = [];
        }
        if (indexOf(callbacks, callback) === -1) {
            callbacks.push(callback);
        }
    },
    off: function (eventName, callback) {
        var allCallbacks = callbacksFor(this), callbacks, index;
        if (!callback) {
            allCallbacks[eventName] = [];
            return;
        }
        callbacks = allCallbacks[eventName];
        index = indexOf(callbacks, callback);
        if (index !== -1) {
            callbacks.splice(index, 1);
        }
    },
    trigger: function (eventName, options) {
        var allCallbacks = callbacksFor(this), callbacks, callbackTuple, callback, binding;
        if (callbacks = allCallbacks[eventName]) {
            // Don't cache the callbacks.length since it may grow
            for (var i = 0; i < callbacks.length; i++) {
                callback = callbacks[i];
                callback(options);
            }
        }
    }
};
},{}],83:[function(require,module,exports){
'use strict';
var Promise = require('./promise')['default'];
var isFunction = require('./utils').isFunction;
var isMaybeThenable = require('./utils').isMaybeThenable;
/**
 `RSVP.filter` is similar to JavaScript's native `filter` method, except that it
  waits for all promises to become fulfilled before running the `filterFn` on
  each item in given to `promises`. `RSVP.filter` returns a promise that will
  become fulfilled with the result of running `filterFn` on the values the
  promises become fulfilled with.

  For example:

  ```javascript

  var promise1 = RSVP.resolve(1);
  var promise2 = RSVP.resolve(2);
  var promise3 = RSVP.resolve(3);

  var promises = [promise1, promise2, promise3];

  var filterFn = function(item){
    return item > 1;
  };

  RSVP.filter(promises, filterFn).then(function(result){
    // result is [ 2, 3 ]
  });
  ```

  If any of the `promises` given to `RSVP.filter` are rejected, the first promise
  that is rejected will be given as an argument to the returned promise's
  rejection handler. For example:

  ```javascript
  var promise1 = RSVP.resolve(1);
  var promise2 = RSVP.reject(new Error("2"));
  var promise3 = RSVP.reject(new Error("3"));
  var promises = [ promise1, promise2, promise3 ];

  var filterFn = function(item){
    return item > 1;
  };

  RSVP.filter(promises, filterFn).then(function(array){
    // Code here never runs because there are rejected promises!
  }, function(reason) {
    // reason.message === "2"
  });
  ```

  `RSVP.filter` will also wait for any promises returned from `filterFn`.
  For instance, you may want to fetch a list of users then return a subset
  of those users based on some asynchronous operation:

  ```javascript

  var alice = { name: 'alice' };
  var bob   = { name: 'bob' };
  var users = [ alice, bob ];

  var promises = users.map(function(user){
    return RSVP.resolve(user);
  });

  var filterFn = function(user){
    // Here, Alice has permissions to create a blog post, but Bob does not.
    return getPrivilegesForUser(user).then(function(privs){
      return privs.can_create_blog_post === true;
    });
  };
  RSVP.filter(promises, filterFn).then(function(users){
    // true, because the server told us only Alice can create a blog post.
    users.length === 1;
    // false, because Alice is the only user present in `users`
    users[0] === bob;
  });
  ```

  @method filter
  @static
  @for RSVP
  @param {Array} promises
  @param {Function} filterFn - function to be called on each resolved value to
  filter the final results.
  @param {String} label optional string describing the promise. Useful for
  tooling.
  @return {Promise}
*/
exports['default'] = function filter(promises, filterFn, label) {
    return Promise.all(promises, label).then(function (values) {
        if (!isFunction(filterFn)) {
            throw new TypeError('You must pass a function as filter\'s second argument.');
        }
        var length = values.length;
        var filtered = new Array(length);
        for (var i = 0; i < length; i++) {
            filtered[i] = filterFn(values[i]);
        }
        return Promise.all(filtered, label).then(function (filtered$2) {
            var results = new Array(length);
            var newLength = 0;
            for (var i$2 = 0; i$2 < length; i$2++) {
                if (filtered$2[i$2]) {
                    results[newLength] = values[i$2];
                    newLength++;
                }
            }
            results.length = newLength;
            return results;
        });
    });
};
},{"./promise":90,"./utils":100}],84:[function(require,module,exports){
'use strict';
var Promise = require('./promise')['default'];
var makeSettledResult = require('./enumerator').makeSettledResult;
var PromiseHash = require('./promise-hash')['default'];
var Enumerator = require('./enumerator')['default'];
var o_create = require('./utils').o_create;
function HashSettled(Constructor, object, label) {
    this._superConstructor(Constructor, object, false, label);
}
HashSettled.prototype = o_create(PromiseHash.prototype);
HashSettled.prototype._superConstructor = Enumerator;
HashSettled.prototype._makeResult = makeSettledResult;
HashSettled.prototype._validationError = function () {
    return new Error('hashSettled must be called with an object');
};
/**
  `RSVP.hashSettled` is similar to `RSVP.allSettled`, but takes an object
  instead of an array for its `promises` argument.

  Unlike `RSVP.all` or `RSVP.hash`, which implement a fail-fast method,
  but like `RSVP.allSettled`, `hashSettled` waits until all the
  constituent promises have returned and then shows you all the results
  with their states and values/reasons. This is useful if you want to
  handle multiple promises' failure states together as a set.

  Returns a promise that is fulfilled when all the given promises have been
  settled, or rejected if the passed parameters are invalid.

  The returned promise is fulfilled with a hash that has the same key names as
  the `promises` object argument. If any of the values in the object are not
  promises, they will be copied over to the fulfilled object and marked with state
  'fulfilled'.

  Example:

  ```javascript
  var promises = {
    myPromise: RSVP.Promise.resolve(1),
    yourPromise: RSVP.Promise.resolve(2),
    theirPromise: RSVP.Promise.resolve(3),
    notAPromise: 4
  };

  RSVP.hashSettled(promises).then(function(hash){
    // hash here is an object that looks like:
    // {
    //   myPromise: { state: 'fulfilled', value: 1 },
    //   yourPromise: { state: 'fulfilled', value: 2 },
    //   theirPromise: { state: 'fulfilled', value: 3 },
    //   notAPromise: { state: 'fulfilled', value: 4 }
    // }
  });
  ```

  If any of the `promises` given to `RSVP.hash` are rejected, the state will
  be set to 'rejected' and the reason for rejection provided.

  Example:

  ```javascript
  var promises = {
    myPromise: RSVP.Promise.resolve(1),
    rejectedPromise: RSVP.Promise.reject(new Error('rejection')),
    anotherRejectedPromise: RSVP.Promise.reject(new Error('more rejection')),
  };

  RSVP.hashSettled(promises).then(function(hash){
    // hash here is an object that looks like:
    // {
    //   myPromise:              { state: 'fulfilled', value: 1 },
    //   rejectedPromise:        { state: 'rejected', reason: Error },
    //   anotherRejectedPromise: { state: 'rejected', reason: Error },
    // }
    // Note that for rejectedPromise, reason.message == 'rejection',
    // and for anotherRejectedPromise, reason.message == 'more rejection'.
  });
  ```

  An important note: `RSVP.hashSettled` is intended for plain JavaScript objects that
  are just a set of keys and values. `RSVP.hashSettled` will NOT preserve prototype
  chains.

  Example:

  ```javascript
  function MyConstructor(){
    this.example = RSVP.Promise.resolve('Example');
  }

  MyConstructor.prototype = {
    protoProperty: RSVP.Promise.resolve('Proto Property')
  };

  var myObject = new MyConstructor();

  RSVP.hashSettled(myObject).then(function(hash){
    // protoProperty will not be present, instead you will just have an
    // object that looks like:
    // {
    //   example: { state: 'fulfilled', value: 'Example' }
    // }
    //
    // hash.hasOwnProperty('protoProperty'); // false
    // 'undefined' === typeof hash.protoProperty
  });
  ```

  @method hashSettled
  @for RSVP
  @param {Object} promises
  @param {String} label optional string that describes the promise.
  Useful for tooling.
  @return {Promise} promise that is fulfilled when when all properties of `promises`
  have been settled.
  @static
*/
exports['default'] = function hashSettled(object, label) {
    return new HashSettled(Promise, object, label).promise;
};
},{"./enumerator":81,"./promise":90,"./promise-hash":89,"./utils":100}],85:[function(require,module,exports){
'use strict';
var Promise = require('./promise')['default'];
var PromiseHash = require('./promise-hash')['default'];
var ABORT_ON_REJECTION = require('./enumerator').ABORT_ON_REJECTION;
/**
  `RSVP.hash` is similar to `RSVP.all`, but takes an object instead of an array
  for its `promises` argument.

  Returns a promise that is fulfilled when all the given promises have been
  fulfilled, or rejected if any of them become rejected. The returned promise
  is fulfilled with a hash that has the same key names as the `promises` object
  argument. If any of the values in the object are not promises, they will
  simply be copied over to the fulfilled object.

  Example:

  ```javascript
  var promises = {
    myPromise: RSVP.resolve(1),
    yourPromise: RSVP.resolve(2),
    theirPromise: RSVP.resolve(3),
    notAPromise: 4
  };

  RSVP.hash(promises).then(function(hash){
    // hash here is an object that looks like:
    // {
    //   myPromise: 1,
    //   yourPromise: 2,
    //   theirPromise: 3,
    //   notAPromise: 4
    // }
  });
  ````

  If any of the `promises` given to `RSVP.hash` are rejected, the first promise
  that is rejected will be given as the reason to the rejection handler.

  Example:

  ```javascript
  var promises = {
    myPromise: RSVP.resolve(1),
    rejectedPromise: RSVP.reject(new Error("rejectedPromise")),
    anotherRejectedPromise: RSVP.reject(new Error("anotherRejectedPromise")),
  };

  RSVP.hash(promises).then(function(hash){
    // Code here never runs because there are rejected promises!
  }, function(reason) {
    // reason.message === "rejectedPromise"
  });
  ```

  An important note: `RSVP.hash` is intended for plain JavaScript objects that
  are just a set of keys and values. `RSVP.hash` will NOT preserve prototype
  chains.

  Example:

  ```javascript
  function MyConstructor(){
    this.example = RSVP.resolve("Example");
  }

  MyConstructor.prototype = {
    protoProperty: RSVP.resolve("Proto Property")
  };

  var myObject = new MyConstructor();

  RSVP.hash(myObject).then(function(hash){
    // protoProperty will not be present, instead you will just have an
    // object that looks like:
    // {
    //   example: "Example"
    // }
    //
    // hash.hasOwnProperty('protoProperty'); // false
    // 'undefined' === typeof hash.protoProperty
  });
  ```

  @method hash
  @static
  @for RSVP
  @param {Object} promises
  @param {String} label optional string that describes the promise.
  Useful for tooling.
  @return {Promise} promise that is fulfilled when all properties of `promises`
  have been fulfilled, or rejected if any of them become rejected.
*/
exports['default'] = function hash(object, label) {
    return new PromiseHash(Promise, object, label).promise;
};
},{"./enumerator":81,"./promise":90,"./promise-hash":89}],86:[function(require,module,exports){
'use strict';
var config = require('./config').config;
var now = require('./utils').now;
var queue = [];
exports['default'] = function instrument(eventName, promise, child) {
    if (1 === queue.push({
            name: eventName,
            payload: {
                guid: promise._guidKey + promise._id,
                eventName: eventName,
                detail: promise._result,
                childGuid: child && promise._guidKey + child._id,
                label: promise._label,
                timeStamp: now(),
                stack: new Error(promise._label).stack
            }
        })) {
        setTimeout(function () {
            var entry;
            for (var i = 0; i < queue.length; i++) {
                entry = queue[i];
                config.trigger(entry.name, entry.payload);
            }
            queue.length = 0;
        }, 50);
    }
};
},{"./config":79,"./utils":100}],87:[function(require,module,exports){
'use strict';
var Promise = require('./promise')['default'];
var isArray = require('./utils').isArray;
var isFunction = require('./utils').isFunction;
/**
 `RSVP.map` is similar to JavaScript's native `map` method, except that it
  waits for all promises to become fulfilled before running the `mapFn` on
  each item in given to `promises`. `RSVP.map` returns a promise that will
  become fulfilled with the result of running `mapFn` on the values the promises
  become fulfilled with.

  For example:

  ```javascript

  var promise1 = RSVP.resolve(1);
  var promise2 = RSVP.resolve(2);
  var promise3 = RSVP.resolve(3);
  var promises = [ promise1, promise2, promise3 ];

  var mapFn = function(item){
    return item + 1;
  };

  RSVP.map(promises, mapFn).then(function(result){
    // result is [ 2, 3, 4 ]
  });
  ```

  If any of the `promises` given to `RSVP.map` are rejected, the first promise
  that is rejected will be given as an argument to the returned promise's
  rejection handler. For example:

  ```javascript
  var promise1 = RSVP.resolve(1);
  var promise2 = RSVP.reject(new Error("2"));
  var promise3 = RSVP.reject(new Error("3"));
  var promises = [ promise1, promise2, promise3 ];

  var mapFn = function(item){
    return item + 1;
  };

  RSVP.map(promises, mapFn).then(function(array){
    // Code here never runs because there are rejected promises!
  }, function(reason) {
    // reason.message === "2"
  });
  ```

  `RSVP.map` will also wait if a promise is returned from `mapFn`. For example,
  say you want to get all comments from a set of blog posts, but you need
  the blog posts first because they contain a url to those comments.

  ```javscript

  var mapFn = function(blogPost){
    // getComments does some ajax and returns an RSVP.Promise that is fulfilled
    // with some comments data
    return getComments(blogPost.comments_url);
  };

  // getBlogPosts does some ajax and returns an RSVP.Promise that is fulfilled
  // with some blog post data
  RSVP.map(getBlogPosts(), mapFn).then(function(comments){
    // comments is the result of asking the server for the comments
    // of all blog posts returned from getBlogPosts()
  });
  ```

  @method map
  @static
  @for RSVP
  @param {Array} promises
  @param {Function} mapFn function to be called on each fulfilled promise.
  @param {String} label optional string for labeling the promise.
  Useful for tooling.
  @return {Promise} promise that is fulfilled with the result of calling
  `mapFn` on each fulfilled promise or value when they become fulfilled.
   The promise will be rejected if any of the given `promises` become rejected.
  @static
*/
exports['default'] = function map(promises, mapFn, label) {
    return Promise.all(promises, label).then(function (values) {
        if (!isFunction(mapFn)) {
            throw new TypeError('You must pass a function as map\'s second argument.');
        }
        var length = values.length;
        var results = new Array(length);
        for (var i = 0; i < length; i++) {
            results[i] = mapFn(values[i]);
        }
        return Promise.all(results, label);
    });
};
},{"./promise":90,"./utils":100}],88:[function(require,module,exports){
'use strict';
/* global  arraySlice */
var Promise = require('./promise')['default'];
var isArray = require('./utils').isArray;
/**
  `RSVP.denodeify` takes a "node-style" function and returns a function that
  will return an `RSVP.Promise`. You can use `denodeify` in Node.js or the
  browser when you'd prefer to use promises over using callbacks. For example,
  `denodeify` transforms the following:

  ```javascript
  var fs = require('fs');

  fs.readFile('myfile.txt', function(err, data){
    if (err) return handleError(err);
    handleData(data);
  });
  ```

  into:

  ```javascript
  var fs = require('fs');
  var readFile = RSVP.denodeify(fs.readFile);

  readFile('myfile.txt').then(handleData, handleError);
  ```

  If the node function has multiple success parameters, then `denodeify`
  just returns the first one:

  ```javascript
  var request = RSVP.denodeify(require('request'));

  request('http://example.com').then(function(res) {
    // ...
  });
  ```

  However, if you need all success parameters, setting `denodeify`'s
  second parameter to `true` causes it to return all success parameters
  as an array:

  ```javascript
  var request = RSVP.denodeify(require('request'), true);

  request('http://example.com').then(function(result) {
    // result[0] -> res
    // result[1] -> body
  });
  ```

  Or if you pass it an array with names it returns the parameters as a hash:

  ```javascript
  var request = RSVP.denodeify(require('request'), ['res', 'body']);

  request('http://example.com').then(function(result) {
    // result.res
    // result.body
  });
  ```

  Sometimes you need to retain the `this`:

  ```javascript
  var app = require('express')();
  var render = RSVP.denodeify(app.render.bind(app));
  ```

  The denodified function inherits from the original function. It works in all
  environments, except IE 10 and below. Consequently all properties of the original
  function are available to you. However, any properties you change on the
  denodeified function won't be changed on the original function. Example:

  ```javascript
  var request = RSVP.denodeify(require('request')),
      cookieJar = request.jar(); // <- Inheritance is used here

  request('http://example.com', {jar: cookieJar}).then(function(res) {
    // cookieJar.cookies holds now the cookies returned by example.com
  });
  ```

  Using `denodeify` makes it easier to compose asynchronous operations instead
  of using callbacks. For example, instead of:

  ```javascript
  var fs = require('fs');

  fs.readFile('myfile.txt', function(err, data){
    if (err) { ... } // Handle error
    fs.writeFile('myfile2.txt', data, function(err){
      if (err) { ... } // Handle error
      console.log('done')
    });
  });
  ```

  you can chain the operations together using `then` from the returned promise:

  ```javascript
  var fs = require('fs');
  var readFile = RSVP.denodeify(fs.readFile);
  var writeFile = RSVP.denodeify(fs.writeFile);

  readFile('myfile.txt').then(function(data){
    return writeFile('myfile2.txt', data);
  }).then(function(){
    console.log('done')
  }).catch(function(error){
    // Handle error
  });
  ```

  @method denodeify
  @static
  @for RSVP
  @param {Function} nodeFunc a "node-style" function that takes a callback as
  its last argument. The callback expects an error to be passed as its first
  argument (if an error occurred, otherwise null), and the value from the
  operation as its second argument ("function(err, value){ }").
  @param {Boolean|Array} argumentNames An optional paramter that if set
  to `true` causes the promise to fulfill with the callback's success arguments
  as an array. This is useful if the node function has multiple success
  paramters. If you set this paramter to an array with names, the promise will
  fulfill with a hash with these names as keys and the success parameters as
  values.
  @return {Function} a function that wraps `nodeFunc` to return an
  `RSVP.Promise`
  @static
*/
exports['default'] = function denodeify(nodeFunc, argumentNames) {
    var asArray = argumentNames === true;
    var asHash = isArray(argumentNames);
    function denodeifiedFunction() {
        var length = arguments.length;
        var nodeArgs = new Array(length);
        for (var i = 0; i < length; i++) {
            nodeArgs[i] = arguments[i];
        }
        var thisArg;
        if (!asArray && !asHash && argumentNames) {
            if (typeof console === 'object') {
                console.warn('Deprecation: RSVP.denodeify() doesn\'t allow setting the ' + '"this" binding anymore. Use yourFunction.bind(yourThis) instead.');
            }
            thisArg = argumentNames;
        } else {
            thisArg = this;
        }
        return Promise.all(nodeArgs).then(function (nodeArgs$2) {
            return new Promise(resolver);
            // sweet.js has a bug, this resolver can't be defined in the constructor
            // or the arraySlice macro doesn't work
            function resolver(resolve, reject) {
                function callback() {
                    var length$2 = arguments.length;
                    var args = new Array(length$2);
                    for (var i$2 = 0; i$2 < length$2; i$2++) {
                        args[i$2] = arguments[i$2];
                    }
                    var error = args[0];
                    var value = args[1];
                    if (error) {
                        reject(error);
                    } else if (asArray) {
                        resolve(args.slice(1));
                    } else if (asHash) {
                        var obj = {};
                        var successArguments = args.slice(1);
                        var name;
                        var i$3;
                        for (i$3 = 0; i$3 < argumentNames.length; i$3++) {
                            name = argumentNames[i$3];
                            obj[name] = successArguments[i$3];
                        }
                        resolve(obj);
                    } else {
                        resolve(value);
                    }
                }
                nodeArgs$2.push(callback);
                nodeFunc.apply(thisArg, nodeArgs$2);
            }
        });
    }
    denodeifiedFunction.__proto__ = nodeFunc;
    return denodeifiedFunction;
};
},{"./promise":90,"./utils":100}],89:[function(require,module,exports){
'use strict';
var Enumerator = require('./enumerator')['default'];
var PENDING = require('./-internal').PENDING;
var FULFILLED = require('./-internal').FULFILLED;
var o_create = require('./utils').o_create;
function PromiseHash(Constructor, object, label) {
    this._superConstructor(Constructor, object, true, label);
}
exports['default'] = PromiseHash;
PromiseHash.prototype = o_create(Enumerator.prototype);
PromiseHash.prototype._superConstructor = Enumerator;
PromiseHash.prototype._init = function () {
    this._result = {};
};
PromiseHash.prototype._validateInput = function (input) {
    return input && typeof input === 'object';
};
PromiseHash.prototype._validationError = function () {
    return new Error('Promise.hash must be called with an object');
};
PromiseHash.prototype._enumerate = function () {
    var promise = this.promise;
    var input = this._input;
    var results = [];
    for (var key in input) {
        if (promise._state === PENDING && input.hasOwnProperty(key)) {
            results.push({
                position: key,
                entry: input[key]
            });
        }
    }
    var length = results.length;
    this._remaining = length;
    var result;
    for (var i = 0; promise._state === PENDING && i < length; i++) {
        result = results[i];
        this._eachEntry(result.entry, result.position);
    }
};
},{"./-internal":75,"./enumerator":81,"./utils":100}],90:[function(require,module,exports){
'use strict';
var config = require('./config').config;
var EventTarget = require('./events')['default'];
var instrument = require('./instrument')['default'];
var objectOrFunction = require('./utils').objectOrFunction;
var isFunction = require('./utils').isFunction;
var now = require('./utils').now;
var noop = require('./-internal').noop;
var resolve = require('./-internal').resolve;
var reject = require('./-internal').reject;
var fulfill = require('./-internal').fulfill;
var subscribe = require('./-internal').subscribe;
var initializePromise = require('./-internal').initializePromise;
var invokeCallback = require('./-internal').invokeCallback;
var FULFILLED = require('./-internal').FULFILLED;
var REJECTED = require('./-internal').REJECTED;
var cast = require('./promise/cast')['default'];
var all = require('./promise/all')['default'];
var race = require('./promise/race')['default'];
var Resolve = require('./promise/resolve')['default'];
var Reject = require('./promise/reject')['default'];
var guidKey = 'rsvp_' + now() + '-';
var counter = 0;
function needsResolver() {
    throw new TypeError('You must pass a resolver function as the first argument to the promise constructor');
}
function needsNew() {
    throw new TypeError('Failed to construct \'Promise\': Please use the \'new\' operator, this object constructor cannot be called as a function.');
}
exports['default'] = Promise;
/**
  Promise objects represent the eventual result of an asynchronous operation. The
  primary way of interacting with a promise is through its `then` method, which
  registers callbacks to receive either a promise’s eventual value or the reason
  why the promise cannot be fulfilled.

  Terminology
  -----------

  - `promise` is an object or function with a `then` method whose behavior conforms to this specification.
  - `thenable` is an object or function that defines a `then` method.
  - `value` is any legal JavaScript value (including undefined, a thenable, or a promise).
  - `exception` is a value that is thrown using the throw statement.
  - `reason` is a value that indicates why a promise was rejected.
  - `settled` the final resting state of a promise, fulfilled or rejected.

  A promise can be in one of three states: pending, fulfilled, or rejected.

  Promises that are fulfilled have a fulfillment value and are in the fulfilled
  state.  Promises that are rejected have a rejection reason and are in the
  rejected state.  A fulfillment value is never a thenable.

  Promises can also be said to *resolve* a value.  If this value is also a
  promise, then the original promise's settled state will match the value's
  settled state.  So a promise that *resolves* a promise that rejects will
  itself reject, and a promise that *resolves* a promise that fulfills will
  itself fulfill.


  Basic Usage:
  ------------

  ```js
  var promise = new Promise(function(resolve, reject) {
    // on success
    resolve(value);

    // on failure
    reject(reason);
  });

  promise.then(function(value) {
    // on fulfillment
  }, function(reason) {
    // on rejection
  });
  ```

  Advanced Usage:
  ---------------

  Promises shine when abstracting away asynchronous interactions such as
  `XMLHttpRequest`s.

  ```js
  function getJSON(url) {
    return new Promise(function(resolve, reject){
      var xhr = new XMLHttpRequest();

      xhr.open('GET', url);
      xhr.onreadystatechange = handler;
      xhr.responseType = 'json';
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.send();

      function handler() {
        if (this.readyState === this.DONE) {
          if (this.status === 200) {
            resolve(this.response);
          } else {
            reject(new Error("getJSON: `" + url + "` failed with status: [" + this.status + "]"));
          }
        }
      };
    });
  }

  getJSON('/posts.json').then(function(json) {
    // on fulfillment
  }, function(reason) {
    // on rejection
  });
  ```

  Unlike callbacks, promises are great composable primitives.

  ```js
  Promise.all([
    getJSON('/posts'),
    getJSON('/comments')
  ]).then(function(values){
    values[0] // => postsJSON
    values[1] // => commentsJSON

    return values;
  });
  ```

  @class RSVP.Promise
  @param {function} resolver
  @param {String} label optional string for labeling the promise.
  Useful for tooling.
  @constructor
*/
function Promise(resolver, label) {
    this._id = counter++;
    this._label = label;
    this._subscribers = [];
    if (config.instrument) {
        instrument('created', this);
    }
    if (noop !== resolver) {
        if (!isFunction(resolver)) {
            needsResolver();
        }
        if (!(this instanceof Promise)) {
            needsNew();
        }
        initializePromise(this, resolver);
    }
}
Promise.cast = cast;
Promise.all = all;
Promise.race = race;
Promise.resolve = Resolve;
Promise.reject = Reject;
Promise.prototype = {
    constructor: Promise,
    _id: undefined,
    _guidKey: guidKey,
    _label: undefined,
    _state: undefined,
    _result: undefined,
    _subscribers: undefined,
    _onerror: function (reason) {
        config.trigger('error', reason);
    },
    then: function (onFulfillment, onRejection, label) {
        var parent = this;
        var state = parent._state;
        if (state === FULFILLED && !onFulfillment || state === REJECTED && !onRejection) {
            if (config.instrument) {
                instrument('chained', this, this);
            }
            return this;
        }
        parent._onerror = null;
        var child = new this.constructor(noop, label);
        var result = parent._result;
        if (config.instrument) {
            instrument('chained', parent, child);
        }
        if (state) {
            var callback = arguments[state - 1];
            config.async(function () {
                invokeCallback(state, child, callback, result);
            });
        } else {
            subscribe(parent, child, onFulfillment, onRejection);
        }
        return child;
    },
    'catch': function (onRejection, label) {
        return this.then(null, onRejection, label);
    },
    'finally': function (callback, label) {
        var constructor = this.constructor;
        return this.then(function (value) {
            return constructor.resolve(callback()).then(function () {
                return value;
            });
        }, function (reason) {
            return constructor.resolve(callback()).then(function () {
                throw reason;
            });
        }, label);
    }
};
},{"./-internal":75,"./config":79,"./events":82,"./instrument":86,"./promise/all":91,"./promise/cast":92,"./promise/race":93,"./promise/reject":94,"./promise/resolve":95,"./utils":100}],91:[function(require,module,exports){
'use strict';
var Enumerator = require('../enumerator')['default'];
/**
  `RSVP.Promise.all` accepts an array of promises, and returns a new promise which
  is fulfilled with an array of fulfillment values for the passed promises, or
  rejected with the reason of the first passed promise to be rejected. It casts all
  elements of the passed iterable to promises as it runs this algorithm.

  Example:

  ```javascript
  var promise1 = RSVP.resolve(1);
  var promise2 = RSVP.resolve(2);
  var promise3 = RSVP.resolve(3);
  var promises = [ promise1, promise2, promise3 ];

  RSVP.Promise.all(promises).then(function(array){
    // The array here would be [ 1, 2, 3 ];
  });
  ```

  If any of the `promises` given to `RSVP.all` are rejected, the first promise
  that is rejected will be given as an argument to the returned promises's
  rejection handler. For example:

  Example:

  ```javascript
  var promise1 = RSVP.resolve(1);
  var promise2 = RSVP.reject(new Error("2"));
  var promise3 = RSVP.reject(new Error("3"));
  var promises = [ promise1, promise2, promise3 ];

  RSVP.Promise.all(promises).then(function(array){
    // Code here never runs because there are rejected promises!
  }, function(error) {
    // error.message === "2"
  });
  ```

  @method all
  @static
  @param {Array} entries array of promises
  @param {String} label optional string for labeling the promise.
  Useful for tooling.
  @return {Promise} promise that is fulfilled when all `promises` have been
  fulfilled, or rejected if any of them become rejected.
  @static
*/
exports['default'] = function all(entries, label) {
    return new Enumerator(this, entries, true, label).promise;
};
},{"../enumerator":81}],92:[function(require,module,exports){
'use strict';
var resolve = require('./resolve')['default'];
/**
  @deprecated

  `RSVP.Promise.cast` coerces its argument to a promise, or returns the
  argument if it is already a promise which shares a constructor with the caster.

  Example:

  ```javascript
  var promise = RSVP.Promise.resolve(1);
  var casted = RSVP.Promise.cast(promise);

  console.log(promise === casted); // true
  ```

  In the case of a promise whose constructor does not match, it is assimilated.
  The resulting promise will fulfill or reject based on the outcome of the
  promise being casted.

  Example:

  ```javascript
  var thennable = $.getJSON('/api/foo');
  var casted = RSVP.Promise.cast(thennable);

  console.log(thennable === casted); // false
  console.log(casted instanceof RSVP.Promise) // true

  casted.then(function(data) {
    // data is the value getJSON fulfills with
  });
  ```

  In the case of a non-promise, a promise which will fulfill with that value is
  returned.

  Example:

  ```javascript
  var value = 1; // could be a number, boolean, string, undefined...
  var casted = RSVP.Promise.cast(value);

  console.log(value === casted); // false
  console.log(casted instanceof RSVP.Promise) // true

  casted.then(function(val) {
    val === value // => true
  });
  ```

  `RSVP.Promise.cast` is similar to `RSVP.Promise.resolve`, but `RSVP.Promise.cast` differs in the
  following ways:

  * `RSVP.Promise.cast` serves as a memory-efficient way of getting a promise, when you
  have something that could either be a promise or a value. RSVP.resolve
  will have the same effect but will create a new promise wrapper if the
  argument is a promise.
  * `RSVP.Promise.cast` is a way of casting incoming thenables or promise subclasses to
  promises of the exact class specified, so that the resulting object's `then` is
  ensured to have the behavior of the constructor you are calling cast on (i.e., RSVP.Promise).

  @method cast
  @static
  @param {Object} object to be casted
  @param {String} label optional string for labeling the promise.
  Useful for tooling.
  @return {Promise} promise
*/
exports['default'] = resolve;
},{"./resolve":95}],93:[function(require,module,exports){
'use strict';
var isArray = require('../utils').isArray;
var isFunction = require('../utils').isFunction;
var isMaybeThenable = require('../utils').isMaybeThenable;
var noop = require('../-internal').noop;
var resolve = require('../-internal').resolve;
var reject = require('../-internal').reject;
var subscribe = require('../-internal').subscribe;
var PENDING = require('../-internal').PENDING;
/**
  `RSVP.Promise.race` returns a new promise which is settled in the same way as the
  first passed promise to settle.

  Example:

  ```javascript
  var promise1 = new RSVP.Promise(function(resolve, reject){
    setTimeout(function(){
      resolve("promise 1");
    }, 200);
  });

  var promise2 = new RSVP.Promise(function(resolve, reject){
    setTimeout(function(){
      resolve("promise 2");
    }, 100);
  });

  RSVP.Promise.race([promise1, promise2]).then(function(result){
    // result === "promise 2" because it was resolved before promise1
    // was resolved.
  });
  ```

  `RSVP.Promise.race` is deterministic in that only the state of the first
  settled promise matters. For example, even if other promises given to the
  `promises` array argument are resolved, but the first settled promise has
  become rejected before the other promises became fulfilled, the returned
  promise will become rejected:

  ```javascript
  var promise1 = new RSVP.Promise(function(resolve, reject){
    setTimeout(function(){
      resolve("promise 1");
    }, 200);
  });

  var promise2 = new RSVP.Promise(function(resolve, reject){
    setTimeout(function(){
      reject(new Error("promise 2"));
    }, 100);
  });

  RSVP.Promise.race([promise1, promise2]).then(function(result){
    // Code here never runs
  }, function(reason){
    // reason.message === "promise 2" because promise 2 became rejected before
    // promise 1 became fulfilled
  });
  ```

  An example real-world use case is implementing timeouts:

  ```javascript
  RSVP.Promise.race([ajax('foo.json'), timeout(5000)])
  ```

  @method race
  @static
  @param {Array} promises array of promises to observe
  @param {String} label optional string for describing the promise returned.
  Useful for tooling.
  @return {Promise} a promise which settles in the same way as the first passed
  promise to settle.
*/
exports['default'] = function race(entries, label) {
    /*jshint validthis:true */
    var Constructor = this, entry;
    var promise = new Constructor(noop, label);
    if (!isArray(entries)) {
        reject(promise, new TypeError('You must pass an array to race.'));
        return promise;
    }
    var length = entries.length;
    function onFulfillment(value) {
        resolve(promise, value);
    }
    function onRejection(reason) {
        reject(promise, reason);
    }
    for (var i = 0; promise._state === PENDING && i < length; i++) {
        subscribe(Constructor.resolve(entries[i]), undefined, onFulfillment, onRejection);
    }
    return promise;
};
},{"../-internal":75,"../utils":100}],94:[function(require,module,exports){
'use strict';
var noop = require('../-internal').noop;
var _reject = require('../-internal').reject;
/**
  `RSVP.Promise.reject` returns a promise rejected with the passed `reason`.
  It is shorthand for the following:

  ```javascript
  var promise = new RSVP.Promise(function(resolve, reject){
    reject(new Error('WHOOPS'));
  });

  promise.then(function(value){
    // Code here doesn't run because the promise is rejected!
  }, function(reason){
    // reason.message === 'WHOOPS'
  });
  ```

  Instead of writing the above, your code now simply becomes the following:

  ```javascript
  var promise = RSVP.Promise.reject(new Error('WHOOPS'));

  promise.then(function(value){
    // Code here doesn't run because the promise is rejected!
  }, function(reason){
    // reason.message === 'WHOOPS'
  });
  ```

  @method reject
  @static
  @param {Any} reason value that the returned promise will be rejected with.
  @param {String} label optional string for identifying the returned promise.
  Useful for tooling.
  @return {Promise} a promise rejected with the given `reason`.
*/
exports['default'] = function reject(reason, label) {
    /*jshint validthis:true */
    var Constructor = this;
    var promise = new Constructor(noop, label);
    _reject(promise, reason);
    return promise;
};
},{"../-internal":75}],95:[function(require,module,exports){
'use strict';
var noop = require('../-internal').noop;
var _resolve = require('../-internal').resolve;
/**
  `RSVP.Promise.resolve` returns a promise that will become resolved with the
  passed `value`. It is shorthand for the following:

  ```javascript
  var promise = new RSVP.Promise(function(resolve, reject){
    resolve(1);
  });

  promise.then(function(value){
    // value === 1
  });
  ```

  Instead of writing the above, your code now simply becomes the following:

  ```javascript
  var promise = RSVP.Promise.resolve(1);

  promise.then(function(value){
    // value === 1
  });
  ```

  @method resolve
  @static
  @param {Any} value value that the returned promise will be resolved with
  @param {String} label optional string for identifying the returned promise.
  Useful for tooling.
  @return {Promise} a promise that will become fulfilled with the given
  `value`
*/
exports['default'] = function resolve(object, label) {
    /*jshint validthis:true */
    var Constructor = this;
    if (object && typeof object === 'object' && object.constructor === Constructor) {
        return object;
    }
    var promise = new Constructor(noop, label);
    _resolve(promise, object);
    return promise;
};
},{"../-internal":75}],96:[function(require,module,exports){
'use strict';
var Promise = require('./promise')['default'];
/**
  This is a convenient alias for `RSVP.Promise.race`.

  @method race
  @static
  @for RSVP
  @param {Array} array Array of promises.
  @param {String} label An optional label. This is useful
  for tooling.
 */
exports['default'] = function race(array, label) {
    return Promise.race(array, label);
};
},{"./promise":90}],97:[function(require,module,exports){
'use strict';
var Promise = require('./promise')['default'];
/**
  This is a convenient alias for `RSVP.Promise.reject`.

  @method reject
  @static
  @for RSVP
  @param {Any} reason value that the returned promise will be rejected with.
  @param {String} label optional string for identifying the returned promise.
  Useful for tooling.
  @return {Promise} a promise rejected with the given `reason`.
*/
exports['default'] = function reject(reason, label) {
    return Promise.reject(reason, label);
};
},{"./promise":90}],98:[function(require,module,exports){
'use strict';
var Promise = require('./promise')['default'];
/**
  This is a convenient alias for `RSVP.Promise.resolve`.

  @method resolve
  @static
  @for RSVP
  @param {Any} value value that the returned promise will be resolved with
  @param {String} label optional string for identifying the returned promise.
  Useful for tooling.
  @return {Promise} a promise that will become fulfilled with the given
  `value`
*/
exports['default'] = function resolve(value, label) {
    return Promise.resolve(value, label);
};
},{"./promise":90}],99:[function(require,module,exports){
'use strict';
/**
  `RSVP.rethrow` will rethrow an error on the next turn of the JavaScript event
  loop in order to aid debugging.

  Promises A+ specifies that any exceptions that occur with a promise must be
  caught by the promises implementation and bubbled to the last handler. For
  this reason, it is recommended that you always specify a second rejection
  handler function to `then`. However, `RSVP.rethrow` will throw the exception
  outside of the promise, so it bubbles up to your console if in the browser,
  or domain/cause uncaught exception in Node. `rethrow` will also throw the
  error again so the error can be handled by the promise per the spec.

  ```javascript
  function throws(){
    throw new Error('Whoops!');
  }

  var promise = new RSVP.Promise(function(resolve, reject){
    throws();
  });

  promise.catch(RSVP.rethrow).then(function(){
    // Code here doesn't run because the promise became rejected due to an
    // error!
  }, function (err){
    // handle the error here
  });
  ```

  The 'Whoops' error will be thrown on the next turn of the event loop
  and you can watch for it in your console. You can also handle it using a
  rejection handler given to `.then` or `.catch` on the returned promise.

  @method rethrow
  @static
  @for RSVP
  @param {Error} reason reason the promise became rejected.
  @throws Error
  @static
*/
exports['default'] = function rethrow(reason) {
    setTimeout(function () {
        throw reason;
    });
    throw reason;
};
},{}],100:[function(require,module,exports){
'use strict';
function objectOrFunction(x) {
    return typeof x === 'function' || typeof x === 'object' && x !== null;
}
exports.objectOrFunction = objectOrFunction;
function isFunction(x) {
    return typeof x === 'function';
}
exports.isFunction = isFunction;
function isMaybeThenable(x) {
    return typeof x === 'object' && x !== null;
}
exports.isMaybeThenable = isMaybeThenable;
var _isArray;
if (!Array.isArray) {
    _isArray = function (x) {
        return Object.prototype.toString.call(x) === '[object Array]';
    };
} else {
    _isArray = Array.isArray;
}
var isArray = _isArray;
exports.isArray = isArray;
// Date.now is not available in browsers < IE9
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/now#Compatibility
var now = Date.now || function () {
        return new Date().getTime();
    };
exports.now = now;
var o_create = Object.create || function (object) {
        var o = function () {
        };
        o.prototype = object;
        return o;
    };
exports.o_create = o_create;
},{}],101:[function(require,module,exports){
(function (process){
var Belt = require('../../lib/adapter')

//  models
  , Board = require('../lib/models/board')
  , Card = require('../lib/models/card')
  , Pocket = require('../lib/models/pocket')
  , Region = require('../lib/models/region')
  , Wall = require('../lib/models/wall')

//  system
  , Commands = require('../lib/commands')
  , Queries = require('../lib/queries')
  , Interface = require('../lib/interface')
  , Services = require('../lib/services');

function Application( queue, options ) {
    this.options = options || {};
    if ( !process.browser ) {
        this.options.db = require('memdown');
    }

    var belt = this.belt = new Belt( 'vuu_se', this.options );

    // initialize the services
    var services = this.services = new Services( new Interface( queue ), new Commands( belt ), new Queries( belt ) );

    var factories = {
        "Board": Board
      , "Card": Card
      , "Pocket": Pocket
      , "Region": Region
      , "Wall": Wall
    };

    var listeners = [ 'created', 'updated', 'deleted' ];

    for ( var key in factories ) {
        var type = key.toLowerCase(), Model = factories[ key ];

        // register model
        belt.resource( type, Model.constructor )
            .schema( Model.schema )
            .validator( Model.validator )
            .beforeCreate( Model.onBeforeCreate )
            .beforeUpdate( Model.onBeforeUpdate );

        // listen to db for events
        attachListenersToDb( type );
    }


    function attachListenersToDb( type  ) {
        listeners.forEach(function( listener ) {
            belt.on( type + ':' + listener, function( data ) {
                queue.trigger( type + ':' + listener, data );
            });
        });
    }

    this.constructor = Application;

    // setup events to trigger services

    var listeners2 = [ 'new', 'create', 'edit', 'update', 'select', 'display', 'unlink', 'move', 'resize' ];

    for ( var x in factories ) {
        setUpEventListeners( x );
    }

    function setUpEventListeners( type ) {
        listeners2.forEach(function( task ) {
            queue.on( type + ':' + listeners, function( ev ) {
                services[ task + type ]( ev );
            });
        });
    }

    queue
        .on('board:displayed', function( board ) {
            services.displayCards( board );
            services.displayRegions( board );
        })

        .on('wall:firsttime', function( wall ) {
            services.newBoard();
        })

        ;
}

module.exports = Application;

}).call(this,require("JkpR2F"))
},{"../../lib/adapter":1,"../lib/commands":102,"../lib/interface":103,"../lib/models/board":105,"../lib/models/card":106,"../lib/models/pocket":107,"../lib/models/region":108,"../lib/models/wall":109,"../lib/queries":110,"../lib/services":112,"JkpR2F":10,"memdown":15}],102:[function(require,module,exports){
var RSVP = require('rsvp')
  , Promise = RSVP.Promise;

// Commands

function Commands( adapter ) {
    this._db = adapter;
}

Commands.prototype.createBoard = function( data ) {
    return this._db.create( 'board', data ); // --> board:created
};

Commands.prototype.updateBoard = function( data ) {
    return this._db.update( 'board', data ); // --> board:updated
};

Commands.prototype.createCard = function( data ) {
    return this._db.create( 'card', data ); // --> card:created
};

Commands.prototype.updateCard = function( data ) {
    return this._db.update( 'card', data ); // --> card:updated
};

Commands.prototype.createPocket = function( data ) {
    return this._db.create( 'pocket', data ); // --> pocket:created
};

Commands.prototype.updatePocket = function( data ) {
    return this._db.update( 'pocket', data ); // --> pocket:updated
};

Commands.prototype.createRegion = function( data ) {
    return this._db.create( 'region', data ); // --> region:created
};

Commands.prototype.updateRegion = function( data ) {
    return this._db.update( 'region', data ); // --> region:updated
};

Commands.prototype.createWall = function( data ) {
    return this._db.create( 'wall', data ); // --> wall:created
};

Commands.prototype.updateWall = function( data ) {
    return this._db.update( 'wall', data ); // --> wall:updated
};

Commands.prototype.addPocketsToBoard = function( board, pockets ) {
    var _this = this;

    var promises = pockets.map(function( pocket ) {
        return _this.createCard( board.getId(), pocket.getId() );
    });

    return RSVP.all( promises );
};

Commands.prototype.addPocketToBoards = function( boards, pocket ) {
    var _this = this;

    var promises = boards.map(function( board ) {
        return _this.createCard( board.getId(), pocket.getId() );
    });

    return RSVP.all( promises );
};

module.exports = Commands;

},{"rsvp":74}],103:[function(require,module,exports){
var RSVP = require('rsvp')
  , Promise = RSVP.Promise;

// Commands

function Interface( queue ) {
    this._queue = queue;
}

Interface.prototype.preventDefault = function( ev ) {
    return new Promise(function( resolve, reject ) {
        ev.preventDefault();

        resolve( ev );
    });
};

Interface.prototype.extractTargetId = function( ev ) {
    return this.preventDefault( ev )
        .then(function( ev ) {
            var el = ev.target;

            return el['data-target'];
        });
};

Interface.prototype.extractAddWallData = function( ev ) {
    return this.preventDefault( ev )
        .then(function( ev ) {
            var form = ev.target;

            var data = {
                name: form.name
            };

            return data;
        });
};

Interface.prototype.extractModifyWallData = function( ev ) {
    return new Promise(function( resolve, reject ) {
        var form = ev.target;

        var data = {
            id: form.id,
            name: form.name
        };

        resolve( data );
    });
};

Interface.prototype.extractAddBoardData = function( ev ) {
    return new Promise(function( resolve, reject ) {
        var form = ev.target;

        var data = {
            name: form.name,
            wall: form.wall
        };

        resolve( data );
    });
};

Interface.prototype.extractModifyBoardData = function( ev ) {
    return new Promise(function( resolve, reject ) {
        var form = ev.target;

        var data = {
            id: form.id,
            name: form.name,
            wall: form.wall
        };

        resolve( data );
    });
};

Interface.prototype.extractAddRegionData = function( ev ) {
    return new Promise(function( resolve, reject ) {
        var form = ev.target;

        var data = {
            label: form.label,
            value: form.value,
            color: form.color,
            board: form.board
        };

        resolve( data );
    });
};

Interface.prototype.extractModifyRegionData = function( ev ) {
    return new Promise(function( resolve, reject ) {
        var form = ev.target;

        var data = {
            id: form.id,
            label: form.label,
            value: form.value,
            color: form.color,
            board: form.board
        };

        resolve( data );
    });
};

Interface.prototype.extractAddPocketData = function( ev ) {
    return new Promise(function( resolve, reject ) {
        var form = ev.target;

        var data = {
            title: form.title,
            wall: form.wall
        };

        resolve( data );
    });
};

Interface.prototype.extractModifyPocketData = function( ev ) {
    return new Promise(function( resolve, reject ) {
        var form = ev.target;

        var data = {
            id: form.id,
            title: form.title,
            wall: form.wall
        };

        resolve( data );
    });
};

Interface.prototype.displayBoardSelector = function( boards ) {
    this._queue.trigger( 'boardselector:display', boards );
};

Interface.prototype.displayBoard = function( board ) {
    this._queue.trigger( 'board:display', board );
};

Interface.prototype.displayBoardCreator = function( wall ) {
    this._queue.trigger( 'boardcreator:display', { wall: wall.getId() } );
};

Interface.prototype.displayBoardEditor = function( board ) {
    this._queue.trigger( 'boardeditor:display', board );
};

Interface.prototype.addBoard = function( board ) {
    this._queue.trigger( 'board:add', board );

    this.displayBoard( board );
};

Interface.prototype.displayRegionCreator = function( board ) {
      this._queue.trigger( 'regioncreator:display', { board: board.getId() } );
};

Interface.prototype.displayRegionEditor = function( region ) {
    this._queue.trigger( 'regioneditor:display', region );
};

Interface.prototype.displayPocketCreator = function( wall ) {
    this._queue.trigger( 'pocketcreator:display', { wall: wall.getId() } );
};

Interface.prototype.displayPocketEditor = function( pocket ) {
    this._queue.trigger( 'pocketeditor:display', pocket );
};

Interface.prototype.displayWallCreator = function() {
    this._queue.trigger( 'wallcreator:display', {} );
};

Interface.prototype.displayWallEditor = function( wall ) {
    this._queue.trigger( 'walleditor:display', wall );
};

Interface.prototype.displayWallSelector = function( walls ) {
    this._queue.trigger( 'wallselector:display', walls );
};

Interface.prototype.displayWall = function( wall ) {
    this._queue.trigger( 'wall:display', wall );
};

Interface.prototype.notifyWallFirstTime = function( wall ) {
    this._queue.trigger( 'wall:firsttime', wall );
};

module.exports = Interface;

},{"rsvp":74}],104:[function(require,module,exports){
var $ = require('jquery-browserify')
  , Queue = require('./queue')
  , Application = require('./application')
  , UI = require('./ui');

var queue = new Queue();
var application = new Application( queue );
var ui = new UI( queue, $('[data-provides="ui"]') );

module.exports = queue;

},{"./application":101,"./queue":111,"./ui":113,"jquery-browserify":"UErKnN"}],105:[function(require,module,exports){


function Board( data ) {
    for ( var prop in data ) {
        if ( prop === 'links' ) continue;

        this[prop] = data[prop];
    }

    this.cards = [];
    this.regions = [];

    for ( var link in data.links ) {
        this[link] = data.links[link];
    }

    this.shelf = {};

    this.constructor = Board;
}

Board.prototype.getId = function() {
    return this.id;
};

Board.prototype.getName = function() {
    return this.name;
};

Board.prototype.getWall = function() {
    return this.wall;
};

Board.prototype.getCards = function() {
    return this.cards;
};

Board.prototype.addCard = function( card ) {
    if ( !~this.cards.indexOf( card.id ) ) {
        this.cards.push( card.id );
    }

    return this;
};

Board.prototype.getRegions = function() {
    return this.regions;
};

Board.prototype.addRegion = function( region ) {
    if ( !~this.regions.indexOf( region.id ) ) {
        this.regions.push( region.id );
    }

    return this;
};

Board.prototype.getTransforms = function() {
    return this.transforms;
};

Board.prototype.addTransform = function( transform ) {
    if ( !~this.transforms.indexOf( transform.id ) ) {
        this.transforms.push( transform.id );
    }

    return this;
};

Board.constructor = function( data ) {
    if ( data instanceof Board ) {
        return data;
    }

    return new Board( data );
};

Board.schema = {
    name: String
  , wall: 'wall'
  , cards: ['card']
  , regions: ['region']
  , transforms: ['transform']
  , createdBy: 'user'
  , createdOn: Date
  , lastModifiedBy: 'user'
  , lastModifiedOn: Date
  // , views: [ 'view' ] --> [ 'transform' ]
  // , access: [ 'right' ] --> 'user', 'group'
};

Board.validator = function( data ) {
    var validator = {
        validForUpdate: true
      , validForCreate: true
      , issues: []
    };

    if ( !data.id ) {
        validator.validForUpdate = false;
        validator.issues.push( 'ID is required' );
    }

    if ( !data.name || data.name === '' ) {
        validator.validForUpdate = validator.validForCreate = false;
        validator.issues.push( 'Name is required' );
    }

    if ( !data.wall || data.wall === '' ) {
        validator.validForUpdate = validator.validForCreate = false;
        validator.issues.push( 'Wall is required' );
    }

    return validator;
};

Board.onBeforeUpdate = function ( data ) {
    // data.lastModifiedBy = app.getCurrentUser()._id;
    data.lastModifiedOn = new Date();

    return data;
};

Board.onBeforeCreate = function( data ) {
    // data.createdBy = app.getCurrentUser()._id;
    data.createdOn = new Date();

    return data;
};

module.exports = Board;

},{}],106:[function(require,module,exports){


function Card( data ) {
    for ( var prop in data ) {
        if ( prop === 'links' ) continue;

        this[prop] = data[prop];
    }

    for ( var link in data.links ) {
        this[link] = data.links[link];
    }

    this.constructor = Card;
}

Card.prototype.getId = function() {
    return this.id;
};

Card.prototype.getPocket = function() {
    return this.pocket;
};

Card.prototype.getBoard = function() {
    return this.board;
};

Card.prototype.getPosition = function() {
    return {
        board: this.board,
        x: this.x,
        y: this.y
    };
};

Card.prototype.moveTo = function( x, y ) {
    if ( this.x !== x || this.y !== y ) {
        this.x = x;
        this.y = y;
    }

    return this;
};

Card.constructor = function( data ) {
    if ( data instanceof Card ) {
        return data;
    }

    return new Card( data );
};

Card.schema = {
    x: Number,
    y: Number,
    board: 'board',
    pocket: 'pocket'
  , createdBy: 'user'
  , createdOn: Date
  , lastModifiedBy: 'user'
  , lastModifiedOn: Date
};

Card.validator = function( data ) {
    var validator = {
        validForUpdate: true
      , validForCreate: true
      , issues: []
    };

    if ( !data.id ) {
        validator.validForUpdate = false;
        validator.issues.push( 'ID is required' );
    }

    if ( !data.pocket || data.pocket === '' ) {
        validator.validForUpdate = validator.validForCreate = false;
        validator.issues.push( 'Pocket is required' );
    }

    if ( !data.board || data.board === '' ) {
        validator.validForUpdate = validator.validForCreate = false;
        validator.issues.push( 'Board is required' );
    }

    return validator;
};

Card.onBeforeUpdate = function ( data ) {
    // data.lastModifiedBy = app.getCurrentUser()._id;
    data.lastModifiedOn = new Date();

    return data;
};

Card.onBeforeCreate = function( data ) {
    // data.createdBy = app.getCurrentUser()._id;
    data.createdOn = new Date();

    return data;
};

module.exports = Card;

},{}],107:[function(require,module,exports){


function Pocket( data ) {
    for ( var prop in data ) {
        if ( prop === 'links' ) continue;

        this[prop] = data[prop];
    }

    this.cards = [];
    this.regions = [];

    for ( var link in data.links ) {
        this[link] = data.links[link];
    }

    this.constructor = Pocket;
}

Pocket.prototype.getId = function() {
    return this.id;
};

Pocket.prototype.getTitle = function() {
    return this.title;
};

Pocket.prototype.getCardnumber = function() {
    return this.cardnumber;
};

Pocket.prototype.getContent = function() {
    return this.content;
};

Pocket.prototype.getTags = function() {
    return this.tags;
};

Pocket.prototype.getMentions = function() {
    return this.mentions;
};

Pocket.prototype.getWall = function() {
    return this.wall;
};

Pocket.prototype.getCards = function() {
    return this.cards;
};

Pocket.prototype.addCard = function( card ) {
    if ( !~this.cards.indexOf( card.id ) ) {
        this.cards.push( card.id );
    }

    return this;
};

Pocket.prototype.getRegions = function() {
    return this.regions;
};

Pocket.prototype.addRegion = function( region ) {
    if ( ~this.regions.indexOf( region.id ) ) {
        this.regions.push( region.id );
    }

    return this;
};

Pocket.constructor = function( data ) {
    if ( data instanceof Pocket ) {
        return data;
    }

    return new Pocket( data );
};

Pocket.schema = {
    title: String,
    cardnumber: Number,
    content: String,     // [ 'fragment' ]
    tags: String,        // [ 'tag' ]
    mentions: String,    // [ 'mention' ] --> 'user', 'group'
    color: String,
    wall: 'wall',
    cards: ['card'],
    regions: ['region']
    , createdBy: 'user'
    , createdOn: Date
    , lastModifiedBy: 'user'
    , lastModifiedOn: Date
};

Pocket.validator = function( data ) {
    var validator = {
        validForUpdate: true
      , validForCreate: true
      , issues: []
    };

    if ( !data.id ) {
        validator.validForUpdate = false;
        validator.issues.push( 'ID is required' );
    }

    if ( !data.title || data.title === '' ) {
        validator.validForUpdate = validator.validForCreate = false;
        validator.issues.push( 'Title is required' );
    }

    if ( !data.wall || data.wall === '' ) {
        validator.validForUpdate = validator.validForCreate = false;
        validator.issues.push( 'Wall is required' );
    }

    return validator;
};

Pocket.onBeforeUpdate = function ( data ) {
    // data.lastModifiedBy = app.getCurrentUser()._id;
    data.lastModifiedOn = new Date();

    return data;
};

Pocket.onBeforeCreate = function( data ) {
    // data.createdBy = app.getCurrentUser()._id;
    data.createdOn = new Date();

    return data;
};

module.exports = Pocket;

},{}],108:[function(require,module,exports){


function Region( data ) {
    for ( var prop in data ) {
        if ( prop === 'links' ) continue;

        this[prop] = data[prop];
    }

    this.pockets = [];

    for ( var link in data.links ) {
        this[link] = data.links[link];
    }

    this.constructor = Region;
}

Region.prototype.getId = function() {
    return this.id;
};

Region.prototype.getLabel = function() {
    return this.label;
};

Region.prototype.getColor = function() {
    return this.color;
};

Region.prototype.getValue = function() {
    return this.value;
};

Region.prototype.getBoard = function() {
    return this.board;
};

Region.prototype.getPockets = function() {
    return this.pockets;
};

Region.prototype.addPocket = function( pocket ) {
    if ( ~this.pockets.indexOf( pocket.id ) ) {
        this.pockets.push( pocket.id );
    }

    return this;
};

Region.prototype.moveTo = function( x, y ) {
    if ( this.x !== x || this.y !== y ) {
        this.x = x;
        this.y = y;
    }

    return this;
};

Region.prototype.resizeTo = function( width, height ) {
    if ( this.width !== width || this.height !== height ) {
        this.width = width;
        this.height = height;
    }

    return this;
};

Region.constructor = function( data ) {
    if ( data instanceof Region ) {
        return data;
    }

    return new Region( data );
};

Region.schema = {
    label: String
  , value: String
  , color: String
  , x: Number
  , y: Number
  , width: Number
  , height: Number
  , board: 'board'
  , pockets: ['pocket']
  , createdBy: 'user'
  , createdOn: Date
  , lastModifiedBy: 'user'
  , lastModifiedOn: Date
};

Region.validator = function( data ) {
    var validator = {
        validForUpdate: true
      , validForCreate: true
      , issues: []
    };

    if ( !data.id ) {
        validator.validForUpdate = false;
        validator.issues.push( 'ID is required' );
    }

    if ( !data.label || data.label === '' ) {
        validator.validForUpdate = validator.validForCreate = false;
        validator.issues.push( 'Label is required' );
    }

    if ( !data.board || data.board === '' ) {
        validator.validForUpdate = validator.validForCreate = false;
        validator.issues.push( 'Board is required' );
    }

    return validator;
};

Region.onBeforeUpdate = function ( data ) {
    // data.lastModifiedBy = app.getCurrentUser()._id;
    data.lastModifiedOn = new Date();

    return data;
};

Region.onBeforeCreate = function( data ) {
    // data.createdBy = app.getCurrentUser()._id;
    data.createdOn = new Date();

    return data;
};

module.exports = Region;

},{}],109:[function(require,module,exports){
function Wall( data ) {
    for ( var prop in data ) {
        if ( prop === 'links' ) continue;

        this[prop] = data[prop];
    }

    this.boards = [];
    this.pockets = [];

    for ( var link in data.links ) {
        this[link] = data.links[link];
    }

    this.constructor = Wall;
}

Wall.prototype.getId = function() {
    return this.id;
};

Wall.prototype.getName = function() {
    return this.name;
};

Wall.prototype.getBoards = function() {
    return this.boards;
};

Wall.prototype.addBoard = function( board ) {
    if ( ~this.boards.indexOf( board.id ) ) {
        this.boards.push( board.id );
    }

    return this;
};

Wall.prototype.getPockets = function() {
    return this.pockets;
};

Wall.prototype.addPocket = function( pocket ) {
    if ( ~this.pockets.indexOf( pocket.id ) ) {
        this.pockets.push( pocket.id );
    }

    return this;
};

Wall.constructor = function( data ) {
    if ( data instanceof Wall ) {
        return data;
    }

    return new Wall( data );
};

Wall.schema = {
    name: String
  , boards: ['board']
  , pockets: ['pocket']
  , createdBy: 'user'
  , createdOn: Date
  , lastModifiedBy: 'user'
  , lastModifiedOn: Date
  // , access: [ 'right' ] --> 'user', 'group'
};

Wall.validator = function( data ) {
    var validator = {
        validForUpdate: true
      , validForCreate: true
      , issues: []
    };

    if ( !data.id ) {
        validator.validForUpdate = false;
        validator.issues.push( 'ID is required' );
    }

    if ( !data.name || data.name === '' ) {
        validator.validForUpdate = validator.validForCreate = false;
        validator.issues.push( 'Name is required' );
    }

    return validator;
};

Wall.onBeforeUpdate = function ( data ) {
    // data.lastModifiedBy = app.getCurrentUser()._id;
    data.lastModifiedOn = new Date();

    return data;
};

Wall.onBeforeCreate = function( data ) {
    // data.createdBy = app.getCurrentUser()._id;
    data.createdOn = new Date();

    return data;
};

module.exports = Wall;

},{}],110:[function(require,module,exports){
var RSVP = require('rsvp')
  , Promise = RSVP.Promise;

// Commands

function Queries( adapter ) {
    this._db = adapter;
}

Queries.prototype.getBoard = function( boardid ) {
    var _this = this;

    return new Promise(function( resolve, reject ) {
        _this._db.find( 'board', boardid )
            .then( resolve )
            .catch( reject );
    });
};

Queries.prototype.getBoards = function( boardids ) {
    var _this = this;

    return new Promise(function( resolve, reject ) {
        _this._db.findMany( 'board', boardids )
            .then( resolve )
            .catch( reject );
    });
};

Queries.prototype.getCard = function( cardid ) {
    var _this = this;

    return new Promise(function( resolve, reject ) {
        _this._db.find( 'card', cardid )
            .then( resolve )
            .catch( reject );
    });
};

Queries.prototype.getCards = function( cardids ) {
    var _this = this;

    return new Promise(function( resolve, reject ) {
        _this._db.findMany( 'card', cardids )
            .then( resolve )
            .catch( reject );
    });
};

Queries.prototype.getPocket = function( pocketid ) {
    var _this = this;

    return new Promise(function( resolve, reject ) {
        _this._db.find( 'pocket', pocketid )
            .then( resolve )
            .catch( reject );
    });
};

Queries.prototype.getPockets = function( pocketids ) {
    var _this = this;

    return new Promise(function( resolve, reject ) {
        _this._db.findMany( 'pocket', pocketids )
            .then( resolve )
            .catch( reject );
    });
};

Queries.prototype.getRegion = function( regionid ) {
    var _this = this;

    return new Promise(function( resolve, reject ) {
        _this._db.find( 'region', regionid )
            .then( resolve )
            .catch( reject );
    });
};

Queries.prototype.getRegions = function( regionids ) {
    var _this = this;

    return new Promise(function( resolve, reject ) {
        _this._db.findMany( 'region', regionids )
            .then( resolve )
            .catch( reject );
    });
};

Queries.prototype.getWall = function( wallid ) {
    var _this = this;

    return new Promise(function( resolve, reject ) {
        _this._db.find( 'wall', wallid )
            .then( resolve )
            .catch( reject );
    });
};

Queries.prototype.getWalls = function( wallids ) {
    var _this = this;

    return new Promise(function( resolve, reject ) {
        _this._db.findMany( 'wall', wallids )
            .then( resolve )
            .catch( reject );
    });
};

module.exports = Queries;

},{"rsvp":74}],111:[function(require,module,exports){
function EventQueue( options ) {
    this.options = options || {};

    this.events = {};
}

EventQueue.prototype.on = function( ev, reaction ) {
    if (!this.events[ev]) {
        this.events[ev] = [];
    }

    this.events[ev].push( reaction );

    return this;
};

EventQueue.prototype.emit = function( ev, data ) {
    if (this.events[ev]) {
        this.events[ev].forEach(function( react ) {
            react( data );
        });
    }

    return this;
};

EventQueue.prototype.clearAll = function() {
    this.events = {};
};

EventQueue.prototype.trigger = function( ev, data ) {
    this.emit( ev, data );
};

module.exports = EventQueue;

},{}],112:[function(require,module,exports){
var RSVP = require('rsvp')
  , Promise = RSVP.Promise;

// Application

function Services( interface, commands, queries ) {
    this._commands = commands;
    this._queries = queries;
    this._interface = interface;
}

// board:new
Services.prototype.newBoard = function( ev ) {
    this._interface.displayBoardCreator();
};

// board:create
Services.prototype.createBoard = function( ev ) {
    var _this = this, board;

    return this._interface
        .extractAddBoardData( ev )
        .then(function( data ) {
            return _this._commands.createBoard( data );  // --> board:created
        })
        .then(function( resource ) {
            board = resource;

            return _this._queries.getWall( board.getWall() );
        })
        .then(function( wall ) {
            return _this._queries.getPockets( wall.getPockets() );
        })
        .then(function( pockets ) {
            _this._commands.addPocketsToBoard( board, pockets );  // --> card:created

            return board;
        });
};

// board:edit
Services.prototype.editBoard = function( ev ) {
    var _this = this;

    return this._interface
        .extractTargetId( ev )
        .then(function( id ) {
            return _this._queries.getBoard( id );
        })
        .then(function( board ) {
            _this._interface.displayBoardEditor( board );

            return board;
        });
};

// board:update
Services.prototype.updateBoard = function( ev ) {
    var _this = this;

    return this._interface
        .extractModifyBoardData( ev )
        .then(function( data ) {
            return _this._commands.updateBoard( data );  // --> board:updated
        });
};

// board:display
Services.prototype.displayBoard = function( ev ) {
    var _this = this;

    return this._interface
        .extractTargetId( ev )
        .then(function( id ) {
            return _this._queries.getBoard( id );
        })
        .then(function( board ) {
            _this._interface.displayBoard( board );  // --> board:displayed

            return board;
        });
};

// card:move
Services.prototype.moveCard = function( ev ) {
var _this = this, info;

return this._interface
    .extractMoveCardData( ev )
    .then(function( data ) {
        info = data;

        return _this.queries.getCard( info.id );
    })
    .then(function( card ) {
        if ( card.x != info.x || card.y != info.y ) {
          card.x = info.x;
          card.y = info.y;

          return _this._commands.updateCard( card );  // --> card:updated
        }
    });
};

// pocket:new
Services.prototype.newPocket = function( ev ) {
    this._interface.displayPocketCreator();
};

// pocket:create
Services.prototype.createPocket = function( ev ) {
    var _this = this, pocket;

    return this._interface
        .extractAddPocketData( ev )
        .then(function( data ) {
            return _this._commands.createPocket( data );  // --> pocket:created
        })
        .then(function( resource ) {
            pocket = resource;

            return _this._queries.getWall( pocket.getWall() );
        })
        .then(function( wall ) {
            return _this._queries.getBoards( wall.getBoards() );
        })
        .then(function( boards ) {
            _this._commands.addPocketToBoards( boards, pocket );  // --> card:created

            return pocket;
        });
};

// pocket:edit
Services.prototype.editPocket = function( ev ) {
    var _this = this;

    return this._interface
        .extractTargetId( ev )
        .then(function( id ) {
            return _this._queries.getPocket( id );
        })
        .then(function( pocket ) {
            _this._interface.displayPocketEditor( pocket );

            return pocket;
        });
};

// pocket:update
Services.prototype.updatePocket = function( ev ) {
    var _this = this;

    return this._interface
        .extractModifyPocketData( ev )
        .then(function( data ) {
            return _this._commands.updatePocket( data );  // --> pocket:updated
        });
};

// region:new
Services.prototype.newRegion = function( ev ) {
    this._interface.displayRegionCreator();
};

// region:create
Services.prototype.createRegion = function( ev ) {
    var _this = this;

    return this._interface
        .extractAddRegionData( ev )
        .then(function( data ) {
            return _this._commands.createRegion( data );  // --> region:created
        });
};

// region:edit
Services.prototype.editRegion = function( ev ) {
    var _this = this;

    return this._interface
        .extractTargetId( ev )
        .then(function( id ) {
            return _this._queries.getRegion( id );
        })
        .then(function( region ) {
            _this._interface.displayRegionEditor( region );

            return region;
        });
};

// region:move
Services.prototype.moveRegion = function( ev ) {
  var _this = this, info;

  return this._interface
      .extractMoveRegionData( ev )
      .then(function( data ) {
          info = data;

          return _this.queries.getRegion( info.id );
      })
      .then(function( region ) {
          if ( region.x != info.x || region.y != info.y ) {
            region.x = info.x;
            region.y = info.y;

            return _this._commands.updateRegion( region );  // --> region:updated
          }
      });
};

// region:resize
Services.prototype.resizeRegion = function( ev ) {
  var _this = this, info;

  return this._interface
      .extractResizeRegionData( ev )
      .then(function( data ) {
          info = data;

          return _this.queries.getRegion( info.id );
      })
      .then(function( region ) {
          if ( region.height != info.height || region.width != info.width ) {
            region.height = info.height;
            region.width = info.width;

            return _this._commands.updateRegion( region );  // --> region:updated
          }
      });
};

// region:update
Services.prototype.updateRegion = function( ev ) {
  var _this = this;

  return this._interface
      .extractModifyRegionData( ev )
      .then(function( data ) {
          return _this._commands.updateRegion( data );  // --> region:updated
      });
};

// wall:new
Services.prototype.newWall = function( ev ) {
    this._interface.displayWallCreator();
};

// wall:create
Services.prototype.createWall = function( ev ) {
    var _this = this;

    return this._interface
        .extractAddWallData( ev )
        .then(function( data ) {
            return _this._commands.createWall( data ); // --> wall:created
        });
};

// wall:edit
Services.prototype.editWall = function( ev ) {
    var _this = this;

    return this._interface
        .extractTargetId( ev )
        .then(function( id ) {
            return _this._queries.getWall( id );
        })
        .then(function( wall ) {
            _this._interface.displayWallEditor( wall );

            return wall;
        });
};

// wall:update
Services.prototype.updateWall = function( ev ) {
    var _this = this;

    return this._interface
        .extractModifyWallData( ev )
        .then(function( data ) {
            return _this._commands.updateWall( data );  // --> wall:updated
        });
};

// wall:select
Services.prototype.selectWall = function( ev ) {
    var _this = this;

    return this._interface
        .preventDefault( ev )
        .then(function( ev ) {
            return _this._queries.getWalls();
        })
        .then(function( walls ) {
            _this._interface.displayWallSelector( walls );

            return walls;
        });
};

// wall:display
Services.prototype.displayWall = function( ev ) {
    var _this = this;

    return this._interface
        .extractTargetId( ev )
        .then(function( id ) {
            return _this._queries.getWall( id );
        })
        .then(function( wall ) {
            _this._interface.displayWall( wall );  // --> wall:display

            if ( !wall.boards.length ) {
                _this._interface.notifyWallFirstTime( wall );  // --> wall:firsttime
            }

            return wall;
        })
        .then(function( boards ) {
            _this._interface.displayBoardSelector( boards );

            return boards;
        });
};

// transform:unlink
Services.prototype.unlinkTransform = function( ev ) {
    var _this = this;

    return this._interface
        .extractTargetId( ev )
        .then(function( id ) {
            return _this._queries.getTransform( id );
        })
        .then(function( transform ) {
            return _this._commands.unlinkTransform( id );  // --> transform:unlinked
        })
        .then(function( transform ) {
            _this._interface.removeTransform( transform );

            return transform;
        });
};

// board:select
Services.prototype.selectBoard = function( wall ) {
    return this._queries
        .getBoards( wall.getBoards() )
        .then(function( boards ) {
            return _this._interface.displayBoardSelector( boards );  // --> boardselector:displayed
        })
        .then(function( boards ) {
            _this._interface.displayBoard( boards[0] );  // --> board:displayed

            return boards[0];
        });
};

// board:displayed
Services.prototype.displayCards = function( board ) {
    return this._queries
        .getCards( board.getCards() )
        .then(function( cards ) {
            _this._interface.displayCards( cards );  // --> card:displayed

            return cards;
        });
};

// board:displayed
Services.prototype.displayRegions = function( board ) {
    return this._queries
        .getRegions( board.getRegions() )
        .then(function( regions ) {
            _this._interface.displayRegions( regions );  // --> region:displayed

            return regions;
        });
};

module.exports = Services;

},{"rsvp":74}],113:[function(require,module,exports){

function UI( queue, $element, options ) {
    this._queue = queue;

    this._$element = $element;

    this.constructor = UI;

    var listeners = [ 'new', 'create', 'edit', 'update', 'select', 'display', 'unlink' ];

    // e.g. on click or touch for [data-new="wall"] trigger 'wall:new' with ev
    // e.g. on click or touch for [data-update="board"] trigger 'board:update' with ev

    listeners.forEach(function( task ) {
        $element.on( 'click touch', '[data-'+ task +']', function( ev ) {
            queue
                .trigger( this.data( task ) + ':' + task, ev );
        });
    });

    var displays = [ 'Board', 'Wall', 'WallSelector', 'BoardSelector' ];

    var _this = this;

    displays.forEach(function( display ) {
        queue
            .on( display.toLowerCase() + ':display', function( data ) {
                _this[ 'display' + display ]( data );
            })
            .on( display.toLowerCase() + ':add', function( data ) {
                _this[ 'add' + display ]( data );
            });
    });
}

UI.prototype = {

    constructor: UI,

    addBoard: function( board ) {
        $('<li><a href="#'+ board.getId() +'" data-display="board">'+ board.getName() +'</a></li>')
            .appendBefore( this._$element.find('[data-selector="board"]').children().last() );

        this._queue.trigger( 'board:added', board );
    },

    displayBoard: function( board ) {
        var viewer = '<div id="'+ board.getId() +'" class="tab-content" data-viewer="board"></div>';

        this._$element.find('[data-viewer="board"]').replaceWith( viewer );

        this._board = board;
        this._canvasboard = new CanvasBoard( this.queue, board, this.size );

        this._queue.trigger( 'board:displayed', board );
    },

    displayWall: function( wall ) {
        var viewer = $('<div id="'+ wall.getId() +'" class="container" data-viewer="wall"> \
                <ul data-selector="board" class="nav nav-tabs"> \
                    <li><button type="button" class="btn btn-default" data-new="board" title="Add Board"><i class="glyphicon glyphicon-plus"></i></button></li> \
                </ul> \
                <div class="tab-content" [data-viewer="board"]></div> \
            </div>');

        this._$element.find('[data-viewer="wall"]').replaceWith( viewer );

        this._wall = wall;
        delete this._board;

        this._queue.trigger( 'wall:displayed', board );
    },

    displayWallSelector: function( walls ) {
        var options = walls.map(function( wall ) {
            return '<a href="#'+ wall.getId() +'" data-display="wall" class="list-group-item">'+ wall.getName() +'</a>';
        });

        this._$element.find('[data-selector="wall"]').empty().append( options.join('') );

        this._queue.trigger( 'wallselector:displayed', board );
    },

    displayBoardSelector: function( boards ) {
        var options = boards.map(function( board ) {
            return '<li><a href="#'+ board.getId() +'" data-display="board">'+ board.getName() +'</a></li>';
        });

        options.push('<li><button type="button" class="btn btn-default" data-new="board" title="Add Board"><i class="glyphicon glyphicon-plus"></i></button></li>');

        this._$element.find('[data-selector="board"]').empty().append( options.join('') );

        this._queue.trigger( 'boardselector:displayed', board );
    },

    // controls

    enableControls: function( data ) {
        this._$element.find('[data-new]:disabled').removeAttr( 'disabled' );

        this._queue.trigger( 'controls:enabled' );
    }

};

module.exports = UI;

},{}]},{},[104]);