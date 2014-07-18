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
    if ( schema ) {
        var model = new Model( this.db, name );

        this._models[ name ] = model;

        return model;
    } else {
        return this._models[ name ];
    }
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