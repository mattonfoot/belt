var util = require("util")
  , events = require("events")
  , RSVP = require('rsvp')
  , Promise = RSVP.Promise
  , Model = require('./model');

// Repository
// Follows the interface for the fortuneJS library adapters in an attempt to provide additional db options easily

function Repository( db, options ) {
  this.db = db;

  events.EventEmitter.call( this );
}

util.inherits( Repository, events.EventEmitter );

Repository.prototype.constructor = Repository;

Repository.prototype._models = {};
Repository.prototype._schemas = {};

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

        watchForChanges( model, this );

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
      model.post( resource, onComplete );

      function onComplete( error, resource ) {
        if ( error ) return reject( error );

        _handleWrite.call( _this, model, resource, error, resolve, reject );
      }
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
      model.put( update, id, onComplete );

      function onComplete( error, resource ) {
        if ( error ) return reject( error );

        _handleWrite.call( _this, model, resource, error, resolve, reject );
      }
    });
};

Repository.prototype.updateMany = function( model, updates ) {
    var _this = this;

    model = typeof model === 'string' ? this.model( model ) : model;
    updates = updates.map(function( update ) {
      var id = update.id;
      update = _serialize.call( _this, model, update );
      update._id = id;

      return update;
    });

    return new Promise(function ( resolve, reject ) {
      model.putMany( updates, onComplete );

      function onComplete( error, resources ) {
        if ( error ) return reject( error );

        _handleWrite.call( _this, model, resources, error, resolve, reject );
      }
    });
};

Repository.prototype.patch = function( model, query, patch ) {
  var _this = this;

  model = typeof model === 'string' ? this.model( model ) : model;

  return new Promise(function (resolve, reject) {
    if ( !patch ) return reject( new Error( 'no patches defined' ) );

    model.patchMany( query, patch, onComplete );

    function onComplete( error, resources ) {
      if ( error ) return reject( error );

      _handleWrite.call( _this, model, resources, error, resolve, reject );
    }
  });
};

// TODO: array of ids should invoke removeMany

Repository.prototype.delete = function( model, id ) {
    var _this = this;

    model = typeof model === 'string' ? this.model(model) : model;

    return new Promise(function ( resolve, reject ) {
      model.remove( id, onComplete );

      function onComplete( error, resource ) {
        if ( error ) return reject( error );

        var schema = _this._schemas[ model._name ];

        for ( var key in schema ) {
          var value = schema[ key ];

          if ( Array.isArray( value ) ) {
            resource[ key ] = [];
          } else {
            delete resource[ key ];
          }
        }

        _handleWrite.call( _this, model, resource, error, resolve, reject );
      }
    });
};

Repository.prototype.find = function( model, query ) {
    var _this = this;
    var method = typeof query != 'object' ? 'get' : 'firstDoc';

    model = typeof model == 'string' ? this.model( model ) : model;

    return new Promise(function ( resolve, reject ) {
        model[ method ]( query, onComplete );

        function onComplete(error, resource) {
          if ( error || !resource ) return reject( error );

          resolve( _deserialize.call( _this, model, resource) );
        }
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
      model.allDocs( query, onComplete );

      function onComplete( error, resources ) {
        if ( error ) return reject( error );

        resources = resources.map(function ( resource ) {
          return _deserialize.call( _this, model, resource );
        });

        resolve( resources );
      }
    });
};


// private methods

function _handleWrite( model, resources, error, resolve, reject ) {
    var _this = this;

    if ( error ) return reject( error );

    if ( !Array.isArray( resources ) ) {
      var resource = resources;

      _updateRelationships.call( _this, model, resource ).then( onComplete, reject );

      return;
    }

    if ( !resources.length ) return resolve();

    var numResources = resources.length;
    updateNextRelationship();

    function updateNextRelationship( i ) {
      i = i || 0;

      var resource = resources[ i ];

      new Promise(function( resolve, reject ) {
        _handleWrite.call( _this, model, resource, error, resolve, reject );
      })
      .then( onComplete )
      .catch( reject );

      function onComplete() {
        i++;

        if ( i >= numResources ) return resolve();

        updateNextRelationship( i );
      }
    }

    function onComplete( resource ) {
      resolve( _deserialize.call( _this, model, resource ) );
    }
}

// serialize gets the resource ready for the database
function _serialize( model, resource ) {
    var doc = {};

    for ( var key in resource ) {
        if ( !resource.hasOwnProperty( key ) ) continue;

        // we don't want to keep these
        if ( ~[ 'id', '_id', 'rev', '_rev', 'doctype', 'links' ].indexOf( key ) ) continue;

        doc[ key ] = resource[ key ];
    }

    // flatten links
    if ( resource.hasOwnProperty( 'links' ) && typeof resource.links === 'object' ) {
      for ( var link in resource.links ) {
        doc[ link ] = resource.links[ link ];
      }
    }

    return _scrubResource.call( this, model, doc );
}

// scrub resource ensures we only have the data relevant to the model
function _scrubResource( model, resource ) {
  var json = {};

  var schema = this._schemas[ model._name ];

  for ( var key in schema ) {
    var value = schema[key]
      , type = value.type
      , typeString = type ? typeCheck(type) : ''
      , isArray = Array.isArray(value)
      , ref = isArray ? value[0].ref : value.ref;

    if ( type && !ref ) {
      // don't store if the resource doesn't define it
      if ( !resource.hasOwnProperty( key ) || resource[ key ] === undefined || resource[ key ] === null ) {
        continue;
      }

      if ( typeString === 'date' ) {
        json[ key ] = new Date( resource[key] );
        continue;
      }

      if (typeString === 'array' || typeString === 'object') {
        json[key] = typeof resource[key] === 'object' ? resource[key] : null;
        continue;
      }

      json[ key ] = type( resource[ key ] );
      continue;
    }

    if ( ref && resource[ key ] ) {
      json[ key ] = resource[ key ];
      continue;
    }

    if ( ref && isArray ) {
      json[ key ] = [];
    }
  }

  return json;
}

function _deserialize( model, resource ) {
    var json = {}
      , schema = this._schemas[ model._name ];

    json.id = resource._id;

    var relations = [];
    for ( var key in schema ) {
        if (key === '_id') continue;

        var value = schema[key]
          , type = value.type
          , typeString = type ? typeCheck(type) : ''
          , ref = Array.isArray(value) ? value[0].ref : value.ref;

        json[key] = resource[key];

        if ( type && !ref ) {
          json[key] = type( resource[key] );

          if ( typeString === 'date' ) {
            json[key] = new Date( resource[key] );
          } else if ( typeString === 'array' || typeString === 'object' ) {
            json[key] = typeof resource[key] === 'object' ? resource[key] : null;
          }
        }

        if ( ref ) {
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

function typeCheck (fn) {
    return Object.prototype.toString.call(new fn(''))
        .slice(1, -1).split(' ')[1].toLowerCase();
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
        .then(function ( info ) {
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
  return new Promise(function (resolve, reject) {
//  var dissociate = { "op": "remove", "path": '/' + field.path, method: '_updateOneToOne' };

    // remove referencial property [ unset ]
    function dissociate( doc ) {
      delete doc[ field.path ];

      return doc;
    }

    var find = {};
    find[ field.path ] = resource._id;

    relatedModel.patchMany( find, dissociate, onComplete );

    function onComplete( error, responses ) {
      if (error) return reject(error);

      resolve();
    }
  })
  .then(function() {
    return new Promise(function ( resolve, reject ) {
      var key = resource[ reference.path ];
      if ( !key ) return resolve();

//    var associate = { op: 'add', path: '/' + field.path, value: resource._id, method: '_updateOneToOne' };

      // set referencial property [ set ]
      function associate( doc ) {
        doc[ field.path ] = resource._id;

        return doc;
      }

      relatedModel.patchMany({ keys: key }, associate, onComplete );

      function onComplete( error, responses ) {
        if ( error ) return reject( error );

        resolve();
      }
    });
  });
}


function _updateOneToMany( relatedModel, resource, reference, field ) {
  return new Promise(function (resolve, reject) {
//  var dissociate = { op: 'remove', path: '/' + field.path + '/' + resource._id, method: '_updateOneToMany' };

    // remove id from referencial array property [ pull ]
    function dissociate( doc ) {
      var index = doc[ field.path ].indexOf( resource._id );

      if ( index >= 0 ) {
        doc[ field.path ].splice( index, 1 );
      }

      return doc;
    }

    var find = {};
    find[ field.path ] = resource._id;

    relatedModel.patchMany( find, dissociate, onComplete );

    function onComplete( error, responses ) {
      if (error) return reject( error );

      resolve();
    }
  })
  .then(function() {
    return new Promise(function (resolve, reject) {
      var key = resource[ reference.path ];
      if ( !key ) return resolve();

//    var associate = { op: 'replace', path: '/' + field.path + '/' + resource._id, value: resource._id, method: '_updateOneToMany' };

      // set referencial property [ addToSet ]
      function associate( doc ) {
        doc[ field.path ] = doc[ field.path ] || [];

        var index = doc[ field.path ].indexOf( resource._id );

        if ( index < 0 ) {
          doc[ field.path ].push( resource._id );
        }

        return doc;
      }

      var find = { key: key };

      relatedModel.patchMany( find, associate, onComplete );

      function onComplete( error, responses ) {
        if ( error ) return reject( error );

        resolve();
      }
    });
  });
}

function _updateManyToOne( relatedModel, resource, reference, field ) {
  return new Promise(function (resolve, reject) {
//  var dissociate = { op: 'remove', path: '/' + field.path, method: '_updateManyToOne' };

    // remove referencial property [ unset ]
    function dissociate( doc ) {
      delete doc[ field.path ];

      return doc;
    }

    var find = {};
    find[ field.path ] = resource._id;

    relatedModel.patchMany( find, dissociate, onComplete );

    function onComplete( error, responses ) {
      if (error) return reject( error );

      resolve();
    }
  })
  .then(function() {
    return new Promise(function (resolve, reject) {
      var keys = resource[ reference.path ];
      if ( !keys || !keys.length ) return resolve();

//    var associate = { op: 'add', path: '/' + field.path, value: resource._id };

      // add id to referencial array property [ set ]
      function associate( doc ) {
        doc[ field.path ] = resource._id;

        return doc;
      }

      var find = { _id: keys };

      relatedModel.patchMany( find, associate, onComplete );

      function onComplete( error, responses ) {
        if ( error ) return reject( error );

        resolve();
      }
    });
  });
}

function _updateManyToMany( relatedModel, resource, reference, field ) {
  return new Promise(function (resolve, reject) {
//  var dissociate = { op: 'remove', path: '/' + field.path + '/' + resource._id, method: '_updateManyToMany' };

    // remove id from referencial array property [ pull ]
    function dissociate( doc ) {
      var index = doc[ field.path ].indexOf( resource._id );

      if ( index >= 0 ) {
        doc[ field.path ].splice( index, 1 );
      }

      return doc;
    }

    var find = {};
    find[ field.path ] = resource._id;

    relatedModel.patchMany( find, dissociate, onComplete );

    function onComplete( error, responses ) {
      if (error) return reject( error );

      resolve();
    }
  })
  .then(function() {
    return new Promise(function (resolve, reject) {
      var keys = resource[ reference.path ];
      if ( !keys ) return resolve();

//    var associate = { op: 'add', path: '/' + field.path + '/' + resource._id, value: resource._id, method: '_updateManyToMany' };

      // add id to referencial array property [ addToSet ]
      function associate( doc ) {
        doc[ field.path ] = doc[ field.path ] || [];

        var index = doc[ field.path ].indexOf( resource._id );

        if ( index < 0 ) {
          doc[ field.path ].push( resource._id );
        }

        return doc;
      }

      var find = { keys: keys };

      relatedModel.patchMany( find, associate, onComplete );

      function onComplete( error, responses ) {
        if ( error ) return reject( error );

        resolve();
      }
    });
  });
}

// util methods

function _isObject( o ) {
    return typeof o === "object" && o.constructor === Object && o !== null;
}

function watchForChanges( model, repository ) {
  model
    .on('create', function( doc ) {
      repository.emit( 'created', doc );
    })
    .on('update', function( doc ) {
      repository.emit( 'updated', doc );
    })
    .on('delete', function( doc ) {
      repository.emit( 'deleted', doc );
    });
}

module.exports = Repository;
