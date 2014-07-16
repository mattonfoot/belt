var PouchDB = require('pouchdb');
var RSVP = require('rsvp');

var Promise = RSVP.Promise;

// private methods

function _isObject( o ) {
    return typeof o === "object" && o.constructor === Object && o !== null
}

// TODO: this should clone so that it doesn't mutate the referenced object
function _normaliseDocument( doc ) {
    if (doc._id) {
        doc.id = doc._id;
        delete doc._id;
    }

    if (doc._rev) {
        doc.rev = doc._rev;
        delete doc._rev;
    }

    return doc;
}

// TODO: this should clone so that it doesn't mutate the referenced object
function _prepareDocument( doc ) {
    if (doc.id) {
        doc._id = doc.id;
        delete doc.id;
    }

    if (doc.rev) {
        doc._rev = doc.rev;
        delete doc.rev;
    }

    return doc;
}

function _addSchema( name, schema ) {
    for( var key in schema ) {
        var value = schema[ key ]
          , obj = {}
          , isArray = Array.isArray( value )

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

    this.schemas[ name ] = schema;

    return schema;
}

function _addRespository( schema, options ) {
    if ( schema ) {
        // Actually set up a database
        var repository = new PouchDB( schema, options );

        // Store the repository name in a private key
        repository._name = schema;

        this.repositories[ schema ] = repository;

        return repository;
    } else {
        return this.repositories[ schema ];
    }
}

function _updateRelationships( schemaName, resource ) {
    var that = this
      , schema = this.schemas[ schemaName ]
      , references = _getSchemaFields( schema, function( obj, schema ) { return ( typeof obj === 'object' && obj.hasOwnProperty('ref') ); })
      , promises = [];

    references
        .forEach(function( reference ) {
            if (reference.inverse !== undefined && !reference.inverse) {
                return;
            }

            var relatedRepository = that.repositories[ reference.model ]
              , relatedSchema = that.schemas[ reference.model ];

            // Get fields on the related model that reference this model
            if (typeof reference.inverse === 'string') {
                var inverted = {};

                inverted[ reference.inverse ] = relatedSchema[ reference.inverse ];
                relatedSchema = inverted;
            }

            var fields = _getSchemaFields( relatedSchema, function( obj, schema ) { return (typeof obj === 'object' && obj.ref === schemaName ); });

            fields
                .forEach(function( field ) {
                    // One-to-one
                    if ( reference.singular && field.singular ) {
                        return promises.push( _updateOneToOne.call( that, relatedRepository, resource, reference, field ) );
                    }
                    // One-to-many
                    if ( reference.singular && !field.singular ) {
                        return promises.push( _updateOneToMany.call( that, relatedRepository, resource, reference, field ) );
                    }
                    // Many-to-one
                    if ( !reference.singular && field.singular ) {
                        return promises.push( _updateManyToOne.call( that, relatedRepository, resource, reference, field ) );
                    }
                    // Many-to-many
                    if ( !reference.singular && !field.singular ) {
                      //  promises.push( _updateManyToMany.call( that, relatedRepository, resource, reference, field ) );

                        return;
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

function _updateOneToOne( relatedRespository, resource, reference, field ) {
    var that = this
      , options = { reduce: false, include_docs: true }
      , dissociate = function( doc, emit ) {
          if ( doc.links !== undefined && doc.links[ field.path ] === resource._id ) {
              emit( doc );
          }
      };

    return new RSVP.Promise(function (resolve, reject) {
        relatedRespository
            .query({ map: dissociate }, options)
            .then( _unsetSingleDocs.call( relatedRespository, field.path, resource._id ) )
            .then( resolve )
            .catch(function( error ) {
                reject( new Error( error.message ) );
            });
    })
    .then(function() {
        if ( resource.links[ reference.path ] ) {
            return relatedRespository
                .get( resource.links[ reference.path ] )
                .then(function( related ) {
                    var update = _setSingleDoc.call( that, related, field.path, resource._id );

                    return relatedRespository.put( update );
                });
        }
    });
}


function _updateOneToMany( relatedRespository, resource, reference, field ) {
      var that = this
        , options = { reduce: false, include_docs: true }
        , dissociate = function( doc, emit ) {
            if ( doc.links !== undefined && doc.links[ field.path ] !== undefined && ~doc.links[ field.path ].indexOf( resource._id ) ) {
                emit( doc );
            }
        };

      return new RSVP.Promise(function (resolve, reject) {
          relatedRespository
              .query({ map: dissociate }, options)
              .then( _removeFromManyDocs.call( relatedRespository, field.path, resource._id ) )
              .then( resolve )
              .catch(function( error ) {
                  reject( new Error( error.message ) );
              });
      })
      .then(function() {
          if ( resource.links[ reference.path ] ) {
              return relatedRespository
                  .get( resource.links[ reference.path ] )
                  .then(function( related ) {
                      var update = _addSingleDoc.call( that, related, field.path, resource._id );

                      return relatedRespository.put( update );
                  });
          }
      });
}

function _updateManyToOne( relatedRespository, resource, reference, field ) {
    var that = this
      , options = { reduce: false, include_docs: true }
      , dissociate = function( doc, emit ) {
          if ( doc.links !== undefined && doc.links[ field.path ] === resource._id ) {
              emit( doc );
          }
      };

    return new RSVP.Promise(function (resolve, reject) {
        relatedRespository
            .query({ map: dissociate }, options)
            .then( _unsetSingleDocs.call( relatedRespository, field.path, resource._id ) )
            .then( resolve )
            .catch(function( error ) {
                reject( new Error( error.message ) );
            });
    })
    .then(function() {
        if ( resource.links[ reference.path ] ) {
            return relatedRespository
                .allDocs({ keys: resource.links[ reference.path ], include_docs: true })
                .then(function( related ) {
                    if (related.rows && related.rows.length > 0) {
                        var updates = _setOnManyDocs.call( that, related.rows, field.path, resource._id );

                        return relatedRespository.bulkDocs( updates );
                    }
                });
        }
    });
}

function _unsetSingleDocs( schema, reference ) {
    var repository = this;

    return function( response ) {
        var rows = response.rows;

        if (rows && rows.length > 0) {
            var updates = rows
                .map(function( row ) {
                    var doc = row.doc;

                    doc.links[ schema ] = undefined;

                    return doc;
                });

            return repository.bulkDocs( updates );
        }
    }
}

function _removeFromManyDocs( schema, reference ) {
    var repository = this;

    return function( response ) {
        var rows = response.rows;

        if (rows && rows.length > 0) {
            var updates = rows
                .map(function( row ) {
                    var doc = row.doc;

                    doc.links[ schema ].splice( doc.links[ schema ].indexOf( reference ), 1 );

                    if ( doc.links[ schema ].length <= 0 ) {
                        doc.links[ schema ] = undefined;
                    }

                    return doc;
                });

            return repository.bulkDocs( updates );
        }
    }
}

function _setOnManyDocs( rows, schema, reference ) {
    return rows
        .map(function( row ) {
            return _setSingleDoc( row.doc, schema, reference );
        });
}

function _addToManyDocs( rows, schema, reference ) {
    return rows
        .map(function( row ) {
            return _addSingleDoc( row.doc, schema, reference );
        });
}

function _setSingleDoc( doc, schema, reference ) {
    doc.links = doc.links || {};
    doc.links[ schema ] = reference;

    return doc;
}

function _addSingleDoc( doc, schema, reference ) {
    doc.links = doc.links || {};
    doc.links[ schema ] = doc.links[ schema ] || [];
    doc.links[ schema ].push( reference );

    return doc;
}

// public interface

function Belt( options ) {
    this.options = options || {};
    this.schemas = {};
    this.models = {};
    this.repositories = {};
}

Belt.prototype = {

    constructor: Belt,

    schema: function( name, schema ) {
        _addSchema.call( this, name, schema );
        _addRespository.call( this, name, this.options );

        return this;
    }

  , create: function( schema, data ) {
        var that = this;

        return this.repositories[ schema ]
                .post( data )
                .then(function( response ) {
                    return _normaliseDocument.call( that, response );
                })
                .catch(function( error ) {
                    throw new Error( error.message );
                });
    }

  , find: function( schema, id ) {
        var that = this;

        return new Promise(function( resolve, reject ) {
            that.repositories[ schema ]
                .get( id )
                .then(function( response ) {
                    resolve( _normaliseDocument.call( that, response ) );
                })
                .catch(function( error ) {
                    reject( new Error( error.message ) );
                });
        });
    }

  , findMany: function( schema, ids ) {
        var that = this
          , query = { include_docs: true };

        if ( ids ) {
            query.keys == ids;
        }

        return new Promise(function( resolve, reject ) {
            that.repositories[ schema ]
                .allDocs(query)
                .then(function( response ) {
                    resolve( response.rows.map(function( resource ) {
                        return _normaliseDocument.call( that, resource.doc );
                    }));
                })
                .catch(function( error ) {
                    reject( new Error( error.message ) );
                });
        });
    }

  , update: function( schema, id, data ) {
        var that = this;

        if ( _isObject( data ) ) {
            data.id = id;
        }

        data = _prepareDocument.call( that, data || id );

        return new Promise(function( resolve, reject ) {
            var info;

            that.repositories[ schema ]
                .put( data )
                .then(function( response ) {
                    info = response;

                    return that.find( schema, info.id );
                })
                .then(function( resource ) {
                    resource = _prepareDocument.call( that, resource );

                    return _updateRelationships.call( that, schema, resource )
                })
                .then(function() {
                    resolve( _normaliseDocument.call( that, info ) );
                })
                .catch(function( error ) {
                    reject( new Error( error.message ) );
                });
        });
    }

  , delete: function( schema, id ) {
        var that = this;

        return new Promise(function( resolve, reject ) {
            that.find( schema, id )
                .then(function( resource ) {
                    return that.repositories[ schema ].remove( _prepareDocument.call( that, resource ) );
                })
                .then(function() {
                    resolve();
                })
                .catch(function( error ) {
                    reject( new Error( error.message ) );
                });
        });
    }

};

module.exports = Belt;
